# 26 · Soiffard

> Le Strava des soiffards : le bar le plus proche, tes tournées en stats et la couronne du King of the Bar.

Jour 26/30 du défi [Apphéro](https://apphero.cloud) (date provisoire : dimanche 13 décembre 2026 à 18 h, thème « Idées perso »).

## C'est quoi

Une app mobile (PWA, à installer depuis le navigateur) :

- **Bar** : un gros bouton qui t'emmène au bar le plus proche, avec une flèche boussole et la distance qui baisse. Arrivé à moins de 50 m : « J'y suis ».
- **Explorer** : les bars, pubs, brasseries, biergartens et boîtes autour (500 m, 1 km, 2 km), ouverts ou fermés, avec le roi de chaque bar.
- **Enregistrer une sortie** : chrono, km à pied, bars visités, compteur de verres (« Rythme de croisière », « Légende du comptoir »…).
- **KOTB, King of the Bar** : le temps passé au comptoir, vérifié par la position à l'arrivée et pendant le passage (4 h max par passage). Le plus long de la semaine porte la couronne.
- **Classements** : par bar, et toute la semaine (bars différents). Remise à zéro le lundi à 6 h.
- **Accueil façon appli de sport** : anneaux d'objectifs (bars, km, comptoir), kcal ingérées et brûlées (« soit 5 croissants »), sorties avec carte.
- **Partager** : une image story 9:16 de ta sortie ou de ta couronne.
- **Rentrer chez moi** : itinéraire à pied, appel d'un taxi, et « Je suis bien rentré » pour prévenir tes potes.

Sur ordinateur, la page affiche un QR code pour ouvrir l'app sur le téléphone.

## Données et vie privée

- Bars : [OpenStreetMap](https://www.openstreetmap.org) via l'API Overpass, interrogée par le Worker d'Apphéro (position arrondie à ~100 m, cache 15 min).
- Cartes des sorties : tuiles OpenStreetMap (assombries le soir).
- Sans compte. Sorties, parcours et réglages restent dans le téléphone (`localStorage`, préfixe `app26_`).
- Pour les couronnes, le serveur reçoit seulement un pseudo, un identifiant aléatoire, l'identifiant OpenStreetMap du bar et le temps passé. Jamais ta position.

## Lancer en local

Depuis la racine du repo : `npm run db:local` puis `npm run preview`, et va sur `/apps/26-soiffard/?app` (le `?app` force l'app sur ordinateur).
L'API est dans `worker/src/soiffard.js`, les tables `soiffard_*` dans `worker/schema.sql`.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/26-soiffard 26-soiffard
```

## Ce que j'ai appris

À compléter.
