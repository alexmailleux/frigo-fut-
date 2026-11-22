const EMOJI_CHOICES = ["🍽️","🍜","🍝","🍛","🥘","🥗","🌮","🌯","🍲","🥙","🍳","🍕","🥩","🐟","🍚","🥑"];
const PREP_SLIDER_MAX = 90;

// Listes de référence : à quelle catégorie appartient chaque tag connu.
// Elles sont ensuite filtrées pour n'afficher que ceux réellement utilisés
// (voir proteinOptions / originOptions / mealTypeOptions plus bas).
const PROTEIN_TAGS = [
  "Poulet", "Bœuf", "Porc", "Agneau", "Veau", "Canard", "Poisson",
  "Fruits de mer", "Gibier", "Végétarien"
];
const MEALTYPE_TAGS = [
  "Plat principal", "Entrée", "Soupe", "Accompagnement", "Dessert"
];
const ORIGIN_TAGS = [
  "Française", "Asiatique", "Italienne", "Moyen-Orient", "Thaï",
  "Américain", "Nord-Africaine", "Fusion", "Indienne", "Japonaise",
  "Grecque", "Sud-Américaine", "Libanais", "Orientale", "Indonésien",
  "Chinoise", "Coréenne", "Africaine", "Mexicain", "Arménien", "Créole"
];

// Gabarits fourre-tout : des idées improvisées toujours disponibles, pour
// les combinaisons de restes qu'aucune des 127 recettes ne couvre bien.
// "suits" référence les rayons (mêmes noms que categorizeIngredient) que
// ce gabarit sait exploiter.
const FRIDGE_TEMPLATES = [
  { id: "tpl-soupe", emoji: "🍲", title: "Soupe improvisée",
    method: "Fais revenir les légumes du Frigo, couvre d'eau ou de bouillon, laisse mijoter 20 min, mixe (ou pas). Assaisonne selon ton goût.",
    suits: ["Fruits & légumes"] },
  { id: "tpl-poelee", emoji: "🥘", title: "Poêlée du Frigo",
    method: "Coupe tout en petits morceaux, fais revenir à la poêle avec un filet d'huile, ajoute les protéines en dernier pour qu'elles ne soient pas trop cuites.",
    suits: ["Fruits & légumes", "Viandes & poissons"] },
  { id: "tpl-salade", emoji: "🥗", title: "Salade composée maison",
    method: "Mélange les crudités et restes cuits froids, ajoute une protéine (œuf, poulet, fromage), assaisonne d'une vinaigrette maison.",
    suits: ["Fruits & légumes", "Viandes & poissons", "Produits laitiers & œufs"] },
  { id: "tpl-omelette", emoji: "🍳", title: "Omelette ou quiche vide-frigo",
    method: "Bats des œufs, incorpore tes restes de légumes/fromage/viande coupés petit, cuis à la poêle ou au four dans un moule à tarte (avec ou sans pâte).",
    suits: ["Produits laitiers & œufs", "Fruits & légumes", "Viandes & poissons"] },
  { id: "tpl-wok", emoji: "🥡", title: "Wok minute",
    method: "Coupe tout en lamelles, saisis à feu vif dans un wok ou une grande poêle avec un peu d'huile, sauce soja et gingembre si tu en as.",
    suits: ["Fruits & légumes", "Viandes & poissons"] },
  { id: "tpl-gratin", emoji: "🧀", title: "Gratin vide-frigo",
    method: "Dispose tes restes de légumes/féculents dans un plat, nappe de béchamel ou de crème, parsème de fromage râpé, enfourne 20-25 min à 200°C.",
    suits: ["Fruits & légumes", "Épicerie & féculents", "Produits laitiers & œufs"] },
  { id: "tpl-bouillon", emoji: "🍜", title: "Bouillon + nouilles",
    method: "Porte un bouillon à ébullition, ajoute des nouilles, puis tes restes de légumes et de viande coupés fin en fin de cuisson.",
    suits: ["Épicerie & féculents", "Fruits & légumes", "Viandes & poissons"] },
  { id: "tpl-julienne", emoji: "🥕", title: "Julienne de légumes sautée",
    method: "Coupe tes légumes en fins bâtonnets, fais-les sauter rapidement à la poêle avec un filet d'huile d'olive, sers en accompagnement ou avec des céréales.",
    suits: ["Fruits & légumes"] }
];

const app = Vue.createApp({
  data() {
    return {
      booted: false,
      store: null,
      storeMode: "local", // 'local' | 'supabase'

      // auth
      session: null,
      authMode: "login",
      authForm: { email: "", password: "", firstName: "", lastName: "", birthdate: "" },
      authError: "",
      authLoading: false,

      // profile
      profile: null,
      profileForm: { firstName: "", lastName: "", email: "", birthdate: "" },

      // family
      family: null,
      familyMembers: [],
      familyNameInput: "",
      joinCodeInput: "",
      familyError: "",

      // navigation
      activeTab: "recettes",
      showOnlyMine: false,
      showFridgeOnly: false,
      videFrigoOpen: true,
      openTemplateId: null,
      recipeSearchQuery: "",
      selectedProteins: [],
      selectedOrigins: [],
      selectedMealTypes: [],
      selectedTags: [],
      proteinMatchMode: "any", // 'any' = OU | 'all' = ET
      originMatchMode: "any",
      mealTypeMatchMode: "any",
      tagsMatchMode: "any",
      filtersOpen: false,
      sortBy: null, // null | 'name' | 'duration' | 'difficulty'
      prepMinMinutes: 0,
      prepMaxMinutes: 90,
      ingredientFilterList: [],
      ingredientInput: "",
      ingredientInputFocused: false,
      ingredientMatchMode: "any", // 'any' = au moins un | 'all' = tous
      openDropdown: null, // 'protein' | 'origin' | 'mealtype' | 'tags' | 'sort' | null

      // recettes
      customRecipes: [],
      recipeOverrides: {},
      favoriteRecipeIds: [],
      weekSelections: [], // [{recipeId, servings}]
      openRecipeId: null,
      modalServings: 2,
      editingRecipeId: null,

      // shopping list state
      overrides: { removed: [], manual: [] },
      fridgeItems: {},
      newItemName: "",
      pendingRemoveItem: null,
      collapsedCategories: [],
      quantityOverrides: {},
      qtyEditItem: null,
      qtyEditInput: "",
      manualEditItem: null,
      manualEditForm: { name: "", qty: "", unit: "" },
      fridgeEditItem: null,
      fridgeEditForm: { name: "", qty: "", unit: "" },
      newFridgeItemName: "",
      newFridgeItemQty: "",
      newFridgeItemUnit: "",

      // add/import recipe modal
      recipeFormModalOpen: false,
      recipeFormMode: "choice", // 'choice' | 'import' | 'manual'
      importUrl: "",
      importLoading: false,
      importError: "",
      recipeForm: null,
      activeIngredientRowIndex: null,
      recipeTagInput: "",
      recipeTagInputFocused: false,

      toastMessage: "",
      _toastTimer: null,
      _unsubscribe: null
    };
  },

  computed: {
    initials() {
      if (!this.profile) return "?";
      const a = (this.profile.first_name || "?")[0] || "";
      const b = (this.profile.last_name || "")[0] || "";
      return (a + b).toUpperCase();
    },
    profileAge() {
      if (!this.profile || !this.profile.birthdate) return null;
      const b = new Date(this.profile.birthdate);
      if (isNaN(b.getTime())) return null;
      const now = new Date();
      let age = now.getFullYear() - b.getFullYear();
      const m = now.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
      return age;
    },

    allRecipes() {
      const base = RECIPES.map(r => {
        const ov = this.recipeOverrides[r.id];
        return ov ? { ...r, ...ov, id: r.id, isCustom: false, hasOverride: true } : r;
      });
      return [...base, ...this.customRecipes];
    },
    prepSliderMax() { return PREP_SLIDER_MAX; },
    allTagsLibrary() {
      const set = new Set();
      this.allRecipes.forEach(r => (r.tags || []).forEach(t => set.add(t)));
      return [...set].sort((a, b) => a.localeCompare(b, "fr"));
    },
    // Chaque liste d'options : uniquement les tags réellement utilisés
    // (ceux qui n'ont plus aucune recette disparaissent du filtre), avec
    // les valeurs déjà sélectionnées remontées en haut de la liste.
    proteinOptions() { return this.sortSelectedFirst(PROTEIN_TAGS.filter(t => this.allTagsLibrary.includes(t)), this.selectedProteins); },
    mealTypeOptions() { return this.sortSelectedFirst(MEALTYPE_TAGS.filter(t => this.allTagsLibrary.includes(t)), this.selectedMealTypes); },
    originOptions() { return this.sortSelectedFirst(ORIGIN_TAGS.filter(t => this.allTagsLibrary.includes(t)), this.selectedOrigins); },
    // "Tags" : tout ce qui n'est pas déjà couvert par une catégorie dédiée.
    otherTagOptions() {
      const used = new Set([...PROTEIN_TAGS, ...MEALTYPE_TAGS, ...ORIGIN_TAGS]);
      return this.sortSelectedFirst(this.allTagsLibrary.filter(t => !used.has(t)), this.selectedTags);
    },
    // Résumé de toutes les sélections actives, tous filtres confondus,
    // pour l'affichage en chips retirables d'un coup d'œil.
    activeFilterChips() {
      const chips = [];
      this.selectedProteins.forEach(v => chips.push({ value: v, list: "selectedProteins" }));
      this.selectedOrigins.forEach(v => chips.push({ value: v, list: "selectedOrigins" }));
      this.selectedMealTypes.forEach(v => chips.push({ value: v, list: "selectedMealTypes" }));
      this.selectedTags.forEach(v => chips.push({ value: v, list: "selectedTags" }));
      return chips;
    },
    allIngredientNames() {
      const set = new Set();
      this.allRecipes.forEach(r => r.ingredients.forEach(i => set.add(i.name)));
      return [...set].sort((a, b) => a.localeCompare(b, "fr"));
    },
    recipeTagSuggestions() {
      if (!this.recipeForm) return [];
      const q = this.recipeTagInput.trim().toLowerCase();
      if (!q) return [];
      return this.allTagsLibrary
        .filter(t => t.toLowerCase().includes(q) && !this.recipeForm.tags.includes(t))
        .slice(0, 8);
    },
    ingredientSuggestions() {
      const q = this.ingredientInput.trim().toLowerCase();
      if (!q) return [];
      return this.allIngredientNames
        .filter(n => n.toLowerCase().includes(q) && !this.ingredientFilterList.includes(n.toLowerCase()))
        .slice(0, 8);
    },
    prepRangeStyle() {
      const left = (this.prepMinMinutes / PREP_SLIDER_MAX) * 100;
      const right = 100 - (this.prepMaxMinutes / PREP_SLIDER_MAX) * 100;
      return { left: left + "%", right: right + "%" };
    },
    activeAdvancedFilterCount() {
      let n = 0;
      if (this.prepMinMinutes > 0 || this.prepMaxMinutes < PREP_SLIDER_MAX) n++;
      if (this.ingredientFilterList.length) n++;
      return n;
    },
    hasActiveFilters() {
      return this.showOnlyMine || this.showFridgeOnly || !!this.recipeSearchQuery.trim() || this.activeFilterChips.length > 0 ||
        this.prepMinMinutes > 0 || this.prepMaxMinutes < PREP_SLIDER_MAX || this.ingredientFilterList.length > 0;
    },
    // Table [recipeId -> nombre d'ingrédients du Frigo utilisés], pour le
    // filtre "Frigo" de l'onglet Recettes et pour le tri associé.
    fridgeMatchCounts() {
      const map = {};
      if (!this.fridgeItemsList.length) return map;
      const fridgeNames = this.fridgeItemsList.map(i => i.name.toLowerCase());
      for (const recipe of this.allRecipes) {
        let count = 0;
        for (const fn of fridgeNames) {
          const hit = recipe.ingredients.some(ing => {
            const n = ing.name.toLowerCase();
            return n.includes(fn) || fn.includes(n);
          });
          if (hit) count++;
        }
        if (count > 0) map[recipe.id] = count;
      }
      return map;
    },
    filteredRecipes() {
      let list = this.showOnlyMine ? this.customRecipes : this.allRecipes;

      const q = this.recipeSearchQuery.trim().toLowerCase();
      if (q) {
        list = list.filter(r => r.title.toLowerCase().includes(q));
      }

      if (this.showFridgeOnly) {
        list = list.filter(r => this.fridgeMatchCounts[r.id] > 0);
      }

      // Chaque catégorie a son propre opérateur (ET/OU), réglable par l'utilisateur.
      const categoryFilters = [
        [this.selectedProteins, this.proteinMatchMode],
        [this.selectedOrigins, this.originMatchMode],
        [this.selectedMealTypes, this.mealTypeMatchMode],
        [this.selectedTags, this.tagsMatchMode]
      ];
      for (const [selected, mode] of categoryFilters) {
        if (selected.length) {
          list = list.filter(r => {
            const tags = r.tags || [];
            return mode === "all" ? selected.every(t => tags.includes(t)) : selected.some(t => tags.includes(t));
          });
        }
      }

      if (this.prepMinMinutes > 0 || this.prepMaxMinutes < PREP_SLIDER_MAX) {
        list = list.filter(r => {
          const p = r.prepMinutes || 0;
          return p >= this.prepMinMinutes && p <= this.prepMaxMinutes;
        });
      }
      if (this.ingredientFilterList.length) {
        const queries = this.ingredientFilterList;
        list = list.filter(r => {
          const matches = queries.map(iq => r.ingredients.some(i => i.name.toLowerCase().includes(iq)));
          return this.ingredientMatchMode === "all" ? matches.every(Boolean) : matches.some(Boolean);
        });
      }

      if (this.showFridgeOnly) {
        // Le tri "Frigo" prime : celles qui utilisent le plus d'ingrédients
        // du Frigo d'abord.
        list = [...list].sort((a, b) => (this.fridgeMatchCounts[b.id] || 0) - (this.fridgeMatchCounts[a.id] || 0));
      } else if (this.sortBy === "name") {
        list = [...list].sort((a, b) => a.title.localeCompare(b.title, "fr"));
      } else if (this.sortBy === "duration") {
        list = [...list].sort((a, b) => (a.prepMinutes || 999) - (b.prepMinutes || 999));
      } else if (this.sortBy === "difficulty") {
        const order = { "Facile": 0, "Moyen": 1, "Avancé": 2 };
        list = [...list].sort((a, b) => (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1));
      }

      // Les favoris remontent toujours en tête, sans casser l'ordre choisi par ailleurs.
      const favSet = new Set(this.favoriteRecipeIds);
      if (favSet.size) {
        list = [...list].sort((a, b) => (favSet.has(b.id) ? 1 : 0) - (favSet.has(a.id) ? 1 : 0));
      }
      return list;
    },
    openRecipe_() {
      return this.openRecipeId ? this.recipeById(this.openRecipeId) : null;
    },
    scaledIngredientsForModal() {
      if (!this.openRecipe_) return [];
      return this.openRecipe_.ingredients.map(ing => ({
        name: ing.name,
        unit: ing.unit,
        isStaple: isStapleIngredient(ing),
        qty: scaledQty(ing, this.modalServings, this.openRecipe_.baseServings)
      }));
    },
    // Même liste, annotée avec ce qui est déjà disponible au Frigo :
    // correspondance exacte (même nom+unité, quantité comparable) en
    // priorité, sinon correspondance approximative par nom (unité
    // différente ou libellé légèrement différent).
    modalIngredientsWithFridge() {
      return this.scaledIngredientsForModal.map(ing => {
        if (ing.isStaple) return { ...ing, hasFridge: false };
        const key = normalizeKey(ing.name, ing.unit);
        const exact = this.fridgeItems[key];
        if (exact) {
          return {
            ...ing, hasFridge: true, fridgeExact: true,
            fridgeQty: exact.qty, fridgeUnit: exact.unit,
            covered: ing.qty != null && exact.qty >= ing.qty
          };
        }
        const n = ing.name.toLowerCase();
        const fuzzy = this.fridgeItemsList.find(f => {
          const fn = f.name.toLowerCase();
          return fn.includes(n) || n.includes(fn);
        });
        if (fuzzy) {
          return { ...ing, hasFridge: true, fridgeExact: false, fridgeQty: fuzzy.qty, fridgeUnit: fuzzy.unit, covered: false };
        }
        return { ...ing, hasFridge: false };
      });
    },

    aggregatedIngredients() {
      const map = {};
      for (const sel of this.weekSelections) {
        const recipe = this.recipeById(sel.recipeId);
        if (!recipe) continue;
        for (const ing of recipe.ingredients) {
          const key = normalizeKey(ing.name, ing.unit);
          const qty = scaledQty(ing, sel.servings, recipe.baseServings);
          if (!map[key]) {
            map[key] = {
              key, name: ing.name, unit: ing.unit,
              totalQty: 0, isAuGout: ing.unit === "au-gout",
              isStaple: isStapleIngredient(ing),
              sources: []
            };
          }
          if (qty !== null) map[key].totalQty += qty;
          if (!map[key].sources.some(s => s.recipeId === recipe.id)) {
            map[key].sources.push({ recipeId: recipe.id, recipeTitle: recipe.title });
          }
        }
      }
      return Object.values(map);
    },
    // Soustrait d'abord le stock réel du Frigo du besoin total des recettes ;
    // seul ce qui manque réellement est proposé à l'achat. Si le Frigo
    // couvre déjà tout le besoin, l'article disparaît de la liste.
    shoppingListRaw() {
      return this.aggregatedIngredients
        .filter(i => !i.isStaple)
        .map(i => {
          if (i.isAuGout) {
            return { ...i, buyQty: null, isOverridden: false };
          }
          const override = this.quantityOverrides[i.key];
          if (override && override.qty >= 0) {
            // Quantité fixée à la main par l'utilisateur : on la respecte
            // telle quelle, sans recalcul par rapport au stock du Frigo.
            const buyQty = Math.round(override.qty * 100) / 100;
            return { ...i, buyQty, isOverridden: true };
          }
          const fridgeQty = this.fridgeItems[i.key] ? this.fridgeItems[i.key].qty : 0;
          const needed = Math.round((i.totalQty - fridgeQty) * 100) / 100;
          if (needed <= 0) return null; // déjà couvert par le Frigo
          const buyQty = DISCRETE_UNITS.has(i.unit) ? roundForBuying(needed, i.unit) : needed;
          return { ...i, buyQty, isOverridden: false };
        })
        .filter(Boolean);
    },
    shoppingList() {
      const removed = new Set(this.overrides.removed);
      const derived = this.shoppingListRaw.filter(i => !removed.has(i.key));
      const manual = this.overrides.manual.map(m => ({
        key: m.id, name: m.name, unit: m.unit, buyQty: m.qty,
        isAuGout: !m.unit, isManual: true, sources: []
      }));
      return [...derived, ...manual];
    },
    shoppingListGrouped() {
      const order = ["Fruits & légumes", "Viandes & poissons", "Produits laitiers & œufs", "Épicerie & féculents", "Autres"];
      const groups = {};
      for (const item of this.shoppingList) {
        const cat = categorizeIngredient(item.name);
        (groups[cat] = groups[cat] || []).push(item);
      }
      for (const cat in groups) groups[cat].sort((a, b) => a.name.localeCompare(b.name, "fr"));
      return order.filter(c => groups[c] && groups[c].length).map(c => ({ name: c, items: groups[c] }));
    },
    staplesList() {
      return this.aggregatedIngredients.filter(i => i.isStaple);
    },
    // Stock réel du Frigo, tel qu'affiché dans l'onglet Frigo.
    fridgeItemsList() {
      return Object.values(this.fridgeItems).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    },
    fridgeGrouped() {
      const order = ["Fruits & légumes", "Viandes & poissons", "Produits laitiers & œufs", "Épicerie & féculents", "Autres"];
      const groups = {};
      for (const item of this.fridgeItemsList) {
        const cat = categorizeIngredient(item.name);
        (groups[cat] = groups[cat] || []).push(item);
      }
      return order.filter(c => groups[c] && groups[c].length).map(c => ({ name: c, items: groups[c] }));
    },
    // Filet de sécurité : des idées improvisées toujours pertinentes,
    // choisies selon les rayons réellement présents au Frigo. Sert de
    // complément quand peu de vraies recettes matchent bien.
    fridgeTemplateSuggestions() {
      if (!this.fridgeItemsList.length) return [];
      const presentCats = new Set(this.fridgeGrouped.map(g => g.name));
      return FRIDGE_TEMPLATES
        .map(tpl => ({ ...tpl, matchCount: tpl.suits.filter(c => presentCats.has(c)).length }))
        .filter(tpl => tpl.matchCount > 0)
        .sort((a, b) => b.matchCount - a.matchCount)
        .slice(0, 3);
    },
    // Détail de l'idée vide-frigo actuellement ouverte dans la modale.
    openTemplate_() {
      if (!this.openTemplateId) return null;
      return FRIDGE_TEMPLATES.find(t => t.id === this.openTemplateId) || null;
    },
    // Articles du Frigo pertinents pour l'idée ouverte : tous ceux dont le
    // rayon correspond aux catégories visées par le gabarit ("suits").
    // NOTE : matching par rayon pour l'instant (ex. "Fruits & légumes"
    // entier) ; à affiner ingrédient par ingrédient une fois le contenu
    // des recettes vide-frigo validé.
    openTemplateMatchedItems() {
      if (!this.openTemplate_) return [];
      const suits = new Set(this.openTemplate_.suits);
      return this.fridgeGrouped
        .filter(g => suits.has(g.name))
        .map(g => ({ category: g.name, items: g.items }));
    }
  },

  methods: {
    // ---------------------------------------------------------------- utils
    recipeById(id) { return this.allRecipes.find(r => r.id === id); },
    recipeIndex(id) { return this.allRecipes.findIndex(r => r.id === id); },
    isSelected(id) { return this.weekSelections.some(s => s.recipeId === id); },
    formatQty,
    uniqueSourceTitles(sources) {
      const titles = [...new Set((sources || []).map(s => s.recipeTitle))];
      return titles.join(", ");
    },
    randomEmoji() { return EMOJI_CHOICES[Math.floor(Math.random() * EMOJI_CHOICES.length)]; },
    // Remonte les valeurs déjà sélectionnées en haut d'une liste d'options,
    // le reste gardant l'ordre alphabétique.
    sortSelectedFirst(options, selected) {
      const sel = new Set(selected);
      return [...options].sort((a, b) => {
        const aSel = sel.has(a) ? 0 : 1;
        const bSel = sel.has(b) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        return a.localeCompare(b, "fr");
      });
    },
    toggleDropdown(name) { this.openDropdown = this.openDropdown === name ? null : name; },
    closeDropdown() { this.openDropdown = null; },
    // Toggle générique réutilisé par les 4 filtres (Protéine/Origine/Type de
    // repas/Tags) : re-cliquer sur une valeur déjà sélectionnée la retire.
    toggleFilterValue(listName, value) {
      const list = this[listName];
      const i = list.indexOf(value);
      if (i >= 0) list.splice(i, 1);
      else list.push(value);
    },
    removeActiveFilterChip(chip) {
      this.toggleFilterValue(chip.list, chip.value);
    },
    toggleMatchMode(modeKey) {
      this[modeKey] = this[modeKey] === "all" ? "any" : "all";
    },
    toggleFridgeOnly() { this.showFridgeOnly = !this.showFridgeOnly; },
    toggleVideFrigo() { this.videFrigoOpen = !this.videFrigoOpen; },
    openTemplateDetail(id) { this.openTemplateId = id; },
    closeTemplateDetail() { this.openTemplateId = null; },
    setSortBy(val) {
      this.sortBy = val;
      this.closeDropdown();
    },
    toggleFiltersOpen() { this.filtersOpen = !this.filtersOpen; },
    onPrepMinInput(e) {
      let v = Number(e.target.value);
      if (v > this.prepMaxMinutes) v = this.prepMaxMinutes;
      this.prepMinMinutes = v;
    },
    onPrepMaxInput(e) {
      let v = Number(e.target.value);
      if (v < this.prepMinMinutes) v = this.prepMinMinutes;
      this.prepMaxMinutes = v;
    },
    addIngredientFilter() {
      const v = this.ingredientInput.trim().toLowerCase();
      if (!v) return;
      if (!this.ingredientFilterList.includes(v)) this.ingredientFilterList.push(v);
      this.ingredientInput = "";
    },
    selectIngredientSuggestion(name) {
      const v = name.trim().toLowerCase();
      if (!this.ingredientFilterList.includes(v)) this.ingredientFilterList.push(v);
      this.ingredientInput = "";
      this.ingredientInputFocused = false;
    },
    onIngredientFocus() { this.ingredientInputFocused = true; },
    onIngredientBlur() { setTimeout(() => { this.ingredientInputFocused = false; }, 150); },
    removeIngredientFilter(i) { this.ingredientFilterList.splice(i, 1); },
    resetFilters() {
      this.showOnlyMine = false;
      this.showFridgeOnly = false;
      this.recipeSearchQuery = "";
      this.selectedProteins = [];
      this.selectedOrigins = [];
      this.selectedMealTypes = [];
      this.selectedTags = [];
      this.proteinMatchMode = "any";
      this.originMatchMode = "any";
      this.mealTypeMatchMode = "any";
      this.tagsMatchMode = "any";
      this.prepMinMinutes = 0;
      this.prepMaxMinutes = PREP_SLIDER_MAX;
      this.ingredientFilterList = [];
      this.ingredientInput = "";
      this.ingredientMatchMode = "any";
      this.openDropdown = null;
    },
    toggleCategory(name) {
      const i = this.collapsedCategories.indexOf(name);
      if (i >= 0) this.collapsedCategories.splice(i, 1);
      else this.collapsedCategories.push(name);
    },
    // ---- édition de quantité (liste de courses ET restes, même mécanisme) ----
    openQtyEdit(item) {
      this.qtyEditItem = item;
      const existing = this.quantityOverrides[item.key];
      this.qtyEditInput = existing ? String(existing.qty) : String(item.buyQty ?? "");
    },
    cancelQtyEdit() {
      this.qtyEditItem = null;
      this.qtyEditInput = "";
    },
    async confirmQtyEdit() {
      const qty = Number(this.qtyEditInput);
      if (!(qty >= 0)) { this.showToast("Indique une quantité valide"); return; }
      try {
        await this.store.setQuantityOverride(this.qtyEditItem.key, qty, this.qtyEditItem.unit);
        await this.refreshQuantityOverrides();
        this.qtyEditItem = null;
        this.qtyEditInput = "";
        this.showToast("Quantité mise à jour 👍");
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    async clearQtyOverride() {
      if (!this.qtyEditItem) return;
      await this.store.deleteQuantityOverride(this.qtyEditItem.key);
      await this.refreshQuantityOverrides();
      this.qtyEditItem = null;
      this.qtyEditInput = "";
      this.showToast("Retour à la quantité calculée automatiquement");
    },
    // ---- édition d'un article ajouté à la main ----
    openManualEdit(item) {
      this.manualEditItem = item;
      this.manualEditForm = { name: item.name, qty: item.buyQty ?? "", unit: item.unit || "" };
    },
    cancelManualEdit() { this.manualEditItem = null; },
    async confirmManualEdit() {
      const name = this.manualEditForm.name.trim();
      if (!name) { this.showToast("Le nom ne peut pas être vide"); return; }
      try {
        await this.store.updateManualItem(this.manualEditItem.key, {
          name, qty: this.manualEditForm.qty === "" ? null : Number(this.manualEditForm.qty),
          unit: this.manualEditForm.unit
        });
        await this.refreshOverrides();
        this.manualEditItem = null;
        this.showToast("Article mis à jour 👍");
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    // ---- édition d'un article du Frigo (nom / unité / quantité) ----
    openFridgeEdit(item) {
      this.fridgeEditItem = item;
      this.fridgeEditForm = { name: item.name, qty: item.qty ?? "", unit: item.unit || "" };
    },
    cancelFridgeEdit() { this.fridgeEditItem = null; },
    async confirmFridgeEdit() {
      const name = this.fridgeEditForm.name.trim();
      if (!name) { this.showToast("Le nom ne peut pas être vide"); return; }
      const qty = this.fridgeEditForm.qty === "" ? 0 : Number(this.fridgeEditForm.qty);
      if (!(qty >= 0)) { this.showToast("Indique une quantité valide"); return; }
      try {
        await this.store.updateFridgeItem(this.fridgeEditItem.key, name, this.fridgeEditForm.unit.trim(), qty);
        await this.refreshFridge();
        this.fridgeEditItem = null;
        this.showToast("Article du Frigo mis à jour 👍");
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    // ---- ajout manuel d'un article directement dans le Frigo ----
    async addFridgeItemManual() {
      const name = this.newFridgeItemName.trim();
      if (!name) return;
      const qty = this.newFridgeItemQty === "" ? 0 : Number(this.newFridgeItemQty);
      if (!(qty >= 0)) { this.showToast("Indique une quantité valide"); return; }
      try {
        const unit = this.newFridgeItemUnit.trim();
        const key = normalizeKey(name, unit);
        await this.store.addToFridge(key, name, unit, qty);
        await this.refreshFridge();
        this.newFridgeItemName = ""; this.newFridgeItemQty = ""; this.newFridgeItemUnit = "";
        this.showToast(`${name} ajouté au Frigo 🧊`);
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    showToast(msg) {
      this.toastMessage = msg;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toastMessage = ""; }, 2400);
    },
    friendlyError(e) {
      const msg = (e && e.message) || "";
      if (msg.includes("already registered") || msg.includes("already exists")) return "Cet email est déjà utilisé.";
      if (msg.includes("Invalid login")) return "Email ou mot de passe incorrect.";
      if (msg.includes("Password should be")) return "Le mot de passe doit contenir au moins 6 caractères.";
      // Erreur non reconnue : on logge l'objet complet (Supabase y attache
      // souvent code / details / hint, bien plus précis que le message seul)
      // et on affiche ce qu'on a de plus utile à l'écran.
      console.error("Erreur complète :", e);
      let out = msg || "Une erreur est survenue.";
      if (e && e.code) out += ` [${e.code}]`;
      if (e && e.details) out += ` — détail : ${e.details}`;
      if (e && e.hint) out += ` — indice : ${e.hint}`;
      return out;
    },

    // ---------------------------------------------------------------- boot
    async refreshWeekSelections() {
      const raw = await this.store.getWeekSelections();
      const valid = [];
      let orphanCount = 0;
      for (const sel of raw) {
        if (this.recipeById(sel.recipeId)) {
          valid.push(sel);
        } else {
          orphanCount++;
          try { await this.store.removeWeekSelection(sel.recipeId); } catch (e) { /* tant pis, on la masque quand même côté affichage */ }
        }
      }
      this.weekSelections = valid;
      if (orphanCount > 0) {
        this.showToast(`${orphanCount} recette${orphanCount > 1 ? "s" : ""} qui n'exist${orphanCount > 1 ? "ent" : "e"} plus ${orphanCount > 1 ? "ont" : "a"} été retirée${orphanCount > 1 ? "s" : ""} de ta semaine`);
      }
    },
    async refreshOverrides() { this.overrides = await this.store.getOverrides(); },
    async refreshFridge() { this.fridgeItems = await this.store.getFridgeItems(); },
    async refreshCustomRecipes() { this.customRecipes = await this.store.getCustomRecipes(); },
    async refreshRecipeOverrides() { this.recipeOverrides = await this.store.getRecipeOverrides(); },
    async refreshQuantityOverrides() { this.quantityOverrides = await this.store.getQuantityOverrides(); },
    async refreshFavorites() { this.favoriteRecipeIds = await this.store.getFavorites(); },
    async refreshFamilyMembers() { this.familyMembers = await this.store.getFamilyMembers(); },
    async refreshFamily() {
      this.family = await this.store.getFamily();
      if (this.family) await this.refreshFamilyMembers();
    },
    async refreshAll() {
      // On charge d'abord les recettes perso + surcouches, car la validation
      // des sélections de la semaine (refreshWeekSelections) a besoin de
      // connaître l'intégralité de allRecipes pour savoir quelles recettes
      // existent encore réellement.
      await Promise.all([this.refreshCustomRecipes(), this.refreshRecipeOverrides()]);
      await Promise.all([
        this.refreshWeekSelections(), this.refreshOverrides(),
        this.refreshFridge(), this.refreshQuantityOverrides(), this.refreshFavorites()
      ]);
    },
    subscribeRealtime() {
      if (this._unsubscribe) this._unsubscribe();
      this._unsubscribe = this.store.subscribe(() => { this.refreshAll(); });
    },

    // ---------------------------------------------------------------- auth
    async handleSignUp() {
      this.authError = ""; this.authLoading = true;
      try {
        this.profile = await this.store.signUp({ ...this.authForm });
        await this.postLogin();
      } catch (e) { this.authError = this.friendlyError(e); }
      this.authLoading = false;
    },
    async handleSignIn() {
      this.authError = ""; this.authLoading = true;
      try {
        this.profile = await this.store.signIn({ email: this.authForm.email, password: this.authForm.password });
        await this.postLogin();
      } catch (e) { this.authError = this.friendlyError(e); }
      this.authLoading = false;
    },
    async postLogin() {
      this.session = await this.store.getSession();
      this.setProfileForm();
      await this.refreshFamily();
      await this.refreshAll();
      this.subscribeRealtime();
    },
    async handleSignOut() {
      if (this._unsubscribe) this._unsubscribe();
      await this.store.signOut();
      this.session = null; this.profile = null; this.family = null; this.familyMembers = [];
      this.weekSelections = []; this.overrides = { removed: [], manual: [] }; this.customRecipes = [];
      this.fridgeItems = {};
    },

    // ---------------------------------------------------------------- profile
    setProfileForm() {
      this.profileForm = {
        firstName: this.profile?.first_name || "",
        lastName: this.profile?.last_name || "",
        email: this.profile?.email || "",
        birthdate: this.profile?.birthdate || ""
      };
    },
    async saveProfileForm() {
      const payload = {
        id: this.profile?.id,
        first_name: this.profileForm.firstName,
        last_name: this.profileForm.lastName,
        email: this.profileForm.email,
        birthdate: this.profileForm.birthdate
      };
      this.profile = await this.store.saveProfile(payload);
      this.showToast("Profil enregistré ✨");
    },

    // ---------------------------------------------------------------- family
    async handleCreateFamily() {
      try {
        this.family = await this.store.createFamily(this.familyNameInput || "Notre famille");
        await this.refreshFamilyMembers();
        await this.refreshAll();
        this.subscribeRealtime();
        this.showToast("Famille créée 🎉");
      } catch (e) { this.familyError = this.friendlyError(e); }
    },
    async handleJoinFamily() {
      this.familyError = "";
      try {
        this.family = await this.store.joinFamily(this.joinCodeInput.trim().toUpperCase());
        await this.refreshFamilyMembers();
        await this.refreshAll();
        this.subscribeRealtime();
        this.joinCodeInput = "";
        this.showToast("Tu as rejoint la famille 🎉");
      } catch (e) { this.familyError = "Code invalide, vérifie avec ta/ton partenaire."; }
    },
    copyInviteCode() {
      if (!this.family) return;
      navigator.clipboard?.writeText(this.family.invite_code);
      this.showToast("Code copié !");
    },

    // ---------------------------------------------------------------- recipes / week
    handleCardTap(id) {
      // Le tap ouvre toujours le popup en aperçu — la recette n'est ajoutée
      // à la semaine qu'après confirmation (bouton "Ajouter à ma semaine"),
      // ce qui laisse le temps de choisir le nombre de portions d'abord.
      this.openRecipe(id);
    },
    openRecipe(id) {
      if (!this.recipeById(id)) {
        this.showToast("Cette recette n'existe plus dans la bibliothèque.");
        return;
      }
      const existing = this.weekSelections.find(s => s.recipeId === id);
      this.modalServings = existing ? existing.servings : (this.recipeById(id)?.baseServings || 2);
      this.openRecipeId = id;
    },
    closeModal() { this.openRecipeId = null; },
    async changeServings(delta) {
      const next = this.modalServings + delta;
      if (next < 1 || next > 6) return;
      this.modalServings = next;
      // Si la recette est déjà dans la semaine, on synchronise en direct ;
      // sinon on ajuste juste l'aperçu, la sélection se fera au clic sur
      // "Ajouter à ma semaine".
      if (this.isSelected(this.openRecipeId)) {
        await this.store.upsertWeekSelection(this.openRecipeId, next);
        await this.refreshWeekSelections();
      }
    },
    async addToWeekFromModal() {
      try {
        await this.store.upsertWeekSelection(this.openRecipeId, this.modalServings);
        await this.refreshWeekSelections();
        this.showToast("Ajoutée à ta semaine 👍");
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    async removeFromWeek() {
      await this.store.removeWeekSelection(this.openRecipeId);
      await this.refreshWeekSelections();
      this.closeModal();
      this.showToast("Recette retirée de ta semaine");
    },
    async quickRemoveFromWeek(id) {
      await this.store.removeWeekSelection(id);
      await this.refreshWeekSelections();
    },
    isFavorite(id) { return this.favoriteRecipeIds.includes(id); },
    async toggleFavorite(id) {
      try {
        this.favoriteRecipeIds = await this.store.toggleFavorite(id);
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    async deleteOpenCustomRecipe() {
      if (!this.openRecipe_ || !this.openRecipe_.isCustom) return;
      await this.store.deleteCustomRecipe(this.openRecipeId);
      await this.store.removeWeekSelection(this.openRecipeId);
      await this.refreshCustomRecipes();
      await this.refreshWeekSelections();
      this.closeModal();
      this.showToast("Recette supprimée");
    },

    // ---------------------------------------------------------------- shopping list
    // Cocher un article pendant les courses : il quitte la liste et rejoint
    // le Frigo avec la quantité réellement achetée (buyQty), pas le besoin
    // théorique. Cumulatif : s'il y en avait déjà, ça s'additionne.
    // L'article disparaît de la liste de façon garantie, même s'il avait une
    // quantité modifiée à la main (l'override est alors effacé).
    async moveToFridge(item) {
      try {
        await this.store.addToFridge(item.key, item.name, item.unit || null, item.buyQty ?? 0);
        if (item.isManual) {
          await this.store.removeManualItem(item.key);
          await this.refreshOverrides();
        } else {
          if (item.isOverridden) await this.store.deleteQuantityOverride(item.key);
          await this.store.addRemovedOverride(item.key);
          await this.refreshOverrides();
          await this.refreshQuantityOverrides();
        }
        await this.refreshFridge();
        this.showToast(`${item.name} ajouté au Frigo 🧊`);
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    // Si l'article était masqué de la liste de courses suite à un achat
    // précédent, on décolle cette étiquette : le stock repart à zéro, donc
    // il redevient éligible si une recette en a besoin.
    async removeFridgeItemAction(key) {
      try {
        await this.store.removeFridgeItem(key);
        await this.store.removeRemovedOverride(key);
        await this.refreshFridge();
        await this.refreshOverrides();
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    // "Cuisinée" depuis Ma semaine : déduit du Frigo les ingrédients de la
    // recette (hors indispensables/staples), à l'échelle des portions
    // choisies, puis retire la recette de la semaine. Tout ingrédient dont
    // le stock retombe à zéro redevient éligible à la liste de courses.
    async markRecipeCooked(id) {
      const recipe = this.recipeById(id);
      const sel = this.weekSelections.find(s => s.recipeId === id);
      if (!recipe || !sel) return;
      try {
        const touchedKeys = [];
        for (const ing of recipe.ingredients) {
          if (isStapleIngredient(ing)) continue;
          const key = normalizeKey(ing.name, ing.unit);
          const qty = scaledQty(ing, sel.servings, recipe.baseServings);
          if (qty) { await this.store.subtractFromFridge(key, qty); touchedKeys.push(key); }
        }
        await this.refreshFridge();
        for (const key of touchedKeys) {
          if (!this.fridgeItems[key]) await this.store.removeRemovedOverride(key);
        }
        await this.refreshOverrides();
        await this.store.removeWeekSelection(id);
        await this.refreshWeekSelections();
        this.showToast(`${recipe.title} cuisinée 🍳`);
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    requestRemove(item) {
      if (item.isManual) this.removeManualItemDirect(item.key);
      else this.pendingRemoveItem = item;
    },
    async confirmRemove() {
      await this.store.addRemovedOverride(this.pendingRemoveItem.key);
      await this.refreshOverrides();
      this.pendingRemoveItem = null;
      this.showToast("Ingrédient retiré de la liste");
    },
    cancelRemove() { this.pendingRemoveItem = null; },
    async removeManualItemDirect(key) {
      await this.store.removeManualItem(key);
      await this.refreshOverrides();
    },
    async addManualItem() {
      const name = this.newItemName.trim();
      if (!name) return;
      try {
        const item = { id: "manual-" + uid(), name, qty: null, unit: "" };
        await this.store.addManualItem(item);
        await this.refreshOverrides();
        this.newItemName = "";
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    async shareShoppingList() {
      if (!this.shoppingListGrouped.length) { this.showToast("Ta liste de courses est vide"); return; }
      const lines = ["🛒 Liste de courses", ""];
      for (const group of this.shoppingListGrouped) {
        lines.push(group.name.toUpperCase());
        for (const item of group.items) {
          const qtyText = (!item.isAuGout && item.buyQty !== null) ? this.formatQty(item.buyQty, item.unit) + " " : "";
          lines.push(`- ${qtyText}${item.name}`);
        }
        lines.push("");
      }
      const text = lines.join("\n").trim();
      if (navigator.share) {
        try { await navigator.share({ title: "Liste de courses", text }); }
        catch (e) { /* l'utilisateur a annulé le partage, rien à faire */ }
      } else if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(text);
          this.showToast("Liste copiée dans le presse-papier 📋");
        } catch (e) { this.showToast("Impossible de copier la liste."); }
      } else {
        this.showToast("Le partage n'est pas supporté sur ce navigateur.");
      }
    },

    // ---------------------------------------------------------------- add / import / edit recipe
    openAddRecipe() {
      this.resetRecipeForm();
      this.recipeFormMode = "choice";
      this.recipeFormModalOpen = true;
    },
    openEditRecipe(id) {
      const r = this.recipeById(id);
      if (!r) return;
      this.recipeForm = {
        title: r.title, subtitle: r.subtitle || "", baseServings: r.baseServings,
        prepMinutes: r.prepMinutes, difficulty: r.difficulty || "Facile", kcal: r.kcal,
        tags: [...(r.tags || [])], emoji: r.emoji, sourceUrl: r.sourceUrl || r.url || null,
        ingredients: r.ingredients.map(i => ({ ...i })),
        steps: [...r.steps]
      };
      this.editingRecipeId = id;
      this.recipeFormMode = "manual";
      this.recipeFormModalOpen = true;
      this.closeModal();
    },
    closeRecipeFormModal() { this.recipeFormModalOpen = false; this.editingRecipeId = null; },
    handleFormBack() {
      if (this.editingRecipeId) this.closeRecipeFormModal();
      else this.recipeFormMode = "choice";
    },
    resetRecipeForm() {
      this.importUrl = "";
      this.importError = "";
      this.editingRecipeId = null;
      this.activeIngredientRowIndex = null;
      this.recipeTagInput = "";
      this.recipeTagInputFocused = false;
      this.recipeForm = {
        title: "", subtitle: "", baseServings: 2, prepMinutes: 30,
        difficulty: "Facile", kcal: null, tags: [], emoji: this.randomEmoji(),
        sourceUrl: null,
        ingredients: [this.blankIngredient()],
        steps: [""]
      };
    },
    blankIngredient() { return { name: "", qty: null, unit: "g", staple: false }; },
    addIngredientRow() { this.recipeForm.ingredients.push(this.blankIngredient()); },
    removeIngredientRow(i) { this.recipeForm.ingredients.splice(i, 1); },
    addStepRow() { this.recipeForm.steps.push(""); },
    removeStepRow(i) { this.recipeForm.steps.splice(i, 1); },
    pickEmoji(e) { this.recipeForm.emoji = e; },
    ingredientRowSuggestions(text) {
      const q = (text || "").trim().toLowerCase();
      if (!q) return [];
      return this.allIngredientNames.filter(n => n.toLowerCase().includes(q)).slice(0, 6);
    },
    selectIngredientRowSuggestion(i, name) {
      this.recipeForm.ingredients[i].name = name;
      // Pré-remplit l'unité si cet ingrédient est déjà connu dans la bibliothèque.
      for (const r of this.allRecipes) {
        const match = r.ingredients.find(ing => ing.name === name);
        if (match) { this.recipeForm.ingredients[i].unit = match.unit; break; }
      }
      this.activeIngredientRowIndex = null;
    },
    onIngredientRowFocus(i) { this.activeIngredientRowIndex = i; },
    onIngredientRowBlur() { setTimeout(() => { this.activeIngredientRowIndex = null; }, 150); },
    addRecipeFormTag() {
      const v = this.recipeTagInput.trim();
      if (!v) return;
      if (!this.recipeForm.tags.includes(v)) this.recipeForm.tags.push(v);
      this.recipeTagInput = "";
    },
    selectRecipeFormTagSuggestion(tag) {
      if (!this.recipeForm.tags.includes(tag)) this.recipeForm.tags.push(tag);
      this.recipeTagInput = "";
      this.recipeTagInputFocused = false;
    },
    removeRecipeFormTag(i) { this.recipeForm.tags.splice(i, 1); },
    onRecipeTagFocus() { this.recipeTagInputFocused = true; },
    onRecipeTagBlur() { setTimeout(() => { this.recipeTagInputFocused = false; }, 150); },

    async handleImportRecipe() {
      if (!this.importUrl.trim()) return;
      this.importError = ""; this.importLoading = true;
      try {
        const parsed = await this.store.importRecipeFromUrl(this.importUrl.trim());
        this.recipeForm = {
          title: parsed.title || "",
          subtitle: parsed.subtitle || "",
          baseServings: parsed.baseServings || 2,
          prepMinutes: parsed.prepMinutes || 30,
          difficulty: "Facile",
          kcal: parsed.kcal || null,
          tags: (parsed.tags && parsed.tags.length) ? parsed.tags : ["Importée"],
          emoji: this.randomEmoji(),
          sourceUrl: this.importUrl.trim(),
          ingredients: (parsed.ingredients && parsed.ingredients.length) ? parsed.ingredients : [this.blankIngredient()],
          steps: (parsed.steps && parsed.steps.length) ? parsed.steps : [""]
        };
        this.recipeFormMode = "manual";
        this.showToast("Recette importée — vérifie et complète si besoin 👀");
      } catch (e) {
        this.importError = this.friendlyError(e);
      }
      this.importLoading = false;
    },

    async saveRecipeForm() {
      if (!this.recipeForm.title.trim()) { this.showToast("Ajoute au moins un titre"); return; }
      const cleanIngredients = this.recipeForm.ingredients
        .filter(i => i.name && i.name.trim())
        .map(i => ({ name: i.name.trim(), qty: i.qty === "" ? null : Number(i.qty) || null, unit: i.unit || "pièce", staple: !!i.staple }));
      const cleanSteps = this.recipeForm.steps.map(s => s.trim()).filter(Boolean);
      if (cleanIngredients.length === 0) { this.showToast("Ajoute au moins un ingrédient"); return; }
      const payload = {
        title: this.recipeForm.title.trim(),
        subtitle: this.recipeForm.subtitle.trim(),
        baseServings: Number(this.recipeForm.baseServings) || 2,
        prepMinutes: Number(this.recipeForm.prepMinutes) || null,
        difficulty: this.recipeForm.difficulty,
        kcal: this.recipeForm.kcal ? Number(this.recipeForm.kcal) : null,
        tags: this.recipeForm.tags,
        emoji: this.recipeForm.emoji,
        sourceUrl: this.recipeForm.sourceUrl,
        ingredients: cleanIngredients,
        steps: cleanSteps
      };
      try {
        if (this.editingRecipeId) {
          const isCustom = this.customRecipes.some(r => r.id === this.editingRecipeId);
          if (isCustom) {
            await this.store.updateCustomRecipe(this.editingRecipeId, payload);
            await this.refreshCustomRecipes();
          } else {
            await this.store.saveRecipeOverride(this.editingRecipeId, payload);
            await this.refreshRecipeOverrides();
          }
          this.showToast("Recette mise à jour ✨");
        } else {
          payload.id = "custom-" + uid();
          await this.store.addCustomRecipe(payload);
          await this.refreshCustomRecipes();
          this.showToast("Recette ajoutée à ta bibliothèque 🎉");
        }
        this.recipeFormModalOpen = false;
        this.editingRecipeId = null;
      } catch (e) { this.showToast(this.friendlyError(e)); }
    },
    async resetRecipeOverride() {
      if (!this.editingRecipeId) return;
      await this.store.deleteRecipeOverride(this.editingRecipeId);
      await this.refreshRecipeOverrides();
      this.recipeFormModalOpen = false;
      this.editingRecipeId = null;
      this.showToast("Recette réinitialisée à sa version d'origine");
    }
  },

  async mounted() {
    this.store = createStore();
    const info = await this.store.init();
    this.storeMode = info.mode;

    if (this.storeMode === "local") {
      this.profile = await this.store.getProfile();
      this.setProfileForm();
      await this.refreshAll();
    } else {
      this.session = await this.store.getSession();
      if (this.session) {
        this.profile = await this.store.getProfile();
        this.setProfileForm();
        await this.refreshFamily();
        await this.refreshAll();
        this.subscribeRealtime();
      }
    }
    this.booted = true;
  }
});

app.mount("#app");
