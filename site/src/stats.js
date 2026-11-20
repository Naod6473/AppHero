// Page privée des statistiques : lit /api/admin/stats avec le code organisateur.
import { api, esc, toast, turnstileToken } from "./common.js";

const $ = (id) => document.getElementById(id);
let days = 30;

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
      ${sukkelBox(d)}
      ${box("Erreurs JavaScript", "À corriger en priorité.", d.errors.length
        ? `<table><tr><th>Erreur</th><th>Page</th><th class="n">Fois</th></tr>${d.errors.map((r) => `<tr><td>${esc(r.k)}</td><td>${esc(r.path)}</td><td class="n">${r.n}</td></tr>`).join("")}</table>`
        : `<p class="empty">Aucune erreur. 🎉</p>`)}
      ${journalBox(d.journal)}
    </div>`;
}

const fmtMs = (ms) => (ms == null ? "–" : fmtSec(ms / 1000).replace(/^(\d+) min (\d+) s$/, (m, a, b) => (a >= 60 ? `${Math.floor(a / 60)} h ${String(a % 60).padStart(2, "0")}` : m)));
const fmtTs = (ts) => new Date(ts).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const PROVIDERS = { claude: "Claude Code", chatgpt: "ChatGPT", mistral: "Mistral AI", gemini: "Gemini", grok: "Grok", deepseek: "DeepSeek", hermes: "Hermes", openrouter: "OpenRouter", perplexity: "Perplexity" };

function sukkelBox(d) {
  const s = d.sukkel || {};
  if (!s.starts) return box("Sukkel (app 03)", "Les appuis sur la touche Espace.", `<p class="empty">Aucun essai sur la période.</p>`);
  return `<section class="box wide"><h2>Sukkel (app 03)</h2><p>Chaque appui sur la touche Espace (chrono mesuré par le serveur).</p>
    <div class="kpis mini">
      <div class="kpi"><small>Appuis</small><strong>${s.starts}</strong></div>
      <div class="kpi"><small>Lâchés avant 5 s</small><strong>${s.early || 0}</strong></div>
      <div class="kpi"><small>Parties (5 s et plus)</small><strong>${s.runs || 0}</strong></div>
      <div class="kpi"><small>Temps moyen</small><strong>${fmtMs(s.avg)}</strong></div>
      <div class="kpi"><small>Record</small><strong>${fmtMs(s.best)}</strong></div>
      <div class="kpi"><small>Inscrits au mur</small><strong>${s.named || 0}</strong></div>
      <div class="kpi"><small>Temps perdu au total</small><strong>${fmtMs(s.wasted)}</strong></div>
      <div class="kpi"><small>En cours</small><strong>${s.open || 0}</strong></div>
    </div>
    <div class="grid">
      ${box("Fournisseur choisi", "", bars(d.sukkelProviders, { label: (r) => PROVIDERS[r.k] || r.k, color: "var(--pink)" }))}
      ${box("Durée tenue", "", bars(d.sukkelBuckets, { label: (r) => r.k.slice(4), color: "var(--lilac)" }))}
    </div>
    <div class="scroll"><table><tr><th>Quand</th><th class="n">Tenu</th><th>Fournisseur</th><th>Pseudo</th></tr>${d.sukkelRecent
      .map((r) => `<tr><td>${fmtTs(r.ts)}</td><td class="n">${r.ms == null ? "en cours" : fmtMs(r.ms)}</td><td>${esc(PROVIDERS[r.provider] || r.provider || "–")}</td><td>${esc(r.name || "")}</td></tr>`)
      .join("")}</table></div></section>`;
}

// Le journal : connexions (pages vues) et actions, du plus récent au plus ancien.
function journalBox(rows) {
  const what = (r) => {
    let p = {};
    try { p = JSON.parse(r.props || "{}"); } catch {}
    const extra = Object.entries(p).filter(([k]) => !["load", "w", "h"].includes(k)).map(([k, v]) => `${k}=${v}`).join(" ");
    return extra;
  };
  return `<section class="box wide"><h2>Journal</h2><p>Les 200 derniers événements de la période : visites (page), sorties de page (fin), clics et actions dans les apps. « Qui » = empreinte du jour, anonyme.</p>
    <div class="scroll"><table><tr><th>Quand</th><th>Qui</th><th>Événement</th><th>Page</th><th>Détails</th><th>Appareil</th><th>Pays</th></tr>${(rows || [])
      .map((r) => `<tr><td>${fmtTs(r.ts)}</td><td><code>${esc(r.v)}</code></td><td><b>${esc(r.name)}</b></td><td>${esc(r.path)}</td><td>${esc(what(r))}</td><td>${esc([r.device, r.browser, r.os].filter(Boolean).join(" · "))}</td><td>${esc(r.country || "")}</td></tr>`)
      .join("")}</table></div></section>`;
}

async function load() {
  const token = $("token").value.trim();
  if (!token) return toast("Entre le code organisateur.");
  try {
    const d = await api(`/api/admin/stats?days=${days}`, { headers: { authorization: `Bearer ${token}` } });
    render(d);
  } catch (err) {
    toast(err.message);
  }
}

// Vérifie que l'anti-robot du vote (Turnstile) répond bien dans ce navigateur, sans attendre un vrai vote.
$("ts-test").addEventListener("click", async () => {
  toast("Test de l'anti-robot en cours…");
  try {
    const st = await api("/api/state");
    if (!st.turnstileSiteKey) return toast("Anti-robot désactivé (pas de clé).");
    const token = await turnstileToken(st.turnstileSiteKey);
    toast(token ? "Anti-robot : OK, le vote peut passer." : "Anti-robot : pas de jeton reçu.");
  } catch (err) {
    toast(`Anti-robot : ${err.message}`);
  }
});

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
