# 07 · JellyCube

> Un cube en gelée, des sauts au millimètre. On tombe, on recommence.

Jour 7/30 du défi [Apphéro](https://apphero.cloud), sortie le mardi 24 novembre 2026 à 18 h. Défi tiré au sort : « 30 min max ».

## C'est quoi

Un petit jeu de plateforme. On guide un cube en gelée jusqu'à l'arrivée : saut, double saut, rebond aux murs, corde, dash, contre.

- 12 niveaux sur une carte où le cube se promène, et un boss à la fin.
- Médailles de temps. L'or ouvre la version sombre du niveau (pièges plus rapides, pas de point de passage).
- Un cube doré caché par niveau.
- À la fin d'un niveau, tous les essais sont rejoués en même temps.
- En bonus : duels à deux sur le même clavier, contre l'ordi, survie.
- Clavier (touches réglables), manette ou écran tactile.

## Comment c'est fait

- `jeu/index.html` : tout le jeu dans un seul fichier, HTML + JavaScript, dessiné dans un canvas, sans bibliothèque.
- Les niveaux sont des cartes en texte (un caractère par case de 40 px).
- Les records sont gardés dans le navigateur (localStorage).
- `jeu/musiques/` : musiques de Jason Shaw ([audionautix.com](https://audionautix.com)), licence CC BY : « Thought Bot », « What's It To Ya Punk », « Zombie Rock ».
