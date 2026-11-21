(function () {
  'use strict';
  // Local previews and embedded games do not initialize another tracker.
  if (location.hostname !== 'mathelio.pissits.com' || window.top !== window.self) return;

  const games = new Set(['fields', 'towers', 'race', 'garden', 'market', 'target', 'balance', 'baskets', 'mystery', 'compare', 'numberline', 'provisions', 'stories']);
  const pending = [];
  let failed = false;
  function send(game) {
    try {
      Promise.resolve(window.umami.track('mini-jeu-ouvert', { jeu: game })).catch(() => {});
    } catch (_) { /* Analytics must never interrupt a game. */ }
  }
  window.MathelioAnalytics = {
    openGame(game) {
      if (!games.has(game) || failed) return;
      if (window.umami) send(game);
      else if (pending.length < 20) pending.push(game);
    }
  };

  const tracker = document.createElement('script');
  tracker.defer = true;
  tracker.src = 'https://stats.pissits.com/script.js';
  tracker.setAttribute('data-website-id', 'a5487b3a-1c14-45ce-8581-09ba9ea956e8');
  tracker.setAttribute('data-domains', 'mathelio.pissits.com');
  tracker.setAttribute('data-exclude-search', 'true');
  tracker.setAttribute('data-do-not-track', 'true');
  tracker.onload = () => {
    if (window.umami) pending.splice(0).forEach(send);
  };
  tracker.onerror = () => { failed = true; pending.length = 0; };
  document.head.appendChild(tracker);
})();
