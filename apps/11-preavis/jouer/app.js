// Préavis : l'app. Elle parle à /api/preavis/… (un Worker Cloudflare et sa base D1).
// Sans serveur (fichier ouvert tout seul, copie statique, ?demo), elle bascule sur demo.js :
// une fausse salle des marchés qui tourne dans le navigateur, où rien n'est enregistré.

import { START, DAILY, MIN_BET, MAX_PER_MARKET, CATS, TITLES, shares, odds, quote, payout, grogneIndex, grogneLabel, fmt, fmtOdds, fmtPct, weekKey, bingoGrid, bingoLines, BINGO_SIZE } from "../lib.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const NBSP = "\u00a0";
// Un titre : échappé, et sans coupure au milieu d'une inversion (« entrera-t-elle »).
const titleHtml = (s) => esc(s).replace(/[\p{L}]+(?:-t)?-(?:ils|elles|il|elle|on)(?![\p{L}-])/giu, '<span class="nw">$&</span>');
// Typographie française : pas de retour à la ligne avant ? ! : ; » ni après «.
const fr = (s) => s.replace(/ ([?!:;»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`);
const OUT_COLORS = ["#4d8dff", "#ffd60a", "#ff8a1f", "#b47cff", "#19d38a", "#ff6b84"];
const TABS = ["salle", "paris", "classement", "bingo", "regles"];
const PAVE =
  '<svg class="pave" viewBox="0 0 16 16" aria-hidden="true"><path fill="#ffd60a" d="M1.5 5.2 8 2l6.5 3.2v5.6L8 14l-6.5-3.2z"/><path fill="none" stroke="#080c18" stroke-width="1.1" stroke-linejoin="round" d="M1.5 5.2 8 8.4l6.5-3.2M8 8.4V14"/></svg>';

const view = $("#view");
const sheetWrap = $("#sheet");
const sheetBox = $("#sheet-box");

const S = {
  demo: false,
  skew: 0, // heure du serveur moins heure de l'appareil
  me: null,
  mine: {}, // mes mises : { idDuPari: { issue: { amount, payout } } }
  markets: [],
  players: 0,
  turnstile: "",
  tab: "salle",
  cat: "tout",
  board: null,
  boardAt: 0,
  boardMode: "all",
  bets: null,
  sheet: null,
  flash: [],
  lastDeg: -90,
};

const now = () => Date.now() + S.skew;
const pv = (n) => `${fmt(n)}${NBSP}${Math.abs(n) > 1 ? "pavés" : "pavé"}`;
const pl = (n, one, many) => `${fmt(n)}${NBSP}${n > 1 ? many : one}`;
const byId = (id) => S.markets.find((m) => m.id === id);
// Entre deux nouvelles du serveur, un pari peut atteindre son heure de clôture.
const statusOf = (m) => (m.status === "open" && m.closesAt <= now() ? "closed" : m.status);
const track = (name, props) => {
  try {
    window.ahTrack?.(name, props);
  } catch {
    /* la mesure d'audience ne doit jamais gêner le jeu */
  }
};

// ---------------------------------------------------------------- le serveur (ou la démo)

let backend = null;
async function call(method, path, body) {
  if (backend) return backend(method, path, body);
  let res;
  try {
    res = await fetch(`/api/preavis/${path}`, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("Connexion impossible. Vérifie ton réseau et réessaie."), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Le serveur a répondu de travers. Réessaie dans un instant."), { status: res.status, data });
  return data;
}

async function useDemo() {
  const { createDemo } = await import("./demo.js");
  backend = createDemo();
  S.demo = true;
  if (!$(".demo-flag")) $(".app").insertAdjacentHTML("afterbegin", '<p class="demo-flag">Mode démo : de faux parieurs, et rien n\'est enregistré.</p>');
}

function apply(d) {
  const before = oddsMap();
  S.skew = d.now - Date.now();
  S.me = d.me || null;
  S.markets = d.markets || [];
  S.players = d.players || 0;
  S.turnstile = d.turnstile || "";
  S.mine = {};
  for (const b of d.mine || []) (S.mine[b.market] ||= {})[b.outcome] = { amount: b.amount, payout: b.payout };
  noteFlash(before);
}

let lastRefresh = 0;
let refreshing = null;
function refresh() {
  refreshing ||= call("GET", "state")
    .then((d) => {
      lastRefresh = Date.now();
      apply(d);
      render();
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

// Les cotes qui viennent de bouger clignotent (vert : la cote monte, rouge : elle baisse).
function oddsMap() {
  const map = {};
  for (const m of S.markets) odds(m.outcomes).forEach((x, i) => (map[`${m.id}:${i}`] = x));
  return map;
}
function noteFlash(before) {
  const after = oddsMap();
  for (const k in after) if (before[k] && fmtOdds(before[k]) !== fmtOdds(after[k])) S.flash.push([k, after[k] > before[k] ? "up" : "down"]);
}
function playFlash() {
  for (const [k, dir] of S.flash.splice(0)) {
    for (const el of $$(`[data-odds="${CSS.escape(k)}"]`)) {
      el.classList.remove("up", "down");
      void el.offsetWidth;
      el.classList.add(dir);
      setTimeout(() => el.classList.remove(dir), 1500);
    }
  }
}

// ---------------------------------------------------------------- dates

const dtf = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function parts(ms) {
  return Object.fromEntries(dtf.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
}
// « mer. 16 déc. à 23 h 59 » (l'année seulement si ce n'est pas celle en cours)
function dateText(ms, withTime = true) {
  const p = parts(ms);
  const year = p.year === parts(now()).year ? "" : ` ${p.year}`;
  const time = withTime ? ` à ${Number(p.hour)}${NBSP}h${p.minute === "00" ? "" : NBSP + p.minute}` : "";
  return `${p.weekday} ${p.day} ${p.month}${year}${time}`;
}
function left(ms) {
  const d = ms - now();
  if (d >= 2 * 86400000) return `${Math.floor(d / 86400000)}${NBSP}j`;
  if (d >= 3600000) return `${Math.floor(d / 3600000)}${NBSP}h`;
  if (d >= 60000) return `${Math.floor(d / 60000)}${NBSP}min`;
  return "un instant";
}
function whenHtml(m, st) {
  if (st === "open") return `<span class="when${m.closesAt - now() < 2 * 86400000 ? " soon" : ""}">Clôture dans ${left(m.closesAt)}</span>`;
  if (st === "closed") return '<span class="when wait">Verdict attendu</span>';
  if (st === "resolved") return '<span class="when done">Tranché</span>';
  return '<span class="when">Annulé</span>';
}
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const monthName = (key) => MONTHS[Number(String(key).slice(5, 7)) - 1] || "ce mois-ci";

// ---------------------------------------------------------------- petits dessins

// La courbe miniature d'un pari : la part de l'issue favorite, depuis l'ouverture.
function series(m, i) {
  const pts = (m.hist || []).map((h) => [h[0], (h[1 + i] || 0) / 10]);
  pts.push([Math.max(now(), pts.length ? pts[pts.length - 1][0] + 1 : now()), shares(m.outcomes)[i] * 100]);
  if (pts.length === 1) pts.unshift([pts[0][0] - 1, pts[0][1]]);
  return pts;
}
function spark(m) {
  const sh = shares(m.outcomes);
  const fav = sh.indexOf(Math.max(...sh));
  const pts = series(m, fav);
  const ys = pts.map((p) => p[1]);
  let lo = Math.min(...ys) - 4;
  let hi = Math.max(...ys) + 4;
  if (hi - lo < 12) {
    const mid = (hi + lo) / 2;
    lo = mid - 6;
    hi = mid + 6;
  }
  const t0 = pts[0][0];
  const span = pts[pts.length - 1][0] - t0 || 1;
  const xy = pts.map(([t, y]) => [2 + ((t - t0) / span) * 80, 23 - ((y - lo) / (hi - lo)) * 20]);
  const end = xy[xy.length - 1];
  const color = OUT_COLORS[fav % OUT_COLORS.length];
  return `<svg viewBox="0 0 88 26" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${xy.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}"/><circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="2.6" fill="${color}"/></svg>`;
}
// La grande courbe de la fiche : toutes les issues, de 0 à 100 %.
function chart(m) {
  const W = 320;
  const H = 120;
  const all = m.outcomes.map((_, i) => series(m, i));
  const t0 = all[0][0][0];
  const span = all[0][all[0].length - 1][0] - t0 || 1;
  const x = (t) => 6 + ((t - t0) / span) * (W - 12);
  const y = (v) => H - 8 - (v / 100) * (H - 16);
  const grid = [25, 50, 75].map((v) => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#26314f" stroke-width="1" stroke-dasharray="3 5"/>`).join("");
  const lines = all
    .map((pts, i) => {
      const c = OUT_COLORS[i % OUT_COLORS.length];
      const last = pts[pts.length - 1];
      return `<polyline fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/><circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="3.4" fill="${c}"/>`;
    })
    .join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Évolution des parts de chaque issue depuis l'ouverture du pari">${grid}${lines}</svg>`;
}

// Le cadran du grognomètre : cinq zones, du calme plat à « ça va péter ».
function gaugeSvg(v) {
  const zones = ["#19d38a", "#a6dd3b", "#ffd60a", "#ff8a1f", "#ff2d46"];
  const pt = (deg, r) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 - r * Math.sin((deg * Math.PI) / 180)];
  const arcs = zones
    .map((c, i) => {
      const a = pt(180 - i * 36 - 1.5, 84);
      const b = pt(180 - (i + 1) * 36 + 1.5, 84);
      return `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}A84 84 0 0 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none" stroke="${c}" stroke-width="14"/>`;
    })
    .join("");
  const ticks = [0, 20, 40, 60, 80, 100]
    .map((n) => {
      const a = pt(180 - n * 1.8, 72);
      const b = pt(180 - n * 1.8, 66);
      return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#7480a3" stroke-width="2"/>`;
    })
    .join("");
  const deg = v == null ? -90 : (v - 50) * 1.8;
  return `<svg viewBox="0 0 200 112" role="img" aria-label="${v == null ? "Indice de grogne en attente" : `Indice de grogne : ${v} sur 100`}">${arcs}${ticks}<path class="needle" data-deg="${deg}" d="M96.6 100 100 30l3.4 70z" fill="#f2f5ff"/><circle cx="100" cy="100" r="7" fill="#f2f5ff"/><circle cx="100" cy="100" r="3" fill="#080c18"/></svg>`;
}

// ---------------------------------------------------------------- un pari, en carte

function sourceLink(url) {
  return /^https?:\/\//i.test(url || "") ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">Voir la source</a>` : "";
}
function outsHtml(m, st, opt = {}) {
  const sh = shares(m.outcomes);
  const od = odds(m.outcomes);
  const items = m.outcomes
    .map((o, i) => {
      const cls = ["out"];
      const mine = S.mine[m.id]?.[i];
      if (mine) cls.push("has-mine");
      if (st === "resolved") cls.push(i === m.winner ? "win" : "lose");
      if (opt.picked === i) cls.push("picked");
      const hook = opt.sheet ? `data-pick="${i}" aria-pressed="${opt.picked === i}"` : `data-bet="${esc(m.id)}:${i}"`;
      const lead = st === "open" ? '<span class="sr">Miser sur </span>' : "";
      const tail = (mine ? '<span class="sr"> (tu as misé ici)</span>' : "") + (st === "resolved" && i === m.winner ? '<span class="sr"> (issue gagnante)</span>' : "");
      return `<button type="button" class="${cls.join(" ")}" ${hook}${st === "open" ? "" : " disabled"}><span class="out-label">${lead}${esc(o.label)}${tail}</span><span class="out-odds" data-odds="${esc(m.id)}:${i}">${fmtOdds(od[i])}</span><span class="out-pct">${fmtPct(sh[i])} des mises</span><i class="out-bar" style="--w:${(sh[i] * 100).toFixed(1)}%;--c:${OUT_COLORS[i % OUT_COLORS.length]}"></i></button>`;
    })
    .join("");
  return `<div class="outs${m.outcomes.length === 2 ? " two" : ""}">${items}</div>`;
}
// Ce que j'ai misé sur ce pari, et ce que ça donne.
function mineHtml(m, st) {
  const mine = S.mine[m.id];
  if (!mine) return "";
  return Object.entries(mine)
    .map(([k, b]) => {
      const i = Number(k);
      const label = esc(m.outcomes[i]?.label ?? "?");
      if (st === "void") return `<p class="mk-mine">Pari annulé : tes <b>${fmt(b.amount)}</b> pavés te sont rendus.</p>`;
      if (st === "resolved") {
        const pay = b.payout ?? 0;
        if (i === m.winner && pay > b.amount) return `<p class="mk-mine">Gagné. <b>${fmt(b.amount)}</b> misés sur « ${label} », <b>${fmt(pay)}</b> touchés : <b class="plus">+${fmt(pay - b.amount)}</b>.</p>`;
        if (i === m.winner) return `<p class="mk-mine">Bien vu : « ${label} ». Tu récupères ta mise de <b>${fmt(pay)}</b> pavés.</p>`;
        if (pay > 0) return `<p class="mk-mine">« ${label} » : <b>${fmt(pay)}</b> pavés remboursés (mise arrivée après l'événement)${pay < b.amount ? `, <b class="minus">${fmt(b.amount - pay)}</b> perdus` : ""}.</p>`;
        return `<p class="mk-mine">Perdu : <b class="minus">${fmt(b.amount)}</b> pavés misés sur « ${label} ».</p>`;
      }
      return `<p class="mk-mine">Ta mise : <b>${fmt(b.amount)}</b> sur « ${label} ». Gain possible : <b>≈${NBSP}${fmt(payout(b.amount, m.outcomes, i))}</b>.</p>`;
    })
    .join("");
}
function verdictHtml(m, st) {
  if (st === "resolved") return `<p class="verdict"><b>Verdict : ${esc(m.outcomes[m.winner]?.label ?? "?")}</b>${esc(m.verdict || "L'arbitre a tranché.")}${sourceLink(m.source)}</p>`;
  if (st === "void") return `<p class="verdict void"><b>Pari annulé</b>${esc(m.verdict || "Tout le monde récupère sa mise.")}${sourceLink(m.source)}</p>`;
  if (st === "closed") return `<p class="verdict void"><b>Les mises sont closes</b>L'arbitre tranchera ${m.resolveBy && m.resolveBy > now() ? `au plus tard ${dateText(m.resolveBy, false)}` : "dès que l'issue sera connue"}.</p>`;
  return "";
}
function footHtml(m) {
  return `<button type="button" class="mk-foot linkish" data-open="${esc(m.id)}" aria-label="Voir la règle et la courbe de ce pari">${spark(m)}<span>${PAVE} ${fmt(m.total)} en jeu · ${pl(m.bettors, "parieur", "parieurs")}</span><span class="chev" aria-hidden="true">›</span></button>`;
}
function cardHtml(m) {
  const st = statusOf(m);
  const cat = CATS[m.cat] || CATS.divers;
  return `<article class="mk${S.mine[m.id] ? " is-mine" : ""}">
    <div class="mk-top"><span class="tag" style="--c:${cat.color}">${esc(cat.name)}</span><span class="sym">${esc(m.symbol)}</span>${whenHtml(m, st)}</div>
    <h3 class="mk-title"><button type="button" class="linkish" data-open="${esc(m.id)}">${titleHtml(m.title)}</button></h3>
    ${outsHtml(m, st)}${mineHtml(m, st)}${verdictHtml(m, st)}${footHtml(m)}
  </article>`;
}

// ---------------------------------------------------------------- la salle

function gaugeHtml(v) {
  return `<section class="panel gauge"><h2>Le grognomètre</h2>${gaugeSvg(v)}
    <div class="gauge-value">${v == null ? "–" : v}<small>/100</small></div>
    <div class="gauge-label">${grogneLabel(v)}</div>
    <p class="gauge-note">Calculé sur les paris en cours : plus la salle mise sur la grogne, plus l'aiguille monte.</p></section>`;
}
function alertHtml(m) {
  if (!m) return '<section class="panel alert"><span class="alert-kicker">À la une</span><h3>La salle est calme.</h3><p>Aucun pari n\'est ouvert pour l\'instant. L\'arbitre prépare la suite : repasse bientôt.</p></section>';
  const st = statusOf(m);
  const cat = CATS[m.cat] || CATS.divers;
  return `<section class="panel alert${S.mine[m.id] ? " is-mine" : ""}">
    <div class="mk-top"><span class="alert-kicker">À la une</span><span class="tag" style="--c:${cat.color}">${esc(cat.name)}</span>${whenHtml(m, st)}</div>
    <h3><button type="button" class="linkish" data-open="${esc(m.id)}">${titleHtml(m.title)}</button></h3>
    ${outsHtml(m, st)}${mineHtml(m, st)}${footHtml(m)}
  </section>`;
}
function calloutHtml() {
  if (!S.me)
    return `<section class="callout"><p>${fmt(START)} pavés t'attendent.<small>Choisis un pseudo, parie sur l'actu, grimpe au classement. Aucun argent, rien à gagner : c'est pour rire.</small></p><button type="button" class="btn btn-red" data-act="enter">Entrer dans la salle</button></section>`;
  if (S.me.bonus === "dispo")
    return `<section class="callout"><p>La caisse de grève est ouverte.<small>Ta fortune est sous ${fmt(START)} pavés : la solidarité te verse ${DAILY} pavés par jour.</small></p><button type="button" class="btn btn-yellow" data-act="bonus">Toucher ${DAILY} pavés</button></section>`;
  return "";
}
function chipsHtml(live, done) {
  const count = (id) => live.filter((m) => m.cat === id).length;
  const chip = (id, name, n) => `<button type="button" class="chip" data-cat="${id}" aria-pressed="${S.cat === id}">${esc(name)}<i>${n}</i></button>`;
  let html = chip("tout", "Tout", live.length);
  for (const [id, c] of Object.entries(CATS)) if (count(id)) html += chip(id, c.name, count(id));
  const mine = live.filter((m) => S.mine[m.id]).length;
  if (mine) html += chip("mes", "Mes paris", mine);
  if (done.length) html += chip("verdicts", "Verdicts", done.length);
  return `<div class="chips" role="group" aria-label="Filtrer les paris">${html}</div>`;
}
function salle() {
  const withSt = S.markets.map((m) => ({ ...m, status: statusOf(m) }));
  const live = withSt.filter((m) => m.status === "open" || m.status === "closed").sort((a, b) => (a.status === "closed") - (b.status === "closed"));
  const done = withSt.filter((m) => m.status === "resolved" || m.status === "void").sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
  const open = live.filter((m) => m.status === "open");
  const featured = open.find((m) => m.pinned) || open.slice().sort((a, b) => b.bettors - a.bettors)[0] || null;
  if (S.cat !== "tout" && S.cat !== "mes" && S.cat !== "verdicts" && !live.some((m) => m.cat === S.cat)) S.cat = "tout";
  if ((S.cat === "mes" && !live.some((m) => S.mine[m.id])) || (S.cat === "verdicts" && !done.length)) S.cat = "tout";

  const blocks = [["hero", '<div class="hero"></div>', [["gauge", gaugeHtml(grogneIndex(withSt))], ["alert", alertHtml(featured)]]]];
  const callout = calloutHtml();
  if (callout) blocks.push(["callout", callout]);
  blocks.push(["bar", `<h2 class="bar">Les paris <small>${pl(open.length, "pari ouvert", "paris ouverts")} · ${pl(S.players, "inscrit", "inscrits")}</small></h2>`]);
  blocks.push(["chips", chipsHtml(live, done)]);

  let list;
  if (S.cat === "verdicts") list = done;
  else if (S.cat === "mes") list = live.filter((m) => S.mine[m.id]);
  else if (S.cat === "tout") list = live.filter((m) => m !== featured);
  else list = live.filter((m) => m.cat === S.cat);
  if (list.length) blocks.push(["grid", '<div class="grid"></div>', list.map((m) => [`m:${m.id}`, cardHtml(m)])]);
  else if (!featured || S.cat !== "tout") blocks.push(["none", '<p class="empty"><b>Rien ici pour l\'instant</b>L\'arbitre ajoute des paris au fil de l\'actualité.</p>']);

  if (S.cat !== "verdicts" && done.length) {
    blocks.push(["bar-done", '<h2 class="bar">Derniers verdicts</h2>']);
    blocks.push(["grid-done", '<div class="grid"></div>', done.slice(0, 4).map((m) => [`m:${m.id}`, cardHtml(m)])]);
    if (done.length > 4) blocks.push(["more-done", '<p class="center"><button type="button" class="btn btn-ghost" data-cat="verdicts">Tous les verdicts</button></p>']);
  }
  return blocks;
}

// ---------------------------------------------------------------- mes paris

function kpisHtml(me) {
  return `<div class="kpis">
    <div class="kpi"><small>Fortune</small><b>${fmt(me.fortune)}</b><span>disponible + en jeu</span></div>
    <div class="kpi"><small>Disponible</small><b>${fmt(me.balance)}</b><span>à miser</span></div>
    <div class="kpi"><small>En jeu</small><b>${fmt(me.staked)}</b><span>sur les paris en cours</span></div>
    <div class="kpi"><small>Titre</small><b class="word">${esc(me.title)}</b><span>${esc(TITLES[me.title] || "")}</span></div>
  </div>`;
}
function betLine(b) {
  const m = byId(b.market);
  const st = m ? statusOf(m) : b.status;
  const label = esc(b.label);
  let sub;
  let n;
  if (st === "open" || st === "closed") {
    const est = m ? payout(b.amount, m.outcomes, b.outcome) : null;
    sub = `« ${label} » · ${st === "open" ? `clôture dans ${left(b.closesAt)}` : "verdict attendu"}`;
    n = `${fmt(b.amount)}<small>${est ? `gain possible ≈${NBSP}${fmt(est)}` : "en jeu"}</small>`;
  } else if (st === "void") {
    sub = `« ${label} » · pari annulé`;
    n = `${fmt(b.amount)}<small>remboursés</small>`;
  } else {
    const d = (b.payout ?? 0) - b.amount;
    sub = `« ${label} » · ${fmt(b.amount)} misés · verdict : ${esc(b.winLabel ?? m?.outcomes[b.winner]?.label ?? "?")}`;
    n = d > 0 ? `<span class="plus">+${fmt(d)}</span><small>gagnés</small>` : d === 0 ? `${fmt(b.amount)}<small>récupérés</small>` : `<span class="minus">−${fmt(-d)}</span><small>perdus</small>`;
  }
  const title = m ? `<button type="button" class="linkish" data-open="${esc(b.market)}">${esc(b.title)}</button>` : esc(b.title);
  return `<li class="line"><span class="line-title">${title}</span><span class="line-sub">${sub}</span><span class="line-n">${n}</span></li>`;
}
function paris() {
  if (!S.me)
    return [["none", `<div class="empty"><b>Pas encore de compte</b><p>Choisis un pseudo et reçois ${fmt(START)} pavés pour parier. Aucun argent, aucun e-mail.</p><button type="button" class="btn btn-red" data-act="enter">Entrer dans la salle</button></div>`]];
  const me = S.me;
  const blocks = [["kpis", kpisHtml(me)]];
  const record = me.settled ? `${pl(me.won, "pari gagné", "paris gagnés")} sur ${me.settled} ${me.settled > 1 ? "tranchés" : "tranché"}.` : "Aucun de tes paris n'a encore été tranché.";
  const caisse =
    me.bonus === "dispo"
      ? `<button type="button" class="btn btn-yellow" data-act="bonus">Caisse de grève : toucher ${DAILY} pavés</button>`
      : me.bonus === "pris"
        ? '<span class="note">Caisse de grève touchée aujourd\'hui. Elle rouvre demain.</span>'
        : "";
  blocks.push(["record", `<div class="callout plain"><p>${record}<small>${me.bonus === "riche" ? `La caisse de grève est réservée aux fortunes de moins de ${fmt(START)} pavés.` : `Sous ${fmt(START)} pavés de fortune, la caisse de grève verse ${DAILY} pavés par jour.`}</small></p>${caisse}<button type="button" class="btn btn-ghost" data-act="account">Mon compte</button></div>`]);
  if (!S.bets) {
    blocks.push(["wait", '<p class="loading">Relevé des paris en cours…</p>']);
    return blocks;
  }
  const liveSt = (b) => {
    const m = byId(b.market);
    const st = m ? statusOf(m) : b.status;
    return st === "open" || st === "closed";
  };
  const live = S.bets.filter(liveSt);
  const past = S.bets.filter((b) => !liveSt(b));
  blocks.push(["bar-live", `<h2 class="bar">En cours <small>${pl(live.length, "mise", "mises")}</small></h2>`]);
  blocks.push(live.length ? ["live", `<ul class="lines">${live.map(betLine).join("")}</ul>`] : ["live-none", '<p class="empty"><b>Aucune mise en cours</b>Va faire un tour dans la salle : il y a sûrement une cote qui te démange.</p>']);
  if (past.length) {
    blocks.push(["bar-past", `<h2 class="bar">Tranchés <small>${pl(past.length, "mise", "mises")}</small></h2>`]);
    blocks.push(["past", `<ul class="lines">${past.map(betLine).join("")}</ul>`]);
  }
  return blocks;
}
async function loadBets() {
  if (!S.me) return;
  try {
    const d = await call("GET", "bets");
    S.bets = d.bets;
    if (d.me) S.me = d.me;
  } catch (err) {
    if (err.status === 401) S.me = null;
    S.bets = S.bets || [];
  }
  if (S.tab === "paris") render();
}

// ---------------------------------------------------------------- classement

function boardRow(r, rank, mode, mine) {
  const amount = mode === "month" ? `<span class="${r.profit >= 0 ? "plus" : "minus"}">${r.profit >= 0 ? "+" : "−"}${fmt(Math.abs(r.profit))}</span>` : fmt(r.fortune);
  return `<li class="${mine ? "me" : ""}"><span class="rk">${rank}</span><span class="who">${esc(r.name)}${mine ? " (toi)" : ""}<small>${esc(r.title)}</small></span><span class="amt">${amount}</span></li>`;
}
function classement() {
  const b = S.board;
  const seg = `<div class="seg" role="group" aria-label="Classement"><button type="button" data-act="board-all" aria-pressed="${S.boardMode === "all"}">Général</button><button type="button" data-act="board-month" aria-pressed="${S.boardMode === "month"}">${b ? esc(monthName(b.month)[0].toUpperCase() + monthName(b.month).slice(1)) : "Ce mois-ci"}</button></div>`;
  const blocks = [["bar", '<h2 class="bar first">Le classement</h2>'], ["seg", seg]];
  if (!b) return [...blocks, ["wait", '<p class="loading">Dépouillement en cours…</p>']];
  const month = S.boardMode === "month";
  const rows = month ? b.monthly : b.all;
  blocks.push(["note", `<p class="note lead">${month ? `Gains et pertes sur les paris tranchés en ${esc(monthName(b.month))}. Le compteur repart de zéro chaque mois.` : "La fortune, c'est les pavés disponibles plus ceux qui sont en jeu. Il faut avoir parié au moins une fois pour être classé."}</p>`]);
  if (!rows.length) {
    blocks.push(["none", `<p class="empty"><b>${month ? "Aucun verdict ce mois-ci" : "Personne n'a encore parié"}</b>${month ? "Le classement du mois démarre au premier pari tranché." : "La première place est à prendre."}</p>`]);
    return blocks;
  }
  let html = rows.map((r, i) => boardRow(r, i + 1, S.boardMode, b.me && r.id === b.me.id)).join("");
  const myRank = month ? b.me?.monthRank : b.me?.rank;
  if (b.me && myRank && !rows.some((r) => r.id === b.me.id)) html += `<li class="gap me"><span class="rk">${myRank}</span><span class="who">${esc(b.me.name)} (toi)<small>${esc(b.me.title)}</small></span><span class="amt">${month ? `${b.me.profit >= 0 ? "+" : "−"}${fmt(Math.abs(b.me.profit))}` : fmt(b.me.fortune)}</span></li>`;
  blocks.push(["board", `<ol class="board">${html}</ol>`]);
  if (b.me && !myRank) blocks.push(["me-none", `<p class="note lead">${month ? "Tu n'as pas encore de pari tranché ce mois-ci." : "Tu n'es pas encore classé : place ta première mise."}</p>`]);
  return blocks;
}
async function loadBoard(force) {
  if (!force && S.board && Date.now() - S.boardAt < 20000) return;
  try {
    S.board = await call("GET", "board");
    S.boardAt = Date.now();
  } catch (err) {
    S.board = S.board || { month: "", all: [], monthly: [], me: null };
    toast(err.message);
  }
  if (S.tab === "classement") render();
}

// ---------------------------------------------------------------- bingo

const BINGO_KEY = "preavis:bingo";
function bingoState(week) {
  try {
    const d = JSON.parse(localStorage.getItem(BINGO_KEY) || "null");
    if (d && d.week === week && Array.isArray(d.checked)) return Array.from({ length: BINGO_SIZE * BINGO_SIZE }, (_, i) => !!d.checked[i]);
  } catch {
    /* stockage indisponible : la grille repart vide */
  }
  return Array(BINGO_SIZE * BINGO_SIZE).fill(false);
}
function saveBingo(week, checked) {
  try {
    localStorage.setItem(BINGO_KEY, JSON.stringify({ week, checked }));
  } catch {
    /* tant pis : la grille ne sera pas gardée */
  }
}
function bingo() {
  const week = weekKey(now());
  const grid = bingoGrid(week);
  const checked = bingoState(week);
  const lines = bingoLines(checked);
  const inLine = new Set(lines.flat());
  const n = checked.filter(Boolean).length;
  const cells = grid.map((p, i) => `<button type="button" data-cell="${i}" aria-pressed="${checked[i]}"${inLine.has(i) ? ' class="in-line"' : ""}>${esc(p.replace(/^« | »$/g, ""))}</button>`).join("");
  const msg = n === grid.length ? "Carton plein. Tu peux éteindre la télé." : lines.length ? `Bingo ! ${pl(lines.length, "ligne complète", "lignes complètes")}.` : n ? `${n} sur ${grid.length}. Encore un petit effort.` : "Allume la radio, ça ne devrait pas être long.";
  return [
    ["bar", `<h2 class="bar first">Le bingo <small>des petites phrases · semaine ${Number(week.slice(-2))}</small></h2>`],
    ["intro", '<p class="note lead">Seize formules toutes faites, la même grille pour tout le monde, renouvelée chaque lundi. Coche celles que tu entends à la télé ou à la radio. Rien à gagner, même pas des pavés.</p>'],
    ["grid", `<div class="bingo" role="group" aria-label="Grille de bingo">${cells}</div>`],
    ["msg", `<p class="bingo-msg" role="status">${msg}</p>`],
    ["tools", `<p class="row tools"><button type="button" class="btn" data-act="bingo-share"${n ? "" : " disabled"}>Partager ma grille</button><button type="button" class="btn btn-ghost" data-act="bingo-reset"${n ? "" : " disabled"}>Tout décocher</button></p>`],
  ];
}
function bingoText() {
  const week = weekKey(now());
  const checked = bingoState(week);
  const inLine = new Set(bingoLines(checked).flat());
  let rows = "";
  for (let r = 0; r < BINGO_SIZE; r++) {
    for (let c = 0; c < BINGO_SIZE; c++) rows += inLine.has(r * BINGO_SIZE + c) ? "🟨" : checked[r * BINGO_SIZE + c] ? "🟥" : "⬛";
    rows += "\n";
  }
  return `Bingo des petites phrases, semaine ${Number(week.slice(-2))}\n${rows}${checked.filter(Boolean).length}/${checked.length} sur Préavis, la bourse de la grogne`;
}

// ---------------------------------------------------------------- règles

function regles() {
  const titles = Object.entries(TITLES)
    .map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`)
    .join("");
  return [
    ["bar", '<h2 class="bar first">Les règles du jeu</h2>'],
    [
      "prose",
      `<div class="prose">
      <section><h3>Le principe</h3>
        <p>Préavis est une bourse pour rire. On y parie sur ce qui va se passer dans l'actualité sociale et politique française, d'ici la présidentielle des 18 avril et 2 mai 2027 : grèves, manifs, budget, 49.3, candidatures.</p>
        <p>Tout se joue en <b>pavés</b>, une monnaie fictive. <b>Aucun argent, aucun lot</b> : on ne peut ni déposer, ni retirer, ni rien gagner d'autre qu'une place au classement.</p></section>
      <section><h3>Les pavés</h3>
        <ul><li><b>${fmt(START)} pavés</b> offerts à l'inscription.</li>
        <li>Mise minimale : <b>${MIN_BET} pavés</b>. Pas plus de <b>${MAX_PER_MARKET} pavés</b> par personne sur un même pari.</li>
        <li>Ta <b>fortune</b>, c'est ce que tu as de disponible plus ce qui est en jeu. C'est elle qui compte au classement général.</li>
        <li>Une mise posée ne se reprend pas.</li></ul></section>
      <section><h3>Les cotes</h3>
        <p>C'est un pari mutuel : toutes les mises d'un pari vont dans le même pot, et les gagnants se le partagent au prorata de leur mise. La cote d'une issue, c'est le pot divisé par ce qui a été misé sur elle.</p>
        <p>Exemple : tu mises 100 pavés sur « Oui » à ×3. Si « Oui » gagne et que la cote n'a pas bougé, tu touches 300 pavés, mise comprise. Si d'autres misent sur « Oui » après toi, la cote baisse. S'ils misent sur « Non », elle monte.</p>
        <p>La cote bouge donc <b>jusqu'à la clôture</b> : le gain affiché est une estimation. À l'ouverture, la maison pose 1 000 pavés sur chaque pari, répartis selon son pronostic : c'est ce qui donne la première cote.</p></section>
      <section><h3>Le verdict</h3>
        <p>Chaque pari a une règle écrite et une date de clôture. Après la clôture, plus personne ne mise. L'arbitre tranche ensuite à partir de <b>sources publiques</b>, et donne le lien.</p>
        <ul><li>Si l'issue est connue avant la clôture, les mises arrivées après sont <b>remboursées</b>.</li>
        <li>Si la question n'a plus de sens, le pari est <b>annulé</b> et tout le monde récupère sa mise.</li>
        <li>L'arbitre peut se tromper : un verdict peut être corrigé, les pavés suivent.</li></ul></section>
      <section><h3>La caisse de grève</h3>
        <p>Fauché ? Tant que ta fortune est sous ${fmt(START)} pavés, la caisse de grève te verse <b>${DAILY} pavés par jour</b>, à réclamer dans « Mes paris ». Au-dessus, on estime que tu peux tenir.</p></section>
      <section><h3>Les classements</h3>
        <p>Le <b>général</b> classe les fortunes. Celui <b>du mois</b> classe les gains et pertes sur les paris tranchés dans le mois : tout le monde repart de zéro le 1er.</p>
        <p>Le <b>grognomètre</b> résume l'humeur de la salle : plus les pavés vont vers les issues qui chauffent, plus l'aiguille monte.</p></section>
      <section><h3>Les titres</h3><dl>${titles}</dl></section>
      <section><h3>Ton compte</h3>
        <p>Ni e-mail ni mot de passe : un pseudo, et un cookie qui garde ton compte sur cet appareil. Pour changer d'appareil, note ton <b>code de reprise</b> (dans « Mon compte »). Tu peux supprimer ton compte quand tu veux.</p>
        <p>Le pseudo est public, alors pas de vrai nom, et rien de déplacé : l'arbitre remplace les pseudos qui dérapent.</p></section>
      <section><h3>Pour rire, mais proprement</h3>
        <p>On parie sur des faits publics et vérifiables : un vote, un chiffre officiel, une date. Jamais sur la vie privée, la santé ou les malheurs de quelqu'un, et jamais sur des violences.</p>
        <p>Préavis ne roule pour personne. Ce n'est ni un sondage, ni un site de jeux d'argent : c'est l'app 11 d'<a href="/">Apphéro</a>, 30 apps en 30 jours.</p></section>
    </div>`,
    ],
  ];
}

// ---------------------------------------------------------------- affichage général

const VIEWS = { salle, paris, classement, bingo, regles };

// Met à jour une liste de blocs sans tout reconstruire : un bloc inchangé reste en place
// (pas de clignotement, pas de perte de focus), un bloc modifié est remplacé.
function sync(parent, blocks) {
  const old = new Map();
  for (const el of [...parent.children]) {
    if (el.dataset.k) old.set(el.dataset.k, el);
    else el.remove();
  }
  let prev = null;
  for (const [key, raw, kids] of blocks) {
    const html = fr(raw);
    let el = old.get(key);
    old.delete(key);
    if (!el || el._html !== html) {
      const t = document.createElement("template");
      t.innerHTML = html.trim();
      const fresh = t.content.firstElementChild;
      fresh.dataset.k = key;
      fresh._html = html;
      if (el) {
        const focus = el.contains(document.activeElement) ? hookOf(document.activeElement) : null;
        if (kids) fresh.append(...el.children);
        el.replaceWith(fresh);
        if (focus) $(focus, fresh)?.focus({ preventScroll: true });
      }
      el = fresh;
    }
    const want = prev ? prev.nextElementSibling : parent.firstElementChild;
    if (el !== want) parent.insertBefore(el, want);
    if (kids) sync(el, kids);
    prev = el;
  }
  for (const el of old.values()) el.remove();
}
function hookOf(el) {
  for (const k of ["bet", "open", "cat", "act", "pick", "cell", "tab"]) if (el.dataset?.[k] != null) return `[data-${k}="${CSS.escape(el.dataset[k])}"]`;
  return null;
}

function renderTop() {
  const wallet = $("#wallet");
  const enter = $("#enter");
  if (S.me) {
    const html = `${PAVE}<span>${fmt(S.me.balance)}</span><small>${esc(S.me.name)}</small>`;
    if (wallet._html !== html) wallet.innerHTML = wallet._html = html;
    wallet.setAttribute("aria-label", `Mon compte : ${S.me.name}, ${S.me.balance} pavés disponibles`);
  }
  wallet.hidden = !S.me;
  enter.hidden = !!S.me;
  for (const b of $$("#tabs [data-tab]")) {
    if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
}
function renderTicker() {
  const el = $("#ticker");
  const items = S.markets
    .filter((m) => statusOf(m) === "open")
    .map((m) => {
      const sh = shares(m.outcomes);
      const fav = sh.indexOf(Math.max(...sh));
      const pts = series(m, fav);
      const delta = pts[pts.length - 1][1] - pts[0][1];
      const dir = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
      return `<span><b>${esc(m.symbol)}</b>${esc(m.outcomes[fav].label)} ${fmtOdds(odds(m.outcomes)[fav])} <i class="${dir}">${dir === "up" ? "▲" : dir === "down" ? "▼" : "■"} ${Math.abs(delta).toFixed(1).replace(".", ",")} pt</i></span>`;
    });
  const html = items.length ? items.join("") : "<span><b>PRÉAVIS</b>La salle attend ses premiers paris</span>";
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html + html; // deux fois de suite : le défilement boucle sans couture
  el.style.animationDuration = `${Math.max(24, items.length * 7)}s`;
}
function render() {
  renderTop();
  renderTicker();
  // La rangée de filtres garde sa place quand elle est redessinée, et le filtre choisi reste visible.
  const chipsX = $(".chips", view)?.scrollLeft || 0;
  sync(view, VIEWS[S.tab]());
  const chips = $(".chips", view);
  if (chips) {
    chips.scrollLeft = chipsX;
    const on = $('[aria-pressed="true"]', chips);
    if (on && (on.offsetLeft < chips.scrollLeft || on.offsetLeft + on.offsetWidth > chips.scrollLeft + chips.clientWidth)) chips.scrollLeft = Math.max(0, on.offsetLeft - 16);
  }
  // L'aiguille du grognomètre part de sa position précédente.
  const needle = $(".needle:not([data-set])", view);
  if (needle) {
    const deg = Number(needle.dataset.deg);
    needle.dataset.set = "1";
    needle.style.transform = `rotate(${S.lastDeg}deg)`;
    void needle.getBoundingClientRect();
    needle.style.transform = `rotate(${deg}deg)`;
    S.lastDeg = deg;
  }
  playFlash();
  if (S.sheet && !sheetBox.contains(document.activeElement?.closest?.("input"))) renderSheet(true);
}

// Change l'adresse sans recharger la page. Dans un cadre qui l'interdit (aperçu embarqué), on s'en passe.
function setUrl(url) {
  try {
    history.replaceState(null, "", url);
  } catch {
    /* l'adresse ne suit pas, l'app marche quand même */
  }
}

function setTab(tab, push = true) {
  if (!TABS.includes(tab)) tab = "salle";
  S.tab = tab;
  if (push) setUrl(tab === "salle" ? location.pathname + location.search : `#${tab}`);
  render();
  if (tab === "paris") loadBets();
  if (tab === "classement") loadBoard();
  // Si on avait déjà fait défiler la page, la nouvelle rubrique commence juste sous les onglets
  // (qui restent collés en haut : leur propre position ne dit donc rien, on se repère sur le contenu).
  const top = view.getBoundingClientRect().top + window.scrollY - $("#tabs").offsetHeight;
  window.scrollTo({ top: Math.min(window.scrollY, Math.max(0, top)) });
}

let toastTimer;
function toast(text) {
  const el = $("#toast");
  el.textContent = fr(text);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4200);
}

// ---------------------------------------------------------------- les panneaux (fiche d'un pari, compte)

let lastFocus = null;
function openSheet(sheet) {
  if (!S.sheet) lastFocus = document.activeElement;
  S.sheet = sheet;
  renderSheet();
  sheetBox.scrollTop = 0;
  sheetBox.focus({ preventScroll: true });
}
function closeSheet() {
  if (!S.sheet) return;
  const wasMarket = S.sheet.kind === "market";
  S.sheet = null;
  renderSheet();
  if (wasMarket && location.hash.startsWith("#pari=")) setUrl(S.tab === "salle" ? location.pathname + location.search : `#${S.tab}`);
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  lastFocus = null;
}
function renderSheet(keep = false) {
  const s = S.sheet;
  if (!s) {
    sheetWrap.hidden = true;
    sheetBox.innerHTML = "";
    document.body.style.overflow = "";
    return;
  }
  const top = sheetBox.scrollTop;
  const focus = keep && sheetBox.contains(document.activeElement) ? hookOf(document.activeElement) : null;
  sheetBox.innerHTML = fr(SHEETS[s.kind](s));
  sheetWrap.hidden = false;
  document.body.style.overflow = "hidden";
  sheetBox.scrollTop = top;
  if (focus) $(focus, sheetBox)?.focus({ preventScroll: true });
  if (s.kind === "market") updateStake();
}
const sheetHead = (left) => `<div class="sheet-head">${left}<button type="button" class="sheet-x" data-act="close-sheet" aria-label="Fermer">×</button></div>`;
const errHtml = (s) => `<p class="err" role="alert"${s.err ? "" : " hidden"}>${esc(s.err || "")}</p>`;

function joinForm(s, inMarket) {
  return `<form class="stake" data-form="join" novalidate>
    ${inMarket ? "<h3>Il te faut des pavés</h3>" : ""}
    <p>Choisis un pseudo et reçois <b>${fmt(START)} pavés</b> pour parier. Aucun argent, aucun e-mail.</p>
    <div class="field"><label for="pseudo">Ton pseudo</label><input id="pseudo" name="name" maxlength="16" autocomplete="nickname" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="${esc(s.name || "")}"></div>
    <div class="ts-slot"></div>
    ${errHtml(s)}
    <button type="submit" class="btn btn-red btn-wide"${s.busy ? " disabled" : ""}>${s.busy ? "Un instant…" : `Recevoir mes ${fmt(START)} pavés`}</button>
    <p class="note">Le pseudo est public : pas de vrai nom. Un cookie garde ton compte sur cet appareil. <a href="/mentions-legales/">En savoir plus</a></p>
    <p class="note">Déjà un compte ailleurs ? <button type="button" class="textlink" data-act="restore">Entrer mon code de reprise</button></p>
  </form>`;
}

function stakeForm(m, s) {
  if (!S.me) return joinForm(s, true);
  if (s.outcome == null) return '<p class="note pickme">Touche une issue pour miser dessus.</p>';
  const already = Object.values(S.mine[m.id] || {}).reduce((a, b) => a + b.amount, 0);
  const room = Math.max(0, MAX_PER_MARKET - already);
  const max = Math.min(S.me.balance, room);
  if (max < MIN_BET) {
    const why = room < MIN_BET ? `Tu as atteint le plafond de ${MAX_PER_MARKET} pavés sur ce pari.` : `Il te faut au moins ${MIN_BET} pavés disponibles pour miser.`;
    const help = room >= MIN_BET && S.me.bonus === "dispo" ? `<button type="button" class="btn btn-yellow btn-wide" data-act="bonus">Caisse de grève : toucher ${DAILY} pavés</button>` : "";
    return `<div class="stake"><p class="err">${why}</p>${help}</div>`;
  }
  if (!(s.amount >= MIN_BET)) s.amount = Math.min(50, max);
  if (s.amount > max) s.amount = max;
  const quick = [10, 50, 100].filter((v) => v <= max).map((v) => `<button type="button" data-amt="${v}">${v}</button>`).join("");
  return `<form class="stake" data-form="bet" data-max="${max}" novalidate>
    <div class="stake-row"><button type="button" class="step" data-step="-10" aria-label="Dix pavés de moins">−</button><label class="sr" for="amount">Ta mise, en pavés</label><input id="amount" name="amount" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="go" value="${s.amount}"><button type="button" class="step" data-step="10" aria-label="Dix pavés de plus">+</button></div>
    <div class="quick">${quick}<button type="button" data-amt="${max}">Max ${fmt(max)}</button></div>
    <p class="gain" id="gain"></p>
    ${errHtml(s)}
    <button type="submit" class="btn btn-yellow btn-wide" id="place"${s.busy ? " disabled" : ""}>Miser</button>
    <p class="note">Disponible : ${pv(S.me.balance)}. Plafond : ${MAX_PER_MARKET} par pari${already ? ` (déjà ${fmt(already)} ici)` : ""}. La cote bouge jusqu'à la clôture.</p>
  </form>`;
}
// La ligne « tu touches environ… » et le bouton suivent la mise tapée, sans toucher au champ.
function updateStake() {
  const s = S.sheet;
  const form = $('form[data-form="bet"]', sheetBox);
  if (!s || s.kind !== "market" || !form) return;
  const m = byId(s.id);
  const input = $("#amount", form);
  const gain = $("#gain", form);
  const btn = $("#place", form);
  const max = Number(form.dataset.max);
  const a = /^\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : NaN;
  s.amount = Number.isFinite(a) ? a : 0;
  const label = esc(m.outcomes[s.outcome]?.label ?? "");
  let problem = "";
  if (!Number.isFinite(a) || a < MIN_BET) problem = `La mise minimale est de ${MIN_BET} pavés.`;
  else if (a > max) problem = `Tu peux miser ${fmt(max)} pavés au plus sur ce pari.`;
  if (problem) {
    gain.textContent = problem;
    btn.textContent = "Miser";
    btn.disabled = true;
    return;
  }
  const q = quote(m.outcomes, s.outcome, a);
  gain.innerHTML = fr(`Si « ${label} » l'emporte, tu touches environ <b>${pv(q)}</b>, mise comprise (${fmtOdds(q / a)}).`);
  btn.innerHTML = s.busy ? "Un instant…" : fr(`Miser ${pv(a)} sur « ${label} »`);
  btn.disabled = !!s.busy;
}

function marketSheet(s) {
  const m = byId(s.id);
  if (!m) return `${sheetHead("")}<h2 id="sheet-title">Ce pari n'est plus affiché</h2><p class="note">Il a peut-être été retiré par l'arbitre, ou tranché il y a longtemps.</p>`;
  const st = statusOf(m);
  const cat = CATS[m.cat] || CATS.divers;
  const sh = shares(m.outcomes);
  const legend = m.outcomes.map((o, i) => `<span><i style="--c:${OUT_COLORS[i % OUT_COLORS.length]}"></i>${esc(o.label)} ${fmtPct(sh[i])}</span>`).join("");
  const facts = [
    [st === "open" ? "Clôture des mises" : "Mises closes", dateText(m.closesAt)],
    st === "resolved" || st === "void" ? ["Tranché", dateText(m.resolvedAt)] : ["Verdict", m.resolveBy ? `au plus tard ${dateText(m.resolveBy, false)}` : "dès que l'issue est connue"],
    ["En jeu", pv(m.total)],
    ["Parieurs", fmt(m.bettors)],
  ];
  return `${sheetHead(`<span class="tag" style="--c:${cat.color}">${esc(cat.name)}</span><span class="sym">${esc(m.symbol)}</span>${whenHtml(m, st)}`)}
    <h2 id="sheet-title">${titleHtml(m.title)}</h2>
    ${verdictHtml(m, st)}
    ${outsHtml(m, st, { sheet: true, picked: st === "open" ? s.outcome : null })}
    ${mineHtml(m, st)}
    ${st === "open" ? stakeForm(m, s) : ""}
    <details class="rules"${st === "open" && S.me && s.outcome != null ? "" : " open"}><summary>La règle du pari</summary><p>${esc(m.rules || "L'arbitre tranche à partir de sources publiques.")}</p></details>
    <h3>Ce que pense la salle</h3>
    ${chart(m)}
    <div class="legend">${legend}</div>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <button type="button" class="btn btn-ghost" data-act="share-market">Partager ce pari</button>`;
}
function joinSheet(s) {
  return `${sheetHead('<span class="alert-kicker">Bienvenue</span>')}<h2 id="sheet-title">Entrer dans la salle</h2>${joinForm(s, false)}`;
}
function restoreSheet(s) {
  return `${sheetHead('<span class="alert-kicker">Reprise</span>')}<h2 id="sheet-title">Retrouver mon compte</h2>
    <form class="stake" data-form="restore" novalidate>
      <p>Tape le code de reprise affiché dans « Mon compte » sur ton autre appareil.</p>
      <div class="field"><label for="code">Code de reprise</label><input id="code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" value="${esc(s.code || "")}"></div>
      ${errHtml(s)}
      <button type="submit" class="btn btn-red btn-wide"${s.busy ? " disabled" : ""}>Retrouver mon compte</button>
      <p class="note">Pas encore de compte ? <button type="button" class="textlink" data-act="enter">Choisir un pseudo</button></p>
    </form>`;
}
function accountSheet(s) {
  const me = S.me;
  if (!me) return joinSheet(s);
  const caisse = me.bonus === "dispo" ? `<button type="button" class="btn btn-yellow btn-wide" data-act="bonus">Caisse de grève : toucher ${DAILY} pavés</button>` : "";
  const code = s.code
    ? `<p class="code">${esc(s.code)}</p><p class="note">C'est la clé de ton compte : garde-la pour toi. Tape-la sur un autre appareil, dans « Entrer » puis « Entrer mon code de reprise ».</p><button type="button" class="btn" data-act="copy-key">Copier le code</button>`
    : '<p class="note">Pour retrouver ton compte sur un autre appareil, ou si tu effaces tes cookies.</p><button type="button" class="btn" data-act="show-key">Afficher mon code de reprise</button>';
  const out =
    s.confirm === "logout"
      ? '<p class="err">Sans ton code de reprise, tu ne pourras plus revenir sur ce compte. Tu l\'as noté ?</p><div class="row"><button type="button" class="btn btn-red" data-act="logout-yes">Oui, me déconnecter</button><button type="button" class="btn btn-ghost" data-act="confirm-no">Annuler</button></div>'
      : s.confirm === "forget"
        ? '<p class="err">Ton pseudo est libéré, ton compte disparaît du classement et personne ne peut le récupérer, toi non plus.</p><div class="row"><button type="button" class="btn btn-red" data-act="forget-yes">Supprimer pour de bon</button><button type="button" class="btn btn-ghost" data-act="confirm-no">Annuler</button></div>'
        : '<div class="row"><button type="button" class="btn btn-ghost" data-act="logout">Me déconnecter</button><button type="button" class="btn btn-ghost" data-act="forget">Supprimer mon compte</button></div>';
  return `${sheetHead('<span class="alert-kicker">Mon compte</span>')}<h2 id="sheet-title">${esc(me.name)}</h2>
    ${kpisHtml(me)}${caisse}
    <h3>Changer de pseudo</h3>
    <form class="row" data-form="rename" novalidate><div class="field grow"><label class="sr" for="rename">Nouveau pseudo</label><input id="rename" name="name" maxlength="16" autocomplete="nickname" autocapitalize="off" spellcheck="false" value="${esc(s.name ?? me.name)}"></div><button type="submit" class="btn"${s.busy ? " disabled" : ""}>Changer</button></form>
    ${errHtml(s)}
    <h3>Code de reprise</h3>${code}
    <h3>Quitter</h3>${out}`;
}
const SHEETS = { market: marketSheet, join: joinSheet, restore: restoreSheet, account: accountSheet };

function openMarket(id, outcome = null) {
  const m = byId(id);
  if (!m) return toast("Ce pari n'est plus affiché.");
  openSheet({ kind: "market", id, outcome: statusOf(m) === "open" ? outcome : null, amount: 0, err: "" });
  setUrl(`#pari=${id}`);
}

// ---------------------------------------------------------------- actions

// L'anti-robot de Cloudflare, demandé seulement à l'inscription et seulement si le serveur l'exige.
let tsLoading = null;
function turnstileToken(slot) {
  if (!S.turnstile) return Promise.resolve("");
  tsLoading ||= new Promise((ok, ko) => {
    const el = document.createElement("script");
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.onload = ok;
    el.onerror = () => {
      tsLoading = null;
      ko(new Error("Vérification anti-robot indisponible. Réessaie dans un instant."));
    };
    document.head.append(el);
  });
  return tsLoading.then(
    () =>
      new Promise((ok, ko) => {
        slot.innerHTML = "";
        const fail = () => ko(new Error("Vérification anti-robot échouée. Réessaie."));
        const timer = setTimeout(fail, 45000);
        window.turnstile.render(slot, {
          sitekey: S.turnstile,
          appearance: "interaction-only",
          language: "fr",
          callback: (token) => {
            clearTimeout(timer);
            ok(token);
          },
          "error-callback": fail,
          "timeout-callback": fail,
        });
      }),
  );
}

// Une action à la fois : le panneau affiche « Un instant… », puis le résultat ou l'erreur.
async function busy(fn) {
  const s = S.sheet;
  if (s?.busy) return;
  if (s) {
    s.busy = true;
    s.err = "";
  }
  try {
    await fn();
  } catch (err) {
    if (err.data?.needJoin) S.me = null;
    if (S.sheet === s && s) s.err = err.message;
    else toast(err.message);
  } finally {
    if (s) s.busy = false;
    render();
    if (S.sheet) renderSheet(true);
  }
}

async function doJoin(form) {
  const s = S.sheet;
  s.name = form.elements.name.value.trim();
  if (s.name.length < 2) {
    s.err = "Un pseudo de 2 à 16 caractères : lettres, chiffres, espace, point, tiret.";
    return renderSheet(true);
  }
  await busy(async () => {
    const slot = $(".ts-slot", form);
    $("button[type=submit]", form).disabled = true;
    const token = await turnstileToken(slot);
    const d = await call("POST", "join", { name: s.name, token });
    S.me = d.me;
    S.bets = null;
    S.board = null;
    track("pv_inscription");
    toast(`Bienvenue, ${d.me.name}. ${fmt(d.me.balance)} pavés t'attendent.`);
    if (s.kind !== "market") closeSheet();
  });
}
async function doBet() {
  const s = S.sheet;
  const m = byId(s.id);
  const amount = s.amount;
  const outcome = s.outcome;
  await busy(async () => {
    const before = oddsMap();
    const d = await call("POST", "bet", { market: s.id, outcome, amount });
    S.me = d.me;
    S.markets = S.markets.map((x) => (x.id === d.market.id ? d.market : x));
    S.mine[s.id] = {};
    for (const b of d.mine) S.mine[s.id][b.outcome] = { amount: b.amount, payout: b.payout };
    S.bets = null;
    S.board = null;
    noteFlash(before);
    track("pv_pari", { cat: m.cat });
    toast(`C'est noté : ${fmt(amount)} pavés sur « ${m.outcomes[outcome].label} ».`);
    closeSheet();
    if (S.tab === "paris") loadBets();
  });
}
async function doBonus() {
  try {
    const d = await call("POST", "bonus");
    S.me = d.me;
    track("pv_bonus");
    toast(`La caisse de grève te verse ${d.amount} pavés. Tiens bon.`);
  } catch (err) {
    if (err.data?.needJoin) S.me = null;
    toast(err.message);
    if (err.status === 409) await refresh().catch(() => {});
  }
  render();
  if (S.sheet) renderSheet(true);
}
// L'adresse à partager : celle de la page, sauf dans une copie de démo hébergée ailleurs, qui renvoie vers le vrai site.
const OFFICIAL = "https://apphero.cloud/apps/11-preavis/";
const onSite = () => /(^|\.)apphero\.cloud$/.test(location.hostname);
const appUrl = () => (S.demo && !onSite() ? `${OFFICIAL}jouer/` : location.origin + location.pathname);
const homeUrl = () => (S.demo && !onSite() ? OFFICIAL : new URL("../", location.href).href);

async function share(data) {
  try {
    if (navigator.share) {
      try {
        return await navigator.share(data);
      } catch (err) {
        if (err?.name === "AbortError") return; // feuille de partage refermée : rien à dire
      }
    }
    // Pas de partage système (ou il a refusé) : on copie le texte.
    await navigator.clipboard.writeText([data.text, data.url].filter(Boolean).join("\n"));
    toast("Copié. Il n'y a plus qu'à coller.");
  } catch {
    toast("Le partage n'a pas marché sur cet appareil.");
  }
}

const ACTIONS = {
  "close-sheet": closeSheet,
  enter: () => openSheet({ kind: "join", err: "" }),
  restore: () => openSheet({ kind: "restore", err: "" }),
  account: () => openSheet({ kind: S.me ? "account" : "join", err: "" }),
  bonus: doBonus,
  retry: boot,
  "board-all": () => {
    S.boardMode = "all";
    render();
  },
  "board-month": () => {
    S.boardMode = "month";
    render();
  },
  "show-key": () =>
    busy(async () => {
      S.sheet.code = (await call("POST", "key")).code;
    }),
  "copy-key": async () => {
    try {
      await navigator.clipboard.writeText(S.sheet.code);
      toast("Code copié. Range-le en lieu sûr.");
    } catch {
      toast("Copie impossible : note le code à la main.");
    }
  },
  logout: () => {
    S.sheet.confirm = "logout";
    renderSheet(true);
  },
  forget: () => {
    S.sheet.confirm = "forget";
    renderSheet(true);
  },
  "confirm-no": () => {
    S.sheet.confirm = null;
    renderSheet(true);
  },
  "logout-yes": () => leave("logout", "Tu es déconnecté de cet appareil."),
  "forget-yes": () => leave("forget", "Compte supprimé. Les pavés retournent à la rue."),
  "share-market": () => {
    const m = byId(S.sheet?.id);
    if (m) share({ title: "Préavis", text: `« ${m.title} » Les paris sont ouverts sur Préavis, la bourse de la grogne (pour rire, sans argent).`, url: `${appUrl()}#pari=${m.id}` });
  },
  "bingo-share": () => {
    track("pv_bingo");
    share({ title: "Préavis", text: bingoText(), url: homeUrl() });
  },
  "bingo-reset": () => {
    saveBingo(weekKey(now()), []);
    render();
  },
};
function leave(path, message) {
  return busy(async () => {
    await call("POST", path);
    S.me = null;
    S.mine = {};
    S.bets = null;
    S.board = null;
    closeSheet();
    toast(message);
    await refresh().catch(() => {});
  });
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-cat],[data-bet],[data-open],[data-pick],[data-step],[data-amt],[data-cell],[data-act]");
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.tab) return setTab(d.tab);
  if (d.cat) {
    S.cat = d.cat;
    render();
    if (d.cat === "verdicts") $(".chips")?.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  if (d.bet) {
    const cut = d.bet.lastIndexOf(":");
    return openMarket(d.bet.slice(0, cut), Number(d.bet.slice(cut + 1)));
  }
  if (d.open) return openMarket(d.open);
  if (d.pick != null && S.sheet?.kind === "market") {
    S.sheet.outcome = Number(d.pick);
    S.sheet.err = "";
    return renderSheet(true);
  }
  if ((d.step || d.amt) && S.sheet?.kind === "market") {
    const input = $("#amount", sheetBox);
    const max = Number(input.form.dataset.max);
    const cur = /^\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : 0;
    const next = d.amt ? Number(d.amt) : cur + Number(d.step);
    input.value = Math.max(MIN_BET, Math.min(max, next));
    return updateStake();
  }
  if (d.cell != null) {
    const week = weekKey(now());
    const checked = bingoState(week);
    const had = bingoLines(checked).length;
    checked[Number(d.cell)] = !checked[Number(d.cell)];
    saveBingo(week, checked);
    render();
    if (bingoLines(checked).length > had) toast(checked.every(Boolean) ? "Carton plein !" : "Bingo !");
    return;
  }
  if (d.act) return ACTIONS[d.act]?.();
});
$("#wallet").addEventListener("click", () => ACTIONS.account());
$("#enter").addEventListener("click", () => ACTIONS.enter());

document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const s = S.sheet;
  if (!s || s.busy) return;
  const kind = form.dataset.form;
  if (kind === "join") return doJoin(form);
  if (kind === "bet") {
    updateStake();
    if ($("#place", form).disabled) return;
    return doBet();
  }
  if (kind === "restore") {
    s.code = form.elements.code.value.trim();
    return busy(async () => {
      const d = await call("POST", "restore", { code: s.code });
      S.me = d.me;
      S.bets = null;
      S.board = null;
      closeSheet();
      toast(`Te revoilà, ${d.me.name}.`);
      await refresh();
    });
  }
  if (kind === "rename") {
    s.name = form.elements.name.value.trim();
    if (s.name === S.me?.name) return;
    return busy(async () => {
      const d = await call("POST", "rename", { name: s.name });
      S.me = d.me;
      S.board = null;
      s.name = null;
      toast(`Te voilà rebaptisé : ${d.me.name}.`);
    });
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "amount") updateStake();
});
document.addEventListener("keydown", (e) => {
  if (!S.sheet) return;
  if (e.key === "Escape") return closeSheet();
  if (e.key !== "Tab") return;
  // Le focus reste dans le panneau tant qu'il est ouvert.
  const items = $$("button:not([disabled]), a[href], input, summary", sheetBox).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetBox)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// ---------------------------------------------------------------- démarrage et rafraîchissement

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith("pari=")) {
    if (S.tab !== "salle") setTab("salle", false);
    if (byId(hash.slice(5))) openMarket(hash.slice(5));
    return;
  }
  if (S.sheet?.kind === "market") closeSheet();
  setTab(TABS.includes(hash) ? hash : "salle", false);
}
window.addEventListener("hashchange", route);

let lastAction = Date.now();
for (const type of ["pointerdown", "keydown", "scroll"]) addEventListener(type, () => (lastAction = Date.now()), { passive: true });
function tick() {
  if (document.visibilityState !== "visible") return;
  const idle = Date.now() - lastAction > 10 * 60000;
  const every = S.demo ? 7000 : 60000;
  if (!idle && Date.now() - lastRefresh >= every) refresh().catch(() => {});
  else render(); // les comptes à rebours avancent même sans nouvelles du serveur
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastRefresh > 30000) refresh().catch(() => {});
});

let started = false;
async function boot() {
  view.innerHTML = '<p class="loading">Ouverture de la salle des marchés…</p>';
  const wantDemo = new URLSearchParams(location.search).has("demo") || location.protocol === "file:" || window.PREAVIS_DEMO;
  try {
    if (wantDemo && !backend) await useDemo();
    const d = await call("GET", "state");
    lastRefresh = Date.now();
    apply(d);
  } catch (err) {
    // Pas de serveur derrière (copie statique, aperçu local) : on passe en démo. Sur le vrai site, on le dit.
    if (!backend && !onSite() && (err.status === 404 || err.status === 0)) {
      await useDemo();
      apply(await call("GET", "state"));
      lastRefresh = Date.now();
    } else {
      view.innerHTML = `<div class="empty"><b>La salle est fermée</b><p>${esc(err.message)}</p><button type="button" class="btn" data-act="retry">Réessayer</button></div>`;
      return;
    }
  }
  S.flash = [];
  route();
  if (!started) {
    started = true;
    setInterval(tick, S.demo ? 7000 : 20000);
  }
}
boot();
