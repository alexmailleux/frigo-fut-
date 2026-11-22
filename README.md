# Frigo Futé 🧊

Une app pour préparer vos repas de la semaine et votre liste de courses à deux,
avec compte partagé en famille, liste de courses intelligente (arrondi
"achetable", produits non utilisés, indispensables séparés), et bibliothèque
de recettes que vous pouvez enrichir en écrivant vos propres recettes ou en
important une URL.

C'est une **web app** (HTML/CSS/JS, pas de build tool requis) qui fonctionne :
- directement dans le navigateur / en PWA installable (icône sur l'écran d'accueil, plein écran, offline-ready) ;
- **et** peut être empaquetée en vrai `.apk` Android via Capacitor (voir plus bas), pour un test hors Play Store.

---

## 1. Tester tout de suite (mode local, 0 configuration)

Sans rien configurer, l'app fonctionne déjà en **mode local** : tes données
(recettes ajoutées, semaine sélectionnée, liste de courses...) restent
uniquement dans le navigateur de ton téléphone. Idéal pour tester l'interface
avant de connecter le compte partagé.

Depuis un terminal (Mac/Linux/Windows avec Node installé) :

```bash
cd repas-app
npx serve .
# puis ouvre l'URL affichée (http://localhost:3000) sur ton téléphone
# (assure-toi que le téléphone est sur le même Wi-Fi que l'ordinateur,
#  et remplace localhost par l'IP locale de l'ordinateur, ex: 192.168.1.23:3000)
```

Ou avec Python :
```bash
cd repas-app
python3 -m http.server 8080
```

Ouvre ensuite l'adresse dans Chrome sur Android → menu ⋮ → **"Ajouter à l'écran d'accueil"** :
l'app s'installe comme une vraie app, en plein écran.

> Le mode local n'a pas de vrai login, et l'onglet "Mes recettes" ne peut
> pas importer automatiquement depuis une URL (ça nécessite un serveur —
> voir étape 2). Écrire une recette à la main fonctionne partout.

---

## 2. Activer le compte + la liste de courses partagée (Supabase)

[Supabase](https://supabase.com) est un hébergeur gratuit (compte + base de
données + synchronisation en temps réel) — c'est ce qui permet à ton
téléphone et celui de ta/ton partenaire de voir la même liste de courses en
direct.

### 2.1 Créer le projet
1. Va sur [supabase.com](https://supabase.com), crée un compte gratuit.
2. **New project** → choisis un nom, un mot de passe de base de données, une région proche de vous (ex: Europe West).
3. Attends 1-2 minutes que le projet soit prêt.

### 2.2 Exécuter le schéma
1. Dans le menu de gauche, ouvre **SQL Editor** → **New query**.
2. Colle tout le contenu du fichier `supabase-schema.sql` (fourni avec cette app).
3. Clique **Run**. Tu dois voir "Success" (les tables `profiles`, `families`, `weekly_selections`, `custom_recipes`... sont créées).

> À chaque fois que je t'enverrai une nouvelle version de l'app avec des
> changements de base de données, il te suffira de recoller ce même fichier
> en entier et de cliquer **Run** — il est conçu pour être rejoué sans
> risque (il ne recrée jamais ce qui existe déjà).

### 2.3 Récupérer les clés
1. **Project Settings** (icône engrenage) → **API**.
2. Copie **Project URL** et la clé **anon public**.
3. Ouvre `js/config.js` dans l'app et remplace :
   ```js
   window.APP_CONFIG = {
     supabaseUrl: "https://xxxxxxxx.supabase.co",
     supabaseAnonKey: "eyJhbGciOi..."
   };
   ```
4. Recharge l'app : un écran de connexion apparaît. Crée ton compte, puis
   dans l'onglet **Mon compte** → **Créer notre famille**. Donne le code
   affiché à ta/ton partenaire pour qu'iel rejoigne la même famille depuis
   son propre compte (**Mon compte** → **Rejoindre avec un code**).

À partir de là, la sélection de la semaine, la liste de courses, les
indispensables et les recettes ajoutées sont **partagés en temps réel**
entre vos deux téléphones.

### 2.4 Activer l'import de recettes par URL (optionnel mais recommandé)

L'import automatique ("colle un lien Marmiton/750g/HelloFresh...") a besoin
d'une petite fonction serveur (elle va chercher la page web côté serveur —
un navigateur ne peut pas le faire directement pour des raisons de
sécurité/CORS). Cette fonction est fournie (`supabase/functions/import-recipe`),
il faut juste la déployer :

```bash
npm install -g supabase       # CLI Supabase (une fois)
supabase login
cd repas-app
supabase link --project-ref xxxxxxxx   # "xxxxxxxx" = trouvé dans l'URL de ton projet Supabase
supabase functions deploy import-recipe
```

C'est tout : le bouton "Importer depuis une URL" dans l'app fonctionnera
ensuite automatiquement. Sans cette étape, l'écriture manuelle de recettes
reste disponible normalement.

> **Comment ça marche ?** La fonction récupère la page et cherche les
> données structurées "schema.org/Recipe" (JSON-LD) que la quasi-totalité
> des sites de recettes intègrent pour apparaître dans Google. C'est la
> même technique qu'utilisent des apps comme Mealie. Certains sites ne
> l'exposent pas → l'import échoue proprement et te propose d'écrire la
> recette à la main.
> L'extraction des quantités depuis le texte ("200 g de farine", "½ oignon"...)
> est faite au mieux par une fonction d'analyse simple : vérifie toujours
> la recette importée avant de l'enregistrer, et corrige si besoin.

---

## 3. Construire un vrai fichier `.apk` (Capacitor)

Cette étape empaquette l'app web dans une coquille Android native, pour
avoir une icône et une app installable sans navigateur — sans passer par le
Play Store. Il te faut [Android Studio](https://developer.android.com/studio) installé.

```bash
cd repas-app
npm init -y
npm install @capacitor/core @capacitor/android
npx cap init "Nos Repas" "com.tonnom.nosrepas" --web-dir=.
npx cap add android
npx cap sync android
npx cap open android
```

Android Studio s'ouvre sur le projet généré :
- **Build > Build Bundle(s) / APK(s) > Build APK(s)** pour un `.apk` de test (non signé, installable directement).
- Le fichier généré se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`.
- Transfère-le sur vos deux téléphones (câble, Drive, mail...) et installez-le
  (il faudra autoriser "Sources inconnues" dans les paramètres Android).

> Pense à éditer `js/config.js` **avant** ce build, pour que l'APK embarque
> directement la connexion à votre Supabase.

---

## 4. Structure du projet

```
repas-app/
├─ index.html              → toute l'interface (Vue 3, pas de build)
├─ css/styles.css           → design (couleurs, composants)
├─ js/
│  ├─ config.js             → tes identifiants Supabase
│  ├─ recipes-data.js       → bibliothèque de 13 recettes de base
│  ├─ utils.js               → arrondi des quantités, formatage
│  ├─ store.js               → couche de données (local ou Supabase)
│  └─ app.js                  → logique de l'application (Vue)
├─ manifest.json + sw.js     → PWA (installable, icône, offline shell)
├─ icons/                    → icônes de l'app
├─ supabase-schema.sql       → schéma de base de données à exécuter une fois
└─ supabase/functions/import-recipe/  → fonction d'import de recettes par URL
```

---

## 5. La bibliothèque de recettes fournie

13 recettes de démarrage, toutes en français :
- 3 avec des **quantités réelles** récupérées sur hellofresh.be (instructions
  entièrement réécrites avec nos propres mots, jamais copiées) ;
- 10 recettes **originales**, inspirées de noms de plats réels vus sur le
  site (ingrédients, quantités et instructions 100% maison).

Vous pouvez bien sûr en ajouter autant que vous voulez via le bouton
**"+ Ajouter une recette"** dans l'onglet Recettes (écriture manuelle ou
import depuis une URL).

---

## 6. Comment fonctionne la liste "intelligente"

- Chaque ingrédient d'une recette a une unité : `g`, `ml`, `cs`/`cc`
  (cuillères), ou une unité "discrète" (`pièce`, `gousse`, `sachet`,
  `bouquet`, `branche`, `boîte`).
- Pour les unités discrètes, la quantité totale nécessaire (après addition
  entre recettes et mise à l'échelle par portions) est **arrondie au
  supérieur** dans la liste de courses (ex : besoin de ½ courgette + ¼
  courgette = ¾ → achat d'**1 courgette entière**).
- La différence (ici ¼ de courgette) apparaît dans l'onglet **Produits non
  utilisés**.
- Les ingrédients de base (huile, beurre, sel, farine, vinaigre, miel...)
  sont automatiquement détectés et vont dans **Les indispensables**, jamais
  dans la liste de courses.
- Retirer un ingrédient nécessaire à une recette sélectionnée déclenche une
  confirmation ; les articles ajoutés à la main se retirent directement.

---

## 7. Limites connues / pistes d'amélioration

- L'import par URL est un "meilleur effort" : certains sites (sans données
  structurées) ne pourront pas être importés automatiquement.
- Pas d'invitation par email : le partage de famille se fait par code à
  transmettre à la main (plus simple, aucun serveur d'envoi d'email requis).
- Pour un accès plus simple qu'un serveur local, vous pouvez aussi héberger
  gratuitement les fichiers statiques sur [Vercel](https://vercel.com) ou
  [Netlify](https://netlify.com) (glisser-déposer le dossier `repas-app`) et
  ouvrir l'URL obtenue directement depuis vos téléphones.
