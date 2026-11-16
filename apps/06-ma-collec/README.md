# 06 · Ma Collec'

> Les cartes Disney Leclerc de tes enfants : ce qu'ils ont, les doubles à échanger et ce qui manque.

Jour 6/30 du défi [Apphéro](https://apphero.cloud), sortie le lundi 23 novembre à 18 h. Thème du jour : App utile.

## C'est quoi

Pour les parents qui suivent la collection de cartes Disney Leclerc 2026 (« En route pour l'aventure ! ») de leurs enfants :

- un album par enfant, avec les 108 cases rangées par film (21 films) ;
- toucher une case ajoute la carte, « − » en retire une, ×2, ×3 signale les doubles ;
- « J'ouvre une pochette » : on tape les 4 numéros au pavé, l'app dit « Nouvelle ! » ou « Double » ;
- onglets Il manque, Doubles, et Échanger (message à copier pour un autre parent, comparaison entre frères et sœurs) ;
- cartes spéciales (paillettes, métallisée, phosphorescente, thermoréactive) et photo de sa propre carte, gardée sur le téléphone ;
- confettis quand un film est complet, compte à rebours jusqu'à la fin de la distribution (13 décembre) ;
- PWA installable, marche sans réseau. Rien n'est envoyé : état dans `localStorage` (`app06_state`), photos dans IndexedDB. Sauvegarde à télécharger ou à copier.

La liste des noms vient de l'album (relevée sur [ColleX](https://www.collexstash.com/fr/collections/cards/cartes-disney-leclerc-2026)). L'app n'affiche aucune image de carte et n'a aucun lien avec E.Leclerc ni Disney.

## Lancer en local

Ouvre `index.html` dans ton navigateur, ou depuis la racine du repo : `npm run dev` puis va sur `/apps/06-ma-collec/`.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/06-ma-collec 06-ma-collec
```

## Ce que j'ai appris

Les photos vont dans IndexedDB : `localStorage` est partagé par toutes les apps du site et plafonne à environ 5 Mo.
