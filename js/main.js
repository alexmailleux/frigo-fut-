/**
 * main.js — Point d'entrée Vite (v0.5 — migration ES modules complète)
 */

import * as Vue from 'vue';
import * as supabaseJs from '@supabase/supabase-js';

// window.Vue : utilisé par app.js via Vue.createApp(...)
window.Vue = Vue;

// window.supabase : utilisé par store.js via window.supabase.createClient(...)
window.supabase = supabaseJs;

// window.APP_CONFIG : clés Supabase injectées par Vite au build
window.APP_CONFIG = {
  supabaseUrl:     import.meta.env.VITE_SUPABASE_URL     || 'REPLACE_ME',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || 'REPLACE_ME',
};

// app.js tire tout le graphe via ses imports ES6
import './app.js';