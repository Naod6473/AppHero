# 10 · Pile 10

> Un gros bouton. Rappuie au bout de 10 secondes pile, sans chrono.

Jour 10/30 du défi [Apphéro](https://apphero.cloud), sortie le vendredi 27 novembre 2026 à 18 h. Défi : « La roue décide ».

## C'est quoi

- Un seul bouton en verre glacé, avec un « pouic » à chaque appui.
- Tu appuies : le chrono démarre, puis se cache au bout de 3 secondes.
- Tu rappuies quand tu penses être à 10 secondes pile. Ton écart s'affiche au millième.
- Un classement du jour (un nom, pas de compte) et un bouton pour partager ton temps sur X.
- Barre d'espace sur ordinateur.

## Comment c'est fait

- `jeu/index.html`, `jeu/style.css`, `jeu/app.js` : HTML, CSS et JavaScript, sans bibliothèque.
- Le pouic est synthétisé avec Web Audio, le bouton est entièrement en CSS.
- Le classement passe par le Worker du site (`worker/src/pile10.js`, table D1 `pile10_scores`).
