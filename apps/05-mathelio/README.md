# 05 · Mathélio

> Le calcul mental du CP à la 6e, avec un compagnon qui grandit.

Jour 5/30 du défi [Apphéro](https://apphero.cloud), sortie le dimanche 22 novembre 2026 à 18 h. Défi tiré au sort : « Pour les enfants ».

## C'est quoi

Une appli de calcul mental pour les enfants, du CP à la 6e :

- un design « verre coloré » (flou, transparence, reflets) et des compagnons en verre ;
- une barre d'onglets en bas, un espace parent derrière un cadenas, un mode concentration pendant les questions ;
- un pavé de chiffres fixe, la réponse qui s'écrit à la place du « ? », les réussites fêtées et les erreurs corrigées pas à pas ;
- « Qui joue ? » à l'ouverture, un bocal d'étoiles, des mini-jeux rangés en deux onglets ;
- un niveau 6e (un CM2 plus corsé : décimaux, priorités de calcul) ;
- un mode « Confort de lecture » pour les enfants dys : police Lexend, plus d'espace, la question lue à voix haute.

## Comment c'est fait

- `index.html` : la page de présentation (gabarit « plateau » du site).
- `jeu/` : l'appli (HTML, CSS et JS sans framework). Images et sons ont été allégés pour le site.
- L'effet verre : `jeu/design-verre.css` et `jeu/verre.js`, une couche posée par-dessus le thème de base. Les compagnons en verre sont générés par un script Python (Pillow + NumPy), image par image.
- Tout reste dans le navigateur (profils, étoiles, réglages). Sur ce site, le classement partagé est désactivé.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/05-mathelio 05-mathelio
npx serve 05-mathelio/jeu
```
