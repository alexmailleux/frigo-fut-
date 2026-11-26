/**
 * Couche de persistance. Deux implémentations derrière la même interface :
 *  - LocalStore   : localStorage, un seul appareil, aucun compte requis.
 *  - SupaStore    : Supabase (auth + Postgres + Realtime), compte + famille
 *                    partagée entre plusieurs téléphones.
 *
 * app.js n'appelle jamais localStorage ou supabase-js directement : il passe
 * toujours par `Store.xxx()`, ce qui permet de basculer entre les deux modes
 * sans toucher au reste du code.
 */

import {
  DISCRETE_UNITS,
  normalizeKey,
  scaledQty,
  roundForBuying,
  isStapleIngredient,
  categorizeIngredient,
} from './utils.js';

const LS_KEYS = {
  profile: "repas_local_profile",
  weekSelections: "repas_local_week",
  overrides: "repas_local_overrides",
  fridge: "repas_local_fridge",
  customRecipes: "repas_local_custom_recipes",
  recipeOverrides: "repas_local_recipe_overrides",
  quantityOverrides: "repas_local_quantity_overrides",
  favorites: "repas_local_favorites"
};

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------------------------------------------------------------------- */
/* LocalStore                                                              */
/* ---------------------------------------------------------------------- */
const LocalStore = {
  mode: "local",

  async init() {
    return { ready: true, mode: "local" };
  },
  async getSession() {
    return { id: "local-user", email: null };
  },
  async getProfile() {
    return lsGet(LS_KEYS.profile, null);
  },
  async saveProfile(profile) {
    lsSet(LS_KEYS.profile, profile);
    return profile;
  },
  async getFamily() {
    // En local, il n'y a pas de vraie notion de famille partagée.
    return null;
  },
  async createFamily() { throw new Error("La famille partagée nécessite Supabase (voir README)."); },
  async joinFamily() { throw new Error("La famille partagée nécessite Supabase (voir README)."); },
  async getFamilyMembers() { return []; },

  async getWeekSelections() {
    return lsGet(LS_KEYS.weekSelections, []);
  },
  async upsertWeekSelection(recipeId, servings) {
    const list = lsGet(LS_KEYS.weekSelections, []);
    const idx = list.findIndex(s => s.recipeId === recipeId);
    if (idx >= 0) list[idx].servings = servings;
    else list.push({ recipeId, servings });
    lsSet(LS_KEYS.weekSelections, list);
    return list;
  },
  async removeWeekSelection(recipeId) {
    let list = lsGet(LS_KEYS.weekSelections, []);
    list = list.filter(s => s.recipeId !== recipeId);
    lsSet(LS_KEYS.weekSelections, list);
    return list;
  },

  async getOverrides() {
    return lsGet(LS_KEYS.overrides, { removed: [], manual: [] });
  },
  async addRemovedOverride(key) {
    const o = lsGet(LS_KEYS.overrides, { removed: [], manual: [] });
    if (!o.removed.includes(key)) o.removed.push(key);
    lsSet(LS_KEYS.overrides, o);
    return o;
  },
  // Décolle l'étiquette "retiré de la liste" — utilisé quand un article du
  // Frigo tombe à zéro, pour qu'il redevienne éligible à la liste de
  // courses la prochaine fois qu'une recette en a besoin.
  async removeRemovedOverride(key) {
    const o = lsGet(LS_KEYS.overrides, { removed: [], manual: [] });
    o.removed = o.removed.filter(k => k !== key);
    lsSet(LS_KEYS.overrides, o);
    return o;
  },
  async addManualItem(item) {
    const o = lsGet(LS_KEYS.overrides, { removed: [], manual: [] });
    o.manual.push(item);
    lsSet(LS_KEYS.overrides, o);
    return o;
  },
  async removeManualItem(id) {
    const o = lsGet(LS_KEYS.overrides, { removed: [], manual: [] });
    o.manual = o.manual.filter(m => m.id !== id);
    lsSet(LS_KEYS.overrides, o);
    return o;
  },

  // Stock réel du Frigo : map { [item_key]: {key, name, unit, qty} }.
  // addToFridge est cumulatif (additionne à l'existant), subtractFromFridge
  // supprime l'entrée si la quantité restante tombe à 0 ou moins.
  async getFridgeItems() {
    return lsGet(LS_KEYS.fridge, {});
  },
  async addToFridge(key, name, unit, qty) {
    const map = lsGet(LS_KEYS.fridge, {});
    const existing = map[key];
    const newQty = Math.round(((existing ? existing.qty : 0) + (qty || 0)) * 100) / 100;
    map[key] = { key, name, unit, qty: newQty };
    lsSet(LS_KEYS.fridge, map);
    return map;
  },
  async removeFridgeItem(key) {
    const map = lsGet(LS_KEYS.fridge, {});
    delete map[key];
    lsSet(LS_KEYS.fridge, map);
    return map;
  },
  async subtractFromFridge(key, qty) {
    const map = lsGet(LS_KEYS.fridge, {});
    if (!map[key]) return map;
    const newQty = Math.round((map[key].qty - (qty || 0)) * 100) / 100;
    if (newQty <= 0) delete map[key];
    else map[key] = { ...map[key], qty: newQty };
    lsSet(LS_KEYS.fridge, map);
    return map;
  },
  // Modifie nom/unité/quantité d'un article du Frigo. Comme la clé dépend
  // du nom+unité, un changement de l'un ou l'autre "renomme" l'article : on
  // fusionne (somme) avec un article existant de même nouvelle clé, s'il y
  // en a un.
  async updateFridgeItem(oldKey, name, unit, qty) {
    const map = lsGet(LS_KEYS.fridge, {});
    const newKey = normalizeKey(name, unit);
    delete map[oldKey];
    const existing = map[newKey];
    const finalQty = Math.round(((existing ? existing.qty : 0) + (qty || 0)) * 100) / 100;
    if (finalQty <= 0) delete map[newKey];
    else map[newKey] = { key: newKey, name, unit, qty: finalQty };
    lsSet(LS_KEYS.fridge, map);
    return map;
  },

  async getCustomRecipes() {
    return lsGet(LS_KEYS.customRecipes, []);
  },
  async addCustomRecipe(recipe) {
    const list = lsGet(LS_KEYS.customRecipes, []);
    list.unshift({ ...recipe, isCustom: true });
    lsSet(LS_KEYS.customRecipes, list);
    return list;
  },
  async deleteCustomRecipe(id) {
    let list = lsGet(LS_KEYS.customRecipes, []);
    list = list.filter(r => r.id !== id);
    lsSet(LS_KEYS.customRecipes, list);
    return list;
  },
  async updateCustomRecipe(id, data) {
    const list = lsGet(LS_KEYS.customRecipes, []);
    const idx = list.findIndex(r => r.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...data, id, isCustom: true };
    lsSet(LS_KEYS.customRecipes, list);
    return list;
  },
  async getRecipeOverrides() {
    return lsGet(LS_KEYS.recipeOverrides, {});
  },
  async saveRecipeOverride(recipeId, data) {
    const map = lsGet(LS_KEYS.recipeOverrides, {});
    map[recipeId] = data;
    lsSet(LS_KEYS.recipeOverrides, map);
    return map;
  },
  async deleteRecipeOverride(recipeId) {
    const map = lsGet(LS_KEYS.recipeOverrides, {});
    delete map[recipeId];
    lsSet(LS_KEYS.recipeOverrides, map);
    return map;
  },
  async importRecipeFromUrl() {
    throw new Error("L'import automatique depuis une URL nécessite Supabase (voir README.md). En attendant, tu peux créer la recette manuellement en copiant les infos.");
  },

  async getQuantityOverrides() {
    return lsGet(LS_KEYS.quantityOverrides, {});
  },
  async setQuantityOverride(key, qty, unit) {
    const map = lsGet(LS_KEYS.quantityOverrides, {});
    map[key] = { qty, unit };
    lsSet(LS_KEYS.quantityOverrides, map);
    return map;
  },
  async deleteQuantityOverride(key) {
    const map = lsGet(LS_KEYS.quantityOverrides, {});
    delete map[key];
    lsSet(LS_KEYS.quantityOverrides, map);
    return map;
  },
  async updateManualItem(id, data) {
    const o = lsGet(LS_KEYS.overrides, { removed: [], manual: [] });
    const idx = o.manual.findIndex(m => m.id === id);
    if (idx >= 0) o.manual[idx] = { ...o.manual[idx], ...data, id };
    lsSet(LS_KEYS.overrides, o);
    return o;
  },
  async getFavorites() {
    return lsGet(LS_KEYS.favorites, []);
  },
  async toggleFavorite(recipeId) {
    let list = lsGet(LS_KEYS.favorites, []);
    if (list.includes(recipeId)) list = list.filter(id => id !== recipeId);
    else list.push(recipeId);
    lsSet(LS_KEYS.favorites, list);
    return list;
  },

  subscribe() { /* pas de sync temps réel en local */ return () => {}; }
};

/* ---------------------------------------------------------------------- */
/* SupaStore                                                               */
/* ---------------------------------------------------------------------- */
function mapDbRecipeToApp(row) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || "",
    baseServings: row.base_servings || 2,
    prepMinutes: row.prep_minutes || null,
    difficulty: row.difficulty || "Facile",
    kcal: row.kcal || null,
    tags: row.tags || [],
    emoji: row.emoji || "🍽️",
    sourceUrl: row.source_url || null,
    ingredients: row.ingredients || [],
    steps: row.steps || [],
    isCustom: true
  };
}

function mapDbOverrideToApp(row) {
  return {
    title: row.title,
    subtitle: row.subtitle || "",
    baseServings: row.base_servings || 2,
    prepMinutes: row.prep_minutes || null,
    difficulty: row.difficulty || "Facile",
    kcal: row.kcal || null,
    tags: row.tags || [],
    emoji: row.emoji || "🍽️",
    ingredients: row.ingredients || [],
    steps: row.steps || []
  };
}

function makeSupaStore(client) {
  let currentUserId = null;
  let currentFamilyId = null;

  return {
    mode: "supabase",
    client,

    async init() {
      const { data } = await client.auth.getSession();
      if (data.session) currentUserId = data.session.user.id;
      return { ready: true, mode: "supabase" };
    },

    async signUp({ email, password, firstName, lastName, birthdate }) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      currentUserId = data.user.id;
      const { error: profErr } = await client.from("profiles").insert({
        id: data.user.id, first_name: firstName, last_name: lastName,
        email, birthdate: birthdate || null
      });
      if (profErr) throw profErr;
      return this.getProfile();
    },
    async signIn({ email, password }) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUserId = data.user.id;
      return this.getProfile();
    },
    async signOut() {
      await client.auth.signOut();
      currentUserId = null;
      currentFamilyId = null;
    },
    async getSession() {
      const { data } = await client.auth.getSession();
      if (!data.session) return null;
      currentUserId = data.session.user.id;
      return { id: data.session.user.id, email: data.session.user.email };
    },

    async getProfile() {
      if (!currentUserId) return null;
      const { data, error } = await client.from("profiles").select("*").eq("id", currentUserId).single();
      if (error) return null;
      currentFamilyId = data.family_id;
      return data;
    },
    async saveProfile(profile) {
      // upsert (et pas update) : si le profil n'a jamais été créé — par
      // exemple parce que l'inscription a échoué avant cette étape la
      // première fois — ça le crée au lieu de ne rien faire silencieusement.
      const { data: userData } = await client.auth.getUser();
      const email = userData?.user?.email || null;
      const { error } = await client.from("profiles").upsert({
        id: currentUserId,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email,
        birthdate: profile.birthdate || null
      }, { onConflict: "id" });
      if (error) throw error;
      return profile;
    },

    async getFamily() {
      if (!currentFamilyId) return null;
      const { data, error } = await client.from("families").select("*").eq("id", currentFamilyId).single();
      if (error) return null;
      return data;
    },
    async createFamily(name) {
      const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data, error } = await client.from("families")
        .insert({ name, invite_code: inviteCode, created_by: currentUserId })
        .select().single();
      if (error) throw error;
      const { error: updErr } = await client.from("profiles")
        .update({ family_id: data.id }).eq("id", currentUserId);
      if (updErr) throw updErr;
      currentFamilyId = data.id;
      return data;
    },
    async joinFamily(code) {
      const { data, error } = await client.rpc("join_family", { code });
      if (error) throw error;
      currentFamilyId = data.id;
      return data;
    },
    async getFamilyMembers() {
      if (!currentFamilyId) return [];
      const { data, error } = await client.from("profiles").select("*").eq("family_id", currentFamilyId);
      if (error) return [];
      return data;
    },

    async getWeekSelections() {
      if (!currentFamilyId) return [];
      const { data, error } = await client.from("weekly_selections").select("*").eq("family_id", currentFamilyId);
      if (error) return [];
      return data.map(d => ({ recipeId: d.recipe_id, servings: d.servings }));
    },
    async upsertWeekSelection(recipeId, servings) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      const { error } = await client.from("weekly_selections").upsert({
        family_id: currentFamilyId, recipe_id: recipeId, servings, added_by: currentUserId
      }, { onConflict: "family_id,recipe_id" });
      if (error) throw error;
      return this.getWeekSelections();
    },
    async removeWeekSelection(recipeId) {
      if (!currentFamilyId) return [];
      await client.from("weekly_selections").delete()
        .eq("family_id", currentFamilyId).eq("recipe_id", recipeId);
      return this.getWeekSelections();
    },

    async getOverrides() {
      if (!currentFamilyId) return { removed: [], manual: [] };
      const { data, error } = await client.from("list_overrides").select("*").eq("family_id", currentFamilyId);
      if (error) return { removed: [], manual: [] };
      return {
        removed: data.filter(d => d.action === "removed").map(d => d.item_key),
        manual: data.filter(d => d.action === "manual").map(d => ({ id: d.item_key, name: d.name, qty: d.qty, unit: d.unit }))
      };
    },
    async addRemovedOverride(key) {
      if (!currentFamilyId) return;
      await client.from("list_overrides").upsert({
        family_id: currentFamilyId, item_key: key, action: "removed"
      }, { onConflict: "family_id,item_key" });
      return this.getOverrides();
    },
    // Décolle l'étiquette "retiré de la liste" — utilisé quand un article du
    // Frigo tombe à zéro, pour qu'il redevienne éligible à la liste de
    // courses la prochaine fois qu'une recette en a besoin.
    async removeRemovedOverride(key) {
      if (!currentFamilyId) return;
      await client.from("list_overrides").delete()
        .eq("family_id", currentFamilyId).eq("item_key", key).eq("action", "removed");
      return this.getOverrides();
    },
    async addManualItem(item) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      await client.from("list_overrides").insert({
        family_id: currentFamilyId, item_key: item.id, action: "manual",
        name: item.name, qty: item.qty, unit: item.unit
      });
      return this.getOverrides();
    },
    async removeManualItem(id) {
      if (!currentFamilyId) return;
      await client.from("list_overrides").delete()
        .eq("family_id", currentFamilyId).eq("item_key", id);
      return this.getOverrides();
    },

    // Stock réel du Frigo, calqué sur le pattern de quantity_overrides.
    // addToFridge est cumulatif ; subtractFromFridge supprime la ligne si
    // la quantité restante tombe à 0 ou moins.
    async getFridgeItems() {
      if (!currentFamilyId) return {};
      const { data, error } = await client.from("fridge_items").select("*").eq("family_id", currentFamilyId);
      if (error) return {};
      const map = {};
      data.forEach((row) => { map[row.item_key] = { key: row.item_key, name: row.name, unit: row.unit, qty: Number(row.qty) }; });
      return map;
    },
    async addToFridge(key, name, unit, qty) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      const current = await this.getFridgeItems();
      const existing = current[key];
      const newQty = Math.round(((existing ? existing.qty : 0) + (qty || 0)) * 100) / 100;
      const { error } = await client.from("fridge_items").upsert({
        family_id: currentFamilyId, item_key: key, name, unit, qty: newQty
      }, { onConflict: "family_id,item_key" });
      if (error) throw error;
      return this.getFridgeItems();
    },
    async removeFridgeItem(key) {
      if (!currentFamilyId) return {};
      await client.from("fridge_items").delete().eq("family_id", currentFamilyId).eq("item_key", key);
      return this.getFridgeItems();
    },
    async subtractFromFridge(key, qty) {
      if (!currentFamilyId) return {};
      const current = await this.getFridgeItems();
      const existing = current[key];
      if (!existing) return current;
      const newQty = Math.round((existing.qty - (qty || 0)) * 100) / 100;
      if (newQty <= 0) {
        await client.from("fridge_items").delete().eq("family_id", currentFamilyId).eq("item_key", key);
      } else {
        const { error } = await client.from("fridge_items").update({ qty: newQty }).eq("family_id", currentFamilyId).eq("item_key", key);
        if (error) throw error;
      }
      return this.getFridgeItems();
    },
    // Modifie nom/unité/quantité d'un article du Frigo. Comme la clé dépend
    // du nom+unité, un changement de l'un ou l'autre "renomme" l'article :
    // on fusionne (somme) avec un article existant de même nouvelle clé,
    // s'il y en a un.
    async updateFridgeItem(oldKey, name, unit, qty) {
      if (!currentFamilyId) return {};
      const newKey = normalizeKey(name, unit);
      if (newKey === oldKey) {
        const { error } = await client.from("fridge_items")
          .update({ name, unit, qty }).eq("family_id", currentFamilyId).eq("item_key", oldKey);
        if (error) throw error;
        return this.getFridgeItems();
      }
      const current = await this.getFridgeItems();
      const existing = current[newKey];
      const finalQty = Math.round(((existing ? existing.qty : 0) + (qty || 0)) * 100) / 100;
      await client.from("fridge_items").delete().eq("family_id", currentFamilyId).eq("item_key", oldKey);
      if (finalQty <= 0) {
        await client.from("fridge_items").delete().eq("family_id", currentFamilyId).eq("item_key", newKey);
      } else {
        const { error } = await client.from("fridge_items").upsert({
          family_id: currentFamilyId, item_key: newKey, name, unit, qty: finalQty
        }, { onConflict: "family_id,item_key" });
        if (error) throw error;
      }
      return this.getFridgeItems();
    },

    async getCustomRecipes() {
      if (!currentFamilyId) return [];
      const { data, error } = await client.from("custom_recipes").select("*")
        .eq("family_id", currentFamilyId).order("created_at", { ascending: false });
      if (error) return [];
      return data.map(mapDbRecipeToApp);
    },
    async addCustomRecipe(recipe) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte pour ajouter des recettes.");
      const { error } = await client.from("custom_recipes").insert({
        family_id: currentFamilyId,
        title: recipe.title,
        subtitle: recipe.subtitle,
        base_servings: recipe.baseServings,
        prep_minutes: recipe.prepMinutes,
        difficulty: recipe.difficulty,
        kcal: recipe.kcal,
        tags: recipe.tags,
        emoji: recipe.emoji,
        source_url: recipe.sourceUrl || null,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        created_by: currentUserId
      });
      if (error) throw error;
      return this.getCustomRecipes();
    },
    async deleteCustomRecipe(id) {
      if (!currentFamilyId) return [];
      await client.from("custom_recipes").delete().eq("id", id).eq("family_id", currentFamilyId);
      return this.getCustomRecipes();
    },
    async updateCustomRecipe(id, data) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      const { error } = await client.from("custom_recipes").update({
        title: data.title, subtitle: data.subtitle, base_servings: data.baseServings,
        prep_minutes: data.prepMinutes, difficulty: data.difficulty, kcal: data.kcal,
        tags: data.tags, emoji: data.emoji, ingredients: data.ingredients, steps: data.steps
      }).eq("id", id).eq("family_id", currentFamilyId);
      if (error) throw error;
      return this.getCustomRecipes();
    },
    async getRecipeOverrides() {
      if (!currentFamilyId) return {};
      const { data, error } = await client.from("recipe_overrides").select("*").eq("family_id", currentFamilyId);
      if (error) return {};
      const map = {};
      data.forEach((row) => { map[row.recipe_id] = mapDbOverrideToApp(row); });
      return map;
    },
    async saveRecipeOverride(recipeId, data) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      const { error } = await client.from("recipe_overrides").upsert({
        family_id: currentFamilyId, recipe_id: recipeId,
        title: data.title, subtitle: data.subtitle, base_servings: data.baseServings,
        prep_minutes: data.prepMinutes, difficulty: data.difficulty, kcal: data.kcal,
        tags: data.tags, emoji: data.emoji, ingredients: data.ingredients, steps: data.steps
      }, { onConflict: "family_id,recipe_id" });
      if (error) throw error;
      return this.getRecipeOverrides();
    },
    async deleteRecipeOverride(recipeId) {
      if (!currentFamilyId) return {};
      await client.from("recipe_overrides").delete().eq("family_id", currentFamilyId).eq("recipe_id", recipeId);
      return this.getRecipeOverrides();
    },
    async importRecipeFromUrl(url) {
      const { data, error } = await client.functions.invoke("import-recipe", { body: { url } });
      if (error) throw new Error(error.message || "Échec de l'import.");
      if (data && data.error) throw new Error(data.error);
      return data;
    },

    async getQuantityOverrides() {
      if (!currentFamilyId) return {};
      const { data, error } = await client.from("quantity_overrides").select("*").eq("family_id", currentFamilyId);
      if (error) return {};
      const map = {};
      data.forEach((row) => { map[row.item_key] = { qty: Number(row.qty), unit: row.unit }; });
      return map;
    },
    async setQuantityOverride(key, qty, unit) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      const { error } = await client.from("quantity_overrides").upsert({
        family_id: currentFamilyId, item_key: key, qty, unit
      }, { onConflict: "family_id,item_key" });
      if (error) throw error;
      return this.getQuantityOverrides();
    },
    async deleteQuantityOverride(key) {
      if (!currentFamilyId) return {};
      await client.from("quantity_overrides").delete().eq("family_id", currentFamilyId).eq("item_key", key);
      return this.getQuantityOverrides();
    },
    async updateManualItem(id, data) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      const { error } = await client.from("list_overrides").update({
        name: data.name, qty: data.qty, unit: data.unit
      }).eq("family_id", currentFamilyId).eq("item_key", id).eq("action", "manual");
      if (error) throw error;
      return this.getOverrides();
    },
    async getFavorites() {
      if (!currentFamilyId) return [];
      const { data, error } = await client.from("favorites").select("recipe_id").eq("family_id", currentFamilyId);
      if (error) return [];
      return data.map(d => d.recipe_id);
    },
    async toggleFavorite(recipeId) {
      if (!currentFamilyId) throw new Error("Rejoins ou crée une famille dans l'onglet Mon compte.");
      const current = await this.getFavorites();
      if (current.includes(recipeId)) {
        await client.from("favorites").delete().eq("family_id", currentFamilyId).eq("recipe_id", recipeId);
      } else {
        await client.from("favorites").insert({ family_id: currentFamilyId, recipe_id: recipeId });
      }
      return this.getFavorites();
    },

    subscribe(callback) {
      if (!currentFamilyId) return () => {};
      const channel = client.channel("family-" + currentFamilyId)
        .on("postgres_changes", { event: "*", schema: "public", table: "weekly_selections", filter: `family_id=eq.${currentFamilyId}` }, callback)
        .on("postgres_changes", { event: "*", schema: "public", table: "list_overrides", filter: `family_id=eq.${currentFamilyId}` }, callback)
        .on("postgres_changes", { event: "*", schema: "public", table: "fridge_items", filter: `family_id=eq.${currentFamilyId}` }, callback)
        .on("postgres_changes", { event: "*", schema: "public", table: "custom_recipes", filter: `family_id=eq.${currentFamilyId}` }, callback)
        .on("postgres_changes", { event: "*", schema: "public", table: "recipe_overrides", filter: `family_id=eq.${currentFamilyId}` }, callback)
        .on("postgres_changes", { event: "*", schema: "public", table: "quantity_overrides", filter: `family_id=eq.${currentFamilyId}` }, callback)
        .on("postgres_changes", { event: "*", schema: "public", table: "favorites", filter: `family_id=eq.${currentFamilyId}` }, callback)
        .subscribe();
      return () => client.removeChannel(channel);
    }
  };
}

function createStore() {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseUrl !== "REPLACE_ME" &&
    cfg.supabaseAnonKey && cfg.supabaseAnonKey !== "REPLACE_ME";
  if (configured && window.supabase) {
    const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return makeSupaStore(client);
  }
  return LocalStore;
}

export { createStore };
