// Le rideau avant le lancement : compte à rebours jusqu'au mercredi 18 novembre à 18 h.
// À zéro : « Tchin ! », les ampoules s'allument, puis la page bascule sur l'accueil.
// Le code Konami ouvre la saisie du code organisateur (aperçu du vrai site avant l'heure).
import "@fontsource/bagel-fat-one/400.css";
import "@fontsource/rubik/700.css";
import "@fontsource/rubik/800.css";
import "./styles.css";
import { LAUNCH_AT } from "../../shared/calendar.js";
import { initTeaser } from "./teaser.js";

const $ = (id) => document.getElementById(id);
const TARGET = Date.parse(LAUNCH_AT);
let offset = 0; // décalage entre l'horloge du serveur et celle du visiteur

// Les ampoules autour de l'écran, en chenillard.
function drawBulbs() {
  const w = innerWidth, h = innerHeight, m = 18, step = innerWidth < 600 ? 34 : 46;
  const pts = [];
  const nx = Math.max(2, Math.round((w - 2 * m) / step)), ny = Math.max(2, Math.round((h - 2 * m) / step));
  for (let i = 0; i <= nx; i++) pts.push([m + (i * (w - 2 * m)) / nx, m], [m + (i * (w - 2 * m)) / nx, h - m]);
  for (let j = 1; j < ny; j++) pts.push([m, m + (j * (h - 2 * m)) / ny], [w - m, m + (j * (h - 2 * m)) / ny]);
  $("bulbs").innerHTML = pts
    .map(([x, y]) => {
      const k = Math.round(((Math.atan2(y - h / 2, x - w / 2) + Math.PI) / (2 * Math.PI)) * 60);
      return `<i data-k="${k % 3}" style="left:${x}px;top:${y}px"></i>`;
    })
    .join("");
}
drawBulbs();
addEventListener("resize", drawBulbs);
let phase = 0;
const chase = setInterval(() => {
  phase = (phase + 1) % 3;
  $("bulbs").dataset.phase = phase;
}, 160);

// L'heure du serveur (en-tête Date), pour ne pas dépendre de l'horloge du téléphone.
fetch("/api/state", { cache: "no-store" })
  .then((r) => {
    const d = Date.parse(r.headers.get("date"));
    if (d) offset = d - Date.now();
  })
  .catch(() => {});

const pad = (n) => String(n).padStart(2, "0");
let done = false;
function tickCount() {
  const left = Math.max(0, TARGET - (Date.now() + offset));
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  $("u-d").hidden = d === 0;
  $("c-d").textContent = d;
  $("u-d").querySelector("small").textContent = d > 1 ? "jours" : "jour";
  $("c-h").textContent = pad(Math.floor((s % 86400) / 3600));
  $("c-m").textContent = pad(Math.floor((s % 3600) / 60));
  $("c-s").textContent = pad(s % 60);
  document.title = left ? `${d ? d + " j " : ""}${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)} · Apphéro` : "Tchin ! · Apphéro";
  if (!left && !done) launch();
}
tickCount();
const timer = setInterval(tickCount, 250);

// Zéro : Tchin ! puis on attend que le serveur ouvre le site, et on y va.
async function launch() {
  done = true;
  clearInterval(timer);
  clearInterval(chase);
  document.body.classList.add("is-open");
  $("kicker").innerHTML = "C'est parti !";
  $("count").innerHTML = `<div class="rc-tchin">Tchin !</div>`;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, i ? 1500 : 2500));
    try {
      const r = await fetch("/", { cache: "no-store" });
      if (!r.headers.get("x-apphero-rideau")) return location.replace("/");
    } catch {
      /* on réessaie */
    }
  }
  location.replace("/");
}

// « Me prévenir » : un rendez-vous d'agenda pour le lancement.
$("remind").addEventListener("click", () => {
  const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apphero//Rideau//FR", "BEGIN:VEVENT",
    `UID:lancement-${TARGET}@apphero.cloud`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(TARGET)}`, `DTEND:${stamp(TARGET + 15 * 60000)}`,
    "SUMMARY:Apphéro : c'est parti !", "DESCRIPTION:30 jours\\, 30 apps\\, 30 défis. Première app à 18 h.", "URL:https://apphero.cloud/",
    "BEGIN:VALARM", "TRIGGER:-PT5M", "ACTION:DISPLAY", "DESCRIPTION:Apphéro ouvre dans 5 minutes", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "apphero-lancement.ics";
  a.click();
  window.ahTrack?.("rideau_rappel");
});

// Code Konami : ↑ ↑ ↓ ↓ ← → ← → B A.
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let pos = 0;
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  pos = k === KONAMI[pos] ? pos + 1 : k === KONAMI[0] ? 1 : 0;
  if (pos === KONAMI.length) {
    pos = 0;
    $("admin").hidden = false;
    $("token").focus();
  }
});
// Sur téléphone (pas de flèches) : 7 touchers rapides sur le logo.
let taps = [];
document.querySelector(".rideau-logo").addEventListener("click", () => {
  const t = Date.now();
  taps = [...taps.filter((x) => t - x < 2500), t];
  if (taps.length >= 7) {
    taps = [];
    $("admin").hidden = false;
    $("token").focus();
  }
});
$("admin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("token").value.trim();
  if (!token) return;
  const r = await fetch("/api/admin/preview", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  if (r?.ok) {
    try {
      localStorage.setItem("apphero_admin_token", token);
    } catch {
      /* stockage indisponible */
    }
    location.replace("/");
  } else $("admin-msg").textContent = "Code incorrect.";
});

initTeaser("rideau");
