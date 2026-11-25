# 08 · Koïs

> Un bassin de carpes koï en ASCII. Touche l'eau, elles viennent manger.

Jour 8/30 du défi [Apphéro](https://apphero.cloud), sortie le mercredi 25 novembre 2026 à 18 h. Défi tiré au sort : « Surprise ».

## C'est quoi

Un bassin à regarder. Des carpes koï dessinées en caractères (`.:-=+*#%@`) nagent sur un fond de nuit, avec un cerisier, des nénuphars et un haïku.

- Touche l'eau : un granulé tombe, l'eau ondule, les koïs viennent le manger.
- Une musique japonaise douce tourne en boucle (bouton ♪ pour la couper).
- De temps en temps, un visiteur traverse le bassin.
- L'interface s'efface toute seule au bout de quelques secondes.

## Comment c'est fait

- `bassin/index.html` : la page plein écran.
- `bassin/js/bassin.js` : le moteur, en JavaScript sans bibliothèque. Les poissons sont simulés (une colonne de 16 points qui ondule), puis le canvas est relu en petite grille et chaque case devient un caractère selon sa luminosité.
- `bassin/js/page.js` : la musique et le compteur.
- L'onde de l'eau passe par WebGL quand il est disponible.
- Respecte « réduire les animations » : une seule image fixe.
- Police Share Tech Mono (licence SIL OFL 1.1). Musiques japonaises libres de droits.
