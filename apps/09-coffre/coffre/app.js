// Le coffre de Mamie (app 09 d'Apphéro).
// Tout est chiffré sur l'appareil (AES-GCM 256, clés dérivées avec PBKDF2). Le serveur ne garde
// qu'une version illisible du coffre, pour que la famille la partage.
//
// - La clé du coffre (32 octets au hasard) chiffre les fiches.
// - La clé de secours (6 mots) protège la clé du coffre dans la version partagée : c'est elle qui
//   permet à un proche de rejoindre le coffre, ou de le rouvrir si on oublie ses images.
// - Les 5 images protègent la clé du coffre sur CE téléphone seulement (jamais envoyées).
{
"use strict";

const IMGS = ["🐈","🏠","☀️","🔑","🌹","🚲","🍎","⛵","🎻","🐟","🌳","☕","🐓","📚","🧀","🚂","🌙","🍇","🐴","⛪","🎈","🦋","🥖","🕰️","🐝","🏔️","🧶","🚗","🍓","🐑","🌻","⚓","🎩","🍰","🦆","🌈"];
const COULEURS = ["#5856d6","#32ade6","#30b0a0","#af52de","#007aff","#ff9f0a","#ff6482","#5e5ce6","#e0a800","#8e8e93","#34c759","#ff453a"];
const MODELES = [
  { n: "Impôts", url: "https://www.impots.gouv.fr", c: 0, aide: "Identifiant : le numéro fiscal (13 chiffres), sur l'avis d'imposition." },
  { n: "Ameli", url: "https://www.ameli.fr", c: 1, aide: "Identifiant : le numéro de sécurité sociale (13 chiffres)." },
  { n: "Banque", url: "", c: 2, banque: true },
  { n: "Info Retraite", url: "https://www.info-retraite.fr", c: 3, aide: "Se connecte souvent avec FranceConnect (le compte Impôts ou Ameli)." },
  { n: "CAF", url: "https://www.caf.fr", c: 4, aide: "Identifiant : le numéro d'allocataire." },
  { n: "EDF", url: "https://www.edf.fr", c: 5 },
  { n: "Mutuelle", url: "", c: 6 },
  { n: "URSSAF", url: "https://www.urssaf.fr", c: 7 },
  { n: "La Poste", url: "https://www.laposte.fr", c: 8 },
  { n: "Messagerie", url: "", c: 9, aide: "L'adresse e-mail et son mot de passe." },
];
const BANQUE_RE = /banque|bank|cr[ée]dit|caisse|bnp|lcl|soci[ée]t[ée] g[ée]n[ée]rale|boursorama|cic\b|hsbc|fortuneo|n26|revolut|la banque postale/i;
const LS = "coffre09";
const ITER = 310000;
const VERROU_MS = 5 * 60 * 1000;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u8) => [...new Uint8Array(u8)].map((b) => b.toString(16).padStart(2, "0")).join("");
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
const rint = (n) => { const m = Math.floor(4294967296 / n) * n; let x; do { x = crypto.getRandomValues(new Uint32Array(1))[0]; } while (x >= m); return x % n; };
const uid = () => hex(rnd(8));

// ------------------------------------------------------------------ icônes
const ic = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/><path d="M4 20L20 4" stroke="#ff3b30"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  fam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 2-5 5-5s5 2 5 5M13 20c0-2.5 1.5-4 4-4s4 1.5 4 4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
};
const LOGO = '<svg class="logo" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8e8bff"/><stop offset="1" stop-color="#5856d6"/></linearGradient></defs><rect x="6" y="6" width="84" height="84" rx="24" fill="url(#lg)"/><rect x="6.5" y="6.5" width="83" height="83" rx="23.5" fill="none" stroke="rgba(255,255,255,.5)"/><circle cx="48" cy="48" r="20" fill="rgba(255,255,255,.22)" stroke="#fff" stroke-width="3"/><path d="M48 34v28M34 48h28" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="48" r="5" fill="#fff"/></svg>';

// ------------------------------------------------------------------ stockage local (ce téléphone)
function lire() { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } }
function ecrire(o) { try { localStorage.setItem(LS, JSON.stringify(o)); return true; } catch { return false; } }
let local = lire(); // { id, rev, doc, moi, porte:{salt,iv,ct}, essais, bloqueJusqua, taille, attente }
try { if (local?.taille) document.documentElement.dataset.taille = local.taille; } catch {}

// ------------------------------------------------------------------ chiffrement
async function derive(secret, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function chiffre(key, bytes) { const iv = rnd(12); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes); return { iv: b64(iv), ct: b64(ct) }; }
async function dechiffre(key, o) { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, key, unb64(o.ct))); }
const cleCoffre = (raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
async function cleEcriture(raw) { return hex(await crypto.subtle.digest("SHA-256", new Uint8Array([...enc.encode("ecrire|"), ...raw]))); }
const normMots = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();
const secretImages = (seq) => "images|" + seq.join(",");

// La version partagée : { v, salt, wiv, wct (clé du coffre protégée par les 6 mots), iv, ct (les fiches) }
async function scelle(raw, data, shared) {
  const k = await cleCoffre(raw);
  const body = await chiffre(k, enc.encode(JSON.stringify(data)));
  return JSON.stringify({ v: 1, salt: shared.salt, wiv: shared.wiv, wct: shared.wct, iv: body.iv, ct: body.ct });
}
async function ouvreDoc(raw, docStr) {
  const d = JSON.parse(docStr);
  const k = await cleCoffre(raw);
  return JSON.parse(dec.decode(await dechiffre(k, d)));
}

// ------------------------------------------------------------------ serveur
async function api(method, path, body) {
  const r = await fetch("/api/coffre" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, j: j || {} };
}

// ------------------------------------------------------------------ état en mémoire (coffre ouvert)
let S = { v: "accueil" }; // vue courante et paramètres
let K = null; // { raw, data, shared:{salt,wiv,wct}, write }
let timer = null;

function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2600); }
function aller(v, extra = {}) { S = { ...extra, v }; rendu(); }
function moi() { return local?.moi || "Moi"; }
function titreCoffre() { return `Le coffre de ${K?.data?.owner || local?.owner || "Mamie"}`; }

// Fusion de deux versions (deux membres ont enregistré en même temps) : la fiche la plus récente gagne.
function fusion(a, b) {
  const out = { ...b, ...a };
  const morts = { ...(b.morts || {}), ...(a.morts || {}) };
  for (const [id, t] of Object.entries(b.morts || {})) morts[id] = Math.max(t, morts[id] || 0);
  const par = new Map();
  for (const s of [...(b.sites || []), ...(a.sites || [])]) { const o = par.get(s.id); if (!o || (s.at || 0) > (o.at || 0)) par.set(s.id, s); }
  out.sites = [...par.values()].filter((s) => !(morts[s.id] >= (s.at || 0)));
  out.morts = morts;
  const mb = new Map();
  for (const m of [...(b.membres || []), ...(a.membres || [])]) if (!mb.has(m.nom.toLowerCase())) mb.set(m.nom.toLowerCase(), m);
  out.membres = [...mb.values()];
  out.maj = Math.max(a.maj || 0, b.maj || 0);
  return out;
}

async function enregistrer(msg) {
  K.data.maj = Date.now();
  const doc = await scelle(K.raw, K.data, K.shared);
  local.doc = doc; local.attente = true; ecrire(local);
  if (msg) toast(msg);
  await synchro();
}

// Envoie la version locale si elle attend ; sinon récupère celle des autres membres.
async function synchro() {
  if (!K || !local?.id) return;
  try {
    if (local.attente) {
      for (let essai = 0; essai < 3; essai++) {
        const r = await api("PUT", "/" + local.id, { rev: local.rev, doc: local.doc, write: K.write });
        if (r.ok) { local.rev = r.j.rev; local.attente = false; ecrire(local); return; }
        if (r.status === 409 && r.j.doc) {
          const autre = await ouvreDoc(K.raw, r.j.doc);
          K.data = fusion(K.data, autre);
          local.rev = r.j.rev; local.doc = await scelle(K.raw, K.data, K.shared); ecrire(local);
          continue;
        }
        return;
      }
    } else {
      const r = await api("GET", "/" + local.id);
      if (r.ok && r.j.rev > (local.rev || 0)) {
        K.data = await ouvreDoc(K.raw, r.j.doc);
        local.rev = r.j.rev; local.doc = r.j.doc; ecrire(local);
        if (["liste", "fiche", "famille"].includes(S.v)) rendu();
      }
    }
  } catch { /* hors connexion : on réessaiera */ }
}
addEventListener("online", () => synchro());

// Fermeture automatique.
function relance() { clearTimeout(timer); if (K) timer = setTimeout(fermer, VERROU_MS); }
["pointerdown", "keydown"].forEach((e) => addEventListener(e, relance, { passive: true }));
let cacheA = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cacheA = Date.now();
  else { if (K && cacheA && Date.now() - cacheA > 60000) fermer(); else synchro(); }
});
function fermer() { K = null; clearTimeout(timer); aller("verrou"); }

// ------------------------------------------------------------------ morceaux d'écran
const head = (titre, sous = "", gauche = "", droite = "") => `<header class="head">${gauche}<h1>${titre}${sous ? `<small>${sous}</small>` : ""}</h1>${droite}</header>`;
const btnFermer = `<button class="hb g" data-act="fermer" aria-label="Fermer le coffre">${ic.lock}Fermer</button>`;
const btnRetour = (cible) => `<button class="hb g" data-retour="${cible}" aria-label="Retour">${ic.back}</button>`;
const onglets = (a) => `<nav class="tabs g" aria-label="Menu">${[["liste", "Mes sites", ic.list], ["famille", "La famille", ic.fam], ["reglages", "Réglages", ic.gear]].map(([k, l, i]) => `<button data-aller="${k}" ${a === k ? 'aria-current="page"' : ""}>${i}${l}</button>`).join("")}</nav>`;
const pastille = (s) => `<span class="dot" style="background:${COULEURS[s.c % COULEURS.length]}">${esc((s.n || "?").slice(0, 2))}</span>`;
const grille = (bloque) => `<div class="imgs g ${bloque ? "bloque" : ""}">${IMGS.map((e, k) => `<button type="button" data-img="${k}" aria-label="Image ${k + 1}">${e}</button>`).join("")}</div>`;
const points = (n) => `<div class="pick" aria-label="${n} image(s) sur 5">${[0, 1, 2, 3, 4].map((k) => `<i class="${k < n ? "f" : ""}"></i>`).join("")}</div>`;
const motsHtml = (mots) => `<div class="words">${mots.map((w, k) => `<span><b>${k + 1}</b>${esc(w)}</span>`).join("")}</div>`;
const estBanque = (s) => s.banque || BANQUE_RE.test(s.n || "");

// ------------------------------------------------------------------ vues
const vues = {
  // Premier lancement
  accueil() {
    app.innerHTML = `<div class="body sans-onglets" style="padding-top:calc(40px + env(safe-area-inset-top,0px))">${LOGO}
      <p class="big centre" style="font-size:1.9rem">Le coffre de la famille</p>
      <p class="p centre">Les mots de passe des impôts, d'Ameli, de la banque… rangés au même endroit, protégés, et partagés avec vos proches.</p>
      <div class="card g"><p style="margin:0 0 6px;font-weight:600">Comment ça marche</p>
      <p class="p" style="margin:0">On l'ouvre en touchant <b>5 images</b>, pas besoin de retenir un mot de passe. Tout est chiffré sur le téléphone : même le site ne peut pas lire vos fiches.</p></div>
      <button class="btn" data-aller="creer">Créer un coffre</button>
      <button class="btn alt" data-aller="rejoindre">Rejoindre le coffre d'un proche</button>
      <p class="note">Apphéro, app 09/30. Gratuit, sans compte, sans publicité.</p></div>`;
  },

  // Création : 1) pour qui  2) 5 images, deux fois  3) les 6 mots
  creer() {
    const e = S.etape || 1;
    if (e === 1) {
      app.innerHTML = head("Nouveau coffre", "Étape 1 sur 3", btnRetour("accueil")) + `<div class="body sans-onglets">
        <div class="card g"><span class="lab">Le coffre de…</span>
        <div class="seg">${["Mamie", "Papy", "Maman", "Papa"].map((w) => `<button type="button" data-qui="${w}" aria-pressed="${S.owner === w}">${w}</button>`).join("")}</div>
        <input class="champ" id="owner" maxlength="24" placeholder="Ou un prénom" value="${esc(S.owner || "")}" aria-label="Le coffre de">
        <label class="lab" for="moi">Qui utilise ce téléphone ?</label>
        <input class="champ" id="moi" maxlength="24" placeholder="Par exemple : Mamie, ou Julien" value="${esc(S.moi || "")}"></div>
        ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
        <button class="btn" data-act="c1">Continuer</button></div>`;
      $$("[data-qui]").forEach((b) => (b.onclick = () => { S.owner = b.dataset.qui; $("#owner").value = S.owner; if (!$("#moi").value) $("#moi").value = S.owner; $$("[data-qui]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
      return;
    }
    if (e === 2) return choixImages("creer", () => aller("creer", { ...S, etape: 3, mots: Array.from({ length: 6 }, () => MOTS[rint(256)]) }));
    app.innerHTML = head("La clé de secours", "Étape 3 sur 3") + `<div class="body sans-onglets">
      <p class="p">Ces 6 mots ouvrent aussi le coffre. Ils servent à <b>ajouter un proche</b> et à <b>retrouver le coffre</b> si on oublie ses images. Notez-les ou imprimez la fiche, et rangez-la dans un tiroir.</p>
      <div class="card g">${motsHtml(S.mots)}</div>
      <button class="btn alt" data-act="imprimer">Imprimer la fiche de secours</button>
      ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
      <button class="btn" data-act="c3" ${S.busy ? "disabled" : ""}>${S.busy ? "Création du coffre…" : "C'est noté, créer le coffre"}</button></div>`;
  },

  rejoindre() {
    app.innerHTML = head("Rejoindre un coffre", "", btnRetour("accueil")) + `<div class="body sans-onglets">
      <p class="p">Demandez à votre proche le lien du coffre et les 6 mots de la fiche de secours.</p>
      <div class="card g">
        <label class="lab" for="lien">Le lien ou le code du coffre</label>
        <input class="champ" id="lien" autocomplete="off" placeholder="apphero.cloud/…#rejoindre=…" value="${esc(S.id || "")}">
        <label class="lab" for="mots">Les 6 mots</label>
        <input class="champ" id="mots" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="lune tasse vélo…" value="${esc(S.motsTxt || "")}">
        <label class="lab" for="moi">Votre prénom</label>
        <input class="champ" id="moi" maxlength="24" placeholder="Par exemple : Julien" value="${esc(S.moi || "")}"></div>
      ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
      <button class="btn" data-act="r1" ${S.busy ? "disabled" : ""}>${S.busy ? "Ouverture…" : "Ouvrir le coffre"}</button></div>`;
  },

  // Les 6 mots pour rouvrir le coffre sur ce téléphone (images oubliées)
  oubli() {
    app.innerHTML = head("J'ai oublié mes images", "", btnRetour("verrou")) + `<div class="body sans-onglets">
      <p class="big">Pas de panique.</p><p class="p">Prenez la fiche de secours (celle du tiroir), ou appelez un proche qui a le coffre : il trouve les 6 mots dans « La famille ».</p>
      <div class="card g"><label class="lab" for="mots">Les 6 mots de la fiche de secours</label>
      <input class="champ" id="mots" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="lune tasse vélo…"></div>
      ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
      <button class="btn" data-act="o1" ${S.busy ? "disabled" : ""}>${S.busy ? "Ouverture…" : "Ouvrir et choisir de nouvelles images"}</button></div>`;
  },

  images() { choixImages(S.retour, S.suite); },

  verrou() {
    const bloque = (local.bloqueJusqua || 0) > Date.now();
    const n = (S.seq || []).length;
    app.innerHTML = head(esc(titreCoffre()), "Fermé") + `<div class="body sans-onglets">${LOGO}
      <p class="big centre">Touchez vos 5 images</p><p class="p centre">Dans le bon ordre.</p>
      ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
      ${bloque ? `<p class="err">Trop d'essais. Réessayez dans une minute.</p>` : ""}
      ${S.busy ? `<p class="info centre">Ouverture…</p>` : points(n)}
      ${grille(bloque || S.busy)}
      <button class="link" data-aller="oubli">J'ai oublié mes images</button></div>`;
    if (bloque) setTimeout(() => S.v === "verrou" && rendu(), local.bloqueJusqua - Date.now() + 50);
    $$("[data-img]").forEach((b) => (b.onclick = async () => {
      S.seq = [...(S.seq || []), +b.dataset.img]; S.err = "";
      if (S.seq.length < 5) return rendu();
      const seq = S.seq; S.seq = []; S.busy = true; rendu();
      try {
        const k = await derive(secretImages(seq), unb64(local.porte.salt));
        const raw = await dechiffre(k, local.porte);
        await ouvrir(raw);
        local.essais = 0; ecrire(local);
        aller("liste");
      } catch {
        local.essais = (local.essais || 0) + 1;
        if (local.essais >= 5) { local.essais = 0; local.bloqueJusqua = Date.now() + 60000; }
        ecrire(local);
        S.busy = false; S.err = "Ce n'est pas la bonne suite. Essayez encore."; rendu();
      }
    }));
  },

  liste() {
    const q = (S.q || "").toLowerCase();
    const sites = [...K.data.sites].sort((a, b) => a.n.localeCompare(b.n, "fr"));
    const rows = sites.filter((s) => !q || (s.n + " " + (s.login || "")).toLowerCase().includes(q));
    const vides = sites.filter((s) => !s.pw).length;
    app.innerHTML = head(esc(titreCoffre()), local.attente ? "Ouvert · pas encore partagé (hors connexion)" : "Ouvert", "", btnFermer) + `<div class="body">
      <input class="champ" id="q" type="search" placeholder="Chercher un site" value="${esc(S.q || "")}" aria-label="Chercher un site" style="margin:0 0 14px">
      ${rows.length ? `<div class="list g">${rows.map((s) => `<button class="row" data-site="${s.id}">${pastille(s)}<span><b>${esc(s.n)}</b><span class="s ${s.pw ? "" : "vide"}">${s.pw ? esc(s.login || "Mot de passe noté") : "À remplir"}</span></span>${ic.chev}</button>`).join("")}</div>` : `<p class="p centre">Aucun site ne correspond.</p>`}
      ${vides && !q ? `<p class="note">${vides} fiche${vides > 1 ? "s" : ""} à remplir.</p>` : ""}
      <button class="btn noir" data-act="ajouter">+ Ajouter un site</button></div>${onglets("liste")}`;
    const qi = $("#q");
    qi.oninput = () => { S.q = qi.value; vues.liste(); const n = $("#q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
    $$("[data-site]").forEach((b) => (b.onclick = () => aller("fiche", { id: b.dataset.site })));
  },

  fiche() {
    const s = K.data.sites.find((x) => x.id === S.id);
    if (!s) return aller("liste");
    if (!s.pw && !s.login) return aller("modifier", { id: s.id, depuis: "liste" });
    const pw = S.voir ? esc(s.pw) : "•".repeat(Math.min(12, (s.pw || "").length));
    app.innerHTML = head(esc(s.n), s.url ? esc(s.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) : "", btnRetour("liste"), btnFermer) + `<div class="body">
      ${estBanque(s) ? `<div class="warn g">${ic.phone}<span>Votre banque ne vous demandera jamais ce mot de passe au téléphone, par SMS ou par e-mail. Si on vous le demande, raccrochez.</span></div>` : ""}
      ${s.login ? `<div class="card g"><span class="lab">Identifiant</span><p class="val">${esc(s.login)}</p><button class="btn alt" data-copie="login" style="margin:0;min-height:50px">${ic.copy}Copier l'identifiant</button></div>` : ""}
      ${s.pw ? `<div class="card g"><span class="lab">Mot de passe</span><p class="val">${pw}</p>
      <div class="two"><button class="btn" data-copie="pw">${ic.copy}Copier</button><button class="btn alt" data-act="voir">${ic.eye}${S.voir ? "Cacher" : "Montrer"}</button></div></div>` : ""}
      ${s.note ? `<div class="card g"><span class="lab">Notes</span><p style="margin:4px 0 0;white-space:pre-wrap">${esc(s.note)}</p></div>` : ""}
      <div class="three">
        ${s.url ? `<a class="btn noir" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${ic.out}Le site</a>` : `<button class="btn noir" disabled>${ic.out}Le site</button>`}
        <button class="btn alt" data-act="envoyer">${ic.send}Envoyer</button>
        <button class="btn alt" data-act="modif">${ic.edit}Modifier</button></div>
      <p class="note">Modifié par ${esc(s.by || "?")}, ${quand(s.at)}.</p></div>${onglets("liste")}`;
    $$("[data-copie]").forEach((b) => (b.onclick = () => copier(b.dataset.copie === "login" ? s.login : s.pw, b.dataset.copie === "login" ? "Identifiant copié." : "Mot de passe copié. Collez-le sur le site.")));
  },

  modifier() {
    const nouveau = !S.id;
    const s = nouveau ? { n: "", url: "", login: "", pw: "", note: "" } : K.data.sites.find((x) => x.id === S.id);
    if (!s) return aller("liste");
    const m = MODELES.find((x) => x.n === s.n);
    app.innerHTML = head(nouveau ? "Nouveau site" : esc(s.n), nouveau ? "" : "Modifier la fiche", btnRetour(nouveau || S.depuis === "liste" ? "liste" : "fiche")) + `<div class="body sans-onglets">
      ${m?.aide ? `<p class="info">${esc(m.aide)}</p>` : ""}
      <div class="card g">
        <label class="lab" for="f-n" style="margin-top:0">Nom du site</label>
        <input class="champ" id="f-n" maxlength="40" value="${esc(s.n)}" placeholder="Par exemple : Ameli">
        <label class="lab" for="f-login">Identifiant</label>
        <input class="champ" id="f-login" maxlength="120" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(s.login)}" placeholder="Numéro, adresse e-mail…">
        <label class="lab" for="f-pw">Mot de passe</label>
        <input class="champ" id="f-pw" maxlength="120" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(s.pw)}" style="font-family:ui-monospace,'SF Mono',Menlo,monospace">
        <button class="btn alt" data-act="generer" style="min-height:48px">${ic.dice}Inventer un mot de passe</button>
        <label class="lab" for="f-url">Adresse du site</label>
        <input class="champ" id="f-url" maxlength="200" inputmode="url" autocapitalize="none" spellcheck="false" value="${esc(s.url)}" placeholder="https://…">
        <label class="lab" for="f-note">Notes</label>
        <textarea class="champ" id="f-note" maxlength="1000" placeholder="Question secrète, numéro de client…">${esc(s.note)}</textarea></div>
      ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
      <button class="btn" data-act="sauver">Enregistrer</button>
      ${nouveau ? "" : `<button class="btn rouge" data-act="supprimer">Supprimer cette fiche</button>`}</div>`;
  },

  famille() {
    const lien = lienInvit();
    app.innerHTML = head("La famille", "Qui a accès au coffre", "", btnFermer) + `<div class="body">
      <div class="list g" style="margin-bottom:12px">${K.data.membres.map((m) => `<div class="row fixe"><span class="dot" style="background:${COULEURS[(m.nom.length * 7) % COULEURS.length]}">${esc(m.nom.slice(0, 1).toUpperCase())}</span><span><b>${esc(m.nom)}${m.nom === moi() ? " (ce téléphone)" : ""}</b><span class="s">Depuis le ${new Date(m.at).toLocaleDateString("fr-FR")}</span></span></div>`).join("")}</div>
      <div class="card g"><p class="big" style="font-size:1.2rem">Ajouter un proche</p>
      <p class="p" style="margin:0">Il scanne ce code avec l'appareil photo de son téléphone, puis il tape les 6 mots ci-dessous.</p>
      <svg class="qr" id="qr" aria-label="QR code d'invitation"></svg>
      <button class="btn" data-act="invit">${ic.send}Envoyer le lien par message</button>
      <p class="note">Donnez les 6 mots de vive voix ou au téléphone, jamais dans le même message que le lien.</p></div>
      <div class="card g"><span class="lab">Les 6 mots (la clé de secours)</span>
      ${S.voirMots ? motsHtml(K.data.mots) : `<button class="btn alt" data-act="voirMots">${ic.eye}Afficher les 6 mots</button>`}
      <button class="btn alt" data-act="imprimer">Imprimer la fiche de secours</button></div>
      <p class="note">Le coffre est chiffré sur chaque téléphone. Le site ne garde qu'une version illisible, que seule la famille peut ouvrir.</p></div>${onglets("famille")}`;
    dessineQR($("#qr"), lien);
  },

  reglages() {
    const t = local.taille || "normal";
    app.innerHTML = head("Réglages", "", "", btnFermer) + `<div class="body">
      <div class="card g"><span class="lab">Le coffre de…</span>
      <input class="champ" id="owner" maxlength="24" value="${esc(K.data.owner)}">
      <button class="btn alt" data-act="owner" style="min-height:46px">Changer le nom</button></div>
      <div class="card g"><span class="lab">Taille du texte</span>
      <div class="seg">${[["normal", "Normal"], ["grand", "Grand"], ["tres-grand", "Très grand"]].map(([k, l]) => `<button type="button" data-taille="${k}" aria-pressed="${t === k}">${l}</button>`).join("")}</div></div>
      <div class="card g"><span class="lab">Sécurité</span>
      <p style="margin:6px 0 0">Le coffre se referme tout seul après 5 minutes sans toucher l'écran.</p>
      <button class="btn alt" data-act="nouvellesImages">Changer mes 5 images</button></div>
      <div class="card g"><span class="lab">Ce téléphone</span>
      <p style="margin:6px 0 0">Vous êtes « ${esc(moi())} ». Retirer le coffre de ce téléphone ne l'efface pas pour la famille.</p>
      <button class="btn rouge" data-act="quitter">Retirer le coffre de ce téléphone</button></div>
      <p class="note">Le coffre de Mamie · app 09 d'Apphéro · chiffrement AES-256 sur l'appareil.</p></div>${onglets("reglages")}`;
    $$("[data-taille]").forEach((b) => (b.onclick = () => { local.taille = b.dataset.taille; ecrire(local); document.documentElement.dataset.taille = local.taille; vues.reglages(); }));
  },
};

function quand(t) {
  if (!t) return "il y a longtemps";
  const j = Math.floor((Date.now() - t) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return "hier";
  return `il y a ${j} jours`;
}

// Choisir 5 images, deux fois pour être sûr.
function choixImages(retour, suite) {
  const first = S.premier;
  const n = (S.seq || []).length;
  app.innerHTML = head(first ? "Encore une fois" : "Vos 5 images", "", btnRetour(retour)) + `<div class="body sans-onglets">
    <p class="p">${first ? "Touchez les mêmes 5 images, dans le même ordre." : "Choisissez 5 images faciles à retenir pour vous, dans l'ordre que vous voulez. Par exemple : votre chat, votre maison, la mer…"}</p>
    ${S.err ? `<p class="err">${esc(S.err)}</p>` : ""}
    ${S.busy ? `<p class="info centre">Un instant…</p>` : points(n)}
    ${grille(S.busy)}
    ${n ? `<button class="link" data-act="effacer">Recommencer</button>` : ""}</div>`;
  $$("[data-img]").forEach((b) => (b.onclick = async () => {
    S.seq = [...(S.seq || []), +b.dataset.img]; S.err = "";
    if (S.seq.length < 5) return rendu();
    if (!S.premier) { S.premier = S.seq; S.seq = []; return rendu(); }
    if (S.premier.join() !== S.seq.join()) { S.premier = null; S.seq = []; S.err = "Les deux suites sont différentes. On recommence."; return rendu(); }
    S.images = S.seq; S.seq = []; S.premier = null;
    suite();
  }));
}

async function porteImages(raw, seq) {
  const salt = rnd(16);
  const k = await derive(secretImages(seq), salt);
  return { salt: b64(salt), ...(await chiffre(k, raw)) };
}

async function ouvrir(raw) {
  const k = await cleCoffre(raw);
  const doc = JSON.parse(local.doc);
  const data = JSON.parse(dec.decode(await dechiffre(k, doc)));
  K = { raw, data, shared: { salt: doc.salt, wiv: doc.wiv, wct: doc.wct }, write: await cleEcriture(raw) };
  relance();
  synchro();
}

// Ouvre la version partagée avec les 6 mots. Renvoie { raw, doc, rev } ou lève une erreur parlante.
async function ouvrirAvecMots(id, motsTxt) {
  const mots = normMots(motsTxt).split(" ").filter(Boolean);
  if (mots.length !== 6) throw new Error("Il faut les 6 mots de la fiche de secours.");
  const r = await api("GET", "/" + id);
  if (r.status === 404) throw new Error("Ce coffre est introuvable. Vérifiez le lien.");
  if (!r.ok) throw new Error("Pas de connexion. Réessayez dans un moment.");
  const d = JSON.parse(r.j.doc);
  try {
    const k = await derive("mots|" + mots.join(" "), unb64(d.salt));
    const raw = await dechiffre(k, { iv: d.wiv, ct: d.wct });
    return { raw, doc: r.j.doc, rev: r.j.rev };
  } catch {
    throw new Error("Les 6 mots ne correspondent pas. Vérifiez l'orthographe et l'ordre.");
  }
}

function lienInvit() { return `${location.origin}${location.pathname}#rejoindre=${local.id}`; }

function dessineQR(svg, texte) {
  try {
    const q = QRCore.encode(texte, "M");
    const n = q.size, b = 2;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.mod[y * n + x]) d += `M${x + b} ${y + b}h1v1h-1z`;
    svg.setAttribute("viewBox", `0 0 ${n + 2 * b} ${n + 2 * b}`);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.innerHTML = `<rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#1c1c1e"/>`;
  } catch { svg.outerHTML = `<p class="info">${esc(texte)}</p>`; }
}

async function copier(t, msg) {
  try { await navigator.clipboard.writeText(t); toast(msg); }
  catch {
    const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove();
    toast(ok ? msg : "Impossible de copier. Appuyez sur Montrer et recopiez-le.");
  }
}

// Ouvre Messages (ou le menu de partage du téléphone) avec le texte.
async function partager(texte, titre) {
  if (navigator.share) { try { await navigator.share({ title: titre, text: texte }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  if (!/Android|iPhone|iPad/.test(navigator.userAgent)) return copier(texte, "Texte copié. Collez-le dans votre message.");
  const sep = /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? "&" : "?";
  location.href = `sms:${sep}body=${encodeURIComponent(texte)}`;
}

function feuille(html, actions) {
  const f = document.createElement("div");
  f.className = "feuille";
  f.innerHTML = `<div class="card g" role="dialog" aria-modal="true">${html}</div>`;
  f.onclick = (e) => { if (e.target === f) f.remove(); };
  document.body.appendChild(f);
  $$("[data-f]", f).forEach((b) => (b.onclick = () => { const a = actions[b.dataset.f]; f.remove(); a && a(); }));
  return f;
}

// Générateur : facile à taper (3 mots + 2 chiffres) ou très solide (16 caractères sans ambiguïté).
function generer(mode) {
  if (mode === "solide") {
    const A = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-!?";
    return Array.from({ length: 16 }, () => A[rint(A.length)]).join("");
  }
  const cap = (w) => w[0].toUpperCase() + w.slice(1);
  const w = new Set(); while (w.size < 3) w.add(MOTS[rint(256)]);
  return [...w].map(cap).join("-") + "-" + String(10 + rint(90));
}
function ouvrirGenerateur() {
  let mode = "facile", val = generer(mode);
  const f = feuille(`<p class="big" style="font-size:1.2rem">Inventer un mot de passe</p>
    <div class="seg"><button type="button" data-m="facile" aria-pressed="true">Facile à taper</button><button type="button" data-m="solide" aria-pressed="false">Très solide</button></div>
    <p class="gen" id="gen"></p>
    <div class="two" style="margin-top:12px"><button class="btn alt" data-f="autre">${ic.dice}Un autre</button><button class="btn" data-f="ok">Je prends</button></div>
    <button class="link" data-f="annuler">Annuler</button>`, {});
  const show = () => { $("#gen", f).textContent = val; };
  show();
  $$("[data-m]", f).forEach((b) => (b.onclick = () => { mode = b.dataset.m; $$("[data-m]", f).forEach((x) => x.setAttribute("aria-pressed", x === b)); val = generer(mode); show(); }));
  $('[data-f="autre"]', f).onclick = () => { val = generer(mode); show(); };
  $('[data-f="ok"]', f).onclick = () => { $("#f-pw").value = val; f.remove(); toast("Mot de passe inventé. Pensez à enregistrer."); };
  $('[data-f="annuler"]', f).onclick = () => f.remove();
}

function imprimer(mots) {
  $("#imprimer").innerHTML = `<h1>${esc(titreCoffre())} : fiche de secours</h1>
    <p>Ces 6 mots ouvrent le coffre si on oublie ses images, et permettent d'ajouter un proche. Gardez cette fiche dans un endroit sûr, chez vous.</p>
    ${motsHtml(mots)}
    ${local?.id ? `<p style="margin-top:8mm">Adresse du coffre :<br><b style="word-break:break-all">${esc(lienInvit())}</b></p>` : ""}
    <p style="margin-top:8mm">Imprimée le ${new Date().toLocaleDateString("fr-FR")}.</p>`;
  try { window.print(); } catch { toast("L'impression n'est pas disponible ici. Recopiez les 6 mots sur papier."); }
}

// ------------------------------------------------------------------ actions (délégation)
const actions = {
  fermer,
  async c1() {
    const owner = $("#owner").value.trim(), m = $("#moi").value.trim();
    if (!owner || !m) { S.err = "Remplissez les deux cases."; S.owner = owner; S.moi = m; return rendu(); }
    aller("creer", { etape: 2, owner, moi: m });
  },
  async c3() {
    S.busy = true; S.err = ""; rendu();
    try {
      const raw = rnd(32);
      const salt = rnd(16);
      const kw = await derive("mots|" + S.mots.join(" "), salt);
      const w = await chiffre(kw, raw);
      const shared = { salt: b64(salt), wiv: w.iv, wct: w.ct };
      const now = Date.now();
      const data = {
        owner: S.owner, mots: S.mots, maj: now, morts: {},
        membres: [{ nom: S.moi, at: now }],
        sites: MODELES.map((m) => ({ id: uid(), n: m.n, url: m.url, c: m.c, banque: !!m.banque, login: "", pw: "", note: "", by: S.moi, at: now })),
      };
      const doc = await scelle(raw, data, shared);
      const write = await cleEcriture(raw);
      const r = await api("POST", "", { doc, write });
      if (!r.ok) throw new Error(r.j.error || "Pas de connexion. Réessayez dans un moment.");
      local = { id: r.j.id, rev: r.j.rev, doc, moi: S.moi, owner: S.owner, porte: await porteImages(raw, S.images), taille: local?.taille };
      if (!ecrire(local)) throw new Error("Ce navigateur refuse d'enregistrer. Essayez hors navigation privée.");
      K = { raw, data, shared, write };
      relance();
      toast("Le coffre est prêt.");
      aller("liste");
    } catch (e) { S.busy = false; S.err = e.message || "Une erreur est survenue."; rendu(); }
  },
  async r1() {
    const lien = $("#lien").value.trim(), motsTxt = $("#mots").value, m = $("#moi").value.trim();
    S.id = lien; S.motsTxt = motsTxt; S.moi = m;
    const id = (lien.match(/[A-Za-z0-9_-]{22}/) || [])[0];
    if (!id) { S.err = "Le lien du coffre n'est pas reconnu."; return rendu(); }
    if (!m) { S.err = "Indiquez votre prénom."; return rendu(); }
    S.busy = true; S.err = ""; rendu();
    try {
      const o = await ouvrirAvecMots(id, motsTxt);
      const data = await ouvreDoc(o.raw, o.doc);
      local = { id, rev: o.rev, doc: o.doc, moi: m, owner: data.owner, taille: local?.taille };
      const d = JSON.parse(o.doc);
      K = { raw: o.raw, data, shared: { salt: d.salt, wiv: d.wiv, wct: d.wct }, write: await cleEcriture(o.raw) };
      aller("images", { retour: "rejoindre", suite: async () => {
        local.porte = await porteImages(K.raw, S.images); ecrire(local);
        if (!K.data.membres.some((x) => x.nom.toLowerCase() === m.toLowerCase())) K.data.membres.push({ nom: m, at: Date.now() });
        relance();
        await enregistrer("Bienvenue dans le coffre.");
        history.replaceState(null, "", location.pathname);
        aller("liste");
      } });
    } catch (e) { S.busy = false; S.err = e.message; rendu(); }
  },
  async o1() {
    S.busy = true; S.err = ""; rendu();
    try {
      const o = await ouvrirAvecMots(local.id, $("#mots")?.value || "");
      local.doc = o.doc; local.rev = o.rev; local.attente = false; ecrire(local);
      await ouvrir(o.raw);
      aller("images", { retour: "liste", suite: async () => { local.porte = await porteImages(K.raw, S.images); local.essais = 0; ecrire(local); toast("Vos nouvelles images sont enregistrées."); aller("liste"); } });
    } catch (e) { S.busy = false; S.err = e.message; rendu(); }
  },
  nouvellesImages() { aller("images", { retour: "reglages", suite: async () => { local.porte = await porteImages(K.raw, S.images); ecrire(local); toast("Vos nouvelles images sont enregistrées."); aller("reglages"); } }); },
  effacer() { S.seq = []; S.premier = null; rendu(); },
  imprimer() { imprimer(K?.data?.mots || S.mots || []); },
  ajouter() { aller("modifier", { id: null }); },
  voir() { S.voir = !S.voir; rendu(); },
  modif() { aller("modifier", { id: S.id }); },
  generer: ouvrirGenerateur,
  async sauver() {
    const n = $("#f-n").value.trim();
    if (!n) { S.err = "Donnez un nom au site."; return rendu(); }
    let url = $("#f-url").value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    if (url) { try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) url = ""; } catch { url = ""; } }
    const champs = { n, url, login: $("#f-login").value.trim(), pw: $("#f-pw").value, note: $("#f-note").value.trim(), by: moi(), at: Date.now() };
    let id = S.id;
    if (!id) { id = uid(); K.data.sites.push({ id, c: rint(COULEURS.length), banque: BANQUE_RE.test(n), ...champs }); }
    else Object.assign(K.data.sites.find((x) => x.id === id), champs);
    const reused = champs.pw && K.data.sites.filter((x) => x.id !== id && x.pw === champs.pw).map((x) => x.n);
    aller("fiche", { id });
    await enregistrer(reused?.length ? `Enregistré. Attention : même mot de passe que ${reused.join(", ")}.` : "Fiche enregistrée.");
  },
  supprimer() {
    const s = K.data.sites.find((x) => x.id === S.id);
    feuille(`<p class="big" style="font-size:1.2rem">Supprimer « ${esc(s.n)} » ?</p><p class="p">La fiche disparaîtra aussi chez les autres membres de la famille.</p>
      <button class="btn rouge" data-f="oui" style="color:#fff;background:#ff3b30">Supprimer</button><button class="link" data-f="non">Annuler</button>`, {
      oui: async () => { K.data.sites = K.data.sites.filter((x) => x.id !== s.id); K.data.morts[s.id] = Date.now(); aller("liste"); await enregistrer("Fiche supprimée."); },
    });
  },
  envoyer() {
    const s = K.data.sites.find((x) => x.id === S.id);
    const texte = [s.n, s.login ? `Identifiant : ${s.login}` : "", s.pw ? `Mot de passe : ${s.pw}` : "", s.url || ""].filter(Boolean).join("\n");
    feuille(`<p class="big" style="font-size:1.2rem">Envoyer « ${esc(s.n)} »</p>
      <p class="p">Le message contiendra l'identifiant et le mot de passe. Un message n'est pas protégé comme le coffre : envoyez-le seulement à quelqu'un de confiance, et effacez-le ensuite.</p>
      <button class="btn" data-f="go">${ic.send}Ouvrir Messages</button><button class="link" data-f="non">Annuler</button>`, { go: () => partager(texte, s.n) });
  },
  invit() {
    partager(`Je t'ajoute au ${titreCoffre()} : ${lienInvit()}\nJe te donne les 6 mots de vive voix.`, titreCoffre());
  },
  voirMots() { S.voirMots = true; rendu(); },
  async owner() {
    const v = $("#owner").value.trim(); if (!v) return;
    K.data.owner = v; local.owner = v; ecrire(local); await enregistrer("Nom changé."); rendu();
  },
  quitter() {
    feuille(`<p class="big" style="font-size:1.2rem">Retirer le coffre de ce téléphone ?</p><p class="p">Le coffre reste chez les autres membres. Pour le retrouver ici, il faudra le lien et les 6 mots.</p>
      <button class="btn rouge" data-f="oui" style="color:#fff;background:#ff3b30">Retirer</button><button class="link" data-f="non">Annuler</button>`, {
      oui: () => { const t = local.taille; local = t ? { taille: t } : null; try { localStorage.removeItem(LS); if (t) ecrire(local); } catch {} K = null; aller("accueil"); },
    });
  },
};

app.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-aller],[data-retour]");
  if (!t || t.disabled) return;
  if (t.dataset.act) { const f = actions[t.dataset.act]; if (f) f(); return; }
  if (t.dataset.aller) {
    const v = t.dataset.aller;
    if (["liste", "famille", "reglages"].includes(v) && !K) return aller("verrou");
    return aller(v);
  }
  if (t.dataset.retour) {
    const v = t.dataset.retour;
    if (v === "fiche") return aller("fiche", { id: S.id });
    if (["liste", "reglages"].includes(v) && !K) return aller(local?.porte ? "verrou" : "accueil");
    return aller(v);
  }
});

function rendu() {
  (vues[S.v] || vues.accueil)();
  const b = $(".body"); if (b && !rendu.garde) b.scrollTop = 0;
}

// ------------------------------------------------------------------ démarrage
// La pastille Apphéro arrive un peu après le chargement : on lui laisse sa place.
{ let n = 0; const t = setInterval(() => { if (document.querySelector("[data-apphero-fiche]")) { document.documentElement.classList.add("avec-fiche"); clearInterval(t); } else if (++n > 20) clearInterval(t); }, 250); }
{
  const j = location.hash.match(/rejoindre=([A-Za-z0-9_-]{22})/);
  if (j && !(local?.id === j[1] && local?.porte)) aller("rejoindre", { id: location.origin + location.pathname + "#rejoindre=" + j[1] });
  else if (local?.porte && local?.doc) aller("verrou");
  else aller("accueil");
}
}
