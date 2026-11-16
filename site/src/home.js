// Accueil : pile de cartes de la semaine, grille des 30 apps, vote, classements.
import { api, esc, toast, confetti, turnstileToken, X_URL } from "./common.js";
import { DAYS, WEEKS, THEMES, WEEKDAYS_SHORT, WHEEL_DAYS, parisDate, fmtShort } from "../../shared/calendar.js";

const S = {
  offset: 0, // écart entre l'horloge du serveur et celle du navigateur
  apps: new Map(), // id -> app sortie
  rankings: { votes: [], views: [] },
  weeks: {},
  draws: new Map(), // forDay -> tirage
  myVote: null,
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
    S.rankings = st.rankings;
    S.weeks = st.weeks;
    S.myVote = st.myVote;
    S.siteKey = st.turnstileSiteKey;
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

// ------------------------------------------------------------ la semaine en cours

function currentWeek() {
  const t = now();
  const today = parisDate(t);
  if (today < DAYS[0].date) return DAYS.filter((d) => d.date < "2026-11-23");
  const d = new Date(today + "T12:00:00Z");
  const wd = d.getUTCDay();
  // Le dimanche, on montre déjà la semaine suivante.
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + (wd === 0 ? 1 : 1 - wd));
  const mon = monday.toISOString().slice(0, 10);
  const sat = new Date(monday);
  sat.setUTCDate(monday.getUTCDate() + 5);
  const satIso = sat.toISOString().slice(0, 10);
  const days = DAYS.filter((x) => x.date >= mon && x.date <= satIso);
  return days.length ? days : DAYS.filter((x) => x.date >= "2026-12-21");
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

function cardModel(day) {
  const app = S.apps.get(day.id);
  const nextDay = DAYS.find((d) => !released(d) && Date.parse(d.publishAt) > now());
  const isNext = nextDay && nextDay.id === day.id;
  const when = `${fmtShort(day.date)} · 18 h`;
  const draw = S.draws.get(day.date);

  if (app) {
    return {
      bg: app.color || day.color,
      title: app.title,
      theme: app.criterion ? `${day.theme} · ${app.criterion}` : day.theme,
      body: app.tagline,
      footLabel: "SORTIE LE",
      footValue: when,
      app,
    };
  }
  let title = "???";
  let body = day.blurb;
  let cta = { label: "Voir les 30 apps", href: "#apps" };
  let theme = day.theme;
  if (day.num === 1) {
    title = "Apphéro";
    body = "Le site qui lance le défi : les 30 apps, le vote et la roue.";
  } else if (day.num === DAYS.length) {
    title = "La finale";
    cta = { label: "Voir les classements", href: "#classements" };
  } else if (day.wheel) {
    const w = WHEEL_DAYS.find((x) => x.forDay === day.date);
    body = draw
      ? draw.idea
        ? "La roue a choisi l'idée de l'IA. Revois le tirage pour la découvrir."
        : `La roue a parlé. Critère du jour : « ${draw.label} ».`
      : `Le critère sort de la roue le ${fmtShort(w.drawOn).toLowerCase()} au soir. Tu pourras revoir le tirage.`;
    if (draw) theme = `Critère : ${draw.label}`;
    cta = { label: "Voir la roue", href: "/roue/" };
  } else if (day.weekday === 3) {
    title = "L'idée du public";
    body = "Propose l'app du mercredi sur X. L'idée la plus soutenue sera construite.";
    cta = { label: "Proposer une idée", href: X_URL };
  } else if (day.weekday === 6) {
    title = "Le jeu du samedi";
    cta = { label: "Comment ça marche", href: "#classements" };
  }
  if (Date.parse(day.publishAt) <= now()) {
    // L'heure est passée mais l'app n'est pas encore en ligne.
    return { bg: day.color, title: "En cuisine…", theme, body: "L'app du jour arrive très vite. Garde l'apéro au frais.", footLabel: "PRÉVUE LE", footValue: when, cta };
  }
  return {
    bg: day.color,
    title,
    theme,
    body,
    footLabel: isNext ? "S'OUVRE DANS" : "S'OUVRE LE",
    footValue: isNext ? countdown(day.publishAt) : when,
    countdownFor: isNext ? day.publishAt : null,
    cta,
  };
}

function voteLabel(appId) {
  if (S.myVote === appId) return "Voté ! Reviens demain";
  if (S.myVote) return "Déjà voté aujourd'hui";
  return "Voter pour celle-ci";
}

function renderDeck() {
  const deck = $("deck");
  const A = S.active;
  deck.innerHTML = S.week
    .map((day, i) => {
      const c = cardModel(day);
      const r = i - A;
      const ar = Math.abs(r);
      const active = r === 0;
      const tf = active
        ? "translate(0px, 0px) rotate(-1.5deg) scale(1)"
        : `translate(${r * 42}px, ${ar * -14}px) rotate(${r * 3.5 - 1.5}deg) scale(${1 - ar * 0.045})`;
      const z = 30 - ar * 3 + (r < 0 ? 1 : 0);
      let actions = "";
      if (c.app) {
        const voted = !!S.myVote;
        actions = `<div class="card-actions">
          <a class="btn" href="/apps/${esc(c.app.slug)}/">Ouvrir l'app</a>
          <button class="btn btn-yellow ${voted ? "" : "pulse"}" type="button" data-vote="${esc(c.app.id)}" ${voted ? "disabled" : ""}>${esc(voteLabel(c.app.id))}</button>
        </div>`;
      } else if (c.cta) {
        actions = `<div class="card-actions"><a class="btn" href="${esc(c.cta.href)}">${esc(c.cta.label)}</a></div>`;
      }
      return `<article class="card ${active ? "is-active" : ""}" style="transform:${tf};z-index:${z};opacity:${ar > 3 ? 0 : 1};pointer-events:${active ? "auto" : "none"}"
          aria-hidden="${active ? "false" : "true"}" ${active ? "" : "inert"} aria-label="${esc(`Jour ${day.id}`)}">
        <div class="card-inner" style="background:${esc(c.bg)}">
          <div class="card-top">
            <span class="card-when">${esc(fmtLongUpper(day.date))}</span>
            <span class="card-num">JOUR ${day.id} / 30</span>
          </div>
          <div class="card-title">${esc(c.title)}</div>
          <span class="card-theme">${esc(c.theme)}</span>
          <p class="card-body">${esc(c.body)}</p>
          <div class="card-foot"><small>${c.footLabel}</small><strong ${c.countdownFor ? `data-countdown="${c.countdownFor}"` : ""}>${esc(c.footValue)}</strong></div>
          ${actions}
        </div>
      </article>`;
    })
    .join("");

  $("tabs").innerHTML = S.week
    .map(
      (day, i) => `<button class="tab" type="button" data-go="${i}" aria-pressed="${i === A}" aria-label="${esc(fmtLongUpper(day.date))}" style="background:${day.color}">
        <b>${WEEKDAYS_SHORT[day.weekday].toUpperCase()}</b><span>${new Date(day.date + "T12:00:00Z").getUTCDate()}</span></button>`,
    )
    .join("");
  $("prev").disabled = A === 0;
  $("next").disabled = A === S.week.length - 1;
}

function fmtLongUpper(iso) {
  const d = new Date(iso + "T12:00:00Z");
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function go(i) {
  S.active = Math.max(0, Math.min(S.week.length - 1, i));
  renderDeck();
}

// ------------------------------------------------------------ sections

function renderPills() {
  const rot = [-1.6, 1.2, -1.0, 1.4, -1.2, 1.0];
  $("pills").innerHTML = [1, 2, 3, 4, 5, 6]
    .map(
      (wd, i) =>
        `<div class="pill" style="background:${THEMES[wd].color};transform:rotate(${rot[i]}deg)"><b>${WEEKDAYS_SHORT[wd].toUpperCase()}</b><span>${esc(THEMES[wd].name)}</span></div>`,
    )
    .join("");
}

function appTitle(id) {
  return S.apps.get(id)?.title || `App ${id}`;
}

function renderWeeks() {
  $("weeks").innerHTML = WEEKS.map((w) => {
    let line = w.final ? "Finale + gagnante" : "App de la semaine";
    if (w.final) {
      const lead = S.rankings.votes[0];
      if (lead) line = `${now() >= Date.parse(w.to) ? "Gagnante" : "En tête"} : ${appTitle(lead.app)}`;
    } else {
      const info = S.weeks[w.id];
      if (info?.leader) line = `${info.closed ? "Gagnante" : "En tête"} : ${appTitle(info.leader.app)}`;
    }
    return `<div class="vote-week ${w.final ? "is-final" : ""}"><b>${w.final ? "F" : w.id}</b><span class="d">${esc(fmtShort(w.announce).toLowerCase())}</span><span class="w">${esc(line)}</span></div>`;
  }).join("");
}

function renderTiles() {
  $("tiles").innerHTML = DAYS.map((day, i) => {
    const app = S.apps.get(day.id);
    const meta = `${fmtShort(day.date)} · ${day.theme}`;
    const rot = `${i % 2 ? 1.4 : -1.4}deg`;
    if (!app) {
      return `<div class="tile is-soon" style="--r:${rot}"><span class="tile-num" aria-hidden="true">${day.id}</span>
        <span><span class="tile-name">Bientôt</span><br><span class="tile-meta">${esc(meta)}</span></span>
        <span class="sr-only">App ${day.id}, sortie ${esc(meta)}</span></div>`;
    }
    const vote = S.myVote
      ? S.myVote === app.id
        ? `<span class="tile-vote" aria-label="Ton vote du jour">♥ Ton vote</span>`
        : ""
      : `<button class="tile-vote" type="button" data-vote="${esc(app.id)}" aria-label="Voter pour ${esc(app.title)}">♥ Voter</button>`;
    return `<div class="tile is-open" style="--r:${rot};--bg:${esc(app.color)}">
      <span class="tile-num" aria-hidden="true">${day.id}</span>
      <span><a class="tile-link tile-name" href="/apps/${esc(app.slug)}/">${esc(app.title)}</a><br><span class="tile-meta">${esc(meta)}</span></span>
      ${vote}
    </div>`;
  }).join("");
}

function renderRanks() {
  const list = (rows, unit, empty) => {
    const items = [0, 1, 2].map((i) => {
      const r = rows[i];
      if (!r) return `<div class="rank is-empty"><i>${i + 1}</i><span>${empty}</span></div>`;
      const app = S.apps.get(r.app);
      const label = `${r.n} ${unit}${r.n > 1 ? "s" : ""}`;
      return app
        ? `<a class="rank" href="/apps/${esc(app.slug)}/"><i>${i + 1}</i><span>${esc(app.title)}</span><small>${label}</small></a>`
        : `<div class="rank"><i>${i + 1}</i><span>App ${esc(r.app)}</span><small>${label}</small></div>`;
    });
    return items.join("");
  };
  $("rank-votes").innerHTML = list(S.rankings.votes, "vote", "Pas encore de vote");
  $("rank-views").innerHTML = list(S.rankings.views, "visite", "Pas encore de visite");
}

function renderAll() {
  renderDeck();
  renderWeeks();
  renderTiles();
  renderRanks();
}

// ------------------------------------------------------------ vote

async function vote(appId, button) {
  if (S.voting || S.myVote) return;
  S.voting = true;
  if (button) button.disabled = true;
  try {
    const token = await turnstileToken(S.siteKey);
    const res = await api("/api/vote", { method: "POST", body: JSON.stringify({ app: appId, token }) });
    S.myVote = res.myVote;
    const appRank = S.rankings.votes.find((r) => r.app === appId);
    if (appRank) appRank.n += 1;
    else S.rankings.votes.push({ app: appId, n: 1 });
    S.rankings.votes.sort((a, b) => b.n - a.n);
    renderAll();
    confetti($("deck"));
    toast(`Merci ! Ton vote pour ${appTitle(appId)} est compté. Reviens demain.`);
  } catch (err) {
    if (err.data?.myVote) S.myVote = err.data.myVote;
    toast(err.message);
    renderAll();
  } finally {
    S.voting = false;
  }
}

// ------------------------------------------------------------ démarrage

document.addEventListener("click", (e) => {
  const v = e.target.closest("[data-vote]");
  if (v) return vote(v.dataset.vote, v);
  const t = e.target.closest("[data-go]");
  if (t) go(Number(t.dataset.go));
});
$("prev").addEventListener("click", () => go(S.active - 1));
$("next").addEventListener("click", () => go(S.active + 1));
$("deck").addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") go(S.active - 1);
  if (e.key === "ArrowRight") go(S.active + 1);
});

function pickActive() {
  const t = now();
  let idx = 0;
  S.week.forEach((d, i) => {
    if (Date.parse(d.publishAt) <= t) idx = i;
  });
  S.active = idx;
}

renderPills();
S.week = currentWeek();
pickActive();
renderAll();
await load();
S.week = currentWeek();
pickActive();
renderAll();

// Compte à rebours, et rechargement quand une app sort.
const reloaded = new Set();
setInterval(async () => {
  let due = null;
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    el.textContent = countdown(el.dataset.countdown);
    if (Date.parse(el.dataset.countdown) <= now() && !reloaded.has(el.dataset.countdown)) due = el.dataset.countdown;
  });
  if (due) {
    reloaded.add(due);
    await new Promise((r) => setTimeout(r, 2000));
    await load();
    S.week = currentWeek();
    pickActive();
    renderAll();
  }
}, 1000);
