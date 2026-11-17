// Révélation animée des critères des 30 cases, pour filmer une vidéo 9:16.
// Avant le lancement (18/11 18 h), les critères ne sont visibles qu'avec le code organisateur.
import { api, esc } from "./common.js";
import { DAYS, fmtShort } from "../../shared/calendar.js";
import { CRITERIA, criterionLabel } from "../../shared/criteria.js";

const KEY = "apphero_admin_token";
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = { criteria: null, running: false, fast: false };

try {
  $("token").value = localStorage.getItem(KEY) || "";
} catch {
  /* stockage indisponible */
}

// Les 30 cartes, face cachée.
function drawGrid() {
  $("grid").innerHTML = DAYS.map(
    (d) => `<div class="tcard" id="c${d.id}"><div class="tcard-in">
      <div class="tcard-back"><b>${d.id}</b><small>${esc(fmtShort(d.date))}</small></div>
      <div class="tcard-front"></div>
    </div></div>`,
  ).join("");
}

function parts(c) {
  return [c, ...(c.extra || [])].map((x) => ({ ...CRITERIA[x.key], text: criterionLabel(x) }));
}

function fillFront(d, c) {
  const p = parts(c);
  const el = $(`c${d.id}`);
  el.style.setProperty("--bg", p[0].color);
  el.querySelector(".tcard-front").innerHTML = `<span class="tcard-num">${d.id}</span><span class="tcard-emo${p.length > 1 ? " is-multi" : ""}">${p.map((x) => x.emoji).join("")}</span>
    <span class="tcard-name">${esc(p[0].name)}</span><small>${esc(fmtShort(d.date))}</small>`;
}

function bigCard(d, c) {
  const p = parts(c);
  return `<small>APP ${d.id} · ${esc(fmtShort(d.date).toUpperCase())}</small>
    <span class="tbig-emo">${p.map((x) => x.emoji).join(" ")}</span>
    <strong>${esc(p[0].text)}</strong>
    ${p.length > 1 ? `<em>${p.slice(1).map((x) => `+ ${esc(x.text)}`).join("<br>")}</em>` : `<em>${esc(p[0].blurb)}</em>`}`;
}

async function load() {
  const token = $("token").value.trim();
  const st = await api("/api/state", token ? { headers: { authorization: `Bearer ${token}` } } : {});
  if (!st.criteria || !Object.keys(st.criteria).length) throw new Error("Critères pas encore révélés : entre le code organisateur.");
  if (token) {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* rien */
    }
  }
  S.criteria = st.criteria;
}

async function run() {
  if (S.running) return;
  $("status").textContent = "";
  try {
    await load();
  } catch (err) {
    $("status").textContent = err.message || "Impossible de charger le tirage.";
    return;
  }
  S.running = true;
  drawGrid();
  $("stage").classList.remove("is-done");
  $("sub").textContent = "Sinon, ce serait trop simple.";
  await wait(S.fast ? 300 : 1400);
  for (const d of DAYS) {
    const c = S.criteria[d.id];
    if (!c) continue;
    const card = $(`c${d.id}`);
    fillFront(d, c);
    card.classList.add("is-shaking");
    await wait(S.fast ? 80 : 450);
    // La grande carte se retourne au centre, puis la petite dans la grille.
    $("big").innerHTML = bigCard(d, c);
    $("big").style.setProperty("--bg", CRITERIA[c.key].color);
    $("spot").hidden = false;
    $("spot").classList.remove("is-out");
    void $("spot").offsetWidth;
    $("spot").classList.add("is-in");
    await wait(S.fast ? 260 : 1500);
    $("spot").classList.add("is-out");
    card.classList.remove("is-shaking");
    card.classList.add("is-flipped");
    await wait(S.fast ? 120 : 380);
    $("spot").hidden = true;
    $("spot").classList.remove("is-in", "is-out");
  }
  $("stage").classList.add("is-done");
  $("sub").textContent = "Premier défi ce soir à 18 h.";
  S.running = false;
}

$("go").addEventListener("click", run);
$("fast").addEventListener("click", () => {
  S.fast = !S.fast;
  $("fast").setAttribute("aria-pressed", String(S.fast));
});
$("hide").addEventListener("click", () => ($("controls").hidden = true));
// Touche H : afficher ou masquer les boutons pendant l'enregistrement. Espace : lancer.
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "h" || e.key === "H") $("controls").hidden = !$("controls").hidden;
  if (e.key === " ") {
    e.preventDefault();
    run();
  }
});
drawGrid();
