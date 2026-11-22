/**
 * main.js — Point d'entrée Vite (étape 3 migration v0.5)
 *
 * Rôle : importer Vue et Supabase depuis npm, exposer les globals attendus
 * par store.js et app.js (window.Vue, window.supabase, window.APP_CONFIG),
 * puis charger les fichiers métier dans le bon ordre.
 *
 * Stratégie conservative : store.js et app.js ne sont pas réécrits en
 * modules ES6 — ils restent des scripts "classiques" qui consomment des
 * globals. main.js joue le rôle de colle entre le monde npm/Vite et ces
 * fichiers existants, sans risque de régression.
 */

import * as Vue from 'vue';
import * as supabaseJs from '@supabase/supabase-js';

// --- Globals attendus par store.js -------------------------------------------

// window.Vue : utilisé par app.js via Vue.createApp(...)
window.Vue = Vue;

// window.supabase : utilisé par createStore() dans store.js
//   → window.supabase.createClient(url, key)
window.supabase = supabaseJs;

// window.APP_CONFIG : remplace l'ancien js/config.js
//   Les valeurs viennent des variables d'environnement Netlify,
//   injectées par Vite au moment du build.
window.APP_CONFIG = {
  supabaseUrl:     import.meta.env.VITE_SUPABASE_URL     || 'REPLACE_ME',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || 'REPLACE_ME',
};

// --- Fichiers métier (ordre impératif) ----------------------------------------
// Vite les bundle dans cet ordre ; chaque fichier peut accéder aux globals
// définis ci-dessus dès son évaluation.

import './recipes-data.js'; // GELÉ — bibliothèque de 128 recettes
import './utils.js';        // GELÉ — normalizeKey, formatQty, roundForBuying…
import './store.js';        // LocalStore + SupaStore + createStore()
import './app.js';          // Vue.createApp({...}).mount('#app')
