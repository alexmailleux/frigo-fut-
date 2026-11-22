-- ============================================================================
-- Schéma "Nos Repas" — à exécuter dans Supabase > SQL Editor
-- (Project > SQL Editor > New query > coller tout ce fichier > Run)
--
-- Ce fichier est conçu pour être rejoué sans risque à chaque mise à jour de
-- l'app : les tables ne sont créées que si elles n'existent pas encore, les
-- policies sont supprimées puis recréées, et l'ajout au flux temps réel est
-- ignoré s'il a déjà été fait. Tu peux donc toujours coller le fichier en
-- entier, même si tu en as déjà exécuté une version précédente.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Familles (foyers partagés)
-- ----------------------------------------------------------------------------
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Profils (infos du compte + rattachement à une famille)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  birthdate date,
  family_id uuid references families(id) on delete set null,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Sélection de recettes de la semaine (par famille)
-- ----------------------------------------------------------------------------
create table if not exists weekly_selections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  recipe_id text not null,
  servings int not null default 2,
  added_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(family_id, recipe_id)
);

-- ----------------------------------------------------------------------------
-- Ajustements manuels de la liste de courses (retraits + ajouts)
-- ----------------------------------------------------------------------------
create table if not exists list_overrides (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  item_key text not null,
  action text not null check (action in ('removed','manual')),
  name text,
  qty numeric,
  unit text,
  created_at timestamptz default now(),
  unique(family_id, item_key)
);

-- ----------------------------------------------------------------------------
-- Stock réel du Frigo : ce qui a été acheté et n'a pas encore été utilisé
-- (une ligne par ingrédient). Alimenté par "acheter" côté liste de courses
-- (cumulatif) et décrémenté par "cuisinée" côté Ma semaine.
-- (Remplace l'ancienne table "checked_items" d'une version précédente : ne
-- reflétait qu'un coche binaire, sans quantité réelle.)
-- ----------------------------------------------------------------------------
drop table if exists checked_items cascade;

create table if not exists fridge_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  item_key text not null,
  name text not null,
  unit text,
  qty numeric not null default 0,
  created_at timestamptz default now(),
  unique(family_id, item_key)
);

-- ----------------------------------------------------------------------------
-- Recettes personnelles (écrites à la main ou importées depuis une URL)
-- ----------------------------------------------------------------------------
create table if not exists custom_recipes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  title text not null,
  subtitle text,
  base_servings int not null default 2,
  prep_minutes int,
  difficulty text default 'Facile',
  kcal int,
  tags text[] default '{}',
  emoji text default '🍽️',
  source_url text,
  ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Modifications apportées aux recettes de la bibliothèque de base (celles-ci
-- restent en lecture seule côté code : une modification crée une "surcouche"
-- par famille, réversible, sans toucher à la bibliothèque d'origine)
-- ----------------------------------------------------------------------------
create table if not exists recipe_overrides (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  recipe_id text not null,
  title text,
  subtitle text,
  base_servings int,
  prep_minutes int,
  difficulty text,
  kcal int,
  tags text[],
  emoji text,
  ingredients jsonb,
  steps jsonb,
  created_at timestamptz default now(),
  unique(family_id, recipe_id)
);

-- ----------------------------------------------------------------------------
-- Quantités modifiées à la main par l'utilisateur : sert à la fois à
-- corriger/ajuster la quantité d'un ingrédient dans la liste de courses, et
-- à indiquer la taille réelle d'un contenant acheté (fromage râpé, boîte de
-- conserve...) pour calculer le reste dans l'onglet Restes.
-- (Remplace l'ancienne table "package_sizes" d'une version précédente.)
-- ----------------------------------------------------------------------------
drop table if exists package_sizes cascade;

create table if not exists quantity_overrides (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  item_key text not null,
  qty numeric not null,
  unit text not null,
  created_at timestamptz default now(),
  unique(family_id, item_key)
);

-- ----------------------------------------------------------------------------
-- Recettes marquées comme favorites (étoile), partagées par toute la famille.
-- ----------------------------------------------------------------------------
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  recipe_id text not null,
  created_at timestamptz default now(),
  unique(family_id, recipe_id)
);

-- ============================================================================
-- Row Level Security : chacun ne voit/modifie que les données de sa famille
-- ============================================================================
alter table families enable row level security;
alter table profiles enable row level security;
alter table weekly_selections enable row level security;
alter table list_overrides enable row level security;
alter table fridge_items enable row level security;
alter table custom_recipes enable row level security;
alter table recipe_overrides enable row level security;
alter table quantity_overrides enable row level security;
alter table favorites enable row level security;

-- Fonction utilitaire : renvoie l'id de famille de la personne connectée.
-- SECURITY DEFINER est indispensable ici : sans ça, la policy "profiles_select"
-- (plus bas) qui l'utilise finirait par se ré-évaluer elle-même à l'infini
-- (elle a besoin de lire "profiles" pour savoir si on a le droit de lire
-- "profiles"). En SECURITY DEFINER, cette fonction s'exécute avec les droits
-- de son propriétaire (qui contourne le RLS), ce qui casse la boucle.
create or replace function my_family_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_id from profiles where id = auth.uid();
$$;

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or family_id = my_family_id());

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update
  using (id = auth.uid());

-- families ---------------------------------------------------------------
drop policy if exists "families_select_own" on families;
create policy "families_select_own" on families for select
  using (id = my_family_id() or created_by = auth.uid());

drop policy if exists "families_insert_own" on families;
create policy "families_insert_own" on families for insert
  with check (created_by = auth.uid());

-- weekly_selections / list_overrides / fridge_items / custom_recipes /
-- recipe_overrides / quantity_overrides : même règle pour toutes — chaque
-- membre de la famille peut tout lire/écrire sur les données de SA famille.
drop policy if exists "weekly_selections_family" on weekly_selections;
create policy "weekly_selections_family" on weekly_selections for all
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

drop policy if exists "list_overrides_family" on list_overrides;
create policy "list_overrides_family" on list_overrides for all
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

drop policy if exists "fridge_items_family" on fridge_items;
create policy "fridge_items_family" on fridge_items for all
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

drop policy if exists "custom_recipes_family" on custom_recipes;
create policy "custom_recipes_family" on custom_recipes for all
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

drop policy if exists "recipe_overrides_family" on recipe_overrides;
create policy "recipe_overrides_family" on recipe_overrides for all
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

drop policy if exists "quantity_overrides_family" on quantity_overrides;
create policy "quantity_overrides_family" on quantity_overrides for all
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

drop policy if exists "favorites_family" on favorites;
create policy "favorites_family" on favorites for all
  using (family_id = my_family_id())
  with check (family_id = my_family_id());

-- ============================================================================
-- Fonction pour rejoindre une famille via son code d'invitation
-- (SECURITY DEFINER : nécessaire pour pouvoir chercher le code sans exposer
-- la table families à une lecture publique)
-- ============================================================================
create or replace function join_family(code text)
returns families
language plpgsql
security definer
set search_path = public
as $$
declare
  fam families;
begin
  select * into fam from families where invite_code = upper(code);
  if fam.id is null then
    raise exception 'Code invalide';
  end if;
  update profiles set family_id = fam.id where id = auth.uid();
  return fam;
end;
$$;

-- ============================================================================
-- Realtime : active la réplication temps réel sur les tables partagées
-- (permet à l'app des deux téléphones de se synchroniser instantanément)
-- Le bloc DO évite l'erreur "relation is already member of publication" si
-- tu rejoues ce script après une première exécution.
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'weekly_selections', 'list_overrides', 'fridge_items',
    'custom_recipes', 'recipe_overrides', 'quantity_overrides', 'favorites'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
