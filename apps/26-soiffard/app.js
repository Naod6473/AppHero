// Soiffard : le Strava des soiffards. App mobile (PWA), sans compte.
// Tout ce qui est perso reste dans le téléphone (localStorage, préfixe app26_).
// Le serveur ne reçoit que : une position arrondie à ~100 m pour chercher les bars,
// et, pour les couronnes, un pseudo + l'identifiant du bar + le temps passé.
import * as L from "./lib.js";

const KEY = "app26_";
const API = "/api/soiffard";
const GOALS = { bars: 8, km: 8, counter: 10 * 3600 };
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// ---------------------------------------------------------------- stockage

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(KEY + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(KEY + k);
      else localStorage.setItem(KEY + k, JSON.stringify(v));
    } catch {}
  },
};

let profile = store.get("profile", null);
let outings = store.get("outings", []);
let current = store.get("current", null);
const cachedBars = store.get("bars", null);

const S = {
  tab: "home",
  pos: null,
  geoError: null,
  heading: null,
  bars: cachedBars && Date.now() - cachedBars.at < 6 * 3600e3 ? cachedBars.list : [],
  barsCenter: cachedBars ? cachedBars.center : null,
  barsAt: cachedBars ? cachedBars.at : 0,
  barsLoading: false,
  barsError: null,
  kings: {},
  radius: 1000,
  rankMode: "bar",
  rankBar: null,
  rankData: {},
  weekData: null,
  crowns: store.get("crowns", []),
  lostCrown: null,
  overlay: null, // "menu" | "home" | "guide" | "share" | "onb"
  guideIdx: 0,
  guideFixed: null,
  share: null,
  confirmDelete: null,
  installPrompt: null,
};

// ---------------------------------------------------------------- outils

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ICON = {
  crown: '<path d="M3 18h18L19 7l-4.5 5L12 5 9.5 12 5 7z"/>',
  arrow: '<path d="M12 2l7 19-7-4-7 4z"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v6h14v-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  rec: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M10 21l2-6 3 3v3M8 12l3-4 3 2 2 3M11 8l-1 6"/>',
  taxi: '<path d="M5 16V11l2-5h10l2 5v5z"/><path d="M9 6V4h6v2"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><path d="M5 16v3M19 16v3"/>',
  ok: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const svg = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const arrowSvg = (bear, cls = "arrow") => `<svg class="${cls}" data-bear="${bear.toFixed(1)}" viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate(${arrowAngle(bear)}deg)">${ICON.arrow}</svg>`;

function arrowAngle(bear) {
  return Math.round(bear - (S.heading ?? 0));
}

let toastTimer;
function toast(msg, ms = 3400) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: opts.body ? { "content-type": "application/json" } : {}, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Réseau indisponible.");
  return data;
}

function dateLabel(ms) {
  const d = new Date(ms);
  const day = WEEKDAYS[d.getDay()];
  return `${day[0].toUpperCase() + day.slice(1)} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`;
}

function outingTitle(o) {
  const d = new Date(o.start);
  const h = d.getHours();
  const period = h >= 5 && h < 11 ? "matin" : h < 14 ? "midi" : h < 18 ? "après-midi" : h < 24 && h >= 18 ? "soir" : "nuit";
  const n = new Set((o.visits || []).map((v) => v.id)).size;
  const kind = n >= 3 ? "Tournée" : n === 2 ? "Sortie" : n === 1 ? "Apéro" : "Balade";
  return `${kind} de ${WEEKDAYS[d.getDay()]} ${period}`;
}

function mapsLink(dest) {
  const d = typeof dest === "string" ? dest : `${dest.lat},${dest.lon}`;
  return isIOS
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(d)}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d)}&travelmode=walking`;
}

function avatarHTML(seed, size = 40) {
  const a = L.avatar(seed);
  const inner = Math.round((size * a.size) / 100);
  return `<span class="av" aria-hidden="true" style="width:${size}px;height:${size}px;background:${a.bg}"><i style="width:${inner}px;height:${inner}px;border-radius:${a.radius};background:${a.fg};transform:rotate(${a.rot}deg) translate(${(a.dx * size) / 40}px,${(a.dy * size) / 40}px)"></i></span>`;
}

function saveCurrent() {
  store.set("current", current);
}

// ---------------------------------------------------------------- position et boussole

let watchId = null;
function startGeo() {
  if (watchId != null) return;
  if (!("geolocation" in navigator)) {
    S.geoError = "Ce navigateur ne donne pas la position.";
    render();
    return;
  }
  watchId = navigator.geolocation.watchPosition(onPos, onPosError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}

function onPosError(err) {
  S.geoError = err.code === 1 ? "Position refusée. Autorise-la dans les réglages du navigateur pour trouver les bars." : "Position introuvable pour l'instant.";
  render();
}

let lastRender = 0;
function onPos(p) {
  const pt = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
  const first = !S.pos;
  S.pos = pt;
  S.geoError = null;
  if (current) {
    const r = L.addPoint(current.track, pt);
    current.track = r.track;
    current.meters += r.added;
    if (current.checkin && L.distance(pt, current.checkin.bar) <= L.STILL_NEAR + Math.min(pt.acc || 0, 60)) {
      current.checkin.lastNear = Date.now();
    }
    saveCurrent();
  }
  maybeFetchBars();
  if (first || Date.now() - lastRender > 4000) render();
  else live();
}

let compassOn = false;
function startCompass() {
  if (compassOn || typeof DeviceOrientationEvent === "undefined") return;
  const handler = (e) => {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
    if (h == null) return;
    const so = (screen.orientation && screen.orientation.angle) || 0;
    S.heading = (h + so + 360) % 360;
    scheduleArrows();
  };
  const go = () => {
    compassOn = true;
    window.addEventListener("deviceorientationabsolute", handler);
    window.addEventListener("deviceorientation", handler);
  };
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((r) => r === "granted" && go())
      .catch(() => {});
  } else go();
}

let arrowFrame = 0;
function scheduleArrows() {
  if (arrowFrame) return;
  arrowFrame = requestAnimationFrame(() => {
    arrowFrame = 0;
    document.querySelectorAll("svg[data-bear]").forEach((el) => {
      el.style.transform = `rotate(${arrowAngle(Number(el.dataset.bear))}deg)`;
    });
    const n = $(".dial .north");
    if (n) n.hidden = S.heading != null;
  });
}

// ---------------------------------------------------------------- bars

async function maybeFetchBars(force = false) {
  if (!S.pos || S.barsLoading) return;
  const fresh = S.barsCenter && L.distance(S.pos, S.barsCenter) < 400 && Date.now() - S.barsAt < 30 * 60e3;
  if (fresh && !force) return;
  S.barsLoading = true;
  S.barsError = null;
  const lat = S.pos.lat.toFixed(3);
  const lon = S.pos.lon.toFixed(3);
  try {
    const data = await api(`/bars?lat=${lat}&lon=${lon}`);
    S.bars = data.bars || [];
    S.barsCenter = { lat: Number(lat), lon: Number(lon) };
    S.barsAt = Date.now();
    store.set("bars", { at: S.barsAt, center: S.barsCenter, list: S.bars });
    fetchKings();
  } catch (e) {
    S.barsError = e.message;
  }
  S.barsLoading = false;
  render();
}

function sortedBars() {
  if (!S.pos) return [];
  const now = new Date();
  return S.bars
    .map((b) => ({ ...b, dist: L.distance(S.pos, b), bear: L.bearing(S.pos, b), st: L.openState(b.oh, now) }))
    .sort((a, b) => a.dist - b.dist);
}

// Pour le bouton Bar : les ouverts (ou horaires inconnus) d'abord, les fermés ensuite.
function guideList() {
  const s = sortedBars();
  return [...s.filter((b) => b.st.open !== false), ...s.filter((b) => b.st.open === false)];
}

async function fetchKings() {
  const ids = sortedBars()
    .slice(0, 60)
    .map((b) => b.id);
  if (!ids.length) return;
  try {
    const data = await api(`/kings?ids=${ids.join(",")}`);
    S.kings = data.kings || {};
    render();
  } catch {}
}

async function fetchCrowns() {
  if (!profile) return;
  try {
    const data = await api(`/me?player=${profile.id}`);
    const now = data.crowns || [];
    const nowIds = new Set(now.map((c) => c.id));
    const lost = S.crowns.filter((c) => !nowIds.has(c.id) && c.week === data.week);
    if (lost.length) S.lostCrown = lost[0].name;
    S.crowns = now.map((c) => ({ ...c, week: data.week }));
    store.set("crowns", S.crowns);
    render();
  } catch {}
}

// ---------------------------------------------------------------- sortie en cours

function startOuting() {
  if (current) return;
  current = { start: Date.now(), track: S.pos ? [S.pos] : [], meters: 0, glasses: 0, visits: [], checkin: null };
  saveCurrent();
  startGeo();
  keepAwake();
  document.documentElement.classList.add("recording");
}

function checkIn(bar) {
  if (!current) startOuting();
  current.checkin = { bar: { id: bar.id, name: bar.name, lat: bar.lat, lon: bar.lon }, at: Date.now(), lastNear: Date.now() };
  saveCurrent();
  loadBarTop(bar.id);
  toast(`Chrono lancé ${L.au(bar.name)}. La couronne t'attend.`);
}

async function checkOut() {
  if (!current?.checkin) return;
  const c = current.checkin;
  const seconds = L.creditedSeconds(c.at, c.lastNear, Date.now());
  current.visits.push({ ...c.bar, seconds, at: c.at });
  current.checkin = null;
  saveCurrent();
  render();
  if (seconds < 60) {
    toast(`Passage ${L.au(c.bar.name)} trop court pour la couronne (moins d'une minute).`);
    return;
  }
  try {
    const r = await api("/visit", {
      method: "POST",
      body: JSON.stringify({ player: profile.id, pseudo: profile.pseudo, bar: { id: c.bar.id, name: c.bar.name }, seconds }),
    });
    S.rankData[c.bar.id] = { top: r.top, at: Date.now() };
    if (r.tookCrown) {
      toast(r.dethroned ? `Couronne prise ! Tu détrônes ${r.dethroned} ${L.au(c.bar.name)}.` : `Couronne prise ! Tu es le roi ${L.du(c.bar.name)}.`, 5000);
      S.crowns = [...S.crowns.filter((x) => x.id !== c.bar.id), { id: c.bar.id, name: c.bar.name, seconds: r.king.seconds, week: L.weekKey(Date.now()) }];
      store.set("crowns", S.crowns);
    } else {
      toast(`+${L.fmtDur(r.credited)} ${L.au(c.bar.name)}. Tu es ${r.rank === 1 ? "1er" : r.rank + "e"} cette semaine.`);
    }
    fetchKings();
  } catch (e) {
    toast(`Passage gardé dans ton téléphone, mais pas compté pour la couronne : ${e.message}`, 5000);
  }
  render();
}

async function finishOuting() {
  if (!current) return;
  if (current.checkin) await checkOut();
  const end = Date.now();
  const o = {
    id: L.randomId(8),
    start: current.start,
    end,
    seconds: Math.round((end - current.start) / 1000),
    meters: Math.round(current.meters),
    glasses: current.glasses,
    visits: current.visits,
    track: thin(current.track, 300).map((p) => ({ lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) })),
    homeAt: current.homeAt || null,
  };
  o.title = outingTitle(o);
  outings.unshift(o);
  outings = outings.slice(0, 200);
  store.set("outings", outings);
  current = null;
  saveCurrent();
  releaseAwake();
  document.documentElement.classList.remove("recording");
  S.tab = "home";
  render();
  shareOuting(o);
}

function thin(points, max) {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ("wakeLock" in navigator && !wakeLock && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    }
  } catch {}
}
function releaseAwake() {
  try {
    wakeLock?.release();
  } catch {}
  wakeLock = null;
}

async function loadBarTop(id) {
  try {
    const data = await api(`/bar?id=${id}&player=${profile?.id || ""}`);
    S.rankData[id] = { top: data.top, at: Date.now() };
    render();
  } catch {}
}

// ---------------------------------------------------------------- rendu

const VIEWS = { home: renderHome, explore: renderExplore, record: renderRecord, rank: renderRank, profile: renderProfile };
const TITLES = { home: "", explore: "Autour de toi", record: "Enregistrer", rank: "Classements", profile: "Profil" };

function render() {
  lastRender = Date.now();
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${S.tab}`));
  document.querySelectorAll(".tabs [data-tab]").forEach((b) => {
    if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("#top-title").textContent = TITLES[S.tab];
  const el = $(`#view-${S.tab}`);
  el.innerHTML = VIEWS[S.tab]();
  renderOverlay();
}

// Mise à jour légère (chrono, distances) sans tout redessiner.
function live() {
  if (S.tab === "record" && current) {
    const clock = $("#clock");
    if (clock) clock.textContent = L.fmtClock((Date.now() - current.start) / 1000);
    const km = $("#rec-km");
    if (km) km.textContent = `${L.fmtKm(current.meters)} km`;
    const bt = $("#bar-time");
    if (bt && current.checkin) bt.textContent = L.fmtDur(L.creditedSeconds(current.checkin.at, current.checkin.lastNear, Date.now()));
  }
  if (S.overlay === "guide") {
    const b = guideTarget();
    if (b && S.pos) {
      const d = L.distance(S.pos, b);
      const arrived = d <= L.NEAR_BAR + Math.min(S.pos.acc || 0, 30);
      if (arrived !== S.guideArrived) return renderOverlay();
      const dist = $("#g-dist");
      if (dist) dist.textContent = L.fmtDist(d);
      const min = $("#g-min");
      if (min) min.textContent = `environ ${L.walkMinutes(d)} min à pied`;
      const a = $(".dial svg[data-bear]");
      if (a) a.dataset.bear = L.bearing(S.pos, b).toFixed(1);
      scheduleArrows();
    }
  }
}

function installHTML() {
  if (standalone || store.get("installHidden", false)) return "";
  const btn = S.installPrompt
    ? `<button class="btn btn-amber" type="button" data-act="install">Installer</button>`
    : "";
  const how = S.installPrompt ? "Ajoute Soiffard à ton écran d'accueil." : isIOS ? "Pour l'installer : <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong>." : "Pour l'installer : menu du navigateur puis <strong>Installer l'application</strong>.";
  return `<div class="install"><img src="icon-192.png" alt=""><span style="flex:1">${how}</span>${btn}<button class="close" type="button" data-act="hide-install" aria-label="Masquer">${svg("x")}</button></div>`;
}

function weekAll() {
  const list = current ? [...outings, { start: current.start, meters: current.meters, glasses: current.glasses, seconds: (Date.now() - current.start) / 1000, visits: current.visits }] : outings;
  return L.weekStats(list);
}

function ringsHTML(ws) {
  const arc = (r, pct, color) => {
    const len = 2 * Math.PI * r;
    if (pct <= 0) return `<circle class="track" cx="80" cy="80" r="${r}"/>`;
    return `<circle class="track" cx="80" cy="80" r="${r}"/><circle class="arc" cx="80" cy="80" r="${r}" stroke="${color}" stroke-dasharray="${(len * Math.min(1, pct)).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 80 80)"/>`;
  };
  const km = ws.meters / 1000;
  const label = `Objectifs de la semaine : ${ws.bars} bars sur ${GOALS.bars}, ${L.fmtKm(ws.meters)} km sur ${GOALS.km}, ${L.fmtDur(ws.counter)} au comptoir sur 10 h`;
  return `<section class="card rings">
    <svg viewBox="0 0 160 160" role="img" aria-label="${esc(label)}">
      ${arc(70, ws.bars / GOALS.bars, "var(--ring-bars)")}${arc(53, km / GOALS.km, "var(--ring-km)")}${arc(36, ws.counter / GOALS.counter, "var(--ring-bar)")}
    </svg>
    <div class="ring-legend">
      <div><div class="l" style="color:var(--accentText)">BARS</div><div class="v">${ws.bars} <small>/ ${GOALS.bars}</small></div></div>
      <div><div class="l" style="color:var(--okText)">KM À PIED</div><div class="v">${L.fmtKm(ws.meters)} <small>/ ${GOALS.km}</small></div></div>
      <div><div class="l" style="color:var(--blueText)">COMPTOIR</div><div class="v">${L.fmtDur(ws.counter)} <small>/ 10 h</small></div></div>
    </div>
  </section>`;
}

function renderHome() {
  const ws = weekAll();
  const kin = L.kcalIn(ws.glasses);
  const kout = L.kcalOut(ws.meters);
  const near = guideList()[0];
  const crowns = S.crowns.filter((c) => c.week === L.weekKey(Date.now()));
  const tiles = [
    ["Kcal ingérées", kin.toLocaleString("fr-FR"), kin ? `soit ${L.croissants(kin)} croissant${L.croissants(kin) > 1 ? "s" : ""}` : "le compteur est à jeun"],
    ["Kcal brûlées", kout.toLocaleString("fr-FR"), kin - kout > 0 ? `bilan +${(kin - kout).toLocaleString("fr-FR")}, le sport c'est demain` : "en marchant d'un bar à l'autre"],
    ["Verres", String(ws.glasses), ws.glasses ? L.pace(ws.seconds, ws.glasses).replace("Allure : ", "allure : ") : "rien au compteur"],
    ["Couronnes", String(crowns.length), crowns.length ? `roi ${crowns.length > 1 ? "de " + crowns.length + " bars" : L.du(crowns[0].name)}` : "aucune, pour l'instant"],
  ];
  const lost = S.lostCrown
    ? `<div class="alert">${svg("crown", "hop")}<span style="flex:1">On t'a pris la couronne ${esc(L.du(S.lostCrown))}. Va la reprendre.</span><button class="close" type="button" data-act="dismiss-lost" aria-label="Fermer">${svg("x")}</button></div>`
    : "";
  const nearBtn = near
    ? `<button class="nearest" type="button" data-act="guide" data-id="${near.id}"><span><span class="t">Bar le plus proche</span><br><span class="n">${esc(near.name)} · ${L.fmtDist(near.dist)}</span></span>${arrowSvg(near.bear)}</button>`
    : `<button class="nearest" type="button" data-act="guide"><span><span class="t">Bar le plus proche</span><br><span class="n">${S.pos ? (S.barsLoading ? "Je cherche…" : "Aucun bar trouvé") : "Active ta position"}</span></span>${svg("compass", "arrow")}</button>`;
  return `${installHTML()}${lost}
    <div class="between"><h1 class="h1">Cette semaine</h1><span class="muted" style="font-size:13px;font-weight:600">Semaine ${ws.week.slice(-2)}</span></div>
    ${ringsHTML(ws)}
    <section class="grid2">${tiles.map(([l, v, s]) => `<div class="tile"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`).join("")}</section>
    ${nearBtn}
    <h2 class="h2" style="margin-top:6px">Tes dernières sorties</h2>
    ${outings.length ? outings.slice(0, 15).map(outingHTML).join("") : `<div class="empty">Aucune sortie pour l'instant.<br>Touche le <strong>bouton ambre</strong> en bas pour lancer la première.</div>`}`;
}

function outingHTML(o) {
  const nBars = new Set((o.visits || []).map((v) => v.id)).size;
  const names = [...new Map((o.visits || []).map((v) => [v.id, v.name])).values()];
  const del = S.confirmDelete === o.id;
  return `<article class="outing">
    <div class="who">${avatarHTML(profile?.id)}<div><div style="font-weight:700;font-size:15px">${esc(profile?.pseudo || "Moi")}</div><div class="muted" style="font-size:12px">${dateLabel(o.start)}</div></div></div>
    <h3>${esc(o.title || outingTitle(o))}</h3>
    <div class="stats4">
      <div><div class="l">Bars</div><div class="v">${nBars}</div></div>
      <div><div class="l">À pied</div><div class="v">${L.fmtKm(o.meters)} km</div></div>
      <div><div class="l">Durée</div><div class="v">${L.fmtDur(o.seconds)}</div></div>
      <div><div class="l">Verres</div><div class="v">${o.glasses || 0}</div></div>
    </div>
    <p class="jk">${esc(L.joke({ bars: nBars, seconds: o.seconds, meters: o.meters, glasses: o.glasses || 0 }))}</p>
    ${mapHTML(o.track || [], o.visits || [])}
    ${names.length ? `<div class="chips">${names.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</div>` : ""}
    <div class="actions2">
      <button class="btn btn-amber" type="button" data-act="share-outing" data-id="${o.id}">${svg("share")}Partager</button>
      <button class="btn btn-chip" type="button" data-act="delete-outing" data-id="${o.id}">${svg("trash")}${del ? "Confirmer ?" : "Supprimer"}</button>
    </div>
  </article>`;
}

// Tuiles OpenStreetMap (le soir, assombries en CSS). Usage léger : seulement les cartes des sorties.
function tileUrl(z, x, y) {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

function mapHTML(track, stops) {
  const pts = [...track, ...stops];
  if (!pts.length) return "";
  const w = Math.round(Math.min(520, innerWidth) - 64);
  const h = 140;
  const v = L.fitView(pts, w, h, 22, 17);
  const x0 = v.cx - w / 2;
  const y0 = v.cy - h / 2;
  const n = 2 ** v.z;
  let imgs = "";
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w) / 256); tx++) {
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + h) / 256); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      imgs += `<img alt="" loading="lazy" src="${tileUrl(v.z, wx, ty)}" style="left:${Math.round(tx * 256 - x0)}px;top:${Math.round(ty * 256 - y0)}px" onerror="this.remove()">`;
    }
  }
  const P = (p) => `${(L.lonToX(p.lon, v.z) - x0).toFixed(1)},${(L.latToY(p.lat, v.z) - y0).toFixed(1)}`;
  const line = track.length > 1 ? `<polyline points="${track.map(P).join(" ")}" fill="none" stroke="#F5B83D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  const dots = stops
    .map((s) => {
      const [x, y] = P(s).split(",");
      return `<circle cx="${x}" cy="${y}" r="6" fill="var(--bg)" stroke="#F5B83D" stroke-width="3"/>`;
    })
    .join("");
  return `<div class="map">${imgs}<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${line}${dots}</svg><span class="attr">© OpenStreetMap</span></div>`;
}

function needPos() {
  if (S.geoError) return `<div class="card stack"><h2 class="h2">Position indisponible</h2><p class="muted" style="margin:0">${esc(S.geoError)}</p><button class="btn btn-amber" type="button" data-act="geo">Réessayer</button></div>`;
  return `<div class="card stack"><h2 class="h2">Où es-tu ?</h2><p class="muted" style="margin:0">Soiffard a besoin de ta position pour trouver les bars autour. Elle reste sur ton téléphone.</p><button class="btn btn-amber" type="button" data-act="geo">Activer ma position</button></div>`;
}

function kingLine(id) {
  const k = S.kings[id];
  return k ? `${esc(k.pseudo)} · ${L.fmtDur(k.seconds)}` : "Couronne libre, à prendre";
}

function renderExplore() {
  if (!S.pos) return needPos();
  const list = sortedBars();
  if (!list.length) {
    if (S.barsLoading) return `<div class="empty">Je cherche les bars autour de toi…</div>`;
    if (S.barsError) return `<div class="card stack"><h2 class="h2">Pas de réponse</h2><p class="muted" style="margin:0">${esc(S.barsError)}</p><button class="btn btn-amber" type="button" data-act="refresh-bars">Réessayer</button></div>`;
    return `<div class="empty">Aucun bar connu dans OpenStreetMap à moins de 2 km. Le désert.</div>`;
  }
  const near = guideList()[0];
  const shown = list.filter((b) => b.dist <= S.radius).slice(0, 80);
  return `<section class="near-big">
      <span class="kicker" style="color:var(--ink)">Le plus proche</span>
      <div class="row" style="justify-content:space-between">
        <div style="min-width:0"><h2>${esc(near.name)}</h2><div style="font-size:14px;font-weight:600">${esc(near.kind)} · ${esc(L.hoursLabel(near.st))}</div></div>
        <div class="compass">${arrowSvg(near.bear)}</div>
      </div>
      <div class="row" style="justify-content:space-between;align-items:flex-end">
        <span class="num" style="font-size:44px;line-height:1">${L.fmtDist(near.dist)}</span>
        <button class="btn" style="background:var(--ink);color:var(--amber)" type="button" data-act="guide" data-id="${near.id}">Y aller</button>
      </div>
      <div class="row" style="gap:6px;font-size:13px;font-weight:600">${svg("crown", "arrow")}<span>${S.kings[near.id] ? "Roi : " + kingLine(near.id) + " cette semaine" : "Couronne libre cette semaine"}</span></div>
    </section>
    <div class="seg" role="group" aria-label="Rayon">${[500, 1000, 2000].map((r) => `<button type="button" data-act="radius" data-r="${r}" aria-pressed="${S.radius === r}">${r < 1000 ? r + " m" : r / 1000 + " km"}</button>`).join("")}</div>
    <div class="list">${
      shown.length
        ? shown
            .map(
              (b) => `<button class="bar-row" type="button" data-act="guide" data-id="${b.id}">
        <span class="dir ${b.st.open === false ? "closed" : ""}">${arrowSvg(b.bear)}</span>
        <span class="info"><span class="name">${esc(b.name)}</span><span class="meta">${esc(b.kind)} · <span class="${b.st.open ? "open" : ""}">${esc(L.hoursLabel(b.st))}</span></span><span class="king">${svg("crown")}${kingLine(b.id)}</span></span>
        <span class="d">${L.fmtDist(b.dist)}</span></button>`,
            )
            .join("")
        : `<div class="empty">Aucun bar dans ce rayon. Élargis un peu.</div>`
    }</div>
    <p class="attrib">Données des bars © les contributeurs OpenStreetMap. Un bar manque ? Ajoute-le sur openstreetmap.org.</p>`;
}

function renderRecord() {
  if (!current) {
    return `<div class="card stack" style="margin-top:12px">
      <span class="kicker">Nouvelle sortie</span>
      <h1 class="h1">Prêt pour une tournée ?</h1>
      <p class="muted" style="margin:0;line-height:1.5">Le chrono, les km à pied et les bars visités s'enregistrent tant que l'app est ouverte. Au bar, touche « J'y suis » pour viser la couronne.</p>
      <button class="btn btn-ink" type="button" data-act="start">Lancer la sortie</button>
    </div>
    ${S.pos ? "" : needPos()}`;
  }
  const elapsed = (Date.now() - current.start) / 1000;
  const nBars = new Set(current.visits.map((v) => v.id)).size + (current.checkin && !current.visits.some((v) => v.id === current.checkin.bar.id) ? 1 : 0);
  let barBlock = "";
  if (current.checkin) {
    const c = current.checkin;
    const sec = L.creditedSeconds(c.at, c.lastNear, Date.now());
    const top = S.rankData[c.bar.id]?.top || [];
    const mine = top.find((r) => r.me)?.seconds || 0;
    const king = top[0];
    let crownLine = "Personne n'a la couronne cette semaine : elle est à toi dès 1 min.";
    let pct = 100;
    if (king && king.me) crownLine = `Tu tiens la couronne avec ${L.fmtDur(king.seconds)}.`;
    else if (king) {
      const left = king.seconds - mine - sec;
      pct = Math.min(100, Math.round(((mine + sec) / king.seconds) * 100));
      crownLine = left > 0 ? `Couronne de ${esc(king.pseudo)} : ${L.fmtDur(king.seconds)}. Encore ${L.fmtDur(left)}.` : `Tu dépasses ${esc(king.pseudo)} ! Touche « Je pars » pour valider.`;
    }
    barBlock = `<section class="card stack">
      <div class="between"><div><div class="muted" style="font-size:12px">Tu es au</div><div class="h2" style="font-size:26px">${esc(c.bar.name)}</div></div><span class="num" id="bar-time" style="font-size:22px;color:var(--accentText)">${L.fmtDur(sec)}</span></div>
      <div style="font-size:13px;color:var(--text2)">${crownLine}</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="two">
        <button class="btn btn-amber" type="button" data-act="share-crown" data-id="${c.bar.id}">${svg("share")}Partager</button>
        <button class="btn btn-ghost" type="button" data-act="checkout">Je pars</button>
      </div>
    </section>`;
  } else {
    const near = sortedBars()[0];
    if (near) {
      const ok = near.dist <= L.NEAR_BAR + Math.min(S.pos?.acc || 0, 30);
      barBlock = `<section class="card stack">
        <span class="muted" style="font-size:12px">Bar le plus proche</span>
        <div class="between"><span class="h2">${esc(near.name)}</span><span class="num" style="font-size:20px">${L.fmtDist(near.dist)}</span></div>
        <button class="btn btn-amber" type="button" data-act="checkin" data-id="${near.id}" ${ok ? "" : "disabled"}>J'y suis</button>
        ${ok ? "" : `<span class="muted" style="font-size:12px;text-align:center">Approche-toi à moins de 50 m pour lancer le chrono du comptoir.</span>`}
      </section>`;
    } else barBlock = S.pos ? "" : needPos();
  }
  return `<section class="chrono">
      <span class="live"><i></i>Sortie en cours</span>
      <span class="num clock" id="clock">${L.fmtClock(elapsed)}</span>
      <div class="sub"><div><div class="v" id="rec-km">${L.fmtKm(current.meters)} km</div><div class="l">à pied</div></div><div><div class="v">${nBars}</div><div class="l">bar${nBars > 1 ? "s" : ""}</div></div></div>
    </section>
    ${barBlock}
    <section class="card glasses">
      <button class="rnd minus" type="button" data-act="glass" data-d="-1" aria-label="Un verre de moins">−</button>
      <div class="mid"><span class="num" style="font-size:30px;line-height:1">${current.glasses} verre${current.glasses > 1 ? "s" : ""}</span><span style="font-size:13px;font-weight:700;color:var(--accentText)">${L.glassLevel(current.glasses)}</span><span class="muted" style="font-size:11px">${L.pace(elapsed, current.glasses)} · ${L.kcalIn(current.glasses)} kcal</span></div>
      <button class="rnd plus" type="button" data-act="glass" data-d="1" aria-label="Un verre de plus">+</button>
    </section>
    <button class="btn btn-ink" type="button" data-act="finish">Terminer la sortie</button>`;
}

function rankBars() {
  const map = new Map();
  if (current?.checkin) map.set(current.checkin.bar.id, current.checkin.bar.name);
  for (const b of sortedBars().slice(0, 15)) map.set(b.id, b.name);
  for (const o of outings.slice(0, 20)) for (const v of o.visits || []) map.set(v.id, v.name);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function renderRank() {
  const seg = `<div class="seg2" role="group" aria-label="Type de classement"><button type="button" data-act="rank-mode" data-m="bar" aria-pressed="${S.rankMode === "bar"}">Par bar</button><button type="button" data-act="rank-mode" data-m="week" aria-pressed="${S.rankMode === "week"}">La semaine</button></div>`;
  const row = (i, name, val, me) =>
    `<div class="rank-row ${me ? "me" : ""} ${i === 0 ? "first" : ""}"><span class="pos">${i + 1}</span><span class="who2"><span>${esc(name)}${me ? " (toi)" : ""}</span>${i === 0 ? `<svg class="hop" viewBox="0 0 24 24" role="img" aria-label="Roi">${ICON.crown}</svg>` : ""}</span><span class="val">${val}</span></div>`;
  if (S.rankMode === "week") {
    const d = S.weekData;
    const mine = profile?.id.slice(0, 6);
    const body = !d
      ? `<div class="empty">Chargement…</div>`
      : d.error
        ? `<div class="empty">${esc(d.error)}</div>`
        : d.top.length
          ? d.top.map((r, i) => row(i, r.pseudo, `${r.bars} bar${r.bars > 1 ? "s" : ""} · ${L.fmtDur(r.seconds)}`, r.id === mine)).join("")
          : `<div class="empty">Personne n'a encore posé le coude cette semaine.</div>`;
    return `${seg}<section class="card stack" style="gap:6px"><span class="kicker">Bars différents · cette semaine</span><h2 class="h2" style="font-size:26px;margin-bottom:8px">Tous les soiffards</h2>${body}</section><p class="attrib">Remise à zéro chaque lundi à 6 h.</p>`;
  }
  const bars = rankBars();
  if (!bars.length) return `${seg}${S.pos ? `<div class="empty">Aucun bar autour pour l'instant.</div>` : needPos()}`;
  if (!S.rankBar || !bars.some((b) => b.id === S.rankBar)) S.rankBar = bars[0].id;
  const bar = bars.find((b) => b.id === S.rankBar);
  const d = S.rankData[bar.id];
  if (!d) loadBarTop(bar.id);
  const body = !d
    ? `<div class="empty">Chargement…</div>`
    : d.top.length
      ? d.top.map((r, i) => row(i, r.pseudo, L.fmtDur(r.seconds), r.me)).join("")
      : `<div class="empty">Couronne libre : personne n'est encore passé cette semaine.</div>`;
  return `${seg}
    <label class="sr" for="rank-pick">Choisir un bar</label>
    <select class="pick" id="rank-pick" data-act="rank-bar">${bars.map((b) => `<option value="${b.id}" ${b.id === bar.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
    <section class="card stack" style="gap:6px"><span class="kicker">Le comptoir · cette semaine</span><h2 class="h2" style="font-size:26px;margin-bottom:8px">${esc(bar.name)}</h2>${body}</section>
    ${d?.top.length ? `<button class="btn btn-amber" type="button" data-act="share-crown" data-id="${bar.id}">${svg("share")}Partager le classement</button>` : ""}
    <p class="attrib">Remise à zéro chaque lundi à 6 h. Un passage compte 4 h au plus.</p>`;
}

function records() {
  let longest = 0, mostBars = 0, counter = 0, far = 0;
  for (const o of outings) {
    longest = Math.max(longest, o.seconds || 0);
    mostBars = Math.max(mostBars, new Set((o.visits || []).map((v) => v.id)).size);
    far = Math.max(far, o.meters || 0);
    for (const v of o.visits || []) counter = Math.max(counter, v.seconds || 0);
  }
  return [
    ["Plus longue sortie", longest ? L.fmtDur(longest) : "–"],
    ["Plus de bars en une soirée", mostBars || "–"],
    ["Plus long au même comptoir", counter ? L.fmtDur(counter) : "–"],
    ["Plus longue marche", far ? `${L.fmtKm(far)} km` : "–"],
  ];
}

function renderProfile() {
  const ws = weekAll();
  const max = Math.max(...ws.perDay, 1);
  const all = L.badges(outings, S.crowns.length);
  const allBars = new Set(outings.flatMap((o) => (o.visits || []).map((v) => v.id))).size;
  const theme = getTheme();
  return `<section class="row" style="padding:6px 2px">${avatarHTML(profile?.id, 64)}<div style="min-width:0;flex:1"><div class="h2" style="font-size:24px">${esc(profile?.pseudo || "")}</div><div class="muted" style="font-size:13px">${allBars} bar${allBars > 1 ? "s" : ""} au compteur · ${outings.length} sortie${outings.length > 1 ? "s" : ""}</div></div></section>
    <section class="card stack">
      <div class="between"><h2 class="h2" style="font-size:18px">Cette semaine</h2><span class="muted" style="font-size:12px">Comptoir par jour</span></div>
      <div class="grid2" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div><div class="num" style="font-size:24px">${L.fmtDur(ws.counter)}</div><div class="muted" style="font-size:12px">au comptoir</div></div>
        <div><div class="num" style="font-size:24px">${ws.bars}</div><div class="muted" style="font-size:12px">bars</div></div>
        <div><div class="num" style="font-size:24px">${L.fmtKm(ws.meters)} km</div><div class="muted" style="font-size:12px">à pied</div></div>
      </div>
      <div class="chart" role="img" aria-label="Temps au comptoir par jour cette semaine">${ws.perDay.map((v, i) => `<div><i class="${v > 0 ? "on" : ""}" style="height:${Math.max(4, Math.round((v / max) * 86))}px"></i><span>${"LMMJVSD"[i]}</span></div>`).join("")}</div>
    </section>
    <section class="card"><h2 class="h2" style="font-size:18px;margin-bottom:6px">Pintes d'or</h2>${records().map(([l, v]) => `<div class="rec-line"><span style="color:var(--text2)">${l}</span><span class="num" style="font-weight:800">${v}</span></div>`).join("")}</section>
    <h2 class="h2" style="font-size:18px">Badges</h2>
    <section class="badges">${all.map((b) => `<div class="badge ${b.done ? "" : "off"}"><span class="m">${b.mark}</span><b>${b.name}</b><small>${b.done ? "Obtenu" : b.hint}</small></div>`).join("")}</section>
    <section class="card stack" id="settings">
      <h2 class="h2" style="font-size:18px">Réglages</h2>
      <div class="field"><label for="f-pseudo">Pseudo (visible dans les classements)</label><input id="f-pseudo" maxlength="20" value="${esc(profile?.pseudo || "")}" autocomplete="nickname"></div>
      <div class="field"><label for="f-home">Maison (adresse, pour « Rentrer chez moi »)</label><input id="f-home" value="${esc(profile?.home?.label || "")}" placeholder="12 rue des Lilas, Lyon" autocomplete="street-address"></div>
      <button class="btn btn-chip" type="button" data-act="home-here">${svg("pin")}Ma position actuelle est ma maison</button>
      <div class="field"><label for="f-taxi">Numéro de taxi</label><input id="f-taxi" type="tel" value="${esc(profile?.taxi || "")}" placeholder="01 23 45 67 89" autocomplete="tel"></div>
      <div class="field"><label for="f-theme">Thème</label><select class="pick" id="f-theme" data-act="theme-pick"><option value="" ${!theme ? "selected" : ""}>Automatique (clair le jour, sombre le soir)</option><option value="light" ${theme === "light" ? "selected" : ""}>Clair</option><option value="dark" ${theme === "dark" ? "selected" : ""}>Sombre</option></select></div>
      <button class="btn btn-amber" type="button" data-act="save-settings">Enregistrer</button>
      <button class="btn btn-ghost" type="button" data-act="wipe">${S.confirmDelete === "wipe" ? "Sûr ? Tout sera effacé" : "Effacer mes données"}</button>
    </section>
    <p class="attrib">Soiffard, une app du défi <a href="/">Apphéro</a>. Bars et cartes © les contributeurs OpenStreetMap. Ta position ne quitte pas ton téléphone.</p>`;
}

// ---------------------------------------------------------------- calques

function guideTarget() {
  if (S.guideFixed) {
    const b = S.bars.find((x) => x.id === S.guideFixed);
    if (b) return b;
  }
  const list = guideList();
  return list.length ? list[S.guideIdx % list.length] : null;
}

function renderOverlay() {
  const ov = $("#overlay");
  if (!S.overlay) {
    ov.hidden = true;
    ov.innerHTML = "";
    return;
  }
  ov.hidden = false;
  const close = `<button class="close" type="button" data-act="close" aria-label="Fermer">${svg("x")}</button>`;
  if (S.overlay === "onb") {
    ov.innerHTML = `<div class="onb">
      <div class="onb-brand"><img class="logo-big" src="logo.svg" alt=""><span class="wm" data-wm>Soiffard</span></div>
      <h1 class="h1">Le Strava des soiffards.</h1>
      <p>Le bar le plus proche en un geste. Tes tournées en stats. Et la couronne du <strong>King of the Bar</strong> pour qui reste le plus longtemps au comptoir.</p>
      <div class="field"><label for="onb-pseudo">Ton pseudo</label><input id="onb-pseudo" maxlength="20" value="${esc(L.randomPseudo())}" autocomplete="nickname"></div>
      <button class="btn btn-ink" type="button" data-act="onb-go">C'est parti</button>
      <p class="muted" style="font-size:13px">Sans compte. Ta position reste sur ton téléphone : seuls ton pseudo et ton temps au comptoir partent dans les classements.</p>
    </div>`;
    return;
  }
  if (S.overlay === "menu") {
    const allBars = new Set(outings.flatMap((o) => (o.visits || []).map((v) => v.id))).size;
    const km = outings.reduce((s, o) => s + (o.meters || 0), 0);
    const item = (act, icon, label, on = false, extra = "") => `<button class="menu-item ${on ? "on" : ""}" type="button" data-act="${act}" ${extra}>${svg(icon)}${label}</button>`;
    ov.innerHTML = `<button class="scrim" type="button" data-act="close" aria-label="Fermer le menu"></button>
      <nav class="drawer" aria-label="Menu">
        <div class="row">${avatarHTML(profile?.id, 52)}<div><div class="h2" style="font-size:20px">${esc(profile?.pseudo || "")}</div><div class="muted" style="font-size:13px">${levelName(allBars)}</div></div></div>
        <div class="mini3"><div><b>${allBars}</b><small>bars</small></div><div><b>${L.fmtKm(km)} km</b><small>à pied</small></div><div><b>${S.crowns.length}</b><small>couronnes</small></div></div>
        <div>
          ${item("go", "home", "Accueil", S.tab === "home", 'data-tab="home"')}
          ${item("go", "list", "Mes sorties", false, 'data-tab="home" data-scroll="outings"')}
          ${item("go", "stats", "Statistiques et badges", S.tab === "profile", 'data-tab="profile"')}
          ${item("go", "compass", "Bars autour de moi", S.tab === "explore", 'data-tab="explore"')}
          ${item("go", "crown", "Classements et couronnes", S.tab === "rank", 'data-tab="rank"')}
          ${item("go", "rec", current ? "Sortie en cours" : "Lancer une sortie", S.tab === "record", 'data-tab="record"')}
          ${item("fiche", "star", document.documentElement.classList.contains("show-fiche") ? "Masquer la fiche Apphéro" : "Apphéro : fiche et j'aime")}
        </div>
        <button class="big-choice blue" type="button" data-act="home-sheet" style="min-height:52px;padding:12px 14px">${svg("home")}<b>Rentrer chez moi</b></button>
        <div style="margin-top:auto">${item("go", "gear", "Réglages", false, 'data-tab="profile" data-scroll="settings"')}</div>
      </nav>`;
    return;
  }
  if (S.overlay === "home") {
    const home = profile?.home;
    const walk = home
      ? `<a class="big-choice" href="${mapsLink(home.lat != null ? home : home.label)}" target="_blank" rel="noopener">${svg("walk")}<span><b>À pied</b><small>${S.pos && home.lat != null ? `Itinéraire · environ ${L.walkMinutes(L.distance(S.pos, home))} min` : "Itinéraire jusqu'à la maison"}</small></span></a>`
      : `<button class="big-choice" type="button" data-act="go" data-tab="profile" data-scroll="settings">${svg("walk")}<span><b>À pied</b><small>Enregistre d'abord ta maison dans les réglages</small></span></button>`;
    const taxi = profile?.taxi
      ? `<a class="big-choice" href="tel:${esc(profile.taxi.replace(/[^\d+]/g, ""))}">${svg("taxi")}<span><b>Appeler un taxi</b><small>${esc(profile.taxi)}</small></span></a>`
      : `<button class="big-choice" type="button" data-act="go" data-tab="profile" data-scroll="settings">${svg("taxi")}<span><b>Appeler un taxi</b><small>Ajoute un numéro de taxi dans les réglages</small></span></button>`;
    ov.innerHTML = `<button class="scrim" type="button" data-act="close" aria-label="Fermer"></button>
      <section class="sheet" role="dialog" aria-label="Rentrer chez moi">
        <div class="sheet-head"><h2 class="h2" style="font-size:24px">Rentrer chez moi</h2>${close}</div>
        ${home ? `<span class="muted" style="font-size:13px">Maison : ${esc(home.label || "position enregistrée")}</span>` : ""}
        ${walk}${taxi}
        <button class="big-choice blue" type="button" data-act="safe-home">${svg("ok")}<span><b>Je suis bien rentré</b><small>Prévient tes potes : « Bien rentré, la couronne attendra demain. »</small></span></button>
      </section>`;
    return;
  }
  if (S.overlay === "guide") {
    const b = guideTarget();
    if (!S.pos || !b) {
      ov.innerHTML = `<section class="guide"><div class="sheet-head"><span class="kicker" style="color:var(--accentText)">Bar le plus proche</span>${close}</div>
        <div class="dial-wrap"><div class="empty">${!S.pos ? (S.geoError ? esc(S.geoError) : "Je cherche ta position…") : S.barsLoading ? "Je cherche les bars autour…" : S.barsError ? esc(S.barsError) : "Aucun bar trouvé à moins de 2 km."}</div></div>
        ${!S.pos ? `<button class="btn btn-amber" type="button" data-act="geo">Activer ma position</button>` : ""}</section>`;
      return;
    }
    const d = L.distance(S.pos, b);
    const st = L.openState(b.oh);
    const arrived = d <= L.NEAR_BAR + Math.min(S.pos.acc || 0, 30);
    S.guideArrived = arrived;
    const here = current?.checkin?.bar.id === b.id;
    ov.innerHTML = `<section class="guide" role="dialog" aria-label="Aller au bar">
      <div class="sheet-head"><span class="kicker" style="color:var(--accentText)">${S.guideFixed ? "Direction" : S.guideIdx ? `Bar n° ${S.guideIdx + 1}` : "Bar le plus proche"}</span>${close}</div>
      <h2>${esc(b.name)}</h2>
      <span class="muted" style="font-size:15px">${esc(b.kind)} · <span class="${st.open ? "open" : ""}">${esc(L.hoursLabel(st))}</span>${S.kings[b.id] ? ` · Roi : ${esc(S.kings[b.id].pseudo)}` : ""}</span>
      <div class="dial-wrap"><div class="dial"><span class="north" ${S.heading != null ? "hidden" : ""}>N</span>${arrowSvg(L.bearing(S.pos, b))}</div></div>
      ${
        arrived
          ? `<div class="arrived">Tu y es !</div><p class="guide hint" style="position:static;padding:0;background:none">${here ? "Le chrono du comptoir tourne déjà." : "Lance le chrono pour viser la couronne."}</p>
             <button class="btn btn-ink" type="button" data-act="${here ? "close" : "checkin"}" data-id="${b.id}">${here ? "Fermer" : "J'y suis"}</button>`
          : `<div class="num dist" id="g-dist">${L.fmtDist(d)}</div><p class="hint" id="g-min" style="margin:0">environ ${L.walkMinutes(d)} min à pied</p>
             <p class="hint" style="margin:0;font-size:12px">${S.heading == null ? "Flèche orientée vers le nord (boussole indisponible)." : "Suis la flèche."}</p>
             <div class="two" style="margin-top:8px">
               ${S.guideFixed ? `<button class="btn btn-ghost" type="button" data-act="guide-nearest">Le plus proche</button>` : `<button class="btn btn-ghost" type="button" data-act="guide-next">Bar suivant</button>`}
               <a class="btn btn-amber" href="${mapsLink(b)}" target="_blank" rel="noopener">Ouvrir dans Plans</a>
             </div>`
      }
    </section>`;
    return;
  }
  if (S.overlay === "share" && S.share) {
    ov.innerHTML = `<button class="scrim" type="button" data-act="close" aria-label="Fermer"></button>
      <section class="sheet" role="dialog" aria-label="Partager">
        <div class="sheet-head"><h2 class="h2">${esc(S.share.title)}</h2>${close}</div>
        ${S.share.url ? `<img class="share-img" src="${S.share.url}" alt="${esc(S.share.alt)}">` : `<div class="empty">Je prépare l'image…</div>`}
        <div class="two">
          <button class="btn btn-amber" type="button" data-act="do-share" ${S.share.url ? "" : "disabled"}>${svg("share")}Partager</button>
          <a class="btn btn-chip" ${S.share.url ? `href="${S.share.url}" download="${esc(S.share.file)}"` : ""}>Enregistrer l'image</a>
        </div>
      </section>`;
  }
}

function levelName(n) {
  if (n >= 30) return "Niveau 5 · Légende du quartier";
  if (n >= 15) return "Niveau 4 · Habitué";
  if (n >= 7) return "Niveau 3 · Explorateur";
  if (n >= 2) return "Niveau 2 · Amateur";
  return "Niveau 1 · Novice du zinc";
}

// ---------------------------------------------------------------- images à partager (story 9:16)

function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 3000);
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, x, y, maxW, lh, maxLines = 4) {
  const words = text.split(" ");
  let line = "";
  let n = 0;
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
      if (++n >= maxLines - 1) break;
    } else line = t;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

// Logo (icône) + titre mousseux en haut des images à partager.
async function drawBrand(ctx, x, y) {
  const [icon, word] = await Promise.all([loadImg("icon-192.png"), loadImg("wordmark.svg")]);
  if (icon) {
    ctx.save();
    rr(ctx, x, y, 84, 84, 22);
    ctx.clip();
    ctx.drawImage(icon, x, y, 84, 84);
    ctx.restore();
  }
  if (word) {
    const h = 92;
    const w = (word.naturalWidth / word.naturalHeight) * h || 360;
    ctx.drawImage(word, x + 102, y - 6, w, h);
  } else {
    ctx.font = "900 60px Archivo, sans-serif";
    ctx.fillText("Soiffard", x + 108, y + 64);
  }
}

async function fonts() {
  try {
    await Promise.all([document.fonts.load("900 60px Archivo"), document.fonts.load("800 60px Archivo"), document.fonts.load("600 40px Inter")]);
  } catch {}
}

async function drawMap(ctx, o, x, y, w, h, withTiles) {
  ctx.save();
  rr(ctx, x, y, w, h, 48);
  ctx.clip();
  ctx.fillStyle = "#14171B";
  ctx.fillRect(x, y, w, h);
  const pts = [...(o.track || []), ...(o.visits || [])];
  if (pts.length) {
    const v = L.fitView(pts, w, h, 70, 18);
    const x0 = v.cx - w / 2;
    const y0 = v.cy - h / 2;
    if (withTiles) {
      const n = 2 ** v.z;
      const jobs = [];
      ctx.filter = "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.5)";
      for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w) / 256); tx++)
        for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + h) / 256); ty++) {
          if (ty < 0 || ty >= n) continue;
          const wx = ((tx % n) + n) % n;
          jobs.push(
            loadImg(tileUrl(v.z, wx, ty)).then((img) => {
              if (img) ctx.drawImage(img, x + tx * 256 - x0, y + ty * 256 - y0, 256, 256);
            }),
          );
        }
      await Promise.all(jobs);
      ctx.filter = "none";
    }
    const P = (p) => [x + L.lonToX(p.lon, v.z) - x0, y + L.latToY(p.lat, v.z) - y0];
    if ((o.track || []).length > 1) {
      ctx.strokeStyle = "#F5B83D";
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      o.track.forEach((p, i) => {
        const [px, py] = P(p);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
    for (const s of o.visits || []) {
      const [px, py] = P(s);
      ctx.fillStyle = "#121418";
      ctx.strokeStyle = "#F5B83D";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function outingCanvas(o, withTiles) {
  await fonts();
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#121418";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#F4F1EA";
  await drawBrand(ctx, 72, 78);
  ctx.fillStyle = "#9BA1AA";
  ctx.font = "600 38px Inter, sans-serif";
  ctx.textAlign = "right";
  const d = new Date(o.start);
  ctx.fillText(`${WEEKDAYS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MONTHS[d.getMonth()]}`, 1008, 136);
  ctx.textAlign = "left";
  ctx.fillStyle = "#F5B83D";
  ctx.font = "800 36px Inter, sans-serif";
  ctx.fillText("SORTIE TERMINÉE", 72, 270);
  ctx.fillStyle = "#F4F1EA";
  ctx.font = "900 96px Archivo, sans-serif";
  const yAfter = wrap(ctx, o.title || outingTitle(o), 72, 370, 936, 100, 3);
  const mapY = Math.max(470, yAfter - 40);
  await drawMap(ctx, o, 72, mapY, 936, 420, withTiles);
  const nBars = new Set((o.visits || []).map((v) => v.id)).size;
  const counter = (o.visits || []).reduce((s, v) => s + (v.seconds || 0), 0);
  const stats = [
    [L.fmtDur(counter || o.seconds), counter ? "au comptoir" : "de sortie"],
    [String(nBars), nBars > 1 ? "bars" : "bar"],
    [`${L.fmtKm(o.meters)} km`, "à pied"],
    [String(o.glasses || 0), (o.glasses || 0) > 1 ? "verres" : "verre"],
  ];
  let sy = mapY + 420 + 130;
  stats.forEach(([v, l], i) => {
    const x = 72 + (i % 2) * 486;
    const y = sy + Math.floor(i / 2) * 200;
    ctx.fillStyle = "#F4F1EA";
    ctx.font = "900 102px Archivo, sans-serif";
    ctx.fillText(v, x, y);
    ctx.fillStyle = "#9BA1AA";
    ctx.font = "600 36px Inter, sans-serif";
    ctx.fillText(l, x, y + 52);
  });
  let jy = sy + 400 + 20;
  ctx.fillStyle = "#DAD6CE";
  ctx.font = "600 38px Inter, sans-serif";
  jy = wrap(ctx, L.joke({ bars: nBars, seconds: o.seconds, meters: o.meters, glasses: o.glasses || 0 }), 72, jy, 936, 52, 3);
  ctx.font = "700 36px Inter, sans-serif";
  if (o.homeAt) {
    const h = new Date(o.homeAt);
    ctx.fillStyle = "#3DD68C";
    ctx.fillText(`✓ Bien rentré à ${h.getHours()} h ${String(h.getMinutes()).padStart(2, "0")}`, 72, 1840);
  }
  ctx.fillStyle = "#9BA1AA";
  ctx.textAlign = "right";
  ctx.fillText("apphero.cloud/26", 1008, 1840);
  ctx.textAlign = "left";
  return c;
}

const QUOTES = ["« Le tabouret a pris ma forme. »", "« Je ne bois pas, je m'entraîne. »", "« Mon cardio, c'est le zinc. »", "« Ici, c'est chez moi. Littéralement. »"];

async function crownCanvas(barName, top, meName) {
  await fonts();
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#F5B83D";
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = "#1A1206";
  await drawBrand(ctx, 72, 78);
  ctx.font = "600 38px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Semaine ${L.weekKey(Date.now()).slice(-2)}`, 1008, 136);
  ctx.textAlign = "center";
  ctx.save();
  ctx.translate(540 - 168, 260);
  ctx.scale(14, 14);
  ctx.fill(new Path2D(ICON.crown.match(/d="([^"]+)"/)[1]));
  ctx.fillRect(4, 19.5, 16, 1.6);
  ctx.restore();
  ctx.font = "800 40px Inter, sans-serif";
  ctx.fillText("KING OF THE BAR", 540, 640);
  ctx.font = "900 132px Archivo, sans-serif";
  let size = 132;
  while (ctx.measureText(barName).width > 960 && size > 64) {
    size -= 6;
    ctx.font = `900 ${size}px Archivo, sans-serif`;
  }
  ctx.fillText(barName, 540, 790);
  const king = top[0];
  ctx.font = "600 48px Inter, sans-serif";
  if (king) {
    const second = top[1];
    ctx.fillText(king.me && second ? `${king.pseudo} détrône ${second.pseudo} avec` : `${king.pseudo} règne avec`, 540, 920);
    ctx.font = "900 150px Archivo, sans-serif";
    ctx.fillText(L.fmtDur(king.seconds), 540, 1080);
    ctx.font = "600 48px Inter, sans-serif";
    ctx.fillText("au comptoir cette semaine", 540, 1150);
  } else {
    ctx.fillText("Couronne libre cette semaine.", 540, 960);
  }
  // Top 3
  const rows = top.slice(0, 3);
  if (rows.length) {
    ctx.fillStyle = "#1A1206";
    rr(ctx, 72, 1230, 936, 70 + rows.length * 76, 54);
    ctx.fill();
    ctx.textAlign = "left";
    rows.forEach((r, i) => {
      const y = 1300 + i * 76;
      ctx.fillStyle = i === 0 ? "#F5B83D" : "#B9B2A4";
      ctx.font = "900 44px Archivo, sans-serif";
      ctx.fillText(String(i + 1), 120, y);
      ctx.fillStyle = "#F4F1EA";
      ctx.font = "600 44px Inter, sans-serif";
      ctx.fillText(r.pseudo + (r.me ? " (moi)" : ""), 190, y);
      ctx.textAlign = "right";
      ctx.font = "800 44px Archivo, sans-serif";
      ctx.fillText(L.fmtDur(r.seconds), 960, y);
      ctx.textAlign = "left";
    });
  }
  ctx.fillStyle = "#1A1206";
  ctx.textAlign = "center";
  ctx.font = "italic 600 44px Inter, sans-serif";
  ctx.fillText(QUOTES[Math.floor(Math.random() * QUOTES.length)], 540, 1640);
  ctx.textAlign = "left";
  ctx.font = "700 36px Inter, sans-serif";
  ctx.fillText(king && king.pseudo === meName ? "Viens me la reprendre" : "Viens la prendre", 72, 1840);
  ctx.textAlign = "right";
  ctx.fillText("apphero.cloud/26", 1008, 1840);
  return c;
}

function toBlob(c) {
  return new Promise((resolve, reject) => {
    try {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

async function openShare(title, alt, file, text, make) {
  if (S.share?.url) URL.revokeObjectURL(S.share.url);
  S.share = { title, alt, file, text, url: null, blob: null };
  S.overlay = "share";
  renderOverlay();
  let blob;
  try {
    blob = await toBlob(await make(true));
  } catch {
    blob = await toBlob(await make(false)); // tuiles refusées : on dessine sans le fond de carte
  }
  if (S.overlay !== "share") return;
  S.share.blob = blob;
  S.share.url = URL.createObjectURL(blob);
  renderOverlay();
}

function shareOuting(o) {
  openShare("Ta sortie", `Carte de la sortie « ${o.title} »`, `soiffard-${o.id}.png`, `${o.title} sur Soiffard 🍻 https://apphero.cloud/26`, (tiles) => outingCanvas(o, tiles));
}

async function shareCrown(id) {
  const name = S.bars.find((b) => b.id === id)?.name || current?.checkin?.bar.name || rankBars().find((b) => b.id === id)?.name || "Mon bar";
  if (!S.rankData[id]) await loadBarTop(id);
  const top = S.rankData[id]?.top || [];
  openShare("La couronne", `Classement ${L.du(name)}`, `soiffard-couronne.png`, `King of the Bar ${L.au(name)} 👑 https://apphero.cloud/26`, () => crownCanvas(name, top, profile?.pseudo));
}

async function doShare() {
  const s = S.share;
  if (!s?.blob) return;
  const file = new File([s.blob], s.file, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: s.text });
    } catch {}
  } else {
    const a = document.createElement("a");
    a.href = s.url;
    a.download = s.file;
    a.click();
  }
}

async function safeHome() {
  const now = Date.now();
  if (current) {
    current.homeAt = now;
    saveCurrent();
  } else if (outings[0] && now - (outings[0].end || 0) < 6 * 3600e3) {
    outings[0].homeAt = now;
    store.set("outings", outings);
  }
  const text = `Bien rentré ! La couronne attendra demain. (${profile?.pseudo || "Soiffard"}, via Soiffard)`;
  if (navigator.share) {
    try {
      await navigator.share({ text });
      toast("Message envoyé. Bonne nuit !");
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }
  location.href = `sms:${isIOS ? "&" : "?"}body=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------- actions

const ACT = {
  go(el) {
    S.tab = el.dataset.tab;
    S.overlay = null;
    render();
    const target = el.dataset.scroll;
    if (target === "outings") $(".views").scrollTo({ top: $("#view-home h2.h2")?.offsetTop - 70 || 0, behavior: "smooth" });
    else if (target) document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
    else $(".views").scrollTo({ top: 0 });
    if (S.tab === "rank" && S.rankMode === "week") loadWeek();
  },
  close() {
    S.overlay = null;
    S.guideFixed = null;
    renderOverlay();
  },
  geo() {
    S.geoError = null;
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    startGeo();
    render();
  },
  "refresh-bars"() {
    maybeFetchBars(true);
    render();
  },
  guide(el) {
    startGeo();
    startCompass();
    S.guideFixed = el.dataset.id && el.closest(".bar-row, .near-big") ? el.dataset.id : null;
    S.guideIdx = 0;
    S.overlay = "guide";
    renderOverlay();
  },
  "guide-next"() {
    S.guideIdx++;
    renderOverlay();
  },
  "guide-nearest"() {
    S.guideFixed = null;
    S.guideIdx = 0;
    renderOverlay();
  },
  checkin(el) {
    const b = S.bars.find((x) => x.id === el.dataset.id);
    if (!b) return;
    checkIn(b);
    S.overlay = null;
    S.tab = "record";
    render();
  },
  checkout() {
    checkOut();
  },
  start() {
    startOuting();
    render();
  },
  finish() {
    finishOuting();
  },
  glass(el) {
    if (!current) return;
    current.glasses = Math.max(0, current.glasses + Number(el.dataset.d));
    saveCurrent();
    render();
  },
  radius(el) {
    S.radius = Number(el.dataset.r);
    render();
  },
  "rank-mode"(el) {
    S.rankMode = el.dataset.m;
    render();
    if (S.rankMode === "week") loadWeek();
  },
  "share-outing"(el) {
    const o = outings.find((x) => x.id === el.dataset.id);
    if (o) shareOuting(o);
  },
  "share-crown"(el) {
    shareCrown(el.dataset.id);
  },
  "do-share"() {
    doShare();
  },
  "delete-outing"(el) {
    const id = el.dataset.id;
    if (S.confirmDelete === id) {
      outings = outings.filter((o) => o.id !== id);
      store.set("outings", outings);
      S.confirmDelete = null;
    } else S.confirmDelete = id;
    render();
  },
  "home-sheet"() {
    S.overlay = "home";
    renderOverlay();
  },
  "safe-home"() {
    safeHome();
  },
  "home-here"() {
    if (!S.pos) return toast("Position inconnue pour l'instant.");
    profile.home = { label: "Position enregistrée", lat: +S.pos.lat.toFixed(5), lon: +S.pos.lon.toFixed(5) };
    store.set("profile", profile);
    toast("Maison enregistrée. Bon retour !");
    render();
  },
  "save-settings"() {
    const pseudo = $("#f-pseudo").value.trim().slice(0, 20);
    if (pseudo.length >= 2) profile.pseudo = pseudo;
    const home = $("#f-home").value.trim();
    if (home && home !== profile.home?.label) profile.home = { label: home.slice(0, 120) };
    if (!home && profile.home && profile.home.lat == null) profile.home = null;
    profile.taxi = $("#f-taxi").value.trim().slice(0, 30);
    store.set("profile", profile);
    toast("C'est enregistré.");
    render();
  },
  wipe() {
    if (S.confirmDelete !== "wipe") {
      S.confirmDelete = "wipe";
      return render();
    }
    for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k);
    location.reload();
  },
  menu() {
    S.overlay = "menu";
    renderOverlay();
  },
  fiche() {
    document.documentElement.classList.toggle("show-fiche");
    S.overlay = null;
    renderOverlay();
  },
  "dismiss-lost"() {
    S.lostCrown = null;
    render();
  },
  "hide-install"() {
    store.set("installHidden", true);
    render();
  },
  async install() {
    const p = S.installPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice.catch(() => {});
    S.installPrompt = null;
    render();
  },
  "onb-go"() {
    const pseudo = ($("#onb-pseudo").value || "").trim().slice(0, 20);
    profile = { id: L.randomId(24), pseudo: pseudo.length >= 2 ? pseudo : L.randomPseudo(), home: null, taxi: "" };
    store.set("profile", profile);
    S.overlay = null;
    startGeo();
    startCompass();
    render();
  },
};

async function loadWeek() {
  try {
    S.weekData = await api("/week");
  } catch (e) {
    S.weekData = { error: e.message, top: [] };
  }
  if (S.tab === "rank") render();
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tabs [data-tab]");
  if (tab) {
    ACT.go(tab);
    return;
  }
  const el = e.target.closest("[data-act]");
  if (!el || el.tagName === "SELECT") return;
  const fn = ACT[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "rank-pick") {
    S.rankBar = e.target.value;
    render();
  }
  if (e.target.id === "f-theme") {
    setTheme(e.target.value || null);
    applyTheme();
    render();
  }
});

$("#btn-menu").addEventListener("click", () => ACT.menu());

// Titre mousseux : SVG inline pour animer les bulles ; la mousse gigote au toucher.
let wmSvg = null;
let wmSeq = 0;
function paintWordmarks(root = document) {
  if (!wmSvg) return;
  root.querySelectorAll("[data-wm]").forEach((el) => {
    if (!el.querySelector("svg")) el.innerHTML = wmSvg.replaceAll("wmX-", `wm${++wmSeq}-`);
  });
}
fetch("wordmark.svg")
  .then((r) => (r.ok ? r.text() : Promise.reject()))
  .then((t) => {
    wmSvg = t;
    paintWordmarks();
  })
  .catch(() => {});
new MutationObserver(() => paintWordmarks($("#overlay"))).observe($("#overlay"), { childList: true });
document.addEventListener("click", (e) => {
  const svgEl = e.target.closest?.(".wm")?.querySelector("svg");
  if (!svgEl) return;
  svgEl.classList.remove("wobble");
  void svgEl.getBoundingClientRect();
  svgEl.classList.add("wobble");
  try {
    navigator.vibrate?.(12);
  } catch {}
});
$("#btn-theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(next);
  applyTheme();
  render();
});
$("#fab-bar").addEventListener("click", (e) => ACT.guide(e.currentTarget));
$("#fab-home").addEventListener("click", () => ACT["home-sheet"]());

// Le thème est gardé en texte brut : le script du <head> le lit avant l'affichage.
function getTheme() {
  try {
    const t = localStorage.getItem(KEY + "theme");
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}
function setTheme(t) {
  try {
    if (t) localStorage.setItem(KEY + "theme", t);
    else localStorage.removeItem(KEY + "theme");
  } catch {}
}
function applyTheme() {
  const h = new Date().getHours();
  document.documentElement.dataset.theme = getTheme() || (h >= 8 && h < 19 ? "light" : "dark");
  document.querySelector('meta[name="theme-color"]').content = document.documentElement.dataset.theme === "dark" ? "#121418" : "#F6F4EF";
}

// ---------------------------------------------------------------- démarrage

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  S.installPrompt = e;
  if (S.tab === "home") render();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (current) keepAwake();
    render();
  }
});
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  live();
}, 1000);
setInterval(() => {
  if (document.visibilityState === "visible") fetchCrowns();
}, 5 * 60e3);

if (!document.documentElement.classList.contains("desk")) {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  applyTheme();
  if (current) document.documentElement.classList.add("recording");
  if (!profile) S.overlay = "onb";
  else {
    startGeo();
    fetchCrowns();
    if (current) keepAwake();
  }
  render();
}
