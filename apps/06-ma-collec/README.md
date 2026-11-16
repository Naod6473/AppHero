# 06 · Ma Collec'

> Crée ta collection de cartes avec tes propres dessins, puis suis ce que chaque enfant a, les doubles et ce qui manque.

Jour 6/30 du défi [Apphéro](https://apphero.cloud), sortie le lundi 23 novembre à 18 h. Thème du jour : App utile.

## C'est quoi

On crée sa propre collection de cartes (ses dessins), puis chaque enfant a son album :

- « Nouvelle carte » : un numéro, un nom et la photo du dessin (recadrée en 3:4). Appui long sur une carte pour la modifier, la renuméroter ou la supprimer ;
- toucher une carte l'ajoute à l'album de l'enfant, « − » en retire une, ×2, ×3 signale les doubles. Les cartes manquantes montrent leur dessin en filigrane ;
- « J'ouvre une pochette » : on tape les numéros reçus au pavé, l'app dit « Nouvelle ! » ou « Double » ;
- onglets Il manque, Doubles, et Échanger (message à copier pour un autre parent, comparaison entre frères et sœurs) ;
- « Télécharger la collection » : un fichier avec les cartes et leurs images, à envoyer à un autre parent qui l'ouvre dans l'app ; « Télécharger la sauvegarde » ajoute les albums des enfants ;
- PWA installable, marche sans réseau. Rien n'est envoyé : état dans `localStorage` (`app06_v2`), images dans IndexedDB.

## Lancer en local

Ouvre `index.html` dans ton navigateur, ou depuis la racine du repo : `npm run dev` puis va sur `/apps/06-ma-collec/`.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/06-ma-collec 06-ma-collec
```

## Ce que j'ai appris

Les images vont dans IndexedDB : `localStorage` est partagé par toutes les apps du site et plafonne à environ 5 Mo.
