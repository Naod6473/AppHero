# Apphéro

**Une petite app par jour pendant 30 jours**, du lundi au samedi, à 18 h pile (l'heure de l'apéro).
Du mercredi 18 novembre au mardi 22 décembre 2026. Légères, gratuites, et le code est à toi.

Site : https://apphero.cloud

## Le défi

| Jour | Thème |
|---|---|
| Lundi | App utile |
| Mardi | 2 heures chrono |
| Mercredi | App de la communauté |
| Jeudi | La roue décide (tirage la veille au soir : un critère, ou une idée d'app complète imaginée par l'IA) |
| Vendredi | Surprise du vendredi |
| Samedi | Jeu + vote de l'app de la semaine |

Un vote par jour, sans compte. App de la semaine les samedis 21 et 28 novembre, 5, 12 et 19 décembre. Finale le mardi 22 décembre avec la 30e app.

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

- Un vote par jour (jour de Paris) et par personne, pour n'importe quelle app sortie.
- Identifiant anonyme en cookie + empreinte d'IP hachée qui change chaque jour (5 votes maximum par réseau et par jour) + Cloudflare Turnstile contre les robots.
- Deux classements : les plus savourées (votes) et les plus regardées (visites). L'app de la semaine est celle qui a reçu le plus de votes entre deux samedis 18 h.

## La roue

Page `/roue/`. Le public revoit les tirages. Le studio privé est sur `/roue/?studio` : tourner, mélanger, son, mode enregistrement, puis « Publier ce tirage » avec le code organisateur (`ADMIN_TOKEN`).
Si la roue tombe sur « Idée de l'IA », colle l'idée générée dans le champ prévu avant de publier.

## Licence

Code libre : prends, modifie, partage. Licence à choisir (MIT proposée).
