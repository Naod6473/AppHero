// Ma Collec' · Apphéro 06/30
// Une collection de cartes que l'on crée soi-même (numéro, nom, photo du dessin),
// puis un album par enfant : ce qu'il a, ses doubles, ce qui lui manque.
// Tout reste sur l'appareil : état dans localStorage, images dans IndexedDB.

const KID_HUES = [205, 330, 140, 35, 265, 10];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const hueOf = (n) => (n * 47 + 200) % 360;

/* ---------- état ---------- */
// Toutes les apps du site partagent la même origine : clés préfixées app06_.
const KEY = "app06_v2";
let S;
try { S = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { S = null; }
if (!S || !Array.isArray(S.kids)) S = { cards: [], kids: [], cur: null };
if (!Array.isArray(S.cards)) S.cards = [];
let tab = "album";

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Impossible d'enregistrer sur cet appareil"); }
}
const kid = () => S.kids.find((k) => k.id === S.cur) || S.kids[0];
const cnt = (k, n) => (k && k.counts[n]) || 0;
const sorted = () => [...S.cards].sort((a, b) => a.n - b.n);
const card = (n) => S.cards.find((c) => c.n === n);
const cardName = (n) => (card(n) && card(n).name) || `Carte ${n}`;
function summary(k) {
  let own = 0, dup = 0;
  for (const c of S.cards) { const x = cnt(k, c.n); if (x > 0) own++; if (x > 1) dup += x - 1; }
  return { own, dup, miss: S.cards.length - own, total: S.cards.length };
}

/* ---------- images (IndexedDB) ---------- */
const IMG = {};
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((ok, ko) => {
    const r = indexedDB.open("app06_images", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("img");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  return dbP;
}
const store = (mode) => db().then((d) => d.transaction("img", mode).objectStore("img"));
const req = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const imgURL = (n) => (IMG[n] && IMG[n].url) || "";
function imgPut(n, blob) {
  return store("readwrite").then((s) => req(s.put(blob, String(n)))).then(() => {
    if (IMG[n]) URL.revokeObjectURL(IMG[n].url);
    IMG[n] = { blob, url: URL.createObjectURL(blob) };
  });
}
function imgDel(n) {
  if (IMG[n]) { URL.revokeObjectURL(IMG[n].url); delete IMG[n]; }
  return store("readwrite").then((s) => req(s.delete(String(n)))).catch(() => {});
}
function imgLoad() {
  return store("readonly")
    .then((s) => Promise.all([req(s.getAllKeys()), req(s.getAll())]))
    .then(([ks, vs]) => ks.forEach((k, i) => { IMG[+k] = { blob: vs[i], url: URL.createObjectURL(vs[i]) }; }))
    .catch(() => {});
}
// Recadre en 3:4 et réduit (360 × 480) pour garder la collection légère.
function shrink(file) {
  return new Promise((ok, ko) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const W = 360, H = 480, c = document.createElement("canvas");
      c.width = W; c.height = H;
      const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? ok(b) : ko()), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(); };
    img.src = url;
  });
}
const blobToData = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
const dataToBlob = (d) => fetch(d).then((r) => r.blob());

/* ---------- changements ---------- */
function add(n, d, quiet) {
  const k = kid(); if (!k || !card(n)) return 0;
  const before = cnt(k, n), after = Math.max(0, before + d);
  if (after === before) return before;
  const wasAll = summary(k).own === S.cards.length;
  if (after) k.counts[n] = after; else delete k.counts[n];
  save();
  if (!quiet) toast(d > 0 ? (before === 0 ? `N° ${n} ${cardName(n)} : nouvelle !` : `N° ${n} : un double de plus (×${after})`) : `N° ${n} : une carte retirée`);
  if (d > 0 && !wasAll && S.cards.length && summary(k).own === S.cards.length) {
    setTimeout(() => { confetti(); confetti(); toast(`Bravo ${k.name}, la collection est complète !`); }, quiet ? 400 : 150);
  }
  render(n);
  return after;
}

/* ---------- affichage ---------- */
function renderHeader() {
  const k = kid(), s = summary(k);
  $("#kids").innerHTML = S.kids.map((x) => {
    const p = s.total ? Math.round(summary(x).own / s.total * 100) : 0;
    return `<button class="kid" aria-pressed="${x.id === k.id}" data-kid="${esc(x.id)}" style="--h:${x.hue}"><span class="dot">${esc((x.name[0] || "?").toUpperCase())}</span>${esc(x.name)} <span class="pct">${p} %</span></button>`;
  }).join("") + `<button class="kid add" data-addkid>+ Enfant</button>`;
  $("#sOwn").textContent = `${s.own} / ${s.total}`;
  $("#sBar").style.width = (s.total ? s.own / s.total * 100 : 0) + "%";
  $("#sMiss").textContent = s.miss; $("#sDup").textContent = s.dup;
  $("#tMiss").textContent = s.miss; $("#tDup").textContent = s.dup;
  $("#subTitle").textContent = s.total ? `Collection de ${s.total} carte${s.total > 1 ? "s" : ""}` : "Tes cartes, tes dessins, ta collection";
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
}
function cardHTML(k, c) {
  const n = c.n, x = cnt(k, n), ph = imgURL(n);
  return `<button class="card${x ? " own" : ""}${ph ? (x ? " ph" : " ph-miss") : ""}" data-n="${n}" style="--h:${hueOf(n)}${ph ? `;--img:url(${ph})` : ""}" aria-label="N° ${n} ${esc(c.name)}, ${x ? x + " exemplaire" + (x > 1 ? "s" : "") : "manquante"}"><span class="no">${n}</span><span class="nm">${esc(c.name)}</span>${x > 1 ? `<span class="x">×${x}</span>` : ""}${x ? `<span class="minus" data-minus="${n}" role="button" aria-label="Retirer une carte ${n}">−</span>` : ""}</button>`;
}
function renderAlbum() {
  const k = kid(), list = sorted();
  if (!list.length) {
    return `<div class="panel"><h2>Crée ta collection</h2><p>Ajoute tes cartes une par une : un numéro, un nom et la photo de ton dessin. Ensuite, chaque enfant coche celles qu'il a.</p><div class="row"><button class="btn" data-newcard>+ Ajouter la première carte</button><label class="btn ghost" for="importFile">Ouvrir une collection reçue</label></div></div>`;
  }
  return `<div class="album-tools"><p class="hint">Touchez une carte pour l'ajouter à l'album de ${esc(k.name)}. Le « − » en retire une. Appui long pour la fiche et la modifier.</p><button class="btn small" data-newcard>+ Nouvelle carte</button></div>
  <section class="film"><div class="grid">${list.map((c) => cardHTML(k, c)).join("")}<button class="card new-card" data-newcard aria-label="Ajouter une carte"><span class="plus">+</span>Nouvelle carte</button></div></section>`;
}
function chips(arr, attr, extra) {
  return `<div class="chips">${arr.map((c) => `<button class="chip" style="--h:${hueOf(c.n)}" ${attr}="${c.n}"><b>${c.n}</b>${esc(c.name)}${extra ? extra(c) : ""}</button>`).join("")}</div>`;
}
function renderMiss() {
  const k = kid(), s = summary(k);
  if (!s.total) return renderAlbum();
  if (!s.miss) return `<div class="panel empty">🎉 Il ne manque plus rien à ${esc(k.name)} !</div>`;
  return `<div class="panel"><h2>Il manque ${s.miss} carte${s.miss > 1 ? "s" : ""} à ${esc(k.name)}</h2><p class="hint">Touchez une carte trouvée pour l'ajouter.</p>${chips(sorted().filter((c) => !cnt(k, c.n)), "data-n")}</div>`;
}
function renderDup() {
  const k = kid(), s = summary(k);
  if (!s.dup) return `<div class="panel empty">Pas encore de double pour ${esc(k.name)}.</div>`;
  return `<div class="panel"><h2>${s.dup} double${s.dup > 1 ? "s" : ""} à échanger</h2><p class="hint">Le nombre indique combien de cartes en trop ${esc(k.name)} peut donner. Touchez-en une après un échange pour la retirer.</p>${chips(sorted().filter((c) => cnt(k, c.n) > 1), "data-minus", (c) => `<span class="xx">×${cnt(k, c.n) - 1}</span>`)}</div>`;
}
function shareText(k) {
  const miss = [], dup = [];
  for (const c of sorted()) { const x = cnt(k, c.n); if (!x) miss.push(c.n); if (x > 1) dup.push(x > 2 ? `${c.n} (×${x - 1})` : `${c.n}`); }
  return `Collection de ${k.name} : ${S.cards.length - miss.length}/${S.cards.length}\n\nIl me manque (${miss.length}) :\n${miss.join(", ") || "rien !"}\n\nJe peux donner (${dup.length}) :\n${dup.join(", ") || "pas de double pour l'instant"}\n\nOn échange ?`;
}
function renderSwap() {
  const k = kid(), others = S.kids.filter((x) => x.id !== k.id);
  let cmp = "";
  if (others.length) {
    const o = others.find((x) => x.id === S.cmp) || others[0];
    const give = sorted().filter((c) => cnt(k, c.n) > 1 && !cnt(o, c.n));
    const get = sorted().filter((c) => cnt(o, c.n) > 1 && !cnt(k, c.n));
    const ch = (arr) => arr.length ? `<div class="chips">${arr.map((c) => `<span class="chip" style="--h:${hueOf(c.n)}"><b>${c.n}</b>${esc(c.name)}</span>`).join("")}</div>` : `<p class="hint">Rien pour l'instant.</p>`;
    cmp = `<div class="panel"><h2>Entre frères et sœurs</h2><div class="row"><label for="cmpSel">Comparer ${esc(k.name)} avec</label><select id="cmpSel">${others.map((x) => `<option value="${esc(x.id)}"${x.id === o.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
    <div class="cmp"><div><h3>${esc(k.name)} peut donner à ${esc(o.name)} (${give.length})</h3>${ch(give)}</div><div><h3>${esc(o.name)} peut donner à ${esc(k.name)} (${get.length})</h3>${ch(get)}</div></div></div>`;
  }
  return `<div class="panel"><h2>Liste d'échange de ${esc(k.name)}</h2><p class="hint">À copier dans un SMS ou un message pour un autre parent.</p><textarea id="shareTxt" readonly>${esc(shareText(k))}</textarea><div class="row"><button class="btn" data-copy="shareTxt">Copier le message</button></div></div>` + cmp;
}
function renderMore() {
  return `<div class="panel"><h2>Enfants</h2>${S.kids.map((x) => `<div class="row"><input type="text" id="name-${esc(x.id)}" value="${esc(x.name)}" data-rename="${esc(x.id)}" aria-label="Prénom" maxlength="30" style="flex:1;min-width:0"><button class="btn danger small" data-del="${esc(x.id)}">Supprimer</button></div>`).join("")}<div class="row"><button class="btn ghost" data-addkid>+ Ajouter un enfant</button></div><div id="delConfirm"></div></div>
  <div class="panel"><h2>Partager la collection</h2><p class="hint">Un fichier avec les cartes et leurs images, sans les albums des enfants. Un autre parent l'ouvre ici avec « Ouvrir un fichier ».</p><div class="row"><button class="btn" data-dl="cards">Télécharger la collection</button></div></div>
  <div class="panel"><h2>Sauvegarde complète</h2><p class="hint">Tout reste sur cet appareil, sans compte. Pour changer de téléphone : téléchargez la sauvegarde (cartes, images et albums), puis ouvrez-la sur l'autre.</p><div class="row"><button class="btn" data-dl="all">Télécharger la sauvegarde</button><label class="btn ghost" for="importFile">Ouvrir un fichier</label></div></div>
  <p class="small-print">Ma Collec' · Apphéro 06/30. Rien n'est envoyé sur Internet.</p>`;
}
function renderWelcome() {
  return `<div class="panel welcome"><h2>Bienvenue !</h2><p>Ma Collec' sert à créer sa propre collection de cartes, avec ses dessins, puis à suivre ce que chaque enfant a, ses doubles et ce qui lui manque.</p><p class="hint">Un album par enfant. Tout reste sur cet appareil, sans compte.</p><label for="firstName"><b>Prénom de l'enfant</b></label><div class="row"><input type="text" id="firstName" maxlength="30" placeholder="Par exemple : Léa" autocomplete="off" style="flex:1;min-width:0"><button class="btn" data-start>Créer son album</button></div><p class="hint">Vous avez reçu une collection ou une sauvegarde ? <label class="ext" for="importFile" style="cursor:pointer">Ouvrir le fichier</label></p></div>`;
}
function render(focusN) {
  document.documentElement.classList.toggle("empty-state", !S.kids.length);
  const v = $("#view"), y = window.scrollY;
  if (!S.kids.length) { $("#kids").innerHTML = ""; v.innerHTML = renderWelcome(); return; }
  renderHeader();
  $("#fab").hidden = !S.cards.length;
  v.innerHTML = tab === "album" ? renderAlbum() : tab === "miss" ? renderMiss() : tab === "dup" ? renderDup() : tab === "swap" ? renderSwap() : renderMore();
  window.scrollTo(0, y);
  if (focusN) { const el = v.querySelector(`.card[data-n="${focusN}"]`); if (el) el.classList.add("pop"); }
}

/* ---------- événements ---------- */
let lp = null, lpFired = false;
$("#view").addEventListener("pointerdown", (e) => {
  const c = e.target.closest(".card[data-n]");
  if (!c || e.target.closest("[data-minus]")) return;
  lpFired = false; clearTimeout(lp);
  lp = setTimeout(() => { lpFired = true; openCard(+c.dataset.n); }, 480);
});
["pointerup", "pointerleave", "pointercancel", "scroll"].forEach((t) => addEventListener(t, () => clearTimeout(lp), true));
$("#view").addEventListener("contextmenu", (e) => {
  const c = e.target.closest(".card[data-n]");
  if (c) { e.preventDefault(); clearTimeout(lp); if (!lpFired) openCard(+c.dataset.n); lpFired = true; }
});
document.addEventListener("click", (e) => {
  const t = e.target;
  const m = t.closest("[data-minus]"); if (m) { e.stopPropagation(); add(+m.dataset.minus, -1); return; }
  const c = t.closest("[data-n]"); if (c && c.closest("#view")) { if (lpFired) { lpFired = false; return; } add(+c.dataset.n, 1); return; }
  if (t.closest("[data-newcard]")) { openEdit(null); return; }
  const kb = t.closest("[data-kid]"); if (kb) { S.cur = kb.dataset.kid; save(); render(); return; }
  if (t.closest("[data-addkid]")) { addKid(); return; }
  const tb = t.closest("#tabs [data-tab]"); if (tb) { tab = tb.dataset.tab; render(); window.scrollTo(0, 0); return; }
  if (t.closest("[data-start]")) {
    const v = $("#firstName").value.trim();
    if (!v) { toast("Écrivez le prénom de l'enfant"); $("#firstName").focus(); return; }
    const k = newKid(v); S.kids.push(k); S.cur = k.id; save(); tab = "album"; render(); return;
  }
  const dl = t.closest("[data-dl]"); if (dl) { download(dl.dataset.dl === "all"); return; }
  const cp = t.closest("[data-copy]"); if (cp) { copy($("#" + cp.dataset.copy)); return; }
  const dk = t.closest("[data-del]"); if (dk) { askDelete(dk.dataset.del); return; }
  const ok = t.closest("[data-delok]");
  if (ok) { const gone = ok.dataset.delok; S.kids = S.kids.filter((x) => x.id !== gone); if (!S.kids.find((x) => x.id === S.cur)) S.cur = S.kids[0] ? S.kids[0].id : null; save(); render(); toast("Album supprimé"); return; }
  if (t.closest("[data-delno]")) { $("#delConfirm").innerHTML = ""; return; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "firstName") { e.preventDefault(); $("[data-start]").click(); } });
document.addEventListener("change", (e) => {
  if (e.target.id === "cmpSel") { S.cmp = e.target.value; render(); }
  if (e.target.id === "importFile") { const f = e.target.files[0]; e.target.value = ""; if (f) f.text().then(importText); }
  const r = e.target.dataset && e.target.dataset.rename;
  if (r) { const x = S.kids.find((k) => k.id === r); if (x) { x.name = (e.target.value.trim() || x.name).slice(0, 30); save(); renderHeader(); } }
});
function newKid(name) {
  return { id: "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.slice(0, 30), hue: KID_HUES[S.kids.length % KID_HUES.length], counts: {} };
}
function addKid() {
  const k = newKid("Enfant " + (S.kids.length + 1)); S.kids.push(k); S.cur = k.id; save(); tab = "more"; render();
  const inp = document.getElementById("name-" + k.id); if (inp) { inp.focus(); inp.select(); }
}
function askDelete(id) {
  const x = S.kids.find((k) => k.id === id);
  $("#delConfirm").innerHTML = `<div class="sample"><span>Supprimer l'album de <b>${esc(x.name)}</b> ? Ses cartes cochées seront effacées.</span><span class="row"><button class="btn danger small" data-delok="${esc(id)}">Supprimer</button><button class="btn ghost small" data-delno>Annuler</button></span></div>`;
}
async function copy(ta) {
  try { await navigator.clipboard.writeText(ta.value); toast("Copié !"); }
  catch (e) { ta.removeAttribute("readonly"); ta.focus(); ta.select(); toast("Texte sélectionné : copiez-le"); }
}
let tt;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), 2200); }

/* ---------- fiche d'une carte ---------- */
let cardN = 0;
function openCard(n) { cardN = n; syncCard(); $("#dCard").showModal(); }
function syncCard() {
  const k = kid(), ph = imgURL(cardN);
  $("#cTitle").textContent = `N° ${cardN} · ${cardName(cardN)}`;
  $("#cSub").textContent = `Album de ${k.name}`;
  $("#cImg").hidden = !ph; if (ph) $("#cImg").src = ph;
  $("#cCount").textContent = cnt(k, cardN);
}
$("#cPlus").onclick = () => { add(cardN, 1, true); syncCard(); };
$("#cMinus").onclick = () => { add(cardN, -1, true); syncCard(); };
$("#cEdit").onclick = () => { $("#dCard").close(); openEdit(cardN); };

/* ---------- créer / modifier une carte ---------- */
let editN = null, editBlob = null, editImgCleared = false;
function openEdit(n) {
  editN = n; editBlob = null; editImgCleared = false;
  const c = n != null ? card(n) : null;
  $("#eTitle").textContent = c ? `Modifier la carte ${n}` : "Nouvelle carte";
  $("#eNum").value = c ? c.n : (S.cards.reduce((m, x) => Math.max(m, x.n), 0) + 1);
  $("#eName").value = c ? c.name : "";
  setEditImg(c ? imgURL(n) : "");
  $("#eErr").textContent = ""; $("#eDelZone").innerHTML = "";
  $("#eDel").hidden = !c;
  $("#dEdit").showModal();
  if (!c) $("#eName").focus();
}
function setEditImg(url) { $("#eImg").hidden = !url; if (url) $("#eImg").src = url; $("#ePh").hidden = !!url; }
$("#eFile").onchange = (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  shrink(f).then((b) => { editBlob = b; setEditImg(URL.createObjectURL(b)); }).catch(() => { $("#eErr").textContent = "Cette image ne s'ouvre pas. Essayez une autre photo (JPEG ou PNG)."; });
};
$("#editForm").addEventListener("submit", async (e) => {
  if (!e.submitter || e.submitter.value !== "save") return;
  e.preventDefault();
  const n = Math.round(+$("#eNum").value), name = $("#eName").value.trim().slice(0, 40);
  if (!(n >= 1 && n <= 9999)) { $("#eErr").textContent = "Le numéro doit être entre 1 et 9999."; return; }
  if (!name) { $("#eErr").textContent = "Donnez un nom à la carte."; $("#eName").focus(); return; }
  if (n !== editN && card(n)) { $("#eErr").textContent = `Le numéro ${n} est déjà pris par « ${cardName(n)} ».`; return; }
  try {
    if (editN == null) {
      S.cards.push({ n, name });
    } else {
      const c = card(editN); c.name = name;
      if (n !== editN) {
        // Nouveau numéro : on déplace les cartes cochées et l'image.
        S.kids.forEach((k) => { if (k.counts[editN]) { k.counts[n] = k.counts[editN]; delete k.counts[editN]; } });
        if (IMG[editN] && !editBlob) await imgPut(n, IMG[editN].blob);
        await imgDel(editN);
        c.n = n;
      }
    }
    if (editBlob) await imgPut(n, editBlob);
    save(); $("#dEdit").close(); tab = "album"; render(n);
    toast(editN == null ? `Carte ${n} ajoutée à la collection` : `Carte ${n} enregistrée`);
  } catch (err) { $("#eErr").textContent = "Plus de place pour les images sur cet appareil."; }
});
$("#eDel").onclick = () => {
  const owners = S.kids.filter((k) => cnt(k, editN)).length;
  $("#eDelZone").innerHTML = `<div class="sample"><span>Supprimer la carte ${editN} de la collection${owners ? ` ? Elle sera retirée de ${owners} album${owners > 1 ? "s" : ""}.` : " ?"}</span><span class="row"><button type="button" class="btn danger small" id="eDelOk">Supprimer</button><button type="button" class="btn ghost small" id="eDelNo">Garder</button></span></div>`;
  $("#eDelOk").onclick = () => {
    const n = editN; S.cards = S.cards.filter((c) => c.n !== n); S.kids.forEach((k) => delete k.counts[n]); imgDel(n);
    save(); $("#dEdit").close(); render(); toast(`Carte ${n} supprimée`);
  };
  $("#eDelNo").onclick = () => { $("#eDelZone").innerHTML = ""; };
};

/* ---------- pochette ---------- */
let typed = "";
const packLog = [];
$("#pad").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, "OK"].map((v) => `<button type="button" class="${v === "OK" ? "go" : ""}" data-k="${v}">${v}</button>`).join("");
function padShow() {
  const n = +typed;
  $("#padNum").textContent = typed || "—";
  $("#padWho").textContent = typed ? (card(n) ? cardName(n) : "Pas de carte à ce numéro") : "Numéro de la carte";
}
function padKey(v) {
  if (v === "⌫") typed = typed.slice(0, -1);
  else if (v === "OK") { commit(); return; }
  else if (typed.length < 4) typed = (typed + v).replace(/^0+/, "");
  padShow();
}
function commit() {
  const n = +typed;
  if (!card(n)) { toast("Ce numéro n'est pas dans la collection"); return; }
  const after = add(n, 1, true); packLog.unshift({ n, after }); typed = ""; padShow(); drawLog();
}
function drawLog() {
  const k = kid();
  $("#packRes").innerHTML = packLog.map((r, i) => `<div><span class="tag ${r.after === 1 ? "new" : "dbl"}">${r.after === 1 ? "Nouvelle !" : "Double ×" + r.after}</span><span class="t"><b>${r.n}</b> ${esc(cardName(r.n))}</span><button type="button" data-undo="${i}">annuler</button></div>`).join("") || `<p class="hint">Les cartes reçues s'afficheront ici pour ${esc(k.name)}.</p>`;
}
$("#pad").onclick = (e) => { const b = e.target.closest("[data-k]"); if (b) padKey(String(b.dataset.k)); };
$("#packRes").onclick = (e) => { const b = e.target.closest("[data-undo]"); if (!b) return; const r = packLog.splice(+b.dataset.undo, 1)[0]; add(r.n, -1, true); drawLog(); };
$("#dPack").addEventListener("keydown", (e) => {
  if (/^[0-9]$/.test(e.key)) { padKey(e.key); e.preventDefault(); }
  else if (e.key === "Backspace") { padKey("⌫"); e.preventDefault(); }
  else if (e.key === "Enter") { commit(); e.preventDefault(); }
});
$("#fab").onclick = () => { typed = ""; packLog.length = 0; padShow(); drawLog(); $("#dPack").showModal(); };
$("#packForm").addEventListener("submit", (e) => { if (e.submitter && e.submitter.value !== "close") e.preventDefault(); });

/* ---------- fichiers : collection et sauvegarde ---------- */
async function download(all) {
  try {
    const images = {};
    for (const c of S.cards) if (IMG[c.n]) images[c.n] = await blobToData(IMG[c.n].blob);
    const data = { app: "ma-collec", v: 2, date: new Date().toISOString(), cards: S.cards, images };
    if (all) data.kids = S.kids;
    const b = new Blob([JSON.stringify(data)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `${all ? "ma-collec-sauvegarde" : "ma-collec-collection"}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(all ? "Sauvegarde téléchargée" : "Collection téléchargée");
  } catch (e) { toast("Téléchargement impossible sur cet appareil"); }
}
async function importText(txt) {
  try {
    const d = JSON.parse(txt);
    if (d.app !== "ma-collec" || !Array.isArray(d.cards)) throw 0;
    const cards = d.cards.map((c) => ({ n: Math.round(+c.n), name: String(c.name || "").slice(0, 40) })).filter((c) => c.n >= 1 && c.n <= 9999 && c.name);
    for (const c of S.cards) await imgDel(c.n);
    S.cards = cards;
    for (const [n, url] of Object.entries(d.images || {})) {
      if (typeof url === "string" && url.startsWith("data:image/") && card(+n)) await imgPut(+n, await dataToBlob(url));
    }
    if (Array.isArray(d.kids) && d.kids.length) {
      S.kids = d.kids.map((x, i) => ({ id: String(x.id || "k" + i), name: String(x.name || "Enfant").slice(0, 30), hue: x.hue ?? KID_HUES[i % KID_HUES.length], counts: x.counts && typeof x.counts === "object" ? x.counts : {} }));
      S.cur = S.kids[0].id;
    }
    save(); tab = "album"; render();
    toast(d.kids ? "Sauvegarde restaurée" : `Collection de ${cards.length} cartes chargée`);
  } catch (err) { toast("Ce fichier n'est pas une collection Ma Collec'"); }
}

/* ---------- confettis ---------- */
const cv = $("#fx"), cx = cv.getContext("2d");
let parts = [], raf = 0;
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ["#ff5d8f", "#ffcc33", "#4f8bff", "#3ccf8e", "#b36bff"];
  for (let i = 0; i < 110; i++) parts.push({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: Math.random() * -12 - 3, r: Math.random() * 6 + 4, c: cols[i % cols.length], a: Math.random() * 6, life: 120 });
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter((p) => p.life-- > 0);
  parts.forEach((p) => { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.a += 0.2; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); cx.restore(); });
  raf = parts.length ? requestAnimationFrame(tick) : 0;
  if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
}

render();
imgLoad().then(() => { if (S.kids.length) render(); });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
