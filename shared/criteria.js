// Les critères (« défis ») tirés au sort pour les 30 cases (Simon, 17/11/2026).
// Le tirage se fait en direct sur /tirage/ (bouton réservé à l'organisateur) : le Worker tire,
// enregistre dans la table criteria, et l'API ne montre le calendrier qu'à partir du lancement.

export const CRITERIA = {
  perso: { name: "Idée perso", emoji: "💡", color: "#FFF8E1", blurb: "Une idée à moi, sortie du carnet." },
  surprise: { name: "Surprise", emoji: "🎁", color: "#B9A3FF", blurb: "Chut. Tu verras à 18 h." },
  roue: { name: "La roue décide", emoji: "🎡", color: "#FFD83D", blurb: "Le critère sort de la roue le jeudi soir." },
  abonne: { name: "Idée d'un abonné", emoji: "💌", color: "#7CF2B0", blurb: "L'idée vient d'un abonné, proposée sur X." },
  utile: { name: "App utile", emoji: "🛠️", color: "#FF3D9A", blurb: "Une app qui sert vraiment, tous les jours." },
  chrono: { name: "2 heures chrono", emoji: "⏳", color: "#25D0E8", blurb: "Pas une minute de plus : 2 heures, montre en main." },
  jeu: { name: "Jeu", emoji: "🎮", color: "#FF8A3D", blurb: "Une app pour jouer." },
  refonte: { name: "Refonte d'une app", emoji: "♻️", color: "#9BE15D", blurb: "Une app qui existe déjà, refaite en mieux." },
  multi: { name: "Multi-critère", emoji: "🎲", color: "#FF5C5C", blurb: "Plusieurs défis à la fois. Bon courage." },
  trente: { name: "30 min max", emoji: "⏱️", color: "#5CE1E6", blurb: "Une app en 30 minutes, pas plus." },
  langage: { name: "Langage imposé", emoji: "🔤", color: "#A0C4FF", blurb: "Le langage est tiré au sort." },
  cuisine: { name: "En cuisinant", emoji: "🍳", color: "#FFC6A5", blurb: "Codé en faisant à manger." },
  couleurs: { name: "Deux couleurs max", emoji: "🎨", color: "#E0E0E0", blurb: "Deux couleurs, pas une de plus." },
  icones: { name: "Sans texte", emoji: "🔣", color: "#CDB4DB", blurb: "Aucun mot, que des icônes." },
  voix: { name: "Commande à la voix", emoji: "🎙️", color: "#FFD6E8", blurb: "On la pilote à la voix." },
  fichier: { name: "Un seul fichier", emoji: "📄", color: "#FDFFB6", blurb: "Un seul fichier, zéro dépendance." },
  retro: { name: "Look rétro 8 bits", emoji: "👾", color: "#8EECF5", blurb: "Pixels, bips et nostalgie." },
  apero: { name: "Codé à l'apéro", emoji: "🍹", color: "#FFB347", blurb: "Un verre à la main." },
  enfants: { name: "Pensé pour les enfants", emoji: "🧸", color: "#FFE5B4", blurb: "Pour les petits (et les grands)." },
  prompt: { name: "En un seul prompt", emoji: "💬", color: "#C3B1E1", blurb: "Un seul message à l'IA, pas de retouche." },
  nuit: { name: "Mode nuit only", emoji: "🌙", color: "#6C63FF", blurb: "Que du sombre. Pas de mode clair." },
  horsligne: { name: "Marche hors ligne", emoji: "📴", color: "#B8F2E6", blurb: "Elle marche même sans réseau." },
  son: { name: "Avec du son partout", emoji: "🔊", color: "#FF9EC7", blurb: "Chaque geste fait un bruit." },
  sansanim: { name: "Sans aucune animation", emoji: "🧊", color: "#D7E3FC", blurb: "Rien ne bouge. Rien." },
  anims: { name: "Que des animations", emoji: "✨", color: "#FFE066", blurb: "Tout bouge, tout le temps." },
  mamie: { name: "Pour mamie", emoji: "👵", color: "#F4C2C2", blurb: "Gros boutons, gros textes, zéro piège." },
  chat: { name: "Avec un chat dedans", emoji: "🐱", color: "#FFCF99", blurb: "Il y a un chat. Obligé." },
  inutile: { name: "Inutile mais jolie", emoji: "🌸", color: "#FFC8DD", blurb: "Ça ne sert à rien, mais c'est beau." },
};

// Les défis qui peuvent se cumuler sous « Multi-critère » (des contraintes, pas des sources d'idée).
export const COMBINABLE = ["chrono", "trente", "langage", "cuisine", "couleurs", "icones", "voix", "fichier", "retro", "apero", "enfants", "prompt", "nuit", "horsligne", "son", "sansanim", "anims", "mamie", "chat"];
const CLASHES = [["sansanim", "anims"], ["chrono", "trente"]];
export const LANGAGES = ["Python", "Rust", "Go", "Lua", "PHP", "Ruby", "Elixir", "Kotlin", "Swift", "C", "Dart", "Zig"];

// Texte d'un défi : « Langage imposé : Rust ».
export function criterionLabel(c) {
  const base = CRITERIA[c.key];
  if (!base) return "";
  return c.detail ? `${base.name} : ${c.detail}` : base.name;
}

// Les règles du tirage (Simon, 17/11/2026) :
// - app 01 (le site) et app 02 (Mine) : Idée perso, déjà faites ;
// - tous les vendredis : La roue décide (la roue tourne le jeudi soir) ;
// - Idée perso 6 fois en tout (Otocut, Mine, naod.fr…), Surprise 2 fois, Idée d'un abonné 2 fois (pas avant l'app 05) ;
// - les autres cases : un défi différent chaque fois, jamais deux fois le même deux jours de suite.
// rand(n) rend un entier dans [0, n). days = la liste DAYS du calendrier.
export function drawCalendar(days, rand) {
  const pick = (a) => a[rand(a.length)];
  const detailOf = (key) => (key === "langage" ? pick(LANGAGES) : null);
  const QUOTA = { perso: 4, surprise: 2, abonne: 2 }; // en plus des 2 Idée perso fixées
  const others = Object.keys(CRITERIA).filter((k) => !["perso", "surprise", "abonne", "roue"].includes(k));
  for (let attempt = 0; attempt < 5000; attempt++) {
    const out = {};
    const free = [];
    for (const d of days) {
      if (d.num <= 2) out[d.id] = { key: "perso", detail: null, extra: [] };
      else if (d.weekday === 5) out[d.id] = { key: "roue", detail: null, extra: [] };
      else free.push(d);
    }
    // La pioche des cases libres : les quotas, puis des défis tous différents.
    const bag = [];
    for (const [k, n] of Object.entries(QUOTA)) for (let i = 0; i < n; i++) bag.push(k);
    const pool = others.slice();
    while (bag.length < free.length) bag.push(pool.splice(rand(pool.length), 1)[0]);
    // Mélange, puis on vérifie les règles ; sinon on recommence.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    free.forEach((d, i) => (out[d.id] = { key: bag[i], detail: detailOf(bag[i]), extra: [] }));
    const keys = days.map((d) => out[d.id].key);
    const okRepeat = keys.every((k, i) => i === 0 || k !== keys[i - 1] || i <= 1);
    const okAbonne = days.every((d) => out[d.id].key !== "abonne" || d.num >= 5);
    if (!okRepeat || !okAbonne) continue;
    for (const d of days) {
      const c = out[d.id];
      if (c.key !== "multi") continue;
      const choices = COMBINABLE.slice();
      while (c.extra.length < 2) {
        const k = choices.splice(rand(choices.length), 1)[0];
        const all = [...c.extra.map((e) => e.key), k];
        if (CLASHES.some(([a, b]) => all.includes(a) && all.includes(b))) continue;
        c.extra.push({ key: k, detail: detailOf(k) });
      }
    }
    return out;
  }
  throw new Error("Tirage impossible avec ces règles.");
}
