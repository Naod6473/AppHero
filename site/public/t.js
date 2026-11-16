// Mesure d'audience maison d'Apphéro.
// Sans cookie et sans rien stocker dans le navigateur : rien n'est écrit sur ton appareil.
// Les données partent vers apphero.cloud uniquement (jamais vers un tiers) et ne sont jamais vendues.
(function () {
  if (window.ahTrack || navigator.webdriver) return;
  var ENDPOINT = "/api/t";
  var path = location.pathname;
  var queue = [];
  var activeMs = 0;
  var lastTick = Date.now();
  var lastInput = Date.now();
  var maxScroll = 0;
  var errors = 0;
  var sent = false;

  function send(events, beacon) {
    if (!events.length) return;
    var body = JSON.stringify({ path: path, events: events });
    try {
      if (beacon && navigator.sendBeacon) return navigator.sendBeacon(ENDPOINT, body);
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(function () {});
    } catch (e) {
      /* jamais bloquant */
    }
  }

  function push(name, props) {
    queue.push({ n: String(name).slice(0, 32), p: props || {} });
    if (queue.length >= 10) send(queue.splice(0), false);
  }

  // Temps actif : on compte seulement quand l'onglet est visible et qu'il y a eu une action il y a moins de 30 s.
  function tick() {
    var now = Date.now();
    if (document.visibilityState === "visible" && now - lastInput < 30000) activeMs += Math.min(now - lastTick, 5000);
    lastTick = now;
  }
  setInterval(tick, 1000);
  ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"].forEach(function (t) {
    addEventListener(t, function () { lastInput = Date.now(); }, { passive: true });
  });

  function scrollDepth() {
    var h = document.documentElement.scrollHeight - innerHeight;
    var pct = h <= 0 ? 100 : Math.round((scrollY / h) * 100);
    var step = pct >= 98 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0;
    if (step > maxScroll) maxScroll = step;
  }
  addEventListener("scroll", scrollDepth, { passive: true });

  // Clics vers un autre site (X, GitHub…) : on garde seulement le nom du site.
  addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    try {
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin && /^https?:$/.test(u.protocol)) push("sortie", { host: u.hostname });
    } catch (err) {}
  }, true);

  // Erreurs JavaScript (3 au plus par page), pour réparer vite.
  addEventListener("error", function (e) {
    if (errors++ >= 3) return;
    push("erreur", { msg: String(e.message || "erreur").slice(0, 160), src: String(e.filename || "").replace(location.origin, "").slice(0, 80), line: e.lineno || 0 });
  });

  function finish() {
    if (sent) return;
    sent = true;
    tick();
    scrollDepth();
    queue.push({ n: "fin", p: { active: Math.round(activeMs / 1000), scroll: maxScroll } });
    send(queue.splice(0), true);
  }
  addEventListener("pagehide", finish);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") finish();
    else if (sent) {
      // Retour sur l'onglet : on repart pour une nouvelle tranche de temps.
      sent = false;
      activeMs = 0;
      lastTick = Date.now();
    }
  });

  // La page vue, avec ce qui aide à comprendre d'où l'on vient et si le site est rapide.
  function pageView() {
    var q = new URLSearchParams(location.search);
    var ref = "";
    try {
      if (document.referrer) {
        var r = new URL(document.referrer);
        if (r.origin !== location.origin) ref = r.hostname;
      }
    } catch (e) {}
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    var w = Math.min(screen.width, innerWidth || screen.width);
    send([{ n: "page", p: {
      ref: ref,
      utm: [q.get("utm_source"), q.get("utm_medium"), q.get("utm_campaign")].filter(Boolean).join("/").slice(0, 80),
      device: w < 640 ? "mobile" : w < 1024 ? "tablette" : "ordinateur",
      lang: (navigator.language || "").slice(0, 2).toLowerCase(),
      load: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd || 0) : 0,
    } }], false);
  }
  if (document.readyState === "complete") setTimeout(pageView, 0);
  else addEventListener("load", function () { setTimeout(pageView, 0); });

  window.ahTrack = push;
})();
