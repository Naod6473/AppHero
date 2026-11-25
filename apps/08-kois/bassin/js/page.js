(() => {
  const root = document.documentElement, stats = document.getElementById('stats');
  MVBassin.create(document.getElementById('bassin'), {
    avoid: '[data-evite]', decor: true, style: 'ascii', paint: false,
    onStats: (s) => { stats.textContent = `${s.fish} koïs · ${s.eaten} granulé${s.eaten > 1 ? 's' : ''} mangé${s.eaten > 1 ? 's' : ''}`; },
  });

  // musique : cinq morceaux japonais libres de droits enchaînés ; le navigateur attend souvent un premier geste
  const PISTES = [1, 2, 3, 4, 5].map((n) => `musique/musique-${n}.mp3`), son = document.getElementById('son'), audio = new Audio();
  let piste = Math.random() * PISTES.length | 0, voulu = true, fondu = 0;
  try { voulu = localStorage.getItem('kois-son') !== '0'; } catch (e) { /* stockage indisponible */ }
  audio.preload = 'none'; audio.volume = 0;
  function volume(cible) {
    cancelAnimationFrame(fondu);
    (function pas() {
      if (Math.abs(cible - audio.volume) <= .02) { audio.volume = cible; if (!cible) audio.pause(); return; }
      audio.volume = Math.min(1, Math.max(0, audio.volume + (cible > audio.volume ? .008 : -.02)));
      fondu = requestAnimationFrame(pas);
    })();
  }
  function jouer() {
    if (!voulu || document.hidden) return;
    if (!audio.src) audio.src = PISTES[piste];
    audio.play().then(() => { son.setAttribute('aria-pressed', 'true'); volume(.35); }).catch(() => {});
  }
  audio.addEventListener('ended', () => { piste = (piste + 1) % PISTES.length; audio.src = PISTES[piste]; jouer(); });
  son.addEventListener('click', () => {
    voulu = son.getAttribute('aria-pressed') !== 'true';
    try { localStorage.setItem('kois-son', voulu ? '1' : '0'); } catch (e) { /* tant pis */ }
    son.setAttribute('aria-pressed', String(voulu));
    if (voulu) jouer(); else volume(0);
  });
  const premierGeste = (e) => {
    if (e.target.closest && e.target.closest('#son')) return;
    if (audio.paused) jouer();
    removeEventListener('pointerdown', premierGeste); removeEventListener('keydown', premierGeste);
  };
  addEventListener('pointerdown', premierGeste); addEventListener('keydown', premierGeste);
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause(); else if (voulu && audio.src) jouer(); });
  jouer();

  // l'interface s'efface après quelques secondes sans geste, et revient au moindre mouvement
  let calme = 0;
  function reveil() { root.classList.remove('calme'); clearTimeout(calme); calme = setTimeout(() => root.classList.add('calme'), 4000); }
  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, reveil, { passive: true }));
  reveil();
  let clics = 0;
  addEventListener('click', (e) => { if (!e.target.closest('button, a') && ++clics > 2) document.getElementById('aide').style.opacity = 0; });
})();
