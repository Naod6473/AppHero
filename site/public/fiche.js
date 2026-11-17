// La fiche d'une app Apphéro, ajoutée par le site dans chaque app.
// Une pastille en bas de l'écran : comment l'app a été fabriquée, j'aime / bof, retour à l'accueil.
// Tout est dans un Shadow DOM : le style de l'app n'est pas touché, et inversement.
(function () {
  var app = window.AH_APP;
  if (!app || window.top !== window) return;

  var m = app.making || {};
  function dur(min) {
    if (min == null) return null;
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), r = Math.round(min % 60);
    return h + " h" + (r ? " " + String(r).padStart(2, "0") : "");
  }
  function big(n) {
    if (n == null) return null;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " M";
    if (n >= 1e3) return Math.round(n / 1e3) + " k";
    return String(n);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var facts = [
    ["⏱", "Construction", dur(m.buildMinutes)],
    ["💭", "Réflexion", dur(m.thinkingMinutes)],
    ["🔤", "Tokens d'IA (estimés)", m.tokens != null ? "≈ " + big(m.tokens) : null],
    ["💬", "Messages à l'IA", m.prompts != null ? String(m.prompts) : null],
    ["📄", "Lignes de code", big(m.lines)],
    ["🛠", "Outil", m.tool || null],
  ].filter(function (f) { return f[2]; });
  var short = facts.slice(0, 2).map(function (f) { return f[0] + " " + f[2]; }).join(" · ");

  var host = document.createElement("div");
  host.setAttribute("data-apphero-fiche", "");
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:Rubik,system-ui,-apple-system,'Segoe UI',sans-serif}" +
    ".wrap{position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:calc(100vw - 24px);color:#15112B}" +
    ".pill{display:flex;align-items:center;gap:8px;min-height:44px;padding:6px 14px 6px 6px;background:#FFD83D;border:3px solid #15112B;border-radius:999px;box-shadow:4px 4px 0 #15112B;font-weight:800;font-size:14px;cursor:pointer;max-width:100%}" +
    ".pill b{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#15112B;color:#FFD83D;font-size:13px;overflow:hidden}" +
    ".pill b img{width:100%;height:100%;object-fit:cover}" +
    ".pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".panel{position:absolute;left:0;bottom:56px;width:min(340px,calc(100vw - 24px));background:#FFF8E1;border:4px solid #15112B;border-radius:20px;box-shadow:6px 6px 0 #15112B;padding:16px}" +
    ".panel[hidden]{display:none}" +
    "h2{margin:0;font-size:20px;line-height:1.15}" +
    ".sub{margin:4px 0 12px;font-size:13px;font-weight:700;opacity:.8}" +
    ".facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}" +
    ".fact{background:#fff;border:2px solid #15112B;border-radius:12px;padding:6px 8px}" +
    ".fact small{display:block;font-size:11px;font-weight:800;opacity:.75}" +
    ".fact strong{font-size:17px}" +
    ".note{font-size:14px;line-height:1.4;margin:0 0 12px}" +
    ".row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
    "button.r,button.sh,a.home{min-height:40px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:3px solid #15112B;border-radius:12px;background:#fff;font-weight:800;font-size:14px;color:#15112B;text-decoration:none;cursor:pointer;box-shadow:2px 2px 0 #15112B}" +
    "button.r[aria-pressed=true].like{background:#FF3D9A}" +
    "button.r[aria-pressed=true].bof{background:#B9A3FF}" +
    "a.home{margin-left:auto;background:#15112B;color:#FFD83D}" +
    ".x{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;background:none;font-size:20px;cursor:pointer;color:#15112B}" +
    "@media print{.wrap{display:none}}" +
    "</style>" +
    '<div class="wrap">' +
    '<div class="panel" id="panel" hidden role="dialog" aria-label="Fiche de l\'app">' +
    '<button class="x" id="close" type="button" aria-label="Fermer">✕</button>' +
    "<h2>" + esc(app.title) + "</h2>" +
    '<p class="sub">App ' + esc(app.num) + "/30" + (app.theme ? " · " + esc(app.theme) : "") + (app.criterion ? " · " + esc(app.criterion) : "") + "</p>" +
    (facts.length
      ? '<div class="facts">' + facts.map(function (f) { return '<div class="fact"><small>' + f[0] + " " + esc(f[1]) + "</small><strong>" + esc(f[2]) + "</strong></div>"; }).join("") + "</div>"
      : '<p class="note">La fiche de fabrication arrive bientôt.</p>') +
    (m.note ? '<p class="note">' + esc(m.note) + "</p>" : "") +
    '<div class="row">' +
    '<button class="r like" type="button" data-v="1" aria-pressed="false">👍 <span id="n">J\'aime</span></button>' +
    '<button class="r bof" type="button" data-v="-1" aria-pressed="false">👎 Bof</button>' +
    '<button class="sh" type="button" id="share" aria-label="Partager">📤</button>' +
    '<a class="home" href="/">Apphéro</a>' +
    "</div></div>" +
    '<button class="pill" id="pill" type="button" aria-expanded="false" aria-controls="panel"><b>' + (app.logo ? '<img src="' + esc(app.logo) + '" alt="">' : esc(app.id)) + "</b><span>" + (short ? esc(short) : "Apphéro · la fiche") + "</span></button>" +
    "</div>";

  var $ = function (id) { return root.getElementById(id); };
  var mine = 0, likes = 0, busy = false;
  function paint() {
    root.querySelectorAll("button.r").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.v) === mine)); });
    $("n").textContent = "J'aime · " + likes;
  }
  function toggle(open) {
    $("panel").hidden = !open;
    $("pill").setAttribute("aria-expanded", String(open));
    if (open && window.ahTrack) window.ahTrack("fiche", { app: app.id });
  }
  $("pill").addEventListener("click", function () { toggle($("panel").hidden); });
  $("close").addEventListener("click", function () { toggle(false); });
  $("share").addEventListener("click", function () {
    var url = location.origin + "/" + app.id;
    if (window.ahTrack) window.ahTrack("partage", { app: app.id, from: "fiche" });
    var data = { title: app.title + " · Apphéro", text: app.title + " : " + app.tagline + " (app " + app.num + "/30 d'Apphéro)", url: url };
    if (navigator.share) return navigator.share(data).catch(function () {});
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { $("share").textContent = "✓ Copié"; setTimeout(function () { $("share").textContent = "📤"; }, 1800); });
  });
  root.querySelectorAll("button.r").forEach(function (b) {
    b.addEventListener("click", function () {
      if (busy) return;
      var v = Number(b.dataset.v), before = mine, likesBefore = likes;
      mine = mine === v ? 0 : v;
      likes += (mine === 1) - (before === 1);
      paint();
      busy = true;
      fetch("/api/react", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ app: app.id, value: mine }) })
        .then(function (r) {
          if (!r.ok) throw new Error();
          if (window.ahTrack) window.ahTrack(mine === 1 ? "jaime" : mine === -1 ? "bof" : "avis_retire", { app: app.id, from: "fiche" });
        })
        .catch(function () { mine = before; likes = likesBefore; paint(); })
        .then(function () { busy = false; });
    });
  });
  fetch("/api/state", { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (st) {
      likes = (st.likes && st.likes[app.id]) || 0;
      mine = (st.me && st.me.reactions && st.me.reactions[app.id]) || 0;
      paint();
    })
    .catch(function () {});

  function mount() { document.body.appendChild(host); paint(); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
