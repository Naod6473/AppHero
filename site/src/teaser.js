// La vidéo de présentation : elle démarre (sans le son) quand on arrive dessus, et s'arrête quand on la quitte.
// Le bouton (ou un clic sur la vidéo) la relance depuis le début avec le son.
export function initTeaser(where) {
  const v = document.getElementById("teaser-video");
  const btn = document.getElementById("teaser-sound");
  if (!v || !btn) return;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.5 }).observe(v);
  }
  const sound = () => {
    v.muted = !v.muted;
    if (!v.muted) {
      v.currentTime = 0;
      v.play().catch(() => {});
      window.ahTrack?.(`${where}_teaser_son`);
    }
    btn.textContent = v.muted ? "🔇 Activer le son" : "🔊 Couper le son";
  };
  btn.addEventListener("click", sound);
  v.addEventListener("click", sound);
}
