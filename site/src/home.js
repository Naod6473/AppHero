// Accueil : pile de cartes de la semaine, grille des 30 apps, j'aime / bof, votes, classements.
import { api, esc, toast, confetti, turnstileToken, track, shareApp, X_URL } from "./common.js";
import { DAYS, BALLOTS, CHALLENGE_END, WEEKDAYS_SHORT, PAPER, wheelDays, parisDate, fmtShort, fmtDateTime } from "../../shared/calendar.js";
import { CRITERIA, criterionLabel } from "../../shared/criteria.js";

const S = {
  offset: 0, // écart entre l'horloge du serveur et celle du navigateur
  apps: new Map(), // id -> app sortie
  likes: {}, // id -> nombre de j'aime
  rankings: { likes: [], views: [] },
  ballots: [], // scrutins vus par le serveur (statut, candidates, gagnante)
  me: { reactions: {}, ballots: {} },
  draws: new Map(), // forDay -> tirage
  criteria: null, // id -> critère tiré (null tant qu'ils ne sont pas révélés)
  siteKey: "",
  active: 0,
  week: [],
  voting: false,
};
const now = () => Date.now() + S.offset;
const released = (day) => S.apps.has(day.id);
const $ = (id) => document.getElementById(id);

document.querySelectorAll(".js-x").forEach((a) => (a.href = X_URL));

// ------------------------------------------------------------ données

async function load() {
  try {
    const st = await api("/api/state");
    S.offset = st.now - Date.now();
    S.apps = new Map(st.apps.map((a) => [a.id, a]));
    S.likes = st.likes || {};
    S.visitors = st.visitors || 0;
    S.rankings = st.rankings;
    S.ballots = st.ballots || [];
    S.me = st.me || { reactions: {}, ballots: {} };
    S.siteKey = st.turnstileSiteKey;
    S.criteria = st.criteria || null;
  } catch (err) {
    console.warn("API indisponible, affichage du calendrier seul.", err);
  }
  try {
    const { draws } = await api("/api/draws");
    S.draws = new Map(draws.map((d) => [d.forDay, d]));
  } catch {
    /* pas de tirages */
  }
}

// ------------------------------------------------------------ les critères tirés au sort

const SECRET = { key: null, name: "Défi secret", emoji: "❓", color: PAPER, blurb: "Les 30 défis sont tirés au sort et révélés le mercredi 18 novembre à 18 h.", label: "Défi secret" };
// Le critère d'une case : nom, emoji, couleur, et le texte complet (« Langage imposé : Rust », multi-critère…).
function critOf(day) {
  const c = S.criteria?.[day.id];
  const base = c && CRITERIA[c.key];
  if (!base) return SECRET;
  const all = [c, ...(c.extra || [])];
  return { ...base, key: c.key, label: all.map(criterionLabel).join(" + "), short: all.map((x) => `${CRITERIA[x.key].emoji} ${criterionLabel(x)}`).join(" + ") };
}
const colorOf = (day) => (day.filler ? day.color : critOf(day).color);

// ------------------------------------------------------------ la semaine en cours

const isoAdd = (iso, n) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const LAST_WEEK_MONDAY = "2026-12-14";

// Les 7 jours de la semaine en cours, du lundi au dimanche.
// Les jours sans app (dimanche, avant le départ, après la finale) ont une carte à eux.
function currentWeek() {
  const today = parisDate(now());
  const wd = new Date(today + "T12:00:00Z").getUTCDay();
  let mon = isoAdd(today, wd === 0 ? -6 : 1 - wd);
  if (mon > LAST_WEEK_MONDAY) mon = LAST_WEEK_MONDAY;
  return Array.from({ length: 7 }, (_, i) => {
    const date = isoAdd(mon, i);
    const day = DAYS.find((d) => d.date === date);
    if (day) return day;
    const weekday = (i + 1) % 7;
    const kind = date < DAYS[0].date ? "before" : date === CHALLENGE_END.slice(0, 10) ? "verdict" : "after";
    const color = { before: "#B9A3FF", verdict: "#FFD83D", after: "#7CF2B0" }[kind];
    return { filler: kind, date, weekday, color, id: null };
  });
}

function countdown(target) {
  const diff = Math.max(0, Date.parse(target) - now());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d} j ${h} h ${m} min`;
  if (h > 0) return `${h} h ${m} min`;
  const s = Math.floor((diff % 60000) / 1000);
  return `${m} min ${String(s).padStart(2, "0")} s`;
}

function fillerModel(day) {
  const openBallot = S.ballots.find((b) => b.status === "open");
  if (day.filler === "before") {
    return {
      bg: day.color,
      tag: "ÉCHAUFFEMENT",
      title: "Échauffement",
      theme: "Avant le départ",
      body:
        now() < Date.parse(DAYS[0].publishAt)
          ? "Le défi démarre mercredi 18 novembre à 18 h. D'ici là, sors les verres et suis le compte X."
          : "Avant le départ, on rangeait les verres. Le défi a démarré mercredi 18 novembre à 18 h.",
      footLabel: now() < Date.parse(DAYS[0].publishAt) ? "DÉPART DANS" : "C'EST PARTI",
      footValue: now() < Date.parse(DAYS[0].publishAt) ? countdown(DAYS[0].publishAt) : "Depuis mer 18 nov.",
      countdownFor: now() < Date.parse(DAYS[0].publishAt) ? DAYS[0].publishAt : null,
      cta: { label: "Suivre sur X", href: X_URL },
    };
  }
  if (day.filler === "verdict") {
    return {
      bg: day.color,
      tag: "VERDICT",
      title: "Le verdict",
      theme: "Résultat de la grande finale",
      body: "La grande gagnante des 30 apps est annoncée ce soir à 20 h.",
      footLabel: "RÉSULTAT",
      footValue: now() < Date.parse(CHALLENGE_END) ? countdown(CHALLENGE_END) : "Annoncé !",
      countdownFor: now() < Date.parse(CHALLENGE_END) ? CHALLENGE_END : null,
      cta: { label: "Voir la finale", href: "#vote" },
    };
  }
  return {
    bg: day.color,
    tag: "BONUS",
    title: "Joyeuses fêtes !",
    theme: "Après le défi",
    body: "Les 30 apps restent en ligne et le code est dispo. Merci d'avoir joué !",
    footLabel: "LE CODE",
    footValue: "Sur GitHub",
    cta: { label: "Revoir les 30 apps", href: "#apps" },
  };
}

function cardModel(day) {
  if (day.filler) return fillerModel(day);
  const app = S.apps.get(day.id);
  const nextDay = DAYS.find((d) => !released(d) && Date.parse(d.publishAt) > now());
  const isNext = nextDay && nextDay.id === day.id;
  const when = `${fmtShort(day.date)} · 18 h`;
  const draw = S.draws.get(day.date);
  const crit = critOf(day);

  if (app) {
    return {
      bg: app.color || crit.color,
      title: app.title,
      theme: app.criterion ? `${crit.label} · ${app.criterion}` : crit.label,
      body: app.tagline,
      footLabel: "SORTIE LE",
      footValue: when,
      making: makingLine(app.making),
      app,
    };
  }
  let title = "???";
  let body = crit.blurb;
  let cta = { label: "Voir les 30 apps", href: "#apps" };
  let theme = `${crit.emoji} ${crit.label}`;
  if (day.num === 1) {
    title = "Apphéro";
    body = "Le site qui lance le défi : les 30 apps, le vote et la roue.";
  } else if (day.num === DAYS.length) {
    title = "La finale";
    cta = { label: "Voir les classements", href: "#vote" };
  } else if (crit.key === "roue") {
    const w = wheelDays(S.criteria).find((x) => x.forDay === day.date);
    body = draw
      ? draw.idea
        ? "La roue a choisi l'idée de l'IA. Revois le tirage pour la découvrir."
        : `La roue a parlé. Critère du jour : « ${draw.label} ».`
      : `Le critère sort de la roue le ${fmtShort(w.drawOn).toLowerCase()} au soir. Tu pourras revoir le tirage.`;
    if (draw) theme = `Critère : ${draw.label}`;
    cta = { label: "Voir la roue", href: "/roue/" };
  } else if (crit.key === "abonne") {
    title = "L'idée d'un abonné";
    body = "Propose l'app de ce jour-là sur X. L'idée la plus soutenue sera construite.";
    cta = { label: "Proposer une idée", href: X_URL };
  } else if (!crit.key) {
    cta = { label: "Suivre sur X", href: X_URL };
  }
  if (Date.parse(day.publishAt) <= now()) {
    // L'heure est passée mais l'app n'est pas encore en ligne.
    return { bg: crit.color, title: "En cuisine…", theme, body: "L'app du jour arrive très vite. Garde l'apéro au frais.", footLabel: "PRÉVUE LE", footValue: when, cta };
  }
  return {
    bg: crit.color,
    title,
    theme,
    body,
    footLabel: isNext ? "S'OUVRE DANS" : "S'OUVRE LE",
    footValue: isNext ? countdown(day.publishAt) : when,
    countdownFor: isNext ? day.publishAt : null,
    cta,
  };
}

// La fiche de fabrication en une ligne : ⏱ 1 h 40 · 💭 25 min · 🔤 182 k tokens
const dur = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(Math.round(min % 60)).padStart(2, "0")}` : ""}`);
const big = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));
function makingLine(m) {
  if (!m) return "";
  return [
    m.buildMinutes != null && `⏱ ${dur(m.buildMinutes)}`,
    m.thinkingMinutes != null && `💭 ${dur(m.thinkingMinutes)}`,
    m.tokens != null && `🔤 ≈ ${big(m.tokens)} tokens`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Boutons j'aime / bof. Le nombre de bof reste privé.
function reactButtons(app, small = false) {
  const mine = S.me.reactions[app.id] || 0;
  const n = S.likes[app.id] || 0;
  return `<div class="react" role="group" aria-label="Ton avis sur ${esc(app.title)}">
    <button class="like" type="button" data-react="1" data-app="${esc(app.id)}" aria-pressed="${mine === 1}" aria-label="J'aime ${esc(app.title)}, ${n} j'aime"><span class="emo" aria-hidden="true">👍</span>${small ? n : `J'aime · ${n}`}</button>
    <button class="bof" type="button" data-react="-1" data-app="${esc(app.id)}" aria-pressed="${mine === -1}" aria-label="Bof pour ${esc(app.title)}"><span class="emo" aria-hidden="true">👎</span>${small ? "" : "Bof"}</button>
  </div>`;
}

function renderDeck() {
  const deck = $("deck");
  const A = S.active;
  deck.innerHTML = S.week
    .map((day, i) => {
      const c = cardModel(day);
      const { active, tf, z, ar } = place(i);
      let actions = "";
      if (c.app) {
        actions = `<div class="card-actions">
          <a class="btn" href="/apps/${esc(c.app.slug)}/" data-open="${esc(c.app.id)}">Ouvrir l'app</a>
          ${reactButtons(c.app)}
          <button class="btn-icon" type="button" data-share="${esc(c.app.id)}" aria-label="Partager ${esc(c.app.title)}" title="Partager">📤</button>
        </div>`;
      } else if (c.cta) {
        actions = `<div class="card-actions"><a class="btn" href="${esc(c.cta.href)}">${esc(c.cta.label)}</a></div>`;
      }
      return `<article class="card ${active ? "is-active" : "is-side"}" data-card="${i}" data-tf="${tf}" style="transform:${tf};z-index:${z};opacity:${ar > 3 ? 0 : 1};pointer-events:${ar > 3 ? "none" : "auto"}"
          aria-hidden="${active ? "false" : "true"}" aria-label="${esc(day.id ? `Jour ${day.id}` : fmtLongUpper(day.date))}">
        <div class="card-inner" style="background:${esc(c.bg)}">
          <div class="card-top">
            <span class="card-when">${esc(fmtLongUpper(day.date))}</span>
            <span class="card-num">${day.id ? `JOUR ${day.id} / 30` : c.tag}</span>
          </div>
          <div class="card-title">${c.app?.logo ? `<img class="card-logo" src="${esc(c.app.logo)}" alt="" width="64" height="64">` : ""}${esc(c.title)}</div>
          <span class="card-theme">${esc(c.theme)}</span>
          <p class="card-body">${esc(c.body)}</p>
          ${c.making ? `<p class="card-making">${esc(c.making)}</p>` : ""}
          <div class="card-foot"><small>${c.footLabel}</small><strong ${c.countdownFor ? `data-countdown="${c.countdownFor}"` : ""}>${esc(c.footValue)}</strong></div>
          ${actions}
        </div>
      </article>`;
    })
    .join("");

  $("tabs").innerHTML = S.week
    .map(
      (day, i) => `<button class="tab" type="button" data-go="${i}" aria-pressed="${i === A}" aria-label="${esc(fmtLongUpper(day.date))}" style="background:${colorOf(day)}">
        <b><span class="d-long">${WEEKDAYS_SHORT[day.weekday].toUpperCase()}</span><span class="d-short" aria-hidden="true">${WEEKDAYS_SHORT[day.weekday][0]}</span></b><span>${new Date(day.date + "T12:00:00Z").getUTCDate()}</span></button>`,
    )
    .join("");
  // Les cartes de côté se cliquent en entier : leurs liens et boutons sortent du parcours clavier.
  deck.querySelectorAll(".card.is-side a, .card.is-side button").forEach((el) => (el.tabIndex = -1));
  S.lastR = S.week.map((_, i) => place(i).r);
}

// Position d'une carte dans la pile. La pile tourne en boucle : il y a toujours des cartes à gauche et à droite.
function place(i) {
  const n = S.week.length;
  let r = i - S.active;
  if (r > n / 2) r -= n;
  if (r < -n / 2) r += n;
  const ar = Math.abs(r);
  const active = r === 0;
  const tf = active
    ? "translate(0px, 0px) rotate(-1.5deg) scale(1)"
    : `translate(${r * 42}px, ${ar * -14}px) rotate(${r * 3.5 - 1.5}deg) scale(${1 - ar * 0.045})`;
  const z = 30 - ar * 3 + (r < 0 ? 1 : 0);
  return { r, ar, active, tf, z };
}

// Changer de carte sans tout redessiner : les cartes glissent à leur nouvelle place.
// Celle qui passe d'un bout à l'autre de la pile y va sans animation, cachée derrière les autres.
function layoutDeck() {
  const cards = $("deck").querySelectorAll(".card");
  if (cards.length !== S.week.length) return renderDeck();
  cards.forEach((el, i) => {
    const { r, ar, active, tf, z } = place(i);
    const jump = Math.abs(r - (S.lastR?.[i] ?? r)) > 1;
    if (jump) el.style.transition = "none";
    el.classList.toggle("is-active", active);
    el.classList.toggle("is-side", !active);
    el.dataset.tf = tf;
    el.style.transform = tf;
    el.style.zIndex = z;
    el.style.opacity = ar > 3 ? 0 : 1;
    el.style.pointerEvents = ar > 3 ? "none" : "auto";
    el.setAttribute("aria-hidden", String(!active));
    el.querySelectorAll("a, button").forEach((b) => (active ? b.removeAttribute("tabindex") : (b.tabIndex = -1)));
    if (jump) {
      void el.offsetWidth;
      el.style.transition = "";
    }
  });
  $("tabs").querySelectorAll("[data-go]").forEach((t, i) => t.setAttribute("aria-pressed", String(i === S.active)));
  S.lastR = S.week.map((_, i) => place(i).r);
}

function fmtLongUpper(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function go(i) {
  const n = S.week.length;
  S.active = ((i % n) + n) % n;
  layoutDeck();
}

// ------------------------------------------------------------ sections

function ballotLine(b) {
  if (b.status === "closed" && b.winner) return `Gagnante : ${appTitle(b.winner)}`;
  if (b.status === "open") return "Vote ouvert !";
  return b.final ? "Finale + gagnante" : "App de la semaine";
}

function renderWeeks() {
  const list = S.ballots.length ? S.ballots : BALLOTS.map((b) => ({ ...b, status: "upcoming" }));
  $("weeks").innerHTML = list
    .map(
      (b) =>
        `<div class="vote-week ${b.final ? "is-final" : ""}"><b>${b.final ? "F" : b.id}</b><span class="d">${esc(fmtShort(b.closesAt.slice(0, 10)).toLowerCase())}</span><span class="w">${esc(ballotLine(b))}</span></div>`,
    )
    .join("");
}

// Le calendrier : 7 colonnes, du lundi au dimanche. La 1re semaine commence un mercredi (cases vides avant),
// et la case Finale se place sous le vendredi 18 décembre.
const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const col = (wd) => (wd + 6) % 7; // weekday : 0 = dimanche
function renderTiles() {
  const lead = col(DAYS[0].weekday);
  const head = DOW.map((d) => `<div class="tiles-dow" aria-hidden="true">${d}</div>`).join("");
  const empty = (n) => Array.from({ length: n }, () => `<div class="tile-empty" aria-hidden="true"></div>`).join("");
  const days = DAYS.map((day, i) => {
    const app = S.apps.get(day.id);
    const crit = critOf(day);
    const date = fmtShort(day.date).replace(/^\S+\s/, "");
    const meta = `${date} · ${crit.label}`;
    const full = `App ${day.id}, ${fmtShort(day.date)} : ${crit.label}`;
    const rot = `${i % 2 ? 1.4 : -1.4}deg`;
    const emo = `<span class="tile-emo" aria-hidden="true">${esc(crit.emoji)}</span>`;
    if (!app) {
      return `<div class="tile is-soon" style="--r:${rot};--bg:${esc(crit.color)}" data-tip="${esc(full)}">
        <span class="tile-top"><span class="tile-num" aria-hidden="true">${day.id}</span>${emo}</span>
        <span class="tile-text"><span class="tile-name">Bientôt</span><br><span class="tile-meta">${esc(meta)}</span></span>
        <span class="sr-only">${esc(full)}</span></div>`;
    }
    return `<div class="tile is-open" style="--r:${rot};--bg:${esc(app.color)}">
      <span class="tile-top"><span class="tile-num" aria-hidden="true">${day.id}</span>${app.logo ? `<img class="tile-logo" src="${esc(app.logo)}" alt="" loading="lazy" width="56" height="56">` : emo}</span>
      <span class="tile-text"><a class="tile-link tile-name" href="/apps/${esc(app.slug)}/" data-open="${esc(app.id)}">${esc(app.title)}</a><br><span class="tile-meta">${esc(meta)}</span></span>
      ${reactButtons(app, true)}
    </div>`;
  }).join("");
  const last = DAYS[DAYS.length - 1];
  const final = `<div class="tile tile-final" style="--r:-1.4deg" data-tip="Grande finale : résultat le vendredi 18 décembre à 20 h">
    <span class="tile-top"><span class="tile-num" aria-hidden="true">F</span><span class="tile-emo" aria-hidden="true">🏆</span></span>
    <span class="tile-text"><span class="tile-name">Finale</span><br><span class="tile-meta">18 déc. · résultat à 20 h</span></span>
    <span class="sr-only">Grande finale, résultat le vendredi 18 décembre à 20 h</span></div>`;
  const after = 6 - col(last.weekday);
  $("tiles").innerHTML = head + empty(lead) + days + (after > 0 ? final + empty(after - 1) : "");
}
// Sur téléphone, les cases ne montrent que le numéro et l'emoji : un toucher affiche le détail.
$("tiles").addEventListener("click", (e) => {
  const t = e.target.closest("[data-tip]");
  if (t && matchMedia("(max-width: 760px)").matches) toast(t.dataset.tip);
});

function renderRanks() {
  const list = (rows, unit, empty) =>
    [0, 1, 2]
      .map((i) => {
        const r = rows[i];
        if (!r) return `<div class="rank is-empty"><i>${i + 1}</i><span>${empty}</span></div>`;
        const app = S.apps.get(r.app);
        const label = `${r.n} ${unit}${r.n > 1 && unit !== "j'aime" ? "s" : ""}`;
        return app
          ? `<a class="rank" href="/apps/${esc(app.slug)}/" data-open="${esc(app.id)}"><i>${i + 1}</i><span>${esc(app.title)}</span><small>${label}</small></a>`
          : `<div class="rank"><i>${i + 1}</i><span>App ${esc(r.app)}</span><small>${label}</small></div>`;
      })
      .join("");
  $("rank-likes").innerHTML = list(S.rankings.likes, "j'aime", "Pas encore de j'aime");
  $("rank-views").innerHTML = list(S.rankings.views, "visite", "Pas encore de visite");
}

// ------------------------------------------------------------ les votes (semaine + finale)

// Le vote de la semaine à mettre en avant : celui qui est ouvert, sinon le prochain, sinon le dernier.
function featuredWeekly() {
  const weekly = S.ballots.filter((b) => !b.final);
  return weekly.find((b) => b.status === "open") || weekly.find((b) => b.status === "upcoming") || weekly[weekly.length - 1];
}

function candidateLabel(id) {
  const app = S.apps.get(id);
  return app ? app.title : `App ${Number(id)}`;
}

function choicesHtml(b) {
  const mine = S.me.ballots[b.id];
  const open = b.status === "open";
  return `<div class="choices">${b.candidates
    .map((id) => {
      const app = S.apps.get(id);
      const can = open && !mine && app;
      return `<button class="choice ${mine === id ? "is-mine" : ""}" type="button" style="--bg:${esc(app?.color || "var(--paper)")}"
        ${can ? `data-ballot="${esc(b.id)}" data-app="${esc(id)}"` : "disabled"}
        aria-label="${esc(open && !mine ? `Voter pour ${candidateLabel(id)}` : candidateLabel(id))}"><i>${Number(id)}</i><span>${esc(candidateLabel(id))}</span></button>`;
    })
    .join("")}</div>`;
}

function resultsHtml(b) {
  if (!b.winner) return "";
  const app = S.apps.get(b.winner);
  const head = `<a class="winner" ${app ? `href="/apps/${esc(app.slug)}/" data-open="${esc(app.id)}"` : ""}><span class="crown" aria-hidden="true">👑</span><span><small>${b.final ? "La grande gagnante" : "L'app de la semaine"}</small><br><strong>${esc(candidateLabel(b.winner))}</strong></span></a>`;
  const rest = (b.results || [])
    .slice(1)
    .map((r, i) => `<div class="rank"><i>${i + 2}</i><span>${esc(candidateLabel(r.app))}</span><small>${r.n} voix</small></div>`)
    .join("");
  const total = b.total ? `<p>${b.total} voix au total.</p>` : `<p>Personne n'a voté : l'app la plus aimée ${b.final ? "parmi les finalistes" : "de la semaine"} l'emporte.</p>`;
  return `<div class="podium">${head}${rest ? `<div class="ranks">${rest}</div>` : ""}</div>${total}`;
}

function ballotHtml(b) {
  const opens = fmtDateTime(b.opensAt);
  const closes = fmtDateTime(b.closesAt);
  let when;
  let text;
  let body = "";
  if (b.status === "upcoming") {
    when = `Ouvre ${opens.toLowerCase()}`;
    text = b.final
      ? "Les 4 apps de la semaine et les apps 27 à 30 s'affrontent. Une seule voix, résultat le lendemain à 20 h."
      : `Les apps ${Number(b.candidates[0])} à ${Number(b.candidates[b.candidates.length - 1])} en lice. Une seule voix, résultat le mardi à 18 h.`;
    if (b.candidates) body = choicesHtml(b);
    else {
      const known = S.ballots.filter((x) => !x.final && x.winner).map((x) => x.winner);
      const weeks = BALLOTS.filter((x) => !x.final).length;
      const extra = BALLOTS.find((x) => x.final).extra;
      body = `<div class="choices">${[...known, ...Array(weeks - known.length).fill(null), ...extra]
        .map((id, i) => `<button class="choice" type="button" disabled><i>${id ? Number(id) : "?"}</i><span>${id ? esc(candidateLabel(id)) : `Gagnante S${i + 1}`}</span></button>`)
        .join("")}</div>`;
    }
  } else if (b.status === "open") {
    const mine = S.me.ballots[b.id];
    when = `Ferme ${closes.toLowerCase()}`;
    text = mine ? `Merci ! Tu as voté pour ${candidateLabel(mine)}. Résultat ${closes.toLowerCase()}.` : "Une seule voix, sans compte. Choisis ton app :";
    body = choicesHtml(b);
  } else {
    when = `Fermé ${closes.toLowerCase()}`;
    text = "";
    body = resultsHtml(b);
  }
  return `<div class="ballot ${b.final ? "is-final" : ""}">
    <h3>${b.final ? "La grande finale" : `Le vote de la ${esc(b.label.toLowerCase())}`}</h3>
    <span class="ballot-when">${esc(when)}</span>
    ${text ? `<p>${esc(text)}</p>` : ""}
    ${body}
    ${b.final ? "" : `<div class="mini-timeline" aria-label="Les 4 votes de la semaine">${S.ballots
      .filter((x) => !x.final)
      .map((x) => `<span class="${x.status === "open" ? "is-open" : x.status === "closed" ? "is-closed" : ""}" title="${esc(x.label)}">${esc(x.id)}${x.status === "closed" ? " ✓" : ""}</span>`)
      .join("")}</div>`}
  </div>`;
}

function renderBallots() {
  const el = $("ballots");
  if (!S.ballots.length) {
    el.innerHTML = `<div class="ballot"><h3>Le vote de la semaine</h3><p>Le premier vote ouvre le samedi 21 novembre à 18 h.</p></div>`;
    return;
  }
  el.innerHTML = ballotHtml(featuredWeekly()) + ballotHtml(S.ballots.find((b) => b.final));
}

// La barre des 30 apps : une case par app, colorée quand elle est sortie.
function renderProgress() {
  const n = S.apps.size;
  $("progress").innerHTML = `<div class="progress-cells" aria-hidden="true">${DAYS.map((d) => {
    const app = S.apps.get(d.id);
    return `<i style="${app ? `background:${esc(app.color || colorOf(d))}` : ""}" class="${app ? "on" : ""}"></i>`;
  }).join("")}</div><span><strong>${n}</strong> / 30 apps sorties</span>`;
  $("progress").setAttribute("aria-label", `${n} apps sorties sur 30`);
}

function renderVisitors() {
  const el = $("visitors");
  el.hidden = !S.visitors;
  if (S.visitors) el.innerHTML = `👀 <strong>${S.visitors.toLocaleString("fr-FR")}</strong> ${S.visitors > 1 ? "visites" : "visite"} depuis le lancement`;
  $("random").disabled = ![...S.apps.values()].some((a) => a.num > 1);
}

function renderAll() {
  renderProgress();
  renderVisitors();
  renderDeck();
  renderWeeks();
  renderTiles();
  renderRanks();
  renderBallots();
}

function appTitle(id) {
  return S.apps.get(id)?.title || `App ${Number(id)}`;
}

function recomputeLikesRanking() {
  S.rankings.likes = Object.entries(S.likes)
    .filter(([, n]) => n > 0)
    .map(([app, n]) => ({ app, n }))
    .sort((a, b) => b.n - a.n || a.app.localeCompare(b.app))
    .slice(0, 5);
}

// ------------------------------------------------------------ j'aime / bof

const busy = new Set();
async function react(appId, value, button) {
  if (busy.has(appId)) return;
  busy.add(appId);
  const before = S.me.reactions[appId] || 0;
  const next = before === value ? 0 : value; // recliquer annule
  const likesBefore = S.likes[appId] || 0;
  S.likes[appId] = likesBefore + (next === 1) - (before === 1);
  S.me.reactions[appId] = next;
  recomputeLikesRanking();
  renderAll();
  const again = document.querySelector(`[data-react="${value}"][data-app="${appId}"]`);
  if (again && next !== 0) again.classList.add("pop");
  try {
    await api("/api/react", { method: "POST", body: JSON.stringify({ app: appId, value: next }) });
    track(next === 1 ? "jaime" : next === -1 ? "bof" : "avis_retire", { app: appId });
  } catch (err) {
    S.likes[appId] = likesBefore;
    S.me.reactions[appId] = before;
    recomputeLikesRanking();
    renderAll();
    toast(err.message);
  } finally {
    busy.delete(appId);
  }
}

// ------------------------------------------------------------ vote d'un tour (semaine ou finale)

async function castBallot(ballotId, appId, button) {
  if (S.voting || S.me.ballots[ballotId]) return;
  S.voting = true;
  document.querySelectorAll("[data-ballot]").forEach((b) => (b.disabled = true));
  try {
    const token = await turnstileToken(S.siteKey);
    await api("/api/ballot", { method: "POST", body: JSON.stringify({ ballot: ballotId, app: appId, token }) });
    S.me.ballots[ballotId] = appId;
    track("vote", { ballot: ballotId, app: appId });
    renderAll();
    confetti(button?.isConnected ? button : $("ballots"));
    toast(`Merci ! Ta voix pour ${appTitle(appId)} est comptée.`);
  } catch (err) {
    if (err.data?.mine) S.me.ballots[ballotId] = err.data.mine;
    toast(err.message);
    renderAll();
  } finally {
    S.voting = false;
  }
}

// ------------------------------------------------------------ démarrage

// Glisser la carte du dessus à gauche ou à droite (souris ou doigt).
const drag = { id: null, x0: 0, y0: 0, dx: 0, moved: false, card: null };
$("deck").addEventListener("pointerdown", (e) => {
  const card = e.target.closest(".card.is-active");
  if (!card || (e.pointerType === "mouse" && e.button !== 0)) return;
  Object.assign(drag, { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, moved: false, card });
});
$("deck").addEventListener("pointermove", (e) => {
  if (drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (!drag.moved) {
    if (Math.abs(dx) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) return (drag.id = null); // geste vertical : on laisse défiler la page
    drag.moved = true;
    drag.card.classList.add("is-dragging");
    drag.card.setPointerCapture(e.pointerId);
  }
  drag.dx = dx;
  drag.card.style.transform = `${drag.card.dataset.tf} translateX(${drag.dx}px) rotate(${drag.dx / 18}deg)`;
});
function endDrag(e) {
  if (drag.id !== e.pointerId) return;
  drag.id = null;
  if (!drag.moved) return;
  drag.card.classList.remove("is-dragging");
  // Le clic qui suit un glissé ne doit rien ouvrir (ni lien, ni carte de côté).
  S.suppressClickUntil = performance.now() + 350;
  if (Math.abs(drag.dx) > 70) {
    go(S.active + (drag.dx < 0 ? 1 : -1));
    track("deck", { how: "swipe" });
  }
  else drag.card.style.transform = drag.card.dataset.tf;
}
$("deck").addEventListener("pointerup", endDrag);
$("deck").addEventListener("pointercancel", endDrag);
$("deck").addEventListener("dragstart", (e) => e.preventDefault());
document.addEventListener(
  "click",
  (e) => {
    if (performance.now() < (S.suppressClickUntil || 0)) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true,
);

document.addEventListener("click", (e) => {
  const side = e.target.closest(".card.is-side");
  if (side) {
    e.preventDefault();
    return go(Number(side.dataset.card));
  }
  const r = e.target.closest("[data-react]");
  if (r) return react(r.dataset.app, Number(r.dataset.react), r);
  const b = e.target.closest("[data-ballot]");
  if (b) return castBallot(b.dataset.ballot, b.dataset.app, b);
  if (e.target.closest("[data-agenda]")) track("agenda");
  const sh = e.target.closest("[data-share]");
  if (sh) return S.apps.get(sh.dataset.share) && shareApp(S.apps.get(sh.dataset.share));
  if (e.target.closest("#random")) {
    const list = [...S.apps.values()].filter((a) => a.num > 1);
    const pick = (list.length ? list : [...S.apps.values()])[Math.floor(Math.random() * (list.length || S.apps.size))];
    if (!pick) return;
    track("hasard", { app: pick.id });
    location.href = `/apps/${pick.slug}/`;
    return;
  }
  const o = e.target.closest("[data-open]");
  if (o) track("ouvrir_app", { app: o.dataset.open, from: o.closest(".card") ? "carte" : "grille" });
  const t = e.target.closest("[data-go]");
  if (t) go(Number(t.dataset.go));
});
$("prev").addEventListener("click", () => (go(S.active - 1), track("deck", { how: "fleche" })));
$("next").addEventListener("click", () => (go(S.active + 1), track("deck", { how: "fleche" })));
$("deck").addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") go(S.active - 1);
  if (e.key === "ArrowRight") go(S.active + 1);
});

// La carte du jour (même avant 18 h : elle affiche le compte à rebours).
function pickActive() {
  const today = parisDate(now());
  const idx = S.week.findIndex((d) => d.date === today);
  S.active = idx >= 0 ? idx : 0;
}

// ------------------------------------------------------------ les deux comptes à rebours du haut

function clock(target) {
  const diff = Math.max(0, Date.parse(target) - now());
  const d = Math.floor(diff / 86400000);
  const hms = [3600000, 60000, 1000].map((u, i) => String(Math.floor((diff % [86400000, 3600000, 60000][i]) / u)).padStart(2, "0")).join(":");
  return d > 0 ? `${d} j ${hms}` : hms;
}

// « Tchin ! » : si la page est ouverte quand 18 h sonne.
let watching = null; // la prochaine app attendue
function tchin(day) {
  track("tchin", { app: day.id });
  const el = document.createElement("div");
  el.className = "tchin";
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="tchin-box"><span class="tchin-glasses" aria-hidden="true">🥂</span><strong>TCHIN !</strong><small>18 h pile : l'app n° ${day.num} est servie</small></div>`;
  document.body.append(el);
  confetti(el.querySelector(".tchin-box"));
  setTimeout(() => confetti($("deck")), 2600);
  setTimeout(() => el.classList.add("is-out"), 2400);
  setTimeout(() => el.remove(), 3000);
}

function renderTimers() {
  const t = now();
  const today = parisDate(t);
  const next = DAYS.find((d) => Date.parse(d.publishAt) > t);
  if (watching && watching !== next && Date.parse(watching.publishAt) <= t && t - Date.parse(watching.publishAt) < 60000) tchin(watching);
  watching = next || null;
  const dayBox = $("t-day-box");
  if (next) {
    dayBox.hidden = false;
    $("t-day-label").textContent =
      next.num === 1 ? "Départ du défi dans" : next.date === today ? `L'app du jour (n° ${next.num}) sort dans` : `Prochaine app, ${fmtShort(next.date).toLowerCase()}, dans`;
    $("t-day").textContent = clock(next.publishAt);
  } else if (t < Date.parse(CHALLENGE_END)) {
    $("t-day-label").textContent = "Verdict de la finale dans";
    $("t-day").textContent = clock(CHALLENGE_END);
  } else dayBox.hidden = true;
  const ended = t >= Date.parse(CHALLENGE_END);
  $("t-end-label").textContent = ended ? "Le défi est terminé" : "Fin du défi dans";
  $("t-end").textContent = ended ? "Merci !" : clock(CHALLENGE_END);
}

renderTimers();
S.week = currentWeek();
pickActive();
renderAll();
await load();
S.week = currentWeek();
pickActive();
renderAll();
renderTimers();

// Compte à rebours, et rechargement quand une app sort.
const reloaded = new Set();
setInterval(async () => {
  renderTimers();
  let due = null;
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    el.textContent = countdown(el.dataset.countdown);
    if (Date.parse(el.dataset.countdown) <= now() && !reloaded.has(el.dataset.countdown)) due = el.dataset.countdown;
  });
  if (due) {
    reloaded.add(due);
    await new Promise((r) => setTimeout(r, 2000));
    await load();
    // On garde la carte que la personne regarde, sauf si la semaine a changé.
    const week = currentWeek();
    const changed = week[0].date !== S.week[0].date;
    S.week = week;
    if (changed) pickActive();
    renderAll();
  }
}, 1000);
