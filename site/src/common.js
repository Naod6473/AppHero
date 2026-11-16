// Outils partagés par l'accueil et la roue.
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
