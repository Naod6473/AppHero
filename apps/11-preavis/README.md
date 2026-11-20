# 11 · Préavis

> La bourse de la grogne. On parie, pour rire, sur les grèves, les manifs et les 49.3, d'ici la présidentielle de 2027.

Jour 11/30 du défi [Apphéro](https://apphero.cloud), sortie le samedi 28 novembre 2026 à 18 h. Défi de la case : « Idée perso ».

## C'est quoi

Une salle des marchés pour l'actualité sociale et politique française. Chaque pari est une question précise (« Une grève à la SNCF perturbera-t-elle le premier week-end des vacances de Noël ? »), avec une règle écrite à l'avance, une date de clôture et une source qui fera foi.

- **Des pavés, pas des euros.** 1 000 pavés offerts à l'inscription. Aucun argent, aucun lot, rien à acheter : ce n'est pas un site de jeux d'argent.
- **Pari mutuel.** La maison ne fixe pas les cotes : elles sortent des mises de tout le monde et bougent jusqu'à la clôture, comme au PMU. La cote qui compte est celle de la clôture.
- **Un arbitre, des sources.** Chaque pari est tranché à la main, avec une phrase de verdict et un lien vers une source publique. Un pari mal né est annulé et tout le monde est remboursé.
- **Le grognomètre.** Une jauge de 0 à 100, calculée sur les paris en cours : plus la salle mise sur la grogne, plus l'aiguille monte.
- **La caisse de grève.** 50 pavés par jour pour celles et ceux qui sont passés sous les 1 000.
- **Deux classements.** Le général (la fortune) et celui du mois (les gains sur les paris tranchés dans le mois), avec des titres : Prophète, Chat noir, Rentier, Fauché…
- **Le bingo de la semaine.** Une grille de 16 petites phrases à cocher quand on les entend aux infos.

Pas d'e-mail ni de mot de passe : un pseudo, un cookie, et un code de reprise pour changer d'appareil.

Satire sans lien avec la SNCF, les syndicats, les partis ni aucune institution. On parie sur des faits publics et vérifiables (un vote, un chiffre officiel, une date), jamais sur la vie privée, la santé ou les malheurs de quelqu'un, et jamais sur des violences.

## Comment c'est fait

HTML, CSS et JavaScript, sans framework ni dépendance. Polices Barlow, Barlow Condensed et JetBrains Mono auto-hébergées dans `fonts/`.

| Fichier | Rôle |
| --- | --- |
| `index.html` | la page de présentation (le « plateau ») |
| `jouer/` | l'app : `index.html`, `style.css`, `app.js` |
| `jouer/demo.js` | un faux serveur dans le navigateur, pour le mode démo |
| `lib.js` | les règles du jeu (cotes, gains, grognomètre, titres, pseudos, bingo), partagées par le navigateur et le serveur |
| `paris.js` | les paris de départ |

Le serveur est dans le Worker du site, hors de ce dossier : `worker/src/preavis.js` (l'API, sous `/api/preavis/`) et les tables `pv_*` de `worker/schema.sql` (base D1). Chaque mise est un seul lot de requêtes dont les conditions sont dans le SQL : impossible de dépenser deux fois le même pavé, même en cliquant très vite.

L'arbitre a sa page, `/arbitre/` (`site/arbitre/` et `site/src/arbitre.js`) : créer un pari, l'ouvrir, le clore, le trancher avec sa source, l'annuler, modérer les pseudos. Elle demande le code organisateur à chaque visite et ne le garde nulle part.

## Le mode démo

Ajoute `?demo` à l'adresse de l'app : de faux parieurs misent toutes les quelques secondes, et rien n'est enregistré. L'app bascule aussi toute seule en démo quand il n'y a pas de serveur derrière (fichier ouvert tel quel, copie du dossier ailleurs).

## Essayer en local

Depuis la racine du dépôt :

```
npm install
npm run db:local
npm run build
npm run preview
```

Puis ouvre http://localhost:8787/apps/11-preavis/ (avec un `DEV_NOW` postérieur à la sortie dans `.dev.vars`, voir le README du dépôt). La page de l'arbitre est sur http://localhost:8787/arbitre/.

Les tests (règles du jeu et API, avec une base SQLite en mémoire) :

```
npm test
```

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/11-preavis 11-preavis
```

Sans le Worker, elle tourne en mode démo.
