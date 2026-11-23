# 06 · QRocquis

> Ton image devient un QR code animé. Et des QR codes transportent un fichier, sans connexion.

Jour 6/30 du défi [Apphéro](https://apphero.cloud), sortie le lundi 23 novembre 2026 à 18 h. Défi tiré au sort : « App utile ».

## C'est quoi

Une app pour téléphone, au style iOS, avec deux onglets en bas :

- **Générer** : une photo ou un texte se transforme en QR code en quelques secondes. Dix effets, dont la vue isométrique : le QR devient une scène en blocs 3D (ville, paysage, briques ou ta photo en relief), puis se pose en léger relief, toujours lisible. Le QR final garde la photo visible (ou la dessine dans ses bits avec QArt, ou reste classique). Export en GIF (jusqu'à 1080 px), en vidéo MP4, en image ou en SVG, en carré, story ou paysage.
- **Envoyer / Recevoir** : un fichier est découpé en morceaux qui défilent en QR codes à l'écran. L'autre téléphone les filme et reconstruit le fichier, même s'il rate une partie des QR. Pas de Wi-Fi, pas de Bluetooth, pas d'Internet.

Tout reste sur le téléphone, et l'app marche hors ligne une fois ouverte une première fois.

## Comment c'est fait

- `app/index.html` : toute l'app dans un seul fichier (HTML, CSS, JS sans framework), avec les bibliothèques intégrées :
  [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) pour les QR de l'envoi,
  [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0) pour les lire,
  [gifenc](https://github.com/mattdesl/gifenc) (MIT) pour le GIF,
  [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) (MIT) pour la vidéo MP4 encodée image par image (WebCodecs).
- « Générer » a son propre encodeur QR (mode octets, versions 1 à 40). Les tables de correction viennent de [QR Code generator](https://github.com/nayuki/QR-Code-generator) de Project Nayuki (MIT). Il connaît le rôle de chaque module (repères, timing, alignement, format, données) et le mot de code qu'il porte.
- QR « photo » : correction H, masque choisi pour ressembler le plus à la photo, repères pleins, un point au centre de chaque module de données et la photo autour. Idée reprise de [qrframe](https://github.com/zhengkyl/qrframe) et [halftone-qr-studio](https://github.com/pRizz/halftone-qr-studio) (MIT), réécrite.
- QArt : les octets de remplissage, après un « # » ajouté au lien, sont choisis par élimination de Gauss sur GF(2) pour que les bits de données et de correction dessinent la photo. C'est une réimplémentation de l'idée de Russ Cox ([QArt Codes](https://research.swtch.com/qart), référence `rsc.io/qr` sous BSD-3). Aucun code GPL n'est repris.
- Lisibilité : à partir de 75 % du morph, les points ne bougent plus. Le badge lit l'animation à plusieurs instants avec jsQR, en petit et avec du bruit. Il compte aussi les modules faux, mot de code par mot de code, et les compare à ce que Reed-Solomon sait corriger (idée d'[antfu/qrcode-toolkit](https://github.com/antfu/qrcode-toolkit), MIT).
- `app/sw.js` et `app/manifest.webmanifest` : le mode hors ligne et l'installation sur l'écran d'accueil.
- Les effets sont dessinés dans un canvas, image par image. La vue isométrique projette chaque case du QR en cube, et la caméra pivote du dessus vers la vue 3/4.
- L'envoi utilise un code « fontaine » : une image sur deux montre un morceau tel quel, l'autre un mélange (XOR) de plusieurs morceaux. Le récepteur retrouve les morceaux ratés à partir des mélanges, sans attendre que la boucle repasse.
- Le verre « Liquid Glass » est imité : flou, reflets et lueur partout, et sur Chrome et Android, une vraie déformation de ce qui passe derrière la barre d'onglets (carte de déplacement SVG dans `backdrop-filter`). Safari ne sait pas encore faire cette déformation.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/06-qrocquis 06-qrocquis
npx serve 06-qrocquis/app
```
