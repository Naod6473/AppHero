# 04 · Bubble

> Fais éclater des bulles de liquide en criant. Rien qu'à la voix.

Jour 4/30 du défi [Apphéro](https://apphero.cloud), sortie le samedi 21 novembre 2026 à 18 h. Défi tiré au sort : « Commande à la voix ».

## C'est quoi

Un jeu qui se joue entièrement à la voix : une fois la page ouverte, on ne touche plus à rien.

- Au centre de l'écran, une bulle de liquide en 3D. La caméra frontale sert de reflet : ta pièce (et toi) se reflète dedans.
- Crie et tiens le son au-dessus de la ligne rose : la bulle gonfle, tremble et éclate en gouttes qui coulent sur l'écran. Si tu faiblis, elle dégonfle. 15 secondes par bulle.
- 20 bulles de plus en plus dures (savon, eau, lait, huile, grenadine, café, encre, slime, miel, chocolat, caramel, champagne, gelée, lessive, verre fondu, azote liquide, or, mercure, lave, galaxie), puis un mode sans fin.
- Quatre règles spéciales : le champagne (rester entre deux lignes, trop fort il durcit), la gelée (crier par saccades), la grappe de lessive (trois bulles d'affilée), le verre fondu (crier aigu).
- À la fin, tu dis ton nom, le jeu le répète, tu réponds « oui » ou « non ». Classement en ligne du cri le plus long. « Rejouer » (ou un cri) relance une partie.

## Comment c'est fait

Tout a été fait depuis un téléphone : idées, démos, code, page et vidéo, pilotés depuis l'app Claude sur mobile.


- `index.html` : la page de présentation (gabarit « plateau » du site).
- `jeu/index.html` : le jeu, en un seul fichier, avec Three.js 0.160 copié dans `jeu/lib/` (licence MIT).
- La bulle est une sphère déformée sur la carte graphique (bruit simplex injecté dans le shader de `MeshPhysicalMaterial`), avec des ressorts pour l'inertie. Le reflet vient d'une `CubeCamera` qui filme une sphère texturée avec l'image de la caméra.
- Le son : Web Audio mesure le volume (et la hauteur pour le verre fondu, par autocorrélation). Rien n'est enregistré.
- Les mots (nom, oui, non, rejouer) : reconnaissance vocale du navigateur (Chrome, Edge, Safari). Sur Firefox, le nom devient « Anonyme » et un cri relance la partie.
- Le classement : `worker/src/bubble.js` (route `/api/bubble/scores`, table `bubble_scores`).
- `jeu/?film` : mode tournage qui simule la voix, utilisé pour la vidéo de présentation.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/04-bubble 04-bubble
```

Le jeu demande le micro : ouvre-le en `https://` ou sur `localhost` (par exemple `npx serve 04-bubble`). Hors du site, le classement reste sur ton appareil.
