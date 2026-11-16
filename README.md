# Apphéro

**Une petite app par jour pendant 30 jours**, tous les jours, à 18 h pile (l'heure de l'apéro).
Du mercredi 18 novembre au jeudi 17 décembre 2026. Légères, gratuites, et le code est à toi.

Site : https://apphero.cloud

## Le défi

| Jour | Thème |
|---|---|
| Lundi | App utile |
| Mardi | 2 heures chrono |
| Mercredi | Idée des abonnés (proposée sur X) |
| Jeudi | Surprise du jeudi |
| Vendredi | La roue décide (tirage le jeudi soir : un critère, ou une idée d'app complète imaginée par l'IA) |
| Samedi | Jeu du samedi |
| Dimanche | Idées perso (et ouverture du vote de la semaine) |

J'aime / Bof sur chaque app, sans compte. Vote de la semaine du dimanche 18 h au mardi 18 h (22, 29 novembre, 6 et 13 décembre). Finale le jeudi 17 décembre avec la 30e app, résultat le vendredi 18 à 20 h.

## Les apps

Chaque app vit dans son dossier `apps/NN-nom/`, avec son propre style et son `README.md`.
Pour récupérer une seule app :

```
npx degit Naod6473/AppHero/apps/05-nom-de-l-app mon-dossier
```

## Organisation du repo

```
apps/        une app par dossier (01-apphero = le site lui-même)
  NN-nom/
    app.json   titre, accroche, date de sortie (publishAt), couleur, tags, statut
    index.html l'app, autonome
    README.md
site/        l'accueil, la page de la roue et la 404 (Vite)
shared/      le calendrier du défi et les 60 critères de la roue
scripts/     build, gabarit d'app, vérification des app.json
worker/      Cloudflare Worker : sert le site, vote, visites, tirages (base D1)
```

## Travailler en local

```
npm install
npm run dev                  # l'accueil et la roue, sans l'API
npm run db:local             # une fois : crée la base D1 locale
npm run preview              # tout le site avec l'API (wrangler dev, http://localhost:8787)
```

Pour simuler une date, crée un fichier `.dev.vars` (jamais commité) :

```
DEV_NOW=2026-11-20T18:30:00+01:00
ADMIN_TOKEN=un-code-de-test
IP_SALT=nimporte-quoi
```

## Ajouter une app

```
npm run new -- 05 nom-de-l-app "Titre de l'app" "Une phrase qui donne envie"
```

Le dossier est créé avec un `app.json` en `"status": "brouillon"` (il n'est pas publié).
Quand l'app est finie, passe le statut à `"prêt"`.

La fiche de fabrication (`"making"` dans `app.json`) s'affiche sur la carte de l'accueil et dans une pastille en bas de l'app :
`buildMinutes` (construction), `thinkingMinutes` (réflexion), `tokens`, `prompts` (messages à l'IA), `lines` (lignes de code), `tool`, `note`. Tout est facultatif.

Le logo de l'app : un fichier `logo.svg` (ou `logo.png`, `logo.webp`, `logo.jpg`, carré) à la racine de son dossier.
Il s'affiche sur sa case de l'accueil, sur sa carte et dans la pastille, seulement une fois l'app publiée.

Une app préparée d'avance reste sur sa propre branche et n'est fusionnée sur `main` que le jour de sa sortie.
Même fusionnée plus tôt dans la journée, elle reste invisible sur le site jusqu'à son `publishAt` (18 h) : c'est le Worker qui décide à chaque visite.

Si une app a besoin d'un build, ajoute dans son `app.json` :

```json
"build": { "command": "npm install && npm run build", "output": "dist" }
```

## Comment la sortie à 18 h fonctionne

- `npm run build` lit tous les `app.json`, construit le site avec Vite et copie chaque app prête dans `dist/apps/`.
- Le Worker connaît la liste des apps (manifeste généré au build) et ne sert `/apps/NN-nom/`, le lien court `/NN` et la carte de l'accueil qu'une fois l'heure passée. Avant, c'est une 404.
- Chaque push sur `main` déploie automatiquement (GitHub Actions, `.github/workflows/deploy.yml`).

## Le vote

- **J'aime / Bof** sur chaque app sortie : une réaction par personne et par app, modifiable. Classement public « Les plus aimées » ; les bof restent privés.
- **Vote de la semaine** : du dimanche 18 h au mardi 18 h, une voix parmi les apps de la semaine (calendrier dans `shared/calendar.js`, `BALLOTS`). Sans voix, l'app la plus aimée de la semaine gagne.
- **Grande finale** : les 4 gagnantes + les apps 27 à 30, du jeudi 17 décembre 18 h au vendredi 18 décembre 20 h.
- Identifiant anonyme en cookie (déposé seulement au premier avis ou vote) + empreinte d'IP hachée qui change chaque jour (8 avis ou votes maximum par réseau) + Cloudflare Turnstile sur les votes.

## Les statistiques (sans cookie)

- `site/public/t.js` est chargé sur toutes les pages (le Worker l'ajoute aussi dans chaque app). Il envoie des événements à `POST /api/t` : page vue, temps actif, défilement, clics sortants, erreurs, et les événements du site (`ouvrir_app`, `deck`, `jaime`, `bof`, `vote`, `roue_revoir`).
- Rien n'est stocké dans le navigateur. Le visiteur du jour est une empreinte (sel, jour, IP, navigateur) qui change chaque jour. Les événements sont effacés après 13 mois.
- Page privée : `/stats/`, avec le code organisateur (`ADMIN_TOKEN`).

## La roue

Page `/roue/`. Le public revoit les tirages. Le studio privé est sur `/roue/?studio` : tourner, mélanger, son, mode enregistrement, puis « Publier ce tirage » avec le code organisateur (`ADMIN_TOKEN`).
Si la roue tombe sur « Idée de l'IA », colle l'idée générée dans le champ prévu avant de publier.

## Licence

Code libre : prends, modifie, partage. Licence à choisir (MIT proposée).
