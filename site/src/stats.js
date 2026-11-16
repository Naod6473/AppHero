// Page privée des statistiques : lit /api/admin/stats avec le code organisateur.
import { api, esc, toast } from "./common.js";

const KEY = "apphero_admin_token";
const $ = (id) => document.getElementById(id);
let days = 30;

try {
  $("token").value = localStorage.getItem(KEY) || "";
} catch {
  /* stockage indisponible */
}

const fmtSec = (s) => (s == null ? "–" : s >= 60 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s` : `${Math.round(s)} s`);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "–");

function bars(rows, { label = (r) => r.k, value = (r) => r.n, unit = "", color } = {}) {
  if (!rows?.length) return `<p class="empty">Rien pour l'instant.</p>`;
  const max = Math.max(...rows.map(value), 1);
  return `<div class="bars">${rows
    .map((r) => `<div class="bar" style="--w:${(value(r) / max) * 100}%;${color ? `--c:${color}` : ""}"><span>${esc(label(r))}</span><b>${esc(value(r))}${unit}</b></div>`)
    .join("")}</div>`;
}

// 24 colonnes compactes pour les heures.
function columns(rows) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return `<div class="cols">${rows
    .map((r, h) => `<div class="col" title="${esc(r.k)} : ${r.n}"><i style="height:${(r.n / max) * 100}%"></i><small>${h % 3 ? "" : h}</small></div>`)
    .join("")}</div>`;
}

function box(title, help, html) {
  return `<section class="box"><h2>${esc(title)}</h2>${help ? `<p>${esc(help)}</p>` : ""}${html}</section>`;
}

function render(d) {
  const t = d.totals || {};
  const b = d.bounce || {};
  const scrollTotal = d.scroll.reduce((s, r) => s + r.n, 0);
  const hours = Array.from({ length: 24 }, (_, h) => ({ k: `${h} h`, n: d.hours.find((x) => x.k === h)?.n || 0 }));
  const votes = d.ballots.reduce((s, r) => s + r.n, 0);
  $("out").innerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Pages vues</small><strong>${t.views || 0}</strong></div>
      <div class="kpi"><small>Visiteurs (par jour, cumulés)</small><strong>${t.visitors || 0}</strong></div>
      <div class="kpi"><small>Temps actif moyen</small><strong>${fmtSec(t.active)}</strong></div>
      <div class="kpi"><small>Rebond (1 seule page)</small><strong>${pct(b.single || 0, b.visits || 0)}</strong></div>
      <div class="kpi"><small>Voix (semaine + finale)</small><strong>${votes}</strong></div>
      <div class="kpi"><small>Roue : vues / tirages revus</small><strong>${d.wheel?.views || 0} / ${d.wheel?.replays || 0}</strong></div>
    </div>
    <div class="grid">
      ${box("Jour par jour", "Pages vues et visiteurs uniques du jour.", `<table><tr><th>Jour</th><th class="n">Pages</th><th class="n">Visiteurs</th></tr>${d.perDay
        .map((r) => `<tr><td>${esc(r.day)}</td><td class="n">${r.views}</td><td class="n">${r.visitors}</td></tr>`)
        .join("")}</table>`)}
      ${box("Pages", "Vues, temps actif moyen et chargement moyen.", `<table><tr><th>Page</th><th class="n">Vues</th><th class="n">Temps</th><th class="n">Charg.</th></tr>${d.pages
        .map((r) => `<tr><td>${esc(r.k)}</td><td class="n">${r.n}</td><td class="n">${fmtSec(r.active)}</td><td class="n">${r.load ? `${(r.load / 1000).toFixed(1)} s` : "–"}</td></tr>`)
        .join("")}</table>`)}
      ${box("Temps dans chaque app", "Visites et temps actif moyen par app.", `<table><tr><th>App</th><th class="n">Visites</th><th class="n">Temps</th></tr>${d.appTime
        .map((r) => `<tr><td>${esc(r.k)}</td><td class="n">${r.n}</td><td class="n">${fmtSec(r.active)}</td></tr>`)
        .join("")}</table>`)}
      ${box("J'aime et bof", "Les bof ne sont visibles qu'ici.", `<table><tr><th>App</th><th class="n">👍</th><th class="n">👎</th></tr>${d.reactions
        .map((r) => `<tr><td>${esc(r.k)}</td><td class="n">${r.likes || 0}</td><td class="n">${r.bofs || 0}</td></tr>`)
        .join("")}</table>`)}
      ${box("Votes", "Nombre de voix par tour.", bars(d.ballots, { color: "var(--pink)" }))}
      ${box("Clics « Ouvrir l'app »", "Depuis les cartes, la grille et les classements.", bars(d.opens, { label: (r) => `App ${r.k}`, color: "var(--pink)" }))}
      ${box("Défilement", "Jusqu'où les gens descendent.", bars(d.scroll, { label: (r) => `${r.k} %`, value: (r) => r.n }) + `<p class="empty">${scrollTotal} pages mesurées</p>`)}
      ${box("Provenance", "Sites d'où viennent les visiteurs.", bars(d.refs))}
      ${box("Campagnes (utm)", "", bars(d.utm))}
      ${box("Liens sortants", "Clics vers X, GitHub…", bars(d.outbound))}
      ${box("Cartes de la semaine", "Swipe ou flèches.", bars(d.deck, { color: "var(--lilac)" }))}
      ${box("Heure des visites", "Pages vues par heure (Paris).", columns(hours))}
      ${box("Appareils", "", bars(d.devices, { color: "var(--mint)" }))}
      ${box("Navigateurs", "", bars(d.browsers, { color: "var(--mint)" }))}
      ${box("Systèmes", "", bars(d.os, { color: "var(--mint)" }))}
      ${box("Pays", "", bars(d.countries, { color: "var(--yellow)" }))}
      ${box("Langues", "", bars(d.langs, { color: "var(--yellow)" }))}
      ${box("Erreurs JavaScript", "À corriger en priorité.", d.errors.length
        ? `<table><tr><th>Erreur</th><th>Page</th><th class="n">Fois</th></tr>${d.errors.map((r) => `<tr><td>${esc(r.k)}</td><td>${esc(r.path)}</td><td class="n">${r.n}</td></tr>`).join("")}</table>`
        : `<p class="empty">Aucune erreur. 🎉</p>`)}
    </div>`;
}

async function load() {
  const token = $("token").value.trim();
  if (!token) return toast("Entre le code organisateur.");
  try {
    const d = await api(`/api/admin/stats?days=${days}`, { headers: { authorization: `Bearer ${token}` } });
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* rien */
    }
    render(d);
  } catch (err) {
    toast(err.message);
  }
}

$("login").addEventListener("submit", (e) => {
  e.preventDefault();
  load();
});
$("periods").addEventListener("click", (e) => {
  const b = e.target.closest("[data-days]");
  if (!b) return;
  days = Number(b.dataset.days);
  document.querySelectorAll("[data-days]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  if ($("token").value) load();
});
if ($("token").value) load();
