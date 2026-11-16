// Outils partagés par l'accueil et la roue.
import { CHALLENGE_END } from "../../shared/calendar.js";
// Polices hébergées avec le site : aucune requête vers Google Fonts.
import "@fontsource/bagel-fat-one/400.css";
import "@fontsource/rubik/500.css";
import "@fontsource/rubik/700.css";
import "@fontsource/rubik/800.css";
import "./styles.css";

// Le compte X du défi.
export const X_URL = "https://x.com/ZeroE24661";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* réponse vide */
  }
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cloudflare Turnstile, chargé seulement au moment de voter.
let tsReady;
export async function turnstileToken(siteKey) {
  if (!siteKey) return "";
  tsReady ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Vérification anti-robot indisponible."));
    document.head.append(s);
  });
  await tsReady;
  let box = document.querySelector(".ts-box");
  if (!box) {
    box = document.createElement("div");
    box.className = "ts-box";
    document.body.append(box);
  }
  return new Promise((resolve, reject) => {
    box.innerHTML = "";
    window.turnstile.render(box, {
      sitekey: siteKey,
      appearance: "interaction-only",
      language: "fr",
      callback: (token) => {
        resolve(token);
        setTimeout(() => (box.innerHTML = ""), 50);
      },
      "error-callback": () => reject(new Error("Vérification anti-robot échouée, réessaie.")),
    });
  });
}

// Petite pluie de confettis dans un conteneur positionné.
export function confetti(container) {
  if (reducedMotion()) return;
  const colors = ["#FF3D9A", "#25D0E8", "#7CF2B0", "#FFD83D", "#B9A3FF"];
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 110 + Math.random() * 90;
    const s = document.createElement("span");
    s.style.background = colors[i % colors.length];
    s.style.setProperty("--dx", `${Math.round(Math.cos(a) * r)}px`);
    s.style.setProperty("--dy", `${Math.round(Math.sin(a) * r)}px`);
    s.style.setProperty("--rt", `${i * 53}deg`);
    layer.append(s);
  }
  container.append(layer);
  setTimeout(() => layer.remove(), 1400);
}

// Footer commun à toutes les pages : <footer class="footer" data-footer></footer>
function renderFooter() {
  const el = document.querySelector("[data-footer]");
  if (!el) return;
  const colors = ["var(--yellow)", "var(--pink)", "var(--cyan)", "var(--mint)", "var(--lilac)", "var(--orange)", "var(--yellow)"];
  const logo = [..."APPHÉRO"].map((ch, i) => `<span style="--i:${i};--c:${colors[i]}">${ch}</span>`).join("");
  const band = "18 H PILE ◆ L'API HOUR ◆ UNE APP PAR JOUR ◆ SERVIE FRAÎCHE ◆ CODE LIBRE ◆ ";
  el.innerHTML = `
    <div class="footer-band" aria-hidden="true"><div class="marquee-track"><span>${band.repeat(2)}</span><span>${band.repeat(2)}</span></div></div>
    <span class="shape circle" style="left:2%;bottom:14%" aria-hidden="true"></span>
    <span class="shape tri" style="right:3%;bottom:10%;animation-delay:-2s" aria-hidden="true"></span>
    <span class="shape square" style="left:52%;top:26%;animation-delay:-4s" aria-hidden="true"></span>
    <span class="shape zig" style="left:40%;bottom:16%;animation-delay:-1s" aria-hidden="true"></span>
    <div class="footer-inner">
      <div class="footer-main">
        <p class="footer-logo" aria-label="Apphéro">${logo}</p>
        <p class="footer-pun">Une app par jour, servie à 18 h. Ici, la happy hour s'appelle <b>l'API hour</b>.</p>
      </div>
      <div class="footer-side">
        <div class="footer-clock" aria-hidden="true">18h<small>TCHIN !</small></div>
        <nav class="footer-links" aria-label="Liens du pied de page">
          <a href="/#apps">Les apps</a>
          <a href="/roue/">La roue</a>
          <a href="${X_URL}" rel="noopener">Suivre sur X</a>
          <a href="https://github.com/Naod6473/AppHero" rel="noopener">Le code</a>
          <a href="/mentions-legales/">Mentions légales</a>
        </nav>
      </div>
    </div>
    <p class="footer-small">Pas de pub, pas de compte, des stats maison sans cookie. Juste des apps. · <a href="/mentions-legales/">Mentions légales et confidentialité</a></p>`;
}
renderFooter();

// Mesure d'audience maison, sans cookie (voir /t.js). Ne fait rien si le script n'est pas chargé.
export function track(name, props) {
  try {
    window.ahTrack?.(name, props);
  } catch {
    /* jamais bloquant */
  }
}

// Partager une app : menu de partage du téléphone, sinon copie du lien court.
export async function shareApp(app) {
  const url = `${location.origin}/${app.id}`;
  const data = { title: `${app.title} · Apphéro`, text: `${app.title} : ${app.tagline} (app ${app.num}/30 d'Apphéro, une app par jour à 18 h)`, url };
  track("partage", { app: app.id });
  try {
    if (navigator.share) return await navigator.share(data);
  } catch (err) {
    if (err?.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(`Lien copié : ${url}`);
  } catch {
    toast(url);
  }
}

// Easter egg : le code Konami, ou 5 clics rapides sur le logo, lancent le « mode apéro ».
function aperoMode() {
  if (document.querySelector(".apero-rain")) return;
  track("easter_egg");
  toast("🥂 Mode apéro activé ! Santé !");
  if (reducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "apero-rain";
  layer.setAttribute("aria-hidden", "true");
  const items = ["🫒", "🫧", "🍋", "🧀", "🥨", "🫒", "🫧", "🍹"];
  for (let i = 0; i < 46; i++) {
    const s = document.createElement("span");
    s.textContent = items[i % items.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 2.2}s`;
    s.style.animationDuration = `${2.6 + Math.random() * 2}s`;
    s.style.fontSize = `${22 + Math.random() * 26}px`;
    layer.append(s);
  }
  document.body.append(layer);
  document.body.classList.add("is-apero");
  setTimeout(() => {
    layer.remove();
    document.body.classList.remove("is-apero");
  }, 7000);
}
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
let konami = 0;
addEventListener("keydown", (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  konami = k === KONAMI[konami] ? konami + 1 : k === KONAMI[0] ? 1 : 0;
  if (konami === KONAMI.length) {
    konami = 0;
    aperoMode();
  }
});
let logoClicks = [];
document.addEventListener("click", (e) => {
  if (!e.target.closest(".logo")) return;
  const t = Date.now();
  logoClicks = logoClicks.filter((x) => t - x < 2000).concat(t);
  if (logoClicks.length >= 5) {
    e.preventDefault();
    logoClicks = [];
    aperoMode();
  } else if (logoClicks.length > 1) e.preventDefault(); // on reste sur la page pendant qu'on clique
});

// Après le verdict de la finale, le lien vers le bilan apparaît dans le menu.
if (Date.now() >= Date.parse(CHALLENGE_END)) {
  const nav = document.querySelector(".nav-links");
  if (nav && !nav.querySelector('[href="/bilan/"]')) nav.insertAdjacentHTML("afterbegin", '<a href="/bilan/">Le bilan 🏆</a>');
}
