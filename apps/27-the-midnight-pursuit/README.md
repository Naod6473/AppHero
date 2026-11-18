# 27 · The Midnight Pursuit

> Trois témoins d'un meurtre, une nuit pour échapper au tueur. Une ville en deux couleurs, et le mort qui raconte.

Jour 27/30 du défi [Apphéro](https://apphero.cloud), sortie le lundi 14 décembre à 18 h. Défi du jour : **Deux couleurs max**.

## C'est quoi

Un jeu de course sans fin, façon polar noir. 23 h 40, quai n° 4 : un homme est abattu. Trois témoins, et le tueur les a vus. Une seule nuit pour lui échapper. On va le plus loin possible, puis on inscrit son nom au tableau des survivants.

- **Trois témoins.** Le Vieux file au commissariat central, La Môme vers le car de 5 h 10, Le Borgne au port pour vendre le nom du tueur. Chacun a sa palette : noir/blanc, bleu électrique/rose néon, violet nuit/vert acide.
- **Le tueur ne fait que marcher.** Il avance au bord gauche avec sa lampe torche. S'il te rattrape, il tire. Ses hommes guettent dans les rues.
- **Deux couleurs, jamais plus.** Une tape inverse le monde : ce qui a la couleur du fond disparaît. Plateformes fantômes, hommes en pointillés qui ne te voient pas.
- **Le mort raconte.** La victime commente la course dans des cadres de récit, et livre un morceau de vérité à 200, 500, 1 000 et 2 000 m, différent pour chaque témoin.

### Commandes

| Clavier | Mobile | Action |
|---|---|---|
| ↑ | glisser vers le haut | sauter (maintenir = plus haut) |
| F | taper à gauche | frapper |
| Espace | taper à droite | inverser le monde |
| ↓ | glisser vers le bas | coup spécial (1 par quartier) |
| M | | couper ou remettre la musique |
| T | | ouvrir le tableau des survivants (écran titre et fin de partie) |
| ← / → | glisser à gauche / à droite, doigt posé | ralentir / accélérer (marcher soigne) |

### Le tableau des scores

Sur apphero.cloud, les scores sont partagés : le Worker les garde dans D1 (table `cj_scores`, code dans `worker/src/contrejour.js`). Le classement montre le meilleur score de chaque nom. Le serveur refuse un score plus long que ce que permet la durée de la partie, et limite les envois par réseau et par jour. Ouvert en local (ou avant la sortie), le jeu garde les scores dans le navigateur.

### Les fichiers

- `index.html` : la page de présentation (gabarit « plateau » du site).
- `jouer/index.html` : le jeu, en un seul fichier (sprites, décors et effets intégrés).
- `jouer/audio/` : les deux boucles de musique (menu, poursuite).
- `media/` : la vidéo de présentation, son image, l'icône.

### Crédits

- Effets : [Artefacts](https://naod.fr) (pluie #0184, barre de vie #0196, giclée #1012, poussière #1014), ramenés en deux couleurs.
- Persos et décors : packs [CraftPix](https://craftpix.net) (« Homeless » et « Free City Backgrounds »), recolorés en deux couleurs. Ces images restent sous la [licence CraftPix](https://craftpix.net/file-licenses/) et ne sont pas réutilisables hors de ce jeu.
- Musiques (libres de droits) : « While the City Sleeps — Jazz Noir for Late Nights » (menu, 2 premières minutes) et « The Midnight Pursuit — Dark Noir Jazz » de The Bastard Of Buffalo (poursuite), coupées en boucles de 2 minutes.
- Polices : Bebas Neue et Special Elite (SIL Open Font License), via Fontsource.

## Lancer en local

Ouvre `jouer/index.html` dans ton navigateur, ou depuis la racine du repo : `npm run dev` puis va sur `/apps/27-the-midnight-pursuit/`.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/27-the-midnight-pursuit 27-the-midnight-pursuit
```

## Ce que j'ai appris

À compléter.
