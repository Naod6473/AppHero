# 01 · Apphéro

> Le site qui lance le défi : les 30 apps, le vote et la roue.

Jour 1/30 du défi, sortie le mercredi 18 novembre 2026 à 18 h. L'app du jour 1, c'est le site lui-même : son code est à la racine du repo.

## C'est quoi

- `site/` : l'accueil et la page de la roue (Vite, HTML/CSS/JS sans framework).
- `worker/` : un Cloudflare Worker qui sert le site, garde les apps cachées jusqu'à 18 h, et gère le vote, les visites et les tirages de la roue (base D1).
- `scripts/` : le build piloté par les `app.json`, et le gabarit `npm run new`.
- `shared/` : le calendrier du défi et les 60 critères de la roue.

## Ce que j'ai appris

À compléter.
