// Le bilan du défi, calculé par le serveur à partir des fiches des apps et des votes.
import { api, esc, confetti, shareApp } from "./common.js";
import { fmtDateTime } from "../../shared/calendar.js";

const $ = (id) => document.getElementById(id);
const hours = (min) => (min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`);
const big = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M` : n >= 1e4 ? `${Math.round(n / 1e3)} k` : n.toLocaleString("fr-FR"));

function rank(rows, apps, unit) {
  if (!rows.length) return `<p>Pas encore de données.</p>`;
  return `<div class="ranks">${rows
    .map((r, i) => {
      const a = apps.get(r.app);
      const label = `${r.n} ${unit}${r.n > 1 && unit !== "j'aime" ? "s" : ""}`;
      return a
        ? `<a class="rank" href="/apps/${esc(a.slug)}/"><i>${i + 1}</i><span>${esc(a.title)}</span><small>${label}</small></a>`
        : `<div class="rank"><i>${i + 1}</i><span>App ${esc(r.app)}</span><small>${label}</small></div>`;
    })
    .join("")}</div>`;
}

async function main() {
  let d;
  try {
    d = await api("/api/bilan");
  } catch {
    $("out").innerHTML = `<p class="lead">Le bilan n'est pas disponible pour l'instant.</p>`;
    return;
  }
  if (!d.ready) {
    $("out").innerHTML = `<div class="wait"><p class="lead">Le bilan du défi s'ouvre avec le verdict de la grande finale.</p><strong>${esc(fmtDateTime(d.at))}</strong><a class="btn btn-dark btn-lg" href="/#vote">Voter pour la finale</a></div>`;
    return;
  }
  const apps = new Map(d.apps.map((a) => [a.id, a]));
  const w = d.winner && apps.get(d.winner);
  const t = d.totals;
  const nums = [
    [t.apps, "apps sorties"],
    t.buildMinutes && [hours(t.buildMinutes), "de construction"],
    t.thinkingMinutes && [hours(t.thinkingMinutes), "de réflexion"],
    t.tokens && [`≈ ${big(t.tokens)}`, "tokens d'IA (estimés)"],
    t.prompts && [big(t.prompts), "messages à l'IA"],
    t.lines && [big(t.lines), "lignes de code"],
    [big(t.likes), "j'aime"],
    [big(t.votes), t.votes > 1 ? "voix aux votes" : "voix au vote"],
    t.visitors && [big(t.visitors), t.visitors > 1 ? "visites" : "visite"],
  ].filter(Boolean);
  $("out").innerHTML = `
    ${w ? `<section class="champ" id="champ"><small>LA GRANDE GAGNANTE</small><span class="crown" aria-hidden="true">👑</span><strong>${esc(w.title)}</strong>
      <p style="font-weight:800;font-size:19px;margin:10px 0 0">App ${w.num}/30 · ${esc(w.theme || "")}</p>
      <a class="btn btn-lg" href="/apps/${esc(w.slug)}/">Ouvrir l'app</a> <button class="btn btn-lg" type="button" id="share-w">📤 Partager</button></section>` : ""}
    <h2 class="h2">En chiffres</h2>
    <div class="nums">${nums.map(([n, l]) => `<div class="num"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>
    <div class="boards">
      <div class="board" style="background: var(--mint)"><h3>Les plus aimées</h3>${rank(d.topLikes, apps, "j'aime")}</div>
      <div class="board" style="background: var(--cyan)"><h3>Les plus regardées</h3>${rank(d.topViews, apps, "visite")}</div>
      <div class="board" style="background: var(--lilac)"><h3>Les apps de la semaine</h3><div class="ranks">${d.weekly
        .map((b) => {
          const a = apps.get(b.winner);
          return a ? `<a class="rank" href="/apps/${esc(a.slug)}/"><i>${esc(b.id)}</i><span>${esc(a.title)}</span></a>` : `<div class="rank is-empty"><i>${esc(b.id)}</i><span>—</span></div>`;
        })
        .join("")}</div></div>
    </div>`;
  if (w) {
    $("share-w").addEventListener("click", () => shareApp(w));
    confetti($("champ"));
  }
}
main();
