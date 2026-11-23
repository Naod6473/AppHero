# 06 · QRocquis

> Ton image devient un QR code animé. Et des QR codes transportent un fichier, sans connexion.

Jour 6/30 du défi [Apphéro](https://apphero.cloud), sortie le lundi 23 novembre 2026 à 18 h. Défi tiré au sort : « App utile ».

## C'est quoi

Une app pour téléphone, au style iOS, avec deux onglets en bas :

- **Générer** : une photo ou un texte se transforme en QR code en quelques secondes. Dix effets, dont la vue isométrique : le QR devient une scène en blocs 3D (ville, paysage, briques ou ta photo en relief), puis redevient un QR qui se scanne. Export en GIF, en vidéo ou en image, en carré, story ou paysage.
- **Envoyer / Recevoir** : un fichier est découpé en morceaux qui défilent en QR codes à l'écran. L'autre téléphone les filme et reconstruit le fichier, même s'il rate une partie des QR. Pas de Wi-Fi, pas de Bluetooth, pas d'Internet.

Tout reste sur le téléphone, et l'app marche hors ligne une fois ouverte une première fois.

## Comment c'est fait

- `app/index.html` : toute l'app dans un seul fichier (HTML, CSS, JS sans framework), avec les bibliothèques intégrées :
  [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) pour fabriquer les QR,
  [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0) pour les lire,
  [gifenc](https://github.com/mattdesl/gifenc) (MIT) pour le GIF.
- `app/sw.js` et `app/manifest.webmanifest` : le mode hors ligne et l'installation sur l'écran d'accueil.
- Les effets sont dessinés dans un canvas, image par image. La vue isométrique projette chaque case du QR en cube, et la caméra pivote du dessus vers la vue 3/4.
- L'envoi utilise un code « fontaine » : une image sur deux montre un morceau tel quel, l'autre un mélange (XOR) de plusieurs morceaux. Le récepteur retrouve les morceaux ratés à partir des mélanges, sans attendre que la boucle repasse.
- Le verre « Liquid Glass » est imité : flou, reflets et lueur partout, et sur Chrome et Android, une vraie déformation de ce qui passe derrière la barre d'onglets (carte de déplacement SVG dans `backdrop-filter`). Safari ne sait pas encore faire cette déformation.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/06-qrocquis 06-qrocquis
npx serve 06-qrocquis/app
```
