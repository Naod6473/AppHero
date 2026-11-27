// Pile 10 : appuie, puis rappuie au bout de 10 secondes pile. Le chrono se cache au bout de 3 s.
(() => {
  "use strict";
  const CIBLE = 10000, VISIBLE = 3000, LIMITE = 20000;
  const $ = (id) => document.getElementById(id);
  const bouton = $("bouton"), etiquette = $("etiquette"), chrono = $("chrono"), verdict = $("verdict");
  const anneau = document.querySelector(".anneau"), liste = $("liste"), nomForm = $("nom-form"), nomInput = $("nom");
  const URL_APP = "https://apphero.cloud/apps/10-pile10/";
  const store = {
    get(k, d) { try { const v = localStorage.getItem("pile10:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("pile10:" + k, JSON.stringify(v)); } catch {} },
  };
  let etat = "pret", t0 = 0, raf = 0, minuterie = 0, dernier = null, ouvert = true;
  let nom = store.get("nom", "");
  nomInput.value = nom;

  // ---------- son : un « pouic » de jouet en caoutchouc, synthétisé
  let ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function pouic(haut = 1) {
    const a = audio(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o.type = "square"; o2.type = "sine";
    const b = 760 * haut;
    o.frequency.setValueAtTime(b, t);
    o.frequency.exponentialRampToValueAtTime(b * 2.1, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(b * 1.55, t + 0.16);
    o2.frequency.setValueAtTime(b * 2, t);
    o2.frequency.exponentialRampToValueAtTime(b * 4, t + 0.05);
    o2.frequency.exponentialRampToValueAtTime(b * 3, t + 0.16);
    f.type = "bandpass"; f.frequency.value = 1900 * haut; f.Q.value = 2.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(a.destination);
    o.start(t); o2.start(t); o.stop(t + 0.22); o2.stop(t + 0.22);
  }
  function tintin() {
    const a = audio(); if (!a) return;
    [1318.5, 1760, 2637].forEach((fr, i) => {
      const t = a.currentTime + i * 0.09, o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.75);
    });
  }

  // ---------- affichage
  const sec = (ms, d = 3) => (ms / 1000).toFixed(d).replace(".", ",");
  function toast(txt) {
    const el = $("toast"); el.textContent = txt; el.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2600);
  }
  function rebond() { bouton.classList.remove("pouic"); void bouton.offsetWidth; bouton.classList.add("pouic"); }
  function vibre(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

  function tic() {
    const ms = performance.now() - t0;
    if (ms < VISIBLE) chrono.textContent = sec(ms);
    if (ms > LIMITE) return finir(ms, true);
    raf = requestAnimationFrame(tic);
  }

  function demarrer() {
    etat = "court"; t0 = performance.now();
    chrono.className = "chrono"; verdict.className = "verdict"; verdict.innerHTML = "&nbsp;";
    etiquette.textContent = "STOP"; etiquette.classList.remove("long");
    bouton.classList.add("attend");
    anneau.classList.remove("on"); void anneau.offsetWidth; anneau.classList.add("on");
    $("actions").hidden = true;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      if (etat !== "court") return;
      chrono.textContent = "?,???"; chrono.classList.add("cache");
      setTimeout(() => { if (etat === "court") { chrono.classList.remove("cache"); chrono.classList.add("mystere"); } }, 600);
      verdict.textContent = "À l'instinct…";
      anneau.classList.remove("on");
    }, VISIBLE);
    raf = requestAnimationFrame(tic);
  }

  function message(ecart, ms) {
    if (ecart <= 5) return ["PILE 10 ! Incroyable.", "pile"];
    if (ecart <= 30) return ["Une horloge suisse.", "pile"];
    if (ecart <= 80) return ["Presque parfait.", "pile"];
    if (ecart <= 200) return ["Très fort.", ""];
    if (ecart <= 500) return [ms < CIBLE ? "Un peu pressé." : "Un peu lent.", ""];
    if (ecart <= 1200) return [ms < CIBLE ? "Trop pressé !" : "Tu rêvassais ?", "loin"];
    return [ms < CIBLE ? "Tu as triché avec le stress." : "Tu t'es endormi ?", "loin"];
  }

  function finir(ms, tropTard) {
    cancelAnimationFrame(raf); clearTimeout(minuterie);
    etat = "fini";
    ms = Math.round(ms);
    const ecart = Math.abs(ms - CIBLE);
    anneau.classList.remove("on");
    bouton.classList.remove("attend");
    etiquette.textContent = "ENCORE"; etiquette.classList.add("long");
    chrono.className = "chrono gros";
    chrono.textContent = tropTard ? "20+" : sec(ms);
    const [txt, cls] = tropTard ? ["Tu es parti ? On recommence.", "loin"] : message(ecart, ms);
    verdict.className = "verdict " + cls;
    verdict.textContent = tropTard ? txt : (ecart === 0 ? txt : `À ${sec(ecart)} s. ${txt}`);
    setTimeout(() => chrono.classList.remove("gros"), 300);
    if (tropTard) return;
    dernier = { ms, ecart };
    const n = store.get("essais", 0) + 1; store.set("essais", n);
    const rec = store.get("record", null);
    if (rec === null || ecart < rec.ecart) { store.set("record", { ms, ecart }); if (rec !== null) toast("Nouveau record perso !"); }
    if (ecart <= 80) { tintin(); eclats(); vibre([20, 40, 20]); }
    majPerso();
    $("actions").hidden = false;
    envoyer(ms);
    // Petite pause pour ne pas relancer par un double appui involontaire.
    bouton.disabled = true; setTimeout(() => { bouton.disabled = false; }, 450);
  }

  function majPerso() {
    const rec = store.get("record", null);
    $("record").textContent = rec ? `±${sec(rec.ecart)} s` : "–";
    $("essais").textContent = store.get("essais", 0);
  }

  function appui(e) {
    if (e) e.preventDefault();
    if (bouton.disabled) return;
    const maintenant = performance.now();
    bouton.classList.add("appui");
    rebond();
    vibre(12);
    if (etat === "court") { pouic(0.82); finir(maintenant - t0, false); }
    else { pouic(1); demarrer(); }
  }
  const relache = () => bouton.classList.remove("appui");
  bouton.addEventListener("pointerdown", appui);
  bouton.addEventListener("pointerup", relache);
  bouton.addEventListener("pointerleave", relache);
  bouton.addEventListener("click", (e) => { if (e.detail === 0) appui(e); }); // clavier (Entrée)
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat || document.activeElement === nomInput) return;
    e.preventDefault(); bouton.classList.add("appui"); appui();
  });
  document.addEventListener("keyup", (e) => { if (e.code === "Space") relache(); });

  // ---------- éclats de glace quand on est tout près
  function eclats() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = bouton.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const couleurs = ["#ffffff", "#bdeeff", "#5cc9ff", "#ffe58a", "#aef4ea"];
    for (let i = 0; i < 46; i++) {
      const el = document.createElement("i"); el.className = "eclat";
      el.style.background = couleurs[i % couleurs.length];
      el.style.left = cx + "px"; el.style.top = cy + "px";
      document.body.appendChild(el);
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 260;
      el.animate([
        { transform: "translate(-50%,-50%) rotate(0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 120}px) rotate(${Math.random() * 720}deg) scale(.4)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 600, easing: "cubic-bezier(.2,.8,.4,1)" }).onfinish = () => el.remove();
    }
  }

  // ---------- classement du jour
  function ligne(s) {
    const li = document.createElement("li");
    if (nom && s.name.toLowerCase() === nom.toLowerCase()) li.className = "moi";
    const n = document.createElement("span"); n.className = "n"; n.textContent = s.name;
    const t = document.createElement("span"); t.className = "t"; t.textContent = sec(s.ms) + " s";
    const sm = document.createElement("small"); sm.textContent = "±" + sec(s.gap); t.appendChild(sm);
    li.append(n, t);
    return li;
  }
  function afficher(scores) {
    liste.replaceChildren();
    if (!scores || !scores.length) {
      const li = document.createElement("li"); li.className = "vide"; li.textContent = "Personne encore aujourd'hui. Lance-toi !";
      liste.appendChild(li); return;
    }
    scores.forEach((s) => liste.appendChild(ligne(s)));
  }
  async function charger() {
    try {
      const r = await fetch("/api/pile10/scores", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      afficher(d.scores);
      $("cl-info").textContent = d.tries ? `${d.tries} essai${d.tries > 1 ? "s" : ""} aujourd'hui` : "Les plus près de 10 s";
    } catch {
      ouvert = false;
      liste.innerHTML = '<li class="vide">Le classement s\'ouvre sur apphero.cloud.</li>';
    }
  }
  async function envoyer(ms) {
    if (!nom || !ouvert) { if (!nom) $("cl-note").textContent = "Mets ton nom pour entrer dans le classement."; return; }
    try {
      const r = await fetch("/api/pile10/scores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: nom, ms }) });
      const d = await r.json();
      if (!r.ok) { toast(d.error || "Classement indisponible."); return; }
      afficher(d.scores);
      if (d.rank <= 10) $("cl-note").textContent = `Tu es ${d.rank === 1 ? "1er" : d.rank + "e"} du jour avec cet essai.`;
      else $("cl-note").textContent = `Cet essai te place ${d.rank}e du jour.`;
    } catch { /* hors ligne : tant pis */ }
  }
  nomForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = nomInput.value.trim().replace(/\s+/g, " ");
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .'’_-]{0,15}$/u.test(v)) { toast("Un nom de 1 à 16 lettres ou chiffres."); return; }
    nom = v; store.set("nom", nom); nomInput.blur();
    toast(`C'est noté, ${nom}.`);
    $("cl-note").textContent = "Ton meilleur essai du jour compte. Remise à zéro à minuit.";
    if (dernier) envoyer(dernier.ms);
  });

  // ---------- partager sur X
  $("partager").addEventListener("click", () => {
    if (!dernier) return;
    const txt = dernier.ecart === 0
      ? `10,000 s pile sur Pile 10. Sans chrono. Qui fait pareil ?`
      : `${sec(dernier.ms)} s sur Pile 10, à ${sec(dernier.ecart)} s des 10 secondes pile. Sans chrono. Tu fais mieux ?`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(txt)}&url=${encodeURIComponent(URL_APP)}`, "_blank", "noopener");
  });

  // ---------- givre : de petites paillettes qui dérivent
  const cv = $("givre"), cx = cv.getContext("2d");
  let W = 0, H = 0, pts = [];
  function taille() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pts = Array.from({ length: Math.round(W * H / 16000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.8, v: 0.1 + Math.random() * 0.3, p: Math.random() * 6 }));
  }
  function givre(t) {
    cx.clearRect(0, 0, W, H);
    for (const p of pts) {
      p.y += p.v; p.x += Math.sin(t / 2000 + p.p) * 0.15;
      if (p.y > H + 4) { p.y = -4; p.x = Math.random() * W; }
      const a = 0.35 + 0.35 * Math.sin(t / 600 + p.p * 3);
      cx.fillStyle = `rgba(255,255,255,${a})`;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill();
    }
    requestAnimationFrame(givre);
  }
  addEventListener("resize", taille); taille();
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(givre);

  majPerso();
  charger();
  setInterval(() => { if (etat !== "court" && !document.hidden) charger(); }, 20000);
})();
