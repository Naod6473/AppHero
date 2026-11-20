// La page de l'arbitre de Préavis (app 11) : ouvrir des paris, les clore, les trancher.
// Elle parle à /api/admin/preavis/… avec le code organisateur, retapé à chaque visite :
// il reste en mémoire le temps de la page et n'est jamais gardé dans le navigateur.
import { api, esc, toast } from "./common.js";
import { CATS, HOUSE, MAX_OUTCOMES, seedsFor, shares, odds, fmt, fmtOdds, fmtPct } from "../../apps/11-preavis/lib.js";

const $ = (sel, root = document) => root.querySelector(sel);
const out = $("#out");
let code = "";
const S = { data: null, tab: "wait", edit: null, resolving: null, pending: null, players: null, q: "" };

const call = (path, body) =>
  api(`/api/admin/preavis/${path}`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined, headers: { authorization: `Bearer ${code}` } });

// Les dates se tapent et se lisent à l'heure de l'appareil (celle de Paris, en pratique).
const dtf = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const when = (ms) => (ms ? dtf.format(new Date(ms)) : "–");
const pad = (n) => String(n).padStart(2, "0");
function toInput(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromInput = (v) => (v ? new Date(v).getTime() : null);

const STATUS = { draft: ["draft", "Brouillon"], open: ["open", "Ouvert"], closed: ["wait", "À trancher"], resolved: ["done", "Tranché"], void: ["done", "Annulé"] };
const group = (m) => (m.raw === "draft" ? "draft" : m.status === "closed" ? "wait" : m.status === "open" ? "open" : "done");

async function load() {
  S.data = await call("all");
  render();
}

function render() {
  const d = S.data;
  if (!d) return;
  const count = (g) => d.markets.filter((m) => group(m) === g).length;
  const tabs = [
    ["wait", `À trancher (${count("wait")})`],
    ["open", `Ouverts (${count("open")})`],
    ["draft", `Brouillons (${count("draft")})`],
    ["done", `Tranchés (${count("done")})`],
    ["new", S.edit?.id ? "Modifier" : "Nouveau pari"],
    ["players", "Joueurs"],
    ["log", "Journal"],
  ];
  const t = d.totals;
  let pane;
  if (S.tab === "new") pane = marketForm(S.edit || blank());
  else if (S.tab === "players") pane = playersPane();
  else if (S.tab === "log") pane = logPane();
  else {
    const list = d.markets.filter((m) => group(m) === S.tab);
    pane = list.length ? list.map(marketBox).join("") : `<p class="empty">${S.tab === "wait" ? "Rien à trancher : aucun pari clos n'attend son verdict." : "Rien ici pour l'instant."}</p>`;
  }
  out.innerHTML = `
    <div class="kpis">
      <div class="kpi"><small>Inscrits</small><strong>${fmt(t.players)}</strong></div>
      <div class="kpi"><small>Ont parié</small><strong>${fmt(t.active)}</strong></div>
      <div class="kpi"><small>Mises</small><strong>${fmt(t.bets)}</strong></div>
      <div class="kpi"><small>Pavés misés</small><strong>${fmt(t.wagered)}</strong></div>
      <div class="kpi"><small>Pavés en circulation</small><strong>${fmt(t.money)}</strong></div>
    </div>
    <div class="arb-tabs">${tabs.map(([id, name]) => `<button class="btn btn-pill" type="button" data-tab="${id}" aria-pressed="${S.tab === id}">${esc(name)}</button>`).join("")}</div>
    ${d.seeded ? "" : '<p class="box">La salle n\'a pas encore été ouverte : les paris de départ seront inscrits à la toute première visite de l\'app. Tu peux déjà préparer des paris ici.</p>'}
    <div id="pane">${pane}</div>`;
  if (S.tab === "new") updateSum();
}

// ---------------------------------------------------------------- un pari

function marketBox(m) {
  const [cls, label] = m.raw === "draft" ? STATUS.draft : STATUS[m.status];
  const sh = shares(m.outcomes);
  const od = odds(m.outcomes);
  const rows = m.outcomes
    .map(
      (o, i) =>
        `<tr${m.status === "resolved" && m.winner === i ? ' class="win"' : ""}><td>${esc(o.label)}${m.status === "resolved" && m.winner === i ? " (gagnant)" : ""}</td><td class="n">${fmtPct(sh[i])}</td><td class="n">${fmtOdds(od[i])}</td><td class="n">${fmt(o.pool)}</td><td class="n">${fmt(o.seed)}</td><td class="n">${o.grogne > 0 ? "+" : ""}${o.grogne}</td></tr>`,
    )
    .join("");
  const g = group(m);
  const acts = [];
  if (g === "draft") acts.push(["publish", "Ouvrir le pari", "btn-dark"], ["edit", "Modifier"], ["delete", "Supprimer", "danger"]);
  if (g === "open") acts.push(["edit", "Modifier"], ["close", "Clore les mises maintenant"], ["resolve", "Trancher", "btn-dark"]);
  if (g === "wait") acts.push(["resolve", "Trancher", "btn-dark"], ["edit", "Modifier"]);
  if (g === "done") acts.push(["reopen", "Annuler ce verdict"]);
  if ((g === "open" || g === "wait") && !m.total) acts.push(["delete", "Supprimer", "danger"]);
  const verdict =
    m.status === "resolved" || m.status === "void"
      ? `<p class="rules"><b>${m.status === "void" ? "Pari annulé" : `Verdict : ${esc(m.outcomes[m.winner]?.label ?? "?")}`}</b> (${when(m.resolvedAt)}). ${esc(m.verdict || "")} ${/^https?:\/\//i.test(m.source || "") ? `<a href="${esc(m.source)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}</p>`
      : "";
  return `<article class="box" id="m-${esc(m.id)}">
    <div class="head"><span class="pill ${cls}">${label}</span><span class="pill">${esc(CATS[m.cat]?.name || m.cat)}</span><span>${esc(m.symbol)}</span><span>${esc(m.id)}</span>${m.pinned ? '<span class="pill">À la une</span>' : ""}</div>
    <h2>${esc(m.title)}</h2>
    <p class="meta">Clôture des mises : ${when(m.closesAt)} · Verdict au plus tard : ${when(m.resolveBy)} · ${fmt(m.bettors)} parieur(s) · ${fmt(m.total)} pavés misés</p>
    <p class="rules">${esc(m.rules || "Pas de règle écrite.")}</p>
    ${verdict}
    <div class="scroll"><table><tr><th>Issue</th><th class="n">Part</th><th class="n">Cote</th><th class="n">Misé</th><th class="n">Maison</th><th class="n">Grogne</th></tr>${rows}</table></div>
    <div class="actions">${acts.map(([act, name, c]) => `<button class="btn ${c || ""}" type="button" data-act="${act}" data-id="${esc(m.id)}">${name}</button>`).join("")}</div>
    ${S.resolving === m.id ? resolveForm(m) : ""}
  </article>`;
}

function resolveForm(m) {
  if (S.pending?.id === m.id) {
    const p = S.pending;
    const what = p.go === "void" ? "annuler ce pari : tout le monde récupère sa mise" : `déclarer « ${esc(m.outcomes[p.body.winner].label)} » gagnant`;
    return `<div class="confirm">Tu vas ${what}. ${fmt(m.bettors)} parieur(s) concerné(s). Un verdict se corrige ensuite avec « Annuler ce verdict ».
      <div class="actions"><button class="btn btn-dark" type="button" data-act="confirm">Confirmer</button><button class="btn" type="button" data-act="back">Revenir</button></div></div>`;
  }
  return `<form class="form resolve" data-form="resolve" data-id="${esc(m.id)}">
    <h3>Trancher</h3>
    <div class="radios">${m.outcomes.map((o, i) => `<label><input type="radio" name="winner" value="${i}"> ${esc(o.label)}</label>`).join("")}</div>
    <label>Le verdict, en une ou deux phrases (affiché à tout le monde)<textarea name="verdict" rows="2" maxlength="600"></textarea></label>
    <label>La source : un lien public<input name="source" type="url" placeholder="https://…" maxlength="500"></label>
    <label>Heure de l'événement (facultatif)<input name="cutoff" type="datetime-local"><small>Si l'issue était connue avant la clôture : les mises arrivées après cette heure sont remboursées et ne comptent pas dans le partage.</small></label>
    <div class="actions"><button class="btn btn-dark" name="go" value="resolve">Trancher</button><button class="btn danger" name="go" value="void">Annuler le pari et tout rembourser</button><button class="btn" type="button" data-act="cancel-resolve">Fermer</button></div>
  </form>`;
}

// ---------------------------------------------------------------- créer, modifier

const blank = () => ({ id: "", title: "", cat: "greves", symbol: "", rules: "", closesAt: null, resolveBy: null, pinned: false, total: 0, outcomes: [{ label: "Oui", pct: 50, grogne: 50 }, { label: "Non", pct: 50, grogne: -50 }] });
function editable(m) {
  return { ...m, outcomes: m.outcomes.map((o) => ({ label: o.label, pct: o.seed / (HOUSE / 100), grogne: o.grogne })) };
}
function outRow(o, locked) {
  return `<div class="orow"><input name="label" maxlength="48" placeholder="Issue" value="${esc(o.label)}" aria-label="Nom de l'issue"><input name="pct" type="number" min="1" max="99" step="0.1" value="${o.pct}" aria-label="Estimation de départ, en %"${locked ? " disabled" : ""}><input name="grogne" type="number" min="-100" max="100" step="10" value="${o.grogne}" aria-label="Grogne, de -100 à +100"><span class="odd"></span><button type="button" data-act="del-out"${locked ? " disabled" : ""}>Retirer</button></div>`;
}
function marketForm(m) {
  const locked = m.total > 0;
  return `<form class="box form" data-form="market" data-id="${esc(m.id)}">
    <h2>${m.id ? `Modifier « ${esc(m.id)} »` : "Nouveau pari"}</h2>
    <p class="hint">Un fait public et vérifiable (un vote, un chiffre officiel, une date), jamais une personne visée. La règle dit exactement comment on tranche, et d'où vient la réponse.</p>
    <label>La question<input name="title" maxlength="180" required value="${esc(m.title)}" placeholder="Une grève à la SNCF perturbera-t-elle… ?"></label>
    <div class="two">
      <label>Rubrique<select name="cat">${Object.entries(CATS).map(([id, c]) => `<option value="${id}"${m.cat === id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label>Symbole du bandeau (12 caractères)<input name="symbol" maxlength="12" value="${esc(m.symbol)}" placeholder="SNCF.NOEL"></label>
    </div>
    <label>La règle<textarea name="rules" rows="4" maxlength="1500">${esc(m.rules)}</textarea></label>
    <div class="two">
      <label>Clôture des mises<input name="closesAt" type="datetime-local" required value="${toInput(m.closesAt)}"></label>
      <label>Verdict au plus tard (facultatif)<input name="resolveBy" type="datetime-local" value="${toInput(m.resolveBy)}"></label>
    </div>
    <fieldset><legend>Les issues (de 2 à ${MAX_OUTCOMES}) : nom, estimation de départ en %, grogne</legend>
      <div id="outs">${m.outcomes.map((o) => outRow(o, locked)).join("")}</div>
      <div><button type="button" class="mini" data-act="add-out"${locked ? " disabled" : ""}>Ajouter une issue</button></div>
      <p class="hint" id="sum"></p>
      <p class="hint">${locked ? "Des mises existent déjà : on peut corriger les noms et la grogne, plus les estimations ni le nombre d'issues." : `L'estimation fixe la première cote : la maison pose ${fmt(HOUSE)} pavés répartis selon ces pourcentages.`} La grogne va de -100 (tout va bien) à +100 (ça chauffe) : elle fait bouger le grognomètre.</p>
    </fieldset>
    <label class="check"><input type="checkbox" name="pinned"${m.pinned ? " checked" : ""}> À la une (en tête de la salle)</label>
    <div class="actions">
      <button class="btn btn-dark" name="go" value="open">${m.id && m.raw !== "draft" ? "Enregistrer" : "Ouvrir le pari"}</button>
      ${m.id && m.raw !== "draft" ? "" : '<button class="btn" name="go" value="draft">Garder en brouillon</button>'}
      <button class="btn" type="button" data-act="cancel-edit">Annuler</button>
    </div>
  </form>`;
}
function readOuts() {
  return [...document.querySelectorAll("#outs .orow")].map((row) => ({ label: $('[name="label"]', row).value.trim(), pct: Number($('[name="pct"]', row).value), grogne: Number($('[name="grogne"]', row).value) || 0 }));
}
// Le total des estimations et les cotes de départ, mis à jour à chaque frappe.
function updateSum() {
  const outs = readOuts();
  const total = outs.reduce((s, o) => s + (o.pct || 0), 0);
  const seeds = seedsFor(outs.map((o) => o.pct));
  const od = seeds ? odds(seeds.map((seed) => ({ seed, pool: 0 }))) : [];
  document.querySelectorAll("#outs .odd").forEach((el, i) => (el.textContent = seeds ? fmtOdds(od[i]) : "–"));
  const sum = $("#sum");
  if (sum) sum.innerHTML = `Total des estimations : <b>${Math.round(total * 10) / 10} %</b>${seeds ? ". C'est bon." : " (il faut 100 % au total, et au moins 1 % par issue)."}`;
}

// ---------------------------------------------------------------- joueurs, journal

function playersPane() {
  const list = S.players;
  const rows = (list || [])
    .map(
      (p) =>
        `<tr><td>${p.id}</td><td>${esc(p.name)}${p.banned ? " (suspendu)" : ""}</td><td class="n">${fmt(p.balance + p.staked)}</td><td class="n">${fmt(p.wagered)}</td><td class="n">${p.won}/${p.settled}</td><td>${when(p.created_at)}</td><td>${esc(p.net || "")}</td><td><button class="mini" type="button" data-act="mod" data-do="rename" data-id="${p.id}">Remplacer le pseudo</button> <button class="mini" type="button" data-act="mod" data-do="${p.banned ? "unban" : "ban"}" data-id="${p.id}">${p.banned ? "Rétablir" : "Suspendre"}</button></td></tr>`,
    )
    .join("");
  return `<section class="box">
    <h2>Joueurs</h2>
    <p class="hint">Un pseudo déplacé se remplace par « Parieur n° … ». Un compte suspendu ne peut plus miser et sort des classements. La colonne « Réseau » est une étiquette anonyme du jour d'inscription : la même étiquette le même jour, c'est le même réseau.</p>
    <form class="arb-bar" data-form="players"><input name="q" placeholder="Chercher un pseudo" value="${esc(S.q)}" aria-label="Chercher un pseudo"><button class="btn btn-pill" type="submit">Chercher</button></form>
    ${list ? (list.length ? `<div class="scroll"><table><tr><th>N°</th><th>Pseudo</th><th class="n">Fortune</th><th class="n">Misé</th><th class="n">Gagnés</th><th>Inscrit le</th><th>Réseau</th><th></th></tr>${rows}</table></div>` : '<p class="empty">Personne à ce nom.</p>') : '<p class="empty">Lance une recherche (vide : les 100 derniers inscrits).</p>'}
  </section>`;
}
function logPane() {
  const rows = S.data.log.map((l) => `<tr><td>${when(l.ts)}</td><td>${esc(l.action)}</td><td>${esc(l.market || "")}</td><td>${esc(l.data || "")}</td></tr>`).join("");
  return `<section class="box"><h2>Journal de l'arbitre</h2>${rows ? `<div class="scroll"><table><tr><th>Quand</th><th>Action</th><th>Pari</th><th>Détail</th></tr>${rows}</table></div>` : '<p class="empty">Rien pour l\'instant.</p>'}</section>`;
}

// ---------------------------------------------------------------- actions

async function act(fn, done) {
  try {
    await fn();
    if (done) toast(done);
    await load();
  } catch (err) {
    toast(err.status === 401 ? "Code organisateur incorrect." : err.message);
  }
}
const market = (id) => S.data.markets.find((m) => m.id === id);

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  code = $("#token").value.trim();
  if (!code) return toast("Tape le code organisateur.");
  try {
    await load();
  } catch (err) {
    out.innerHTML = "";
    toast(err.status === 401 ? "Code organisateur incorrect." : err.message);
  }
});

out.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab],[data-act]");
  if (!b) return;
  if (b.dataset.tab) {
    S.tab = b.dataset.tab;
    if (S.tab !== "new") S.edit = null;
    S.resolving = S.pending = null;
    return render();
  }
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case "edit":
      S.edit = editable(market(id));
      S.tab = "new";
      return render();
    case "cancel-edit":
      S.edit = null;
      S.tab = "open";
      return render();
    case "add-out":
      if (document.querySelectorAll("#outs .orow").length < MAX_OUTCOMES) $("#outs").insertAdjacentHTML("beforeend", outRow({ label: "", pct: "", grogne: 0 }, false));
      return updateSum();
    case "del-out":
      if (document.querySelectorAll("#outs .orow").length > 2) b.closest(".orow").remove();
      return updateSum();
    case "resolve":
      S.resolving = S.resolving === id ? null : id;
      S.pending = null;
      render();
      return document.getElementById(`m-${id}`)?.querySelector(".resolve")?.scrollIntoView({ block: "center", behavior: "smooth" });
    case "cancel-resolve":
      S.resolving = S.pending = null;
      return render();
    case "back":
      S.pending = null;
      return render();
    case "confirm": {
      const p = S.pending;
      S.resolving = S.pending = null;
      return act(() => call(p.go, p.body), p.go === "void" ? "Pari annulé, tout le monde est remboursé." : "Verdict rendu, les gagnants sont payés.");
    }
    case "publish": {
      const m = editable(market(id));
      return act(() => call("market", { ...m, status: "open" }), "Le pari est ouvert.");
    }
    case "close":
      return act(() => call("close", { id }), "Les mises sont closes.");
    case "reopen":
      return act(() => call("reopen", { id }), "Verdict annulé : le pari attend de nouveau son verdict.");
    case "delete":
      return act(() => call("delete", { id }), "Pari supprimé.");
    case "mod":
      return act(async () => {
        await call("moderate", { player: Number(id), action: b.dataset.do });
        S.players = (await call(`players?q=${encodeURIComponent(S.q)}`)).players;
      }, "C'est fait.");
  }
});

out.addEventListener("input", (e) => {
  if (e.target.closest("#outs")) updateSum();
});

out.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const go = e.submitter?.value || "open";
  const f = form.elements;
  if (form.dataset.form === "market") {
    const closesAt = fromInput(f.closesAt.value);
    if (!closesAt) return toast("Il faut une date de clôture.");
    const body = { id: form.dataset.id || undefined, title: f.title.value, cat: f.cat.value, symbol: f.symbol.value, rules: f.rules.value, closesAt, resolveBy: fromInput(f.resolveBy.value), pinned: f.pinned.checked, status: go === "draft" ? "draft" : "open", outcomes: readOuts() };
    // Tant que le formulaire est affiché, on garde ce qui a été tapé (en cas de refus du serveur).
    S.edit = { ...(S.edit || blank()), ...body, id: form.dataset.id || "", outcomes: body.outcomes };
    return act(async () => {
      await call("market", body);
      S.edit = null;
      S.tab = go === "draft" ? "draft" : "open";
    }, go === "draft" ? "Brouillon enregistré." : "Pari enregistré.");
  }
  if (form.dataset.form === "resolve") {
    const id = form.dataset.id;
    if (go === "void") S.pending = { id, go: "void", body: { id, verdict: f.verdict.value, source: f.source.value } };
    else {
      if (f.winner.value === "") return toast("Choisis l'issue gagnante.");
      S.pending = { id, go: "resolve", body: { id, winner: Number(f.winner.value), verdict: f.verdict.value, source: f.source.value, cutoff: fromInput(f.cutoff.value) } };
    }
    return render();
  }
  if (form.dataset.form === "players") {
    S.q = f.q.value.trim();
    return act(async () => {
      S.players = (await call(`players?q=${encodeURIComponent(S.q)}`)).players;
    });
  }
});
