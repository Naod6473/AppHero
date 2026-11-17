// Les critères tirés au sort pour les 30 cases (décidé par Simon le 17/11/2026).
// Chaque case a un critère ; « Multi-critère » en ajoute 2 autres. Les catégories par jour de la semaine
// n'existent plus : App utile, 2 heures chrono, Jeu, La roue décide, Idée d'un abonné… sont dans la pioche.
// Le tirage lui-même n'est PAS dans ce dépôt public : il est en base (table criteria) et révélé au lancement.

export const CRITERIA = {
  utile: { name: "App utile", emoji: "🛠️", color: "#FF3D9A", blurb: "Une app qui sert vraiment, tous les jours." },
  chrono: { name: "2 heures chrono", emoji: "⏳", color: "#25D0E8", blurb: "Pas une minute de plus : 2 heures, montre en main." },
  jeu: { name: "Jeu", emoji: "🎮", color: "#FF8A3D", blurb: "Une app pour jouer." },
  perso: { name: "Idée perso", emoji: "💡", color: "#FFF8E1", blurb: "Une idée à moi, sortie du carnet." },
  abonne: { name: "Idée d'un abonné", emoji: "💌", color: "#7CF2B0", blurb: "L'idée vient d'un abonné, proposée sur X." },
  roue: { name: "La roue décide", emoji: "🎡", color: "#FFD83D", blurb: "Le critère sort de la roue la veille au soir." },
  surprise: { name: "Surprise", emoji: "🎁", color: "#B9A3FF", blurb: "Chut. Tu verras à 18 h." },
  refonte: { name: "Refonte d'une app", emoji: "♻️", color: "#9BE15D", blurb: "Une app qui existe déjà, refaite en mieux." },
  multi: { name: "Multi-critère", emoji: "🎲", color: "#FF5C5C", blurb: "Plusieurs critères à la fois. Bon courage." },
  trente: { name: "30 min max", emoji: "⏱️", color: "#5CE1E6", blurb: "Une app en 30 minutes, pas plus." },
  langage: { name: "Langage imposé", emoji: "🔤", color: "#A0C4FF", blurb: "Le langage est tiré au sort." },
  cuisine: { name: "En cuisinant", emoji: "🍳", color: "#FFC6A5", blurb: "Codé en faisant à manger." },
  main: { name: "Une seule main", emoji: "✋", color: "#FFADAD", blurb: "Clavier et souris, d'une seule main." },
  couleurs: { name: "Deux couleurs max", emoji: "🎨", color: "#E0E0E0", blurb: "Deux couleurs, pas une de plus." },
  icones: { name: "Sans texte", emoji: "🔣", color: "#CDB4DB", blurb: "Aucun mot, que des icônes." },
  voix: { name: "Commande à la voix", emoji: "🎙️", color: "#FFD6E8", blurb: "On la pilote à la voix." },
  fichier: { name: "Un seul fichier", emoji: "📄", color: "#FDFFB6", blurb: "Un seul fichier, zéro dépendance." },
  retro: { name: "Look rétro 8 bits", emoji: "👾", color: "#8EECF5", blurb: "Pixels, bips et nostalgie." },
  ville: { name: "Ville imposée", emoji: "🏙️", color: "#B5EAD7", blurb: "La ville est tirée au sort." },
  apero: { name: "Codé à l'apéro", emoji: "🍹", color: "#FFB347", blurb: "Un verre à la main." },
  enfants: { name: "Pensé pour les enfants", emoji: "🧸", color: "#FFE5B4", blurb: "Pour les petits (et les grands)." },
  prompt: { name: "En un seul prompt", emoji: "💬", color: "#C3B1E1", blurb: "Un seul message à l'IA, pas de retouche." },
};

// Les critères qui peuvent se cumuler sous « Multi-critère » (des contraintes, pas des sources d'idée).
export const COMBINABLE = ["chrono", "trente", "langage", "cuisine", "main", "couleurs", "icones", "voix", "fichier", "retro", "ville", "apero", "enfants", "prompt"];
export const LANGAGES = ["Python", "Rust", "Go", "Lua", "PHP", "Ruby", "Elixir", "Kotlin", "Swift", "C", "Dart", "Zig"];
export const VILLES = ["Paris", "Marseille", "Lyon", "Bordeaux", "Lille", "Naples", "Lisbonne", "Berlin", "Tokyo", "New York", "Montréal", "Dakar"];

// Texte court d'un tirage : « Langage imposé : Rust », ou la liste pour le multi-critère.
export function criterionLabel(c) {
  const base = CRITERIA[c.key];
  if (!base) return "";
  return c.detail ? `${base.name} : ${c.detail}` : base.name;
}
