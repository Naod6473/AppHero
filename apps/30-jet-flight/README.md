# Jet Flight · Apphéro 30/30

Un avion de chasse en pixel art au-dessus des îles : abats les jets ennemis, bombarde la DCA et tiens le plus de vagues possible.
Défi de la case : **Jeu**. C'est la dernière app d'Apphéro, celle de la finale.

Jouer : https://apphero.cloud/apps/30-jet-flight/jouer/

## Le jeu

- Des vagues : des jets ennemis dans le ciel, des canons de DCA (puis des lance-missiles) sur les îles.
- Les bombes sont pour le sol : elles tombent sur la croix jaune. Le canon et les missiles sont pour le ciel.
- Un navire de guerre couvert de canons toutes les 5 vagues.
- Après chaque vague : une amélioration au choix, vitesse (+10 %), armure (+20 %) ou dégâts (+25 %).
- Des caisses lâchées par la DCA détruite : réparation, bombes, missiles.
- Trois vues (dessus, poursuite, cockpit), des sons fabriqués avec Web Audio, un record gardé sur l'appareil et un classement en ligne.

## Commandes

| Action | Ordinateur | Téléphone |
|---|---|---|
| Diriger | souris, flèches ou ZQSD | le doigt sur l'écran |
| Tirer | clic gauche maintenu ou J | Feu (et tir automatique quand un jet est en face) |
| Bombe | clic droit ou K | Bombe |
| Missile | clic molette ou L | Missile |
| Boost | Maj | Boost |
| Tonneau | R | une petite tape |
| Vue | Espace | Vue |
| Pause | Échap | bouton pause |

## Le code

- `src/lib/scene.ts` : le moteur. Tout est dessiné à la main dans un petit tampon de pixels (avion en tranches empilées, îles, nuages), puis agrandi. La partie « the game » ajoute les vagues, la DCA, les bombes, le navire et les améliorations.
- `src/lib/flame-layer.ts` : les flammes des réacteurs (WebGL).
- `src/components/jet-flight.tsx` : les écrans (titre, améliorations, fin de partie), les commandes et le classement.
- `src/lib/sound.ts` : les sons, synthétisés.
- `public/index.html` : la page de présentation sur apphero.cloud.

```
npm install
npm run dev        # puis ouvrir /jouer/
npm run build      # dist/ (page de présentation + dist/jouer/)
```

Le classement en ligne passe par l'API du site (`/api/jet/scores`, table D1 `jet_scores`) : il ne marche que sur apphero.cloud.
Pour tester sans jouer : `/jouer/?test` expose la scène dans `window.jf`.

Le moteur vient de la maquette « Fighter Jet Scene » de Simon.
