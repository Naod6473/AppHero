// Le plateau : ce qui bouge sur la page de présentation d'une app.
// Les infos de l'app (défi, fiche de fabrication, app d'avant et d'après) arrivent dans
// window.AH_APP, ajouté par le Worker. Sans elles (fichier ouvert en local), la page reste lisible.
(function () {
  var app = window.AH_APP || null;
  var $ = function (s) { return document.querySelector(s); };
  function track(name, props) { if (window.ahTrack) window.ahTrack(name, props); }

  // La vidéo : le gros bouton lance la lecture, puis les contrôles habituels prennent le relais.
  var box = $(".pl-video"), video = box && box.querySelector("video"), play = box && box.querySelector(".pl-play");
  if (video && play) {
    play.addEventListener("click", function () {
      video.controls = true;
      video.play().catch(function () {});
      if (app) track("video", { app: app.id });
    });
    video.addEventListener("play", function () { box.classList.add("is-playing"); });
  }

  if (!app) return;

  // Le défi tiré au sort pour cette case.
  var tag = $("[data-plateau-tag]");
  if (tag) tag.textContent = "App " + app.id + "/30" + (app.theme ? " · " + app.theme : "");

  // Les coulisses : la fiche de fabrication.
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
    ["Construction", dur(m.buildMinutes)],
    ["Réflexion", dur(m.thinkingMinutes)],
    ["Tokens d'IA", m.tokens != null ? "≈ " + big(m.tokens) : null],
    ["Messages à l'IA", m.prompts != null ? String(m.prompts) : null],
    ["Lignes de code", big(m.lines)],
  ].filter(function (f) { return f[1]; });
  var making = $("[data-plateau-making]");
  if (making) {
    making.innerHTML =
      (facts.length
        ? '<div class="pl-facts">' + facts.map(function (f) { return '<div class="pl-fact"><span>' + esc(f[0]) + "</span><b>" + esc(f[1]) + "</b></div>"; }).join("") + "</div>"
        : "<p style=\"margin:0;font-size:18px\">Les chiffres arrivent bientôt.</p>") +
      (m.tool ? "<small>Fabriquée avec " + esc(m.tool) + ".</small>" : "");
  }

  // J'aime / Bof : un avis par personne et par app, modifiable.
  var mine = 0, likes = 0, busy = false;
  var buttons = document.querySelectorAll(".pl-votes button[data-v]");
  var count = $("[data-plateau-likes]");
  function paint() {
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.v) === mine)); });
    if (count) count.textContent = likes ? " · " + likes : "";
  }
  buttons.forEach(function (b) {
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
          track(mine === 1 ? "jaime" : mine === -1 ? "bof" : "avis_retire", { app: app.id, from: "plateau" });
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

  // Partager : le lien court /NN.
  var share = $(".pl-share");
  if (share) share.addEventListener("click", function () {
    var url = location.origin + "/" + app.id;
    track("partage", { app: app.id, from: "plateau" });
    var data = { title: app.title + " · Apphéro", text: app.title + " : " + app.tagline + " (app " + app.num + "/30 d'Apphéro)", url: url };
    if (navigator.share) return navigator.share(data).catch(function () {});
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () {
      share.textContent = "Lien copié";
      setTimeout(function () { share.textContent = "Partager"; }, 1800);
    });
  });

  // La suite : l'app d'après (son nom seulement une fois sortie) et celle d'avant.
  var DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function parisDay(iso) {
    return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(iso));
  }
  function when(iso) {
    var day = parisDay(iso), today = parisDay(new Date().toISOString());
    var tomorrow = parisDay(new Date(Date.now() + 864e5).toISOString());
    if (day === today) return "Ce soir, 18 h";
    if (day === tomorrow) return "Demain, 18 h";
    var d = new Date(day + "T12:00:00Z");
    return DAYS[d.getUTCDay()].replace(/^./, function (c) { return c.toUpperCase(); }) + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + ", 18 h";
  }
  var next = app.next, nextTitle = $("[data-plateau-next]"), nextText = $("[data-plateau-next-text]");
  if (nextTitle && next) {
    if (next.released) {
      nextTitle.innerHTML = 'App suivante : <a class="pl-next-link" href="/apps/' + esc(next.slug) + '/">' + esc(next.title) + "</a>";
      if (nextText) nextText.textContent = next.theme ? "Défi : " + next.theme + "." : "";
    } else {
      nextTitle.textContent = when(next.publishAt) + " : " + (next.wheel ? "la roue décide" : "l'app " + next.id);
      if (nextText) nextText.textContent = next.wheel
        ? "La roue tourne la veille au soir, le tirage tombe sur X."
        : next.theme ? "Défi : " + next.theme + ". Les annonces tombent sur X." : "Les annonces tombent sur X.";
    }
  } else if (nextTitle && !next) {
    nextTitle.textContent = "C'était la dernière app";
    if (nextText) nextText.textContent = "Place à la grande finale.";
  }
  var prev = $("[data-plateau-prev]");
  if (prev) {
    if (app.prev && app.prev.released) {
      prev.href = "/apps/" + app.prev.slug + "/";
      prev.textContent = "← App " + app.prev.id + " · " + app.prev.title;
    } else prev.hidden = true;
  }
})();
