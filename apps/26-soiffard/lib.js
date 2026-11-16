// Soiffard : les calculs, sans rien toucher à l'écran (testés dans tests/soiffard.test.mjs).

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

// Distance en mètres entre deux points {lat, lon}.
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Cap de a vers b, en degrés depuis le nord (0 à 360).
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function fmtDist(m) {
  if (m == null || !Number.isFinite(m)) return "–";
  if (m < 995) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace(".", ",")} km`;
}

export function fmtKm(m) {
  return (m / 1000).toFixed(1).replace(".", ",");
}

// 7260 -> "2 h 01", 2520 -> "42 min"
export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

// 5077 -> "1:24:37"
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function walkMinutes(m) {
  return Math.max(1, Math.round(m / 80)); // ≈ 4,8 km/h
}

// ---------------------------------------------------------------- horaires OpenStreetMap
// Sous-ensemble courant de opening_hours : "24/7", "Mo-Fr 17:00-02:00; Sa,Su 15:00-03:00",
// "Tu-Sa 18:00-01:00; Mo off", "18:00+". Renvoie null si on ne sait pas lire.

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseDays(spec) {
  const set = new Set();
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (p === "PH" || p === "SH") continue;
    const m = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    // Mo=1 … Sa=6, Su=0 : on parcourt dans l'ordre de la semaine (lundi en premier)
    let i = a;
    for (let n = 0; n < 7; n++) {
      set.add(i);
      if (i === b) break;
      i = (i + 1) % 7;
    }
  }
  return set;
}

function parseTimes(spec) {
  const out = [];
  for (const part of spec.split(",")) {
    const p = part.trim();
    let m = p.match(/^(\d{1,2}):(\d{2})\+$/);
    if (m) {
      out.push([+m[1] * 60 + +m[2], 4 * 60]); // « 18:00+ » : on suppose jusqu'à 4 h
      continue;
    }
    m = p.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/);
    if (!m) return null;
    out.push([+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
  }
  return out;
}

export function parseHours(oh) {
  if (!oh || typeof oh !== "string") return null;
  const s = oh.trim();
  if (s === "24/7") return { always: true };
  const week = Array.from({ length: 7 }, () => null); // null = rien de dit pour ce jour
  for (const raw of s.split(";")) {
    const rule = raw.trim();
    if (!rule) continue;
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.*)$/);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/,$/, "")) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return null;
    const rest = m[2].trim();
    let times;
    if (rest === "off" || rest === "closed") times = [];
    else if (rest === "") return null;
    else {
      times = parseTimes(rest);
      if (!times) return null;
    }
    for (const d of days) week[d] = times; // une règle plus loin remplace la précédente
  }
  if (week.every((d) => d === null)) return null;
  return { week: week.map((d) => d || []) };
}

// { open: true|false|null, until: "02:00" | null, from: "18:00" | null }
export function openState(oh, date = new Date()) {
  const p = parseHours(oh);
  if (!p) return { open: null, until: null, from: null };
  if (p.always) return { open: true, until: null, from: null, always: true };
  const d = date.getDay();
  const min = date.getHours() * 60 + date.getMinutes();
  const prev = (d + 6) % 7;
  const hhmm = (x) => `${String(Math.floor((x % 1440) / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  // La nuit d'avant qui déborde après minuit.
  for (const [a, b] of p.week[prev]) {
    if (b <= a && min < b) return { open: true, until: hhmm(b), from: null };
  }
  for (const [a, b] of p.week[d]) {
    const end = b <= a ? 1440 + b : b;
    if (min >= a && min < end) return { open: true, until: hhmm(end), from: null };
  }
  const next = p.week[d].map(([a]) => a).filter((a) => a > min).sort((x, y) => x - y)[0];
  return { open: false, until: null, from: next != null ? hhmm(next) : null };
}

export function hoursLabel(st) {
  if (st.open === null) return "Horaires inconnus";
  if (st.open) return st.always ? "Ouvert 24 h/24" : st.until ? `Ouvert jusqu'à ${hourWord(st.until)}` : "Ouvert";
  return st.from ? `Fermé, ouvre à ${hourWord(st.from)}` : "Fermé aujourd'hui";
}

function hourWord(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 0 && m === 0) return "minuit";
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// ---------------------------------------------------------------- stats de soirée

export const KCAL_PER_GLASS = 150; // un demi ou un verre de vin, à la louche
export const KCAL_PER_KM = 55;
export const KCAL_CROISSANT = 250;

export function kcalIn(glasses) {
  return Math.round(glasses * KCAL_PER_GLASS);
}
export function kcalOut(meters) {
  return Math.round((meters / 1000) * KCAL_PER_KM);
}
export function croissants(kcal) {
  return Math.round(kcal / KCAL_CROISSANT);
}

export function glassLevel(n) {
  if (n <= 0) return "Échauffement";
  if (n <= 2) return "Rythme de croisière";
  if (n <= 4) return "Allure soutenue";
  if (n <= 6) return "Hors catégorie";
  return "Légende du comptoir";
}

export function pace(seconds, glasses) {
  if (!glasses) return "Allure : tranquille";
  return `Allure : 1 verre toutes les ${Math.max(1, Math.round(seconds / 60 / glasses))} min`;
}

// Une ligne d'humour pour la carte de sortie, choisie selon la soirée.
export function joke(o) {
  const lines = [];
  if (o.bars > 0) lines.push(`Allure : 1 bar toutes les ${Math.max(1, Math.round(o.seconds / 60 / o.bars))} min.`);
  lines.push(o.meters < 300 ? "Dénivelé : 0 m. Distance : presque autant." : "Dénivelé : 0 m, mais le trottoir penchait.");
  if (o.glasses >= 5) lines.push(`Bilan : +${kcalIn(o.glasses) - kcalOut(o.meters)} kcal, le sport c'est demain.`);
  else if (o.glasses > 0) lines.push(`Soit ${Math.max(1, croissants(kcalIn(o.glasses)))} croissant${croissants(kcalIn(o.glasses)) > 1 ? "s" : ""} liquide${croissants(kcalIn(o.glasses)) > 1 ? "s" : ""}.`);
  return lines.join(" ");
}

// ---------------------------------------------------------------- semaine (lundi 6 h)

export function weekKey(ms) {
  const paris = new Date(ms + 3600000 - 6 * 3600000);
  const d = new Date(Date.UTC(paris.getUTCFullYear(), paris.getUTCMonth(), paris.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// Index du jour dans la semaine (0 = lundi), avec la même bascule à 6 h.
export function weekdayIndex(ms) {
  const paris = new Date(ms + 3600000 - 6 * 3600000);
  return (paris.getUTCDay() + 6) % 7;
}

// Résumé de la semaine à partir des sorties gardées dans le téléphone.
export function weekStats(outings, now = Date.now()) {
  const wk = weekKey(now);
  const mine = outings.filter((o) => weekKey(o.start) === wk);
  const bars = new Set();
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  let meters = 0, seconds = 0, counter = 0, glasses = 0;
  for (const o of mine) {
    meters += o.meters || 0;
    seconds += o.seconds || 0;
    glasses += o.glasses || 0;
    for (const v of o.visits || []) {
      bars.add(v.id);
      counter += v.seconds || 0;
    }
    perDay[weekdayIndex(o.start)] += (o.visits || []).reduce((s, v) => s + (v.seconds || 0), 0);
  }
  return { week: wk, outings: mine.length, bars: bars.size, meters, seconds, counter, glasses, perDay };
}

// ---------------------------------------------------------------- KOTB

// Temps crédité au comptoir : de l'arrivée au dernier moment où le téléphone était près du bar.
export function creditedSeconds(checkin, lastNear, now, cap = 4 * 3600) {
  const end = Math.min(now, lastNear ?? now);
  return Math.max(0, Math.min(cap, Math.round((end - checkin) / 1000)));
}

export const NEAR_BAR = 50; // mètres pour « J'y suis »
export const STILL_NEAR = 120; // mètres tolérés pendant le passage (GPS en intérieur)

// Ajoute un point au parcours s'il est assez précis et assez loin du précédent.
export function addPoint(track, p) {
  if (p.acc != null && p.acc > 60) return { track, added: 0 };
  const last = track[track.length - 1];
  if (!last) return { track: [...track, p], added: 0 };
  const d = distance(last, p);
  if (d < 15) return { track, added: 0 };
  if (d > 2000) return { track: [...track, p], added: 0 }; // saut GPS : on n'ajoute pas de distance
  return { track: [...track, p], added: d };
}

// ---------------------------------------------------------------- badges

export function badges(outings, crowns = 0) {
  const bars = new Set();
  const perBar = {};
  let meters = 0, maxBarsNight = 0, late = false;
  for (const o of outings) {
    meters += o.meters || 0;
    const ids = new Set((o.visits || []).map((v) => v.id));
    maxBarsNight = Math.max(maxBarsNight, ids.size);
    for (const id of ids) {
      bars.add(id);
      perBar[id] = (perBar[id] || 0) + 1;
    }
    const end = new Date(o.end || o.start);
    if (end.getHours() >= 2 && end.getHours() < 6) late = true;
  }
  const loyal = Math.max(0, ...Object.values(perBar));
  return [
    { id: "first", mark: "1", name: "Premier comptoir", hint: "Un premier bar", done: bars.size >= 1 },
    { id: "explorer", mark: "5", name: "Explorateur", hint: "5 bars différents", done: bars.size >= 5 },
    { id: "globe", mark: "20", name: "Globe-trotteur", hint: "20 bars différents", done: bars.size >= 20 },
    { id: "tour", mark: "3", name: "Tournée", hint: "3 bars en une soirée", done: maxBarsNight >= 3 },
    { id: "king", mark: "R", name: "Roi", hint: "Prendre une couronne", done: crowns >= 1 },
    { id: "marathon", mark: "42", name: "Marathonien", hint: "42 km à pied", done: meters >= 42000 },
    { id: "night", mark: "2h", name: "Noctambule", hint: "Finir après 2 h", done: late },
    { id: "loyal", mark: "5×", name: "Habitué", hint: "5 fois le même bar", done: loyal >= 5 },
  ];
}

// ---------------------------------------------------------------- avatar généré

export function avatar(seed) {
  let h = 2166136261;
  for (const c of String(seed || "x")) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const palette = ["#F5B83D", "#7FB7FF", "#3DD68C", "#FF8A7A", "#C9A7FF", "#FFD27A"];
  const ink = ["#1A1206", "#0B2A55", "#0A3A22", "#4A0F08", "#2A1458", "#3A2A00"];
  const i = h % palette.length;
  const shapes = ["5px", "50%", "2px", "40% 0"];
  return {
    bg: palette[i],
    fg: ink[i],
    radius: shapes[(h >>> 3) % shapes.length],
    rot: ((h >>> 5) % 4) * 15,
    size: 50 + ((h >>> 7) % 3) * 6,
    dx: (((h >>> 9) % 5) - 2) * 6,
    dy: (((h >>> 11) % 5) - 2) * 6,
  };
}

// ---------------------------------------------------------------- petites cartes (tuiles)

export function lonToX(lon, z) {
  return ((lon + 180) / 360) * 256 * 2 ** z;
}
export function latToY(lat, z) {
  const s = Math.sin(rad(lat));
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
}

// Zoom et centre pour faire tenir tous les points dans w×h pixels (marge comprise).
export function fitView(points, w, h, pad = 24, maxZ = 17) {
  if (!points.length) return null;
  for (let z = maxZ; z >= 3; z--) {
    const xs = points.map((p) => lonToX(p.lon, z));
    const ys = points.map((p) => latToY(p.lat, z));
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    if (bw <= w - 2 * pad && bh <= h - 2 * pad) {
      return { z, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
    }
  }
  return { z: 3, cx: lonToX(points[0].lon, 3), cy: latToY(points[0].lat, 3) };
}

export function randomId(len = 24) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

const ADJ = ["Grand", "Petit", "Fier", "Joyeux", "Sacré", "Vieux", "Brave", "Fameux"];
const NOUN = ["Zinc", "Tabouret", "Comptoir", "Houblon", "Bouchon", "Demi", "Apéro", "Tonneau"];
export function randomPseudo() {
  const r = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${r(ADJ)} ${r(NOUN)}`;
}

// « au Zinc », « à la Taverne », « à l'Escale », « aux Trois Brasseurs », « chez Lulu »
export function au(name) {
  const n = String(name || "").trim();
  let m;
  if ((m = n.match(/^Le\s+(.+)/i))) return `au ${m[1]}`;
  if ((m = n.match(/^Les\s+(.+)/i))) return `aux ${m[1]}`;
  if ((m = n.match(/^La\s+(.+)/i))) return `à la ${m[1]}`;
  if ((m = n.match(/^L['’]\s*(.+)/i))) return `à l'${m[1]}`;
  if (/^chez\s/i.test(n)) return `chez ${n.replace(/^chez\s+/i, "")}`;
  if (/^(bar|café|pub|bistrot|bistro|comptoir)\b/i.test(n)) return `au ${n}`;
  return `à ${n}`;
}

// « du Zinc », « de la Taverne », « de l'Escale », « des Trois Brasseurs », « de Chez Lulu »
export function du(name) {
  const n = String(name || "").trim();
  let m;
  if ((m = n.match(/^Le\s+(.+)/i))) return `du ${m[1]}`;
  if ((m = n.match(/^Les\s+(.+)/i))) return `des ${m[1]}`;
  if ((m = n.match(/^La\s+(.+)/i))) return `de la ${m[1]}`;
  if ((m = n.match(/^L['’]\s*(.+)/i))) return `de l'${m[1]}`;
  if (/^(bar|café|pub|bistrot|bistro|comptoir)\b/i.test(n)) return `du ${n}`;
  return /^[aeiouyéèêh]/i.test(n) ? `d'${n}` : `de ${n}`;
}

// ---------------------------------------------------------------- bars (OpenStreetMap / Overpass)
// Partagé avec le Worker (worker/src/soiffard.js) : l'app s'en sert aussi en secours si le serveur n'obtient rien.

export const RADIUS = 2000;
const KINDS = { bar: "Bar", pub: "Pub", biergarten: "Biergarten", nightclub: "Boîte de nuit" };
export const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export function overpassQuery(lat, lon, radius = RADIUS) {
  return `[out:json][timeout:20];nwr["amenity"~"^(bar|pub|biergarten|nightclub)$"](around:${radius},${lat},${lon});out center tags 300;`;
}

export function parseOverpass(data) {
  const out = [];
  const seen = new Set();
  for (const el of data?.elements || []) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const name = (t.name || "").trim();
    if (!name) continue; // un bar sans nom n'aide personne à le trouver
    const id = `${el.type[0]}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let kind = KINDS[t.amenity] || "Bar";
    if (t.amenity === "bar" && /brasserie/i.test(`${name} ${t.cuisine || ""}`)) kind = "Brasserie";
    out.push({
      id,
      name: name.slice(0, 80),
      kind,
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      oh: t.opening_hours ? String(t.opening_hours).slice(0, 200) : null,
      street: t["addr:street"] ? `${t["addr:housenumber"] ? t["addr:housenumber"] + " " : ""}${t["addr:street"]}`.slice(0, 80) : null,
    });
  }
  return out;
}
