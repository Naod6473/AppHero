# 09 · Le coffre de Mamie

> Les mots de passe de la famille, dans un coffre qu'on ouvre avec 5 images.

Jour 9/30 du défi [Apphéro](https://apphero.cloud), sortie le jeudi 26 novembre 2026 à 18 h. Défi tiré au sort : « En cuisinant ».

## C'est quoi

Un coffre à mots de passe pour les parents et grands-parents pas très à l'aise avec l'informatique, partagé avec les enfants qui les aident.

- On l'ouvre en touchant 5 images dans le bon ordre.
- Des fiches prêtes : Impôts, Ameli, Info Retraite, CAF, URSSAF, EDF, banque, mutuelle, La Poste, messagerie.
- Gros boutons : Copier, Montrer, Aller sur le site, Envoyer par message, Modifier.
- Un générateur : « facile à taper » (3 mots et un nombre) ou « très solide » (16 caractères).
- Un rappel anti-arnaque sur la fiche de la banque.
- La famille : un proche scanne un QR code et tape les 6 mots de la fiche de secours.
- Texte en grand ou très grand, fermeture automatique après 5 minutes.

## Comment c'est fait

- `coffre/app.js` : toute l'app, en JavaScript sans bibliothèque.
- Une clé de coffre (32 octets au hasard) chiffre les fiches en AES-GCM 256 (WebCrypto).
- Cette clé est protégée deux fois, avec des clés dérivées par PBKDF2-SHA256 (310 000 tours) :
  - par les **6 mots** de secours, dans la version partagée (c'est ce qui permet à un proche de rejoindre) ;
  - par les **5 images**, uniquement sur le téléphone (jamais envoyées).
- Le serveur (`worker/src/coffre.js`, table `coffres`) ne garde que la version chiffrée. Pour la modifier, il faut une clé d'écriture dérivée de la clé du coffre ; le serveur n'en garde que l'empreinte.
- Deux membres modifient en même temps : la fiche la plus récente gagne.
- `coffre/qr.js` : l'encodeur QR de QRocquis (app 06). `coffre/mots.js` : 256 mots simples.

## Limites, honnêtement

- 5 images parmi 36 font 60 millions de suites : c'est bien pour un téléphone de famille, pas pour un coffre de banque. Quelqu'un qui volerait le téléphone ET saurait lire sa mémoire pourrait les essayer toutes.
- Si on perd les images ET les 6 mots, personne ne peut rouvrir le coffre. Pas même nous.
