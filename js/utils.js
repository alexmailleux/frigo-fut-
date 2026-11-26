/**
 * Utilitaires : mise à l'échelle des quantités, arrondi "achetable",
 * clés d'agrégation, formatage d'affichage (fractions FR).
 */

// Unités "discrètes" : on ne peut pas acheter une fraction de ces unités,
// donc on arrondit toujours à l'entier supérieur pour la liste de courses.
const DISCRETE_UNITS = new Set([
  "pièce", "gousse", "sachet", "bouquet", "branche", "boîte"
]);

// Mots-clés pour la détection automatique des "indispensables" (basiques de
// placard), même pour un ingrédient ajouté manuellement ou une recette dont
// le flag `staple` n'aurait pas été renseigné explicitement.
const STAPLE_KEYWORDS = [
  "huile d'olive", "huile de tournesol", "huile végétale", "huile",
  "beurre", "farine", "sucre", "sel", "poivre", "vinaigre",
  "miel", "moutarde", "bouillon", "sauce soja",
  // épices et condiments de base qu'un foyer a en général déjà en placard
  "cumin", "curcuma", "paprika", "cannelle", "muscade", "girofle",
  "badiane", "cardamome", "herbes de provence", "laurier", "garam masala",
  "safran", "curry en poudre", "gingembre moulu", "gingembre en poudre",
  "ail en poudre", "ail semoule", "chili en poudre", "piment en poudre",
  "piment de cayenne", "ras el hanout", "zaatar", "za'atar", "genièvre",
  "levure chimique", "bicarbonate"
];

function isStapleIngredient(ingredient) {
  if (ingredient.staple) return true;
  // Une "pincée" de quoi que ce soit est en pratique toujours un ingrédient
  // de placard (épice, herbe...), jamais quelque chose qu'on achète pour
  // une quantité précise.
  if (ingredient.unit === "pincée") return true;
  const n = ingredient.name.toLowerCase().trim();
  // "eau" seule ou suivie d'un mot ("eau bouillante", "eau pour la sauce")
  // — jamais en fin de mot, pour ne pas confondre avec "poireau" ou "veau".
  if (n === "eau" || n.startsWith("eau ")) return true;
  return STAPLE_KEYWORDS.some(k => n.includes(k));
}

function normalizeKey(name, unit) {
  return (name.trim().toLowerCase() + "|" + (unit || "").trim().toLowerCase())
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Renvoie la quantité mise à l'échelle pour un nombre de portions donné.
function scaledQty(ingredient, chosenServings, baseServings) {
  if (ingredient.unit === "au-gout") return null;
  const factor = chosenServings / baseServings;
  return ingredient.qty * factor;
}

// Arrondit une quantité agrégée pour la rendre "achetable" :
// - unités discrètes (pièce, gousse, sachet...) => arrondi à l'entier supérieur
// - autres unités (g, ml, cs, cc...) => arrondi à 2 décimales (pas de restriction d'achat)
function roundForBuying(qty, unit) {
  if (qty === null || qty === undefined) return null;
  if (DISCRETE_UNITS.has(unit)) {
    return Math.ceil(qty - 1e-9);
  }
  return Math.round(qty * 100) / 100;
}

const FRACTIONS = [
  [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"]
];

// Formate un nombre en texte lisible, avec fractions usuelles type "½"
function formatNumber(n) {
  if (n === null || n === undefined) return "";
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  for (const [val, glyph] of FRACTIONS) {
    if (Math.abs(rest - val) < 0.02) {
      return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }
  if (Math.abs(rest) < 0.02) return `${whole}`;
  // sinon arrondi à 1-2 décimales, sans zéros inutiles
  const rounded = Math.round(n * 100) / 100;
  return rounded.toString().replace(".", ",");
}

const UNIT_LABELS = {
  g: "g", kg: "kg", ml: "ml", l: "l",
  cs: "cs", cc: "cc",
  "pièce": "pièce", "gousse": "gousse", "sachet": "sachet",
  "bouquet": "bouquet", "branche": "branche", "boîte": "boîte",
  "au-gout": "au goût"
};

function pluralizeUnit(unit, qty) {
  const label = UNIT_LABELS[unit] || unit;
  if (["pièce", "gousse", "sachet", "bouquet", "branche", "boîte"].includes(unit) && qty > 1) {
    return label + "s";
  }
  return label;
}

function formatQty(qty, unit) {
  if (unit === "au-gout" || qty === null || qty === undefined) return "au goût";
  return `${formatNumber(qty)} ${pluralizeUnit(unit, qty)}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Classement (au mieux) d'un ingrédient dans un rayon, pour regrouper la
// liste de courses comme en supermarché. Basé sur des mots-clés : imparfait
// par nature, mais couvre bien la bibliothèque fournie et les ajouts usuels.
const CATEGORY_KEYWORDS = [
  ["Viandes & poissons", [
    "poulet", "bœuf", "boeuf", "porc", "merlu", "saumon", "poisson", "chorizo",
    "lardon", "lard", "jambon", "dinde", "agneau", "veau", "aiguillette", "escalope",
    "haché", "rôti", "filet mignon", "viande", "filet de", "merguez", "saucisse",
    "chipolata", "boudin", "andouillette", "saucisson", "bacon", "pâté", "terrine",
    "foie", "gigot", "épaule", "travers", "côte de", "entrecôte", "steak" ,
    "canard", "magret", "pintade", "lapin", "gibier", "sanglier", "cabillaud",
    "morue", "sole", "dorade", "bar", "lieu", "colin", "thon", "truite",
    "crevette", "moule", "calamar", "encornet", "poulpe", "fruits de mer",
    "anchois", "sardine", "maquereau", "palette"
  ]],
  ["Produits laitiers & œufs", [
    "yaourt", "fromage", "cheddar", "parmesan", "crème", "lait", "labné", "lebné",
    "œuf", "oeuf", "mozzarella", "burrata", "gruyère", "comté", "emmental",
    "beaufort", "roquefort", "feta", "ricotta", "mascarpone", "skyr",
    "fromage blanc", "petit-suisse", "babeurre", "gouda", "brie", "chèvre"
  ]],
  ["Épicerie & féculents", [
    "riz", "pâtes", "penne", "nouille", "udon", "soba", "vermicelle", "boulgour",
    "lentille", "pois chiche", "haricot noir", "haricot rouge", "haricot blanc",
    "tortilla", "pain", "cacahuète", "noix de cajou", "noix de pécan", "noix",
    "noisette", "amande", "pignon", "tomate concassée", "passata", "bouillon",
    "curry", "paprika", "cumin", "harissa", "pesto", "lait de coco", "coco",
    "chipotle", "édamame", "edamame", "fève de soja", "maïs", "farine",
    "épice", "épices", "garam masala", "ras el hanout", "zaatar", "curcuma",
    "safran", "muscade", "cannelle", "herbes de provence", "thym séché",
    "laurier", "semoule", "couscous", "quinoa", "sarrasin", "avoine",
    "flocon", "pâte feuilletée", "pâte brisée", "pâte à pizza", "chapelure",
    "panure", "sauce soja", "sauce hoisin", "sauce nuoc", "nuoc-mam", "nuoc mam",
    "ketchup", "mayonnaise", "tahini", "houmous", "tempeh", "tofu", "seitan",
    "steak végé", "steak végétari", "protéine de soja", "raisin sec",
    "fruit sec", "graine", "sésame", "levure", "bicarbonate", "gélatine",
    "agar", "chocolat", "cacao", "vanille", "confiture", "sirop", "miso",
    "dashi", "nori", "wakame", "gnocchi", "ravioli", "tortellini", "tortelloni",
    "lasagne", "vin ", "vin rouge", "vin blanc", "rhum", "grand marnier",
    "bouquet garni", "ketjap", "cornichon", "câpre", "olive",
    "haricots rouges", "haricots noirs", "haricots blancs", "raisins secs",
    "germes de soja", "germe de soja", "rigatoni", "linguine", "casarecce",
    "conchiglie", "falafel", "sumac", "pita", "sauce bbq", "aïoli",
    "ciabatta", "teriyaki", "grana padano", "parmigiano", "béchamel",
    "toastinette", "biscotte", "tandoori", "clou de girofle", "clous de girofle",
    "saké", "nuoc-mâm", "nuoc mâm", "badiane", "sauce yakitori", "nem",
    "sauce d'huître", "glutamate", "arachide", "pistache", "cassonade",
    "purée", "chili en poudre", "os à moelle", "grain de genièvre",
    "riesling", "bière", "gomasio", "furikake", "sauce kimchi", "sauce bulgogi",
    "sauce vietnamienne", "sauce asiatique", "pâte de soja",
    "pâte épicée", "baguette", "sauce chili", "chili sucrée", "zhoug",
    "saindoux"
  ]],
  ["Fruits & légumes", [
    "courgette", "oignon", "ail", "carotte", "poivron", "aubergine", "chou",
    "brocoli", "épinard", "fenouil", "concombre", "tomate", "salade",
    "champignon", "pomme de terre", "persil", "coriandre", "basilic",
    "citronnelle", "gingembre", "piment", "citron", "orange", "mangue",
    "avocat", "pomme", "céleri", "herbe", "légume", "fruit",
    "navet", "betterave", "patate douce", "patates douces", "potimarron",
    "courge", "potiron", "butternut", "panais", "topinambour", "radis",
    "poireau", "artichaut", "asperge", "petit pois", "fève", "roquette",
    "mâche", "mesclun", "cresson", "endive", "chicorée", "pak-choï", "kale",
    "blette", "rhubarbe", "coing", "poire", "pêche", "nectarine", "abricot",
    "prune", "cerise", "figue", "kiwi", "ananas", "pastèque", "melon",
    "framboise", "myrtille", "mûre", "groseille", "clémentine", "pamplemousse",
    "litchi", "grenade", "datte", "ciboulette", "aneth", "menthe", "sauge",
    "romarin", "estragon", "cerfeuil", "origan", "échalote", "banane",
    "pousse", "thym", "haricots verts", "haricots plats", "little gem",
    "batavia", "portobello", "jalapeño", "galanga", "soja frais"
  ]]
];

function categorizeIngredient(name) {
  const n = (name || "").toLowerCase();
  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) return cat;
  }
  return "Autres";
}

export {
  DISCRETE_UNITS,
  isStapleIngredient,
  normalizeKey,
  scaledQty,
  roundForBuying,
  formatQty,
  uid,
  categorizeIngredient,
};