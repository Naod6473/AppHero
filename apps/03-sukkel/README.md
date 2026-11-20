# 03 · Sukkel

> 100 $ de crédit API offerts. Il suffit de maintenir la touche Espace.

Jour 3/30 du défi [Apphéro](https://apphero.cloud), sortie le vendredi 20 novembre 2026 à 18 h. Défi tiré par la roue : « Qui blague ».

## C'est quoi

Une fausse page d'offre, sobre et crédible : 100 $ de crédit API chez votre fournisseur IA préféré (Claude Code, ChatGPT, Mistral, Gemini, Grok, DeepSeek, Hermes, OpenRouter, Perplexity), à condition de garder la touche Espace enfoncée pendant la « vérification ».

- La barre de chargement avance par petits pas, se bloque, repart, et n'atteint jamais 100 % (à 99,1 % elle passe aux millièmes, puis aux dix-millièmes…).
- Des notifications à l'air très sérieux, avec une chute en humour noir.
- Lâcher pendant les 5 premières secondes affiche juste un rappel « anti-robot ». Après, c'est la révélation : 0,00 $, le temps tenu et une phrase moqueuse.
- Le mur des Sukkel : ceux qui ont tenu le plus longtemps.
- Sur téléphone : on garde le doigt sur le bouton.

Sukkel, en néerlandais : le pauvre naïf.

## Comment c'est fait

- `index.html` : la page de présentation (gabarit plateau du site).
- `jouer/index.html` : l'app, une seule page HTML/CSS/JS, police Inter dans `jouer/fonts/`.
- `worker/src/sukkel.js` (à la racine du repo) : le chrono est mesuré par le serveur (début, signe de vie toutes les 10 s, fin), table D1 `sukkel_runs`.

Hors d'apphero.cloud (fichier ouvert en local), le classement est simulé dans le navigateur avec quelques exemples.

## Récupérer juste cette app

```
npx degit Naod6473/AppHero/apps/03-sukkel 03-sukkel
```
