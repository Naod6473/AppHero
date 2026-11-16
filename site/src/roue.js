// Page de la roue : public (revoir les tirages), studio privé (tourner, publier), enregistrement.
import { api, esc, toast, reducedMotion, track, confetti } from "./common.js";
import CRITERES from "../../shared/criteres.json";
import { WHEEL_DAYS, fmtShort } from "../../shared/calendar.js";

const SLICES = 20;
const STEP = 360 / SLICES;
const DURATION = 3600;
const AI_IDEA = "Idée de l'IA";
const TOKEN_KEY = "apphero_admin_token";

const $ = (id) => document.getElementById(id);
const studioAllowed = new URLSearchParams(location.search).has("studio");

const S = {
  angle: 0,
  spinning: false,
  slices: sample(),
  draws: [],
  current: null, // tirage affiché (publié ou en cours dans le studio)
  pending: null, // tirage du studio pas encore publié
  mode: "public",
  sound: true,
  rec: false,
};

function sample() {
  const a = CRITERES.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, SLICES);
}

const slotLabel = (forDay) => fmtShort(forDay);

// Un emoji par critère, pour lire la roue d'un coup d'œil.
const EMOJI = {
  "App utile": "🧰", "2 heures chrono": "⏱️", "Idée de l'IA": "🤖", "Inutile & beau": "🦄", "Un seul fichier": "📄", "Sans clavier": "🚫", "Zéro dépendance": "🪶",
  "Pour un pote": "🤝", "Avec du son": "🔊", "À deux joueurs": "🎮", "Hors ligne": "📴", "Avec une carte": "🗺️", "Selon l'heure": "🕰️", "Éphémère 24 h": "⏳",
  "Noir et blanc": "🖤", "Sans texte": "🙊", "Qui parle": "🗣️", "API publique": "🔌", "Mono-couleur": "🎨", "Remix": "🔁", "Un seul bouton": "🔘", "Sans serveur": "☁️",
  "100 lignes max": "💯", "Pour les chats": "🐱", "Contre la montre": "🏁", "En pixel art": "👾", "Avec un timer": "⏲️", "Qui se partage": "📤", "Sans souris": "🐭",
  "Pour mamie": "👵", "Qui compte": "🔢", "Qui dessine": "✏️", "Au hasard": "🎲", "Météo du jour": "🌦️", "Avec la caméra": "📷", "Avec le micro": "🎤", "Qui secoue": "📳",
  "Sur mobile only": "📱", "Qui note": "📝", "Qui traduit": "🌍", "Qui chronomètre": "⏱", "Qui se souvient": "🧠", "Qui blague": "😂", "Une seule page": "📃",
  "Que des formes": "🔺", "Que du texte": "🔤", "Qui recommande": "👍", "En 3 couleurs": "🚦", "Qui s'installe": "📲", "Qui explose": "💥", "Pour le bureau": "💼",
  "Pour le week-end": "🏖️", "Pour les devs": "👩‍💻", "Pour les enfants": "🧸", "Qui rime": "🎵", "Qui trie": "🗂️", "Qui classe": "🏆", "Qui devine": "🔮", "Qui calcule": "🧮",
  "Qui conseille": "💡",
};
const emojiOf = (label) => EMOJI[label] || "✨";

// ------------------------------------------------------------ dessin

function drawFace() {
  $("wheel-face").innerHTML = S.slices
    .map((label, i) => `<div class="wheel-label" style="transform:rotate(${i * STEP + STEP / 2}deg)"><span>${esc(label)} <i>${emojiOf(label)}</i></span></div>`)
    .join("");
}

// Les ampoules autour de la roue, façon plateau télé.
function drawLights() {
  const n = 28;
  $("wheel-lights").innerHTML = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return `<i style="left:${50 + 52.5 * Math.sin(a)}%;top:${50 - 52.5 * Math.cos(a)}%"></i>`;
  }).join("");
}

// La grande carte qui se retourne quand la roue s'arrête.
let revealTimer;
function reveal(d) {
  const isIdea = d.label === AI_IDEA;
  $("reveal-card").innerHTML = `<small>${isIdea ? "IDÉE D'APP" : "CRITÈRE"} · ${esc(slotLabel(d.forDay).toUpperCase())}</small>
    <span class="reveal-emo" aria-hidden="true">${emojiOf(d.label)}</span>
    <strong>${esc(d.label)}</strong>`;
  const box = $("reveal");
  box.hidden = false;
  box.classList.remove("is-in");
  void box.offsetWidth;
  box.classList.add("is-in");
  confetti($("wheel"));
  clearTimeout(revealTimer);
  revealTimer = setTimeout(hideReveal, S.rec ? 6000 : 4500);
}
function hideReveal() {
  clearTimeout(revealTimer);
  $("reveal").hidden = true;
}
function setAngle(a) {
  S.angle = a;
  $("wheel-rot").style.transform = `rotate(${a}deg)`;
}

function showResult(sub, title, idea) {
  $("result-sub").textContent = sub;
  $("result-title").textContent = title;
  const p = $("result-idea");
  p.hidden = !idea;
  p.textContent = idea || "";
}

function resultFor(d) {
  const isIdea = d.label === AI_IDEA;
  const sub = `${isIdea ? "IDÉE D'APP" : "CRITÈRE"} POUR LE ${slotLabel(d.forDay).toUpperCase()}`;
  return [sub, d.label, d.idea];
}

function nextSlot() {
  const done = new Set(S.draws.map((d) => d.forDay));
  return WHEEL_DAYS.find((w) => !done.has(w.forDay)) || null;
}

function idleResult() {
  const latest = S.draws[0];
  if (S.mode === "public" && latest) return showResult(...resultFor(latest));
  const n = S.mode === "studio" ? WHEEL_DAYS.find((w) => w.forDay === $("slot").value) : nextSlot();
  showResult(n ? `PROCHAIN TIRAGE : ${slotLabel(n.drawOn).toUpperCase()} AU SOIR` : "TOUS LES TIRAGES SONT FAITS", "Prête à tourner");
}

// ------------------------------------------------------------ son

let ac;
function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac ||= new AC();
  if (ac.state === "suspended") ac.resume();
  return ac;
}
function tick() {
  if (!S.sound || !ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "triangle";
  o.frequency.value = 880 + Math.random() * 160;
  g.gain.setValueAtTime(0.0001, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.22, ac.currentTime + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.05);
}
function ding() {
  if (!S.sound || !ac) return;
  [660, 990].forEach((f, i) => {
    const t = ac.currentTime + i * 0.12;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.75);
  });
}

// ------------------------------------------------------------ rotation

function runSpin(k) {
  return new Promise((resolve) => {
    audio();
    const start = S.angle;
    const end = Math.ceil(start / 360) * 360 + 360 * 4 + (360 - (k * STEP + STEP / 2));
    S.spinning = true;
    hideReveal();
    $("wheel").classList.add("is-spinning");
    syncButtons();
    showResult("LA ROUE TOURNE…", "…");
    if (reducedMotion()) {
      setAngle(end);
      S.spinning = false;
      $("wheel").classList.remove("is-spinning");
      ding();
      syncButtons();
      return resolve();
    }
    const t0 = performance.now();
    let last = -1;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / DURATION);
      const e = 1 - Math.pow(1 - p, 3);
      const ang = start + (end - start) * e;
      const idx = Math.floor(((360 - (ang % 360)) % 360) / STEP);
      if (idx !== last) {
        if (last !== -1) {
          tick();
          const ptr = $("wheel-pointer");
          ptr.classList.remove("flick");
          void ptr.getBoundingClientRect();
          ptr.classList.add("flick");
        }
        last = idx;
      }
      setAngle(ang);
      if (p < 1) requestAnimationFrame(step);
      else {
        S.spinning = false;
        $("wheel").classList.remove("is-spinning");
        ding();
        syncButtons();
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

async function replay(d) {
  if (!studioAllowed) track("roue_revoir", { day: d?.forDay || "" });
  if (S.spinning) return;
  S.current = d;
  S.slices = d.slices.slice();
  drawFace();
  await runSpin(d.k);
  showResult(...resultFor(d));
  reveal(d);
}

async function studioSpin() {
  if (S.spinning) return;
  const forDay = $("slot").value;
  const k = Math.floor(Math.random() * SLICES);
  await runSpin(k);
  S.pending = { forDay, slices: S.slices.slice(), k, label: S.slices[k], idea: null };
  showResult(...resultFor(S.pending));
  reveal(S.pending);
  $("publish-box").hidden = false;
  $("idea-field").hidden = S.pending.label !== AI_IDEA;
  $("rec-label").textContent = `APPHÉRO · tirage pour le ${slotLabel(forDay)}`;
}

async function publish() {
  if (!S.pending) return;
  const token = $("token").value.trim();
  if (!token) return toast("Entre le code organisateur.");
  if (S.draws.some((d) => d.forDay === S.pending.forDay) && !confirm("Un tirage existe déjà pour ce jour. Le remplacer ?")) return;
  const body = { ...S.pending, idea: S.pending.label === AI_IDEA ? $("idea").value : null };
  try {
    await api("/api/admin/draws", { method: "POST", body: JSON.stringify(body), headers: { authorization: `Bearer ${token}` } });
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* stockage indisponible */
    }
    toast(`Tirage publié pour le ${slotLabel(body.forDay)} !`);
    S.pending = null;
    $("publish-box").hidden = true;
    $("idea").value = "";
    await loadDraws();
    fillSlots();
  } catch (err) {
    toast(err.message);
  }
}

// ------------------------------------------------------------ interface

function syncButtons() {
  for (const id of ["spin", "shuffle", "rec-spin", "publish"]) $(id).disabled = S.spinning;
  $("replay").disabled = S.spinning;
  $("replay").hidden = !S.draws.length;
  document.querySelectorAll(".door[data-replay]").forEach((b) => (b.disabled = S.spinning));
}

function setMode(mode) {
  S.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  $("public-controls").hidden = mode !== "public" || S.rec;
  $("studio").hidden = mode !== "studio" || S.rec;
  if (mode === "studio") {
    if (!S.pending) {
      S.slices = sample();
      drawFace();
    }
  } else if (S.draws[0]) {
    S.slices = S.draws[0].slices.slice();
    drawFace();
    setAngle(360 - (S.draws[0].k * STEP + STEP / 2));
  }
  if (!S.pending || mode === "public") idleResult();
}

function setRec(on) {
  S.rec = on;
  document.body.classList.toggle("is-rec", on);
  document.querySelectorAll(".js-ui").forEach((el) => (el.hidden = on));
  $("rec-title").hidden = !on;
  $("rec-controls").hidden = !on;
  if (on) $("rec-label").textContent = `APPHÉRO · tirage pour le ${slotLabel($("slot").value)}`;
  setMode(S.mode);
}

// Le calendrier des 5 tirages : une porte par mercredi soir, ouverte une fois le tirage publié.
function renderHistory() {
  const byDay = new Map(S.draws.map((d, i) => [d.forDay, i]));
  $("history").innerHTML = WHEEL_DAYS.map((w, n) => {
    const i = byDay.get(w.forDay);
    const d = i == null ? null : S.draws[i];
    const head = `<span class="door-num">${n + 1}</span><span class="door-date">${esc(slotLabel(w.drawOn))} soir</span>`;
    if (!d) return `<div class="door is-closed">${head}<span class="door-lock" aria-hidden="true">🔒</span><span class="door-for">App du ${esc(slotLabel(w.forDay).toLowerCase())}</span></div>`;
    return `<button class="door is-open" type="button" data-replay="${i}" aria-label="Revoir le tirage du ${esc(slotLabel(w.forDay))} : ${esc(d.label)}">
      ${head}<span class="door-emo" aria-hidden="true">${emojiOf(d.label)}</span><b>${esc(d.label)}</b><span class="door-for">↻ Revoir</span></button>`;
  }).join("");
  const first = WHEEL_DAYS[0];
  $("replay-help").textContent = S.draws.length
    ? "Seul l'organisateur lance les tirages. Toi, tu peux les revoir."
    : `Premier tirage le ${slotLabel(first.drawOn).toLowerCase()} au soir, pour l'app du ${slotLabel(first.forDay).toLowerCase()}.`;
  syncButtons();
}

function fillSlots() {
  const done = new Set(S.draws.map((d) => d.forDay));
  const next = nextSlot();
  $("slot").innerHTML = WHEEL_DAYS.map(
    (w) =>
      `<option value="${w.forDay}" ${next && next.forDay === w.forDay ? "selected" : ""}>App du ${esc(slotLabel(w.forDay))} (tirage ${esc(slotLabel(w.drawOn).toLowerCase())} soir)${done.has(w.forDay) ? " · déjà tiré" : ""}</option>`,
  ).join("");
}

async function loadDraws() {
  try {
    const { draws } = await api("/api/draws");
    S.draws = draws;
  } catch {
    S.draws = [];
  }
  renderHistory();
}

$("replay").addEventListener("click", () => S.draws[0] && replay(S.draws[0]));
$("reveal").addEventListener("click", hideReveal);
$("history").addEventListener("click", (e) => {
  const b = e.target.closest("[data-replay]");
  if (b) replay(S.draws[Number(b.dataset.replay)]);
});
$("spin").addEventListener("click", studioSpin);
$("rec-spin").addEventListener("click", studioSpin);
$("shuffle").addEventListener("click", () => {
  if (S.spinning) return;
  S.slices = sample();
  S.pending = null;
  $("publish-box").hidden = true;
  drawFace();
  idleResult();
});
$("sound").addEventListener("click", (e) => {
  S.sound = !S.sound;
  e.currentTarget.setAttribute("aria-pressed", String(S.sound));
  e.currentTarget.textContent = S.sound ? "Son : oui" : "Son : non";
  e.currentTarget.classList.toggle("btn-mint", S.sound);
});
$("rec").addEventListener("click", () => setRec(true));
$("rec-quit").addEventListener("click", () => setRec(false));
$("publish").addEventListener("click", publish);
$("slot").addEventListener("change", () => {
  if (!S.pending) idleResult();
});
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

// ------------------------------------------------------------ démarrage

drawLights();
drawFace();
await loadDraws();
fillSlots();
if (studioAllowed) {
  $("modes").hidden = false;
  try {
    $("token").value = localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    /* stockage indisponible */
  }
}
setMode(studioAllowed ? "studio" : "public");
