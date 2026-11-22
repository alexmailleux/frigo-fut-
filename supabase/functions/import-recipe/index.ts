// Supabase Edge Function : import-recipe
//
// Reçoit { url } en POST, va chercher la page côté serveur (donc pas de
// souci de CORS), et essaie d'en extraire une recette structurée au format
// schema.org/Recipe (JSON-LD), le standard utilisé par la quasi-totalité
// des sites de cuisine (Marmiton, Cuisine AZ, 750g, HelloFresh, Journal des
// Femmes...) pour leur référencement Google. C'est la même technique
// qu'utilisent des apps comme Mealie ou Paprika pour l'import de recettes.
//
// Déploiement : voir README.md à la racine du projet.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDurationToMinutes(iso?: string | null): number | null {
  if (!iso || typeof iso !== "string") return null;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso);
  if (!m) return null;
  const days = parseInt(m[1] || "0", 10);
  const hours = parseInt(m[2] || "0", 10);
  const mins = parseInt(m[3] || "0", 10);
  const total = days * 24 * 60 + hours * 60 + mins;
  return total || null;
}

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/^(g|gr|grammes?)\b\.?/i, "g"],
  [/^(kg|kilos?)\b\.?/i, "kg"],
  [/^(ml|millilitres?)\b\.?/i, "ml"],
  [/^(cl|centilitres?)\b\.?/i, "ml"],
  [/^(l|litres?)\b\.?/i, "l"],
  [/^(cs|c\.\s?à\s?s\.?|cuill[eè]res?\s?à\s?soupe)\b\.?/i, "cs"],
  [/^(cc|c\.\s?à\s?c\.?|cuill[eè]res?\s?à\s?caf[eé])\b\.?/i, "cc"],
  [/^(gousses?)\b/i, "gousse"],
  [/^(sachets?)\b/i, "sachet"],
  [/^(bouquets?)\b/i, "bouquet"],
  [/^(branches?)\b/i, "branche"],
  [/^(bo[iî]tes?)\b/i, "boîte"],
  [/^(pinc[eé]es?)\b/i, "pincée"],
  [/^(pi[eè]ces?)\b/i, "pièce"],
];

const FRACTION_WORDS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

function parseIngredientLine(raw: string) {
  let line = raw.trim().replace(/\s+/g, " ");
  let qty: number | null = null;

  const qtyMatch = line.match(/^([0-9]+(?:[.,][0-9]+)?(?:\s?[-–]\s?[0-9]+(?:[.,][0-9]+)?)?|[½¼¾⅓⅔]|[0-9]+\s?\/\s?[0-9]+)\s*/);
  if (qtyMatch) {
    const token = qtyMatch[1].trim();
    if (FRACTION_WORDS[token] !== undefined) {
      qty = FRACTION_WORDS[token];
    } else if (token.includes("/")) {
      const [a, b] = token.split("/").map((s) => parseFloat(s.replace(",", ".")));
      if (b) qty = a / b;
    } else if (token.includes("-") || token.includes("–")) {
      const parts = token.split(/[-–]/).map((s) => parseFloat(s.replace(",", ".").trim()));
      qty = parts[0];
    } else {
      qty = parseFloat(token.replace(",", "."));
    }
    line = line.slice(qtyMatch[0].length).trim();
  }

  let unit: string | null = null;
  for (const [regex, normalized] of UNIT_ALIASES) {
    if (regex.test(line)) {
      unit = normalized;
      line = line.replace(regex, "").trim();
      break;
    }
  }

  line = line.replace(/^(de |d'|des |du )/i, "").trim();
  if (qty === null) unit = "au-gout";
  else if (!unit) unit = "pièce";

  const name = line ? line.charAt(0).toUpperCase() + line.slice(1) : raw;
  return { name, qty, unit, staple: false };
}

// deno-lint-ignore no-explicit-any
function findRecipeNode(node: any): any {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipeNode(n);
      if (r) return r;
    }
    return null;
  }
  if (typeof node === "object") {
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes("Recipe")) return node;
    if (node["@graph"]) return findRecipeNode(node["@graph"]);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
      return jsonResponse({ error: "URL invalide." }, 400);
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NosRepasApp/1.0; +recipe-import)",
        "Accept": "text/html",
      },
    });
    if (!res.ok) {
      return jsonResponse({ error: `Impossible de récupérer cette page (code ${res.status}).` });
    }
    const html = await res.text();

    const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    // deno-lint-ignore no-explicit-any
    let recipeNode: any = null;
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html))) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const found = findRecipeNode(parsed);
        if (found) { recipeNode = found; break; }
      } catch (_e) {
        // bloc JSON-LD malformé, on l'ignore et on continue
      }
    }

    if (!recipeNode) {
      return jsonResponse({ error: "Impossible de trouver une recette structurée sur cette page. Essaie de la créer manuellement, ou avec un autre lien." });
    }

    const title = typeof recipeNode.name === "string" ? recipeNode.name.trim() : "";

    let subtitle = "";
    if (typeof recipeNode.description === "string") {
      subtitle = recipeNode.description.trim().slice(0, 180);
    }

    let baseServings = 2;
    if (recipeNode.recipeYield) {
      const y = Array.isArray(recipeNode.recipeYield) ? recipeNode.recipeYield[0] : recipeNode.recipeYield;
      const n = parseInt(String(y).replace(/\D/g, ""), 10);
      if (n) baseServings = n;
    }

    const prepMinutes =
      isoDurationToMinutes(recipeNode.totalTime) ||
      isoDurationToMinutes(recipeNode.cookTime) ||
      isoDurationToMinutes(recipeNode.prepTime) ||
      null;

    let kcal: number | null = null;
    if (recipeNode.nutrition && recipeNode.nutrition.calories) {
      const n = parseInt(String(recipeNode.nutrition.calories).replace(/\D/g, ""), 10);
      if (n) kcal = n;
    }

    let ingredientsRaw = recipeNode.recipeIngredient || recipeNode.ingredients || [];
    if (!Array.isArray(ingredientsRaw)) ingredientsRaw = [ingredientsRaw];
    const ingredients = ingredientsRaw.filter(Boolean).map((s: string) => parseIngredientLine(String(s)));

    const instructionsRaw = recipeNode.recipeInstructions || [];
    let steps: string[] = [];
    if (typeof instructionsRaw === "string") {
      steps = instructionsRaw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(instructionsRaw)) {
      for (const step of instructionsRaw) {
        if (typeof step === "string") {
          steps.push(step.trim());
        } else if (step && typeof step.text === "string") {
          steps.push(step.text.trim());
        } else if (step && Array.isArray(step.itemListElement)) {
          for (const sub of step.itemListElement) {
            if (sub && typeof sub.text === "string") steps.push(sub.text.trim());
          }
        }
      }
    }
    steps = steps.filter(Boolean);

    let tags: string[] = [];
    if (recipeNode.recipeCategory) {
      const c = Array.isArray(recipeNode.recipeCategory) ? recipeNode.recipeCategory : [recipeNode.recipeCategory];
      tags = c.slice(0, 3).map(String);
    }

    return jsonResponse({
      title, subtitle, baseServings, prepMinutes, kcal, tags,
      ingredients, steps, sourceUrl: url,
    });
  } catch (e) {
    return jsonResponse({ error: (e && e.message) || "Erreur lors de l'import de la recette." });
  }
});
