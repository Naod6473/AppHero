// Le tirage en direct des 30 défis, à filmer pour X (format 9:16).
// 1. « Revue des défis » fait défiler toute la pioche. 2. « Tirer au sort » : le serveur tire et enregistre,
// puis les 30 boîtes s'ouvrent au hasard, chacune à la couleur de son défi. Le défi s'affiche au survol.
// Avant le lancement (18/11 18 h), tout passe par le code organisateur.
import { api, esc } from "./common.js";
import { DAYS, fmtShort } from "../../shared/calendar.js";
import { CRITERIA, criterionLabel } from "../../shared/criteria.js";

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = { criteria: null, busy: false };

const token = () => $("token").value.trim();
const auth = () => (token() ? { authorization: `Bearer ${token()}` } : {});

const parts = (c) => [c, ...(c.extra || [])].map((x) => ({ ...CRITERIA[x.key], text: criterionLabel(x) }));

// Les 30 boîtes fermées.
function drawGrid() {
  $("grid").innerHTML = DAYS.map(
    (d) => `<div class="tbox" id="b${d.id}" data-id="${d.id}">
      <div class="tbox-lid" aria-hidden="true"></div>
      <div class="tbox-body"><b>${d.id}</b><small>${esc(fmtShort(d.date))}</small></div>
    </div>`,
  ).join("");
}

function openBox(d, c, animate = true) {
  const p = parts(c);
  const el = $(`b${d.id}`);
  el.style.setProperty("--bg", p[0].color);
  el.querySelector(".tbox-body").innerHTML = `<span class="tbox-num">${d.id}</span><span class="tbox-emo${p.length > 1 ? " is-multi" : ""}">${p.map((x) => x.emoji).join("")}</span><small>${esc(fmtShort(d.date))}</small>`;
  el.setAttribute("aria-label", `App ${d.id}, ${fmtShort(d.date)} : ${p.map((x) => x.text).join(" + ")}`);
  el.classList.toggle("no-anim", !animate);
  el.classList.add("is-open");
}

// Le défi au survol d'une boîte ouverte.
$("grid").addEventListener("mouseover", (e) => {
  const box = e.target.closest(".tbox.is-open");
  if (!box || !S.criteria) return;
  const d = DAYS.find((x) => x.id === box.dataset.id);
  const p = parts(S.criteria[d.id]);
  $("tip").innerHTML = `<small>APP ${d.id} · ${esc(fmtShort(d.date).toUpperCase())}</small><strong>${p.map((x) => `${x.emoji} ${esc(x.text)}`).join("<br>")}</strong><span>${esc(p[0].blurb)}</span>`;
  $("tip").style.setProperty("--bg", p[0].color);
  const st = $("stage").getBoundingClientRect();
  const r = box.getBoundingClientRect();
  $("tip").hidden = false;
  const tw = $("tip").offsetWidth;
  const left = Math.min(Math.max(r.left + r.width / 2 - st.left - tw / 2, 8), st.width - tw - 8);
  $("tip").style.left = `${left}px`;
  $("tip").style.top = `${r.top - st.top - $("tip").offsetHeight - 10}px`;
});
$("grid").addEventListener("mouseleave", () => ($("tip").hidden = true));
$("grid").addEventListener("mouseout", (e) => {
  if (!e.relatedTarget || !e.relatedTarget.closest?.(".tbox.is-open")) $("tip").hidden = true;
});

// Les 30 boîtes s'ouvrent au hasard : lentement au début, puis de plus en plus vite.
async function openAll() {
  drawGrid();
  $("stage").classList.remove("is-done");
  $("sub").textContent = "Sinon, ce serait trop simple.";
  const order = DAYS.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  await wait(600);
  for (let i = 0; i < order.length; i++) {
    const d = order[i];
    $(`b${d.id}`).classList.add("is-shaking");
    await wait(Math.max(90, 420 - i * 16));
    $(`b${d.id}`).classList.remove("is-shaking");
    openBox(d, S.criteria[d.id]);
  }
  await wait(700);
  $("stage").classList.add("is-done");
  $("sub").textContent = Date.now() < Date.parse(DAYS[0].publishAt) ? "Premier défi mercredi à 18 h." : "Un défi par jour, à 18 h.";
}

// La revue rapide de toute la pioche, pour le début de la vidéo.
async function review() {
  if (S.busy) return;
  S.busy = true;
  const all = Object.values(CRITERIA);
  $("spot").hidden = false;
  for (const c of all) {
    $("big").style.setProperty("--bg", c.color);
    $("big").innerHTML = `<small>DANS LA PIOCHE</small><span class="tbig-emo">${c.emoji}</span><strong>${esc(c.name)}</strong><em>${esc(c.blurb)}</em>`;
    $("spot").classList.remove("is-in");
    void $("spot").offsetWidth;
    $("spot").classList.add("is-in");
    await wait(380);
  }
  $("big").style.setProperty("--bg", "var(--yellow)");
  $("big").innerHTML = `<small>${all.length} DÉFIS DANS LA PIOCHE</small><span class="tbig-emo">🎲</span><strong>À qui le tour ?</strong>`;
  $("spot").classList.remove("is-in");
  void $("spot").offsetWidth;
  $("spot").classList.add("is-in");
  await wait(1600);
  $("spot").hidden = true;
  S.busy = false;
}

async function draw() {
  if (S.busy) return;
  $("status").textContent = "";
  if (S.criteria && !confirm("Un tirage existe déjà. Le remplacer par un nouveau ?")) return;
  S.busy = true;
  try {
    const res = await api("/api/admin/criteria/draw", { method: "POST", headers: auth() });
    S.criteria = res.criteria;
    await openAll();
    $("status").textContent = "Tirage enregistré. Il sera visible sur le site au lancement.";
  } catch (err) {
    $("status").textContent = err.message || "Le tirage n'a pas marché.";
  }
  S.busy = false;
}

async function replay() {
  if (S.busy) return;
  if (!S.criteria) await load();
  if (!S.criteria) return ($("status").textContent = "Pas encore de tirage à rejouer.");
  S.busy = true;
  await openAll();
  S.busy = false;
}

// Au chargement : si un tirage existe (et qu'on a le droit de le voir), les boîtes sont déjà ouvertes.
async function load() {
  try {
    const st = await api("/api/state", { headers: auth() });
    S.criteria = st.criteria && Object.keys(st.criteria).length ? st.criteria : null;
  } catch {
    S.criteria = null;
  }
}

$("review").addEventListener("click", review);
$("draw").addEventListener("click", draw);
$("replay").addEventListener("click", replay);
addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "h" || e.key === "H") $("controls").hidden = !$("controls").hidden;
});

drawGrid();
load().then(() => {
  if (!S.criteria) return;
  for (const d of DAYS) if (S.criteria[d.id]) openBox(d, S.criteria[d.id], false);
  $("stage").classList.add("is-done");
});
