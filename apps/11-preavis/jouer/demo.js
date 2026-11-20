// Préavis, mode démo : une fausse salle des marchés qui tourne dans le navigateur.
// Mêmes routes et mêmes réponses que le vrai serveur (worker/src/preavis.js), mais rien ne quitte
// l'appareil et rien n'est gardé : on recharge la page, tout repart de zéro.
// Elle sert quand l'app est ouverte sans serveur derrière (copie du dépôt, aperçu) ou avec ?demo.

import { START, DAILY, MIN_BET, MAX_PER_MARKET, seedsFor, cleanName, nameKey, blockedName, titleOf, parisDay, parisMonth } from "../lib.js";
import { SEED_MARKETS } from "../paris.js";

const HOUR = 3600000;
const DAY = 24 * HOUR;

// Des parieurs inventés. Toute ressemblance avec un pseudo existant serait une coïncidence.
const NAMES = [
  "Mamie Pavé", "Jean-Mi la Grève", "Quai 9", "Motion2Censure", "Le Strapontin", "Pancarte_22", "Gilet Fluo", "Mégaphone",
  "La Sardine", "Cortège", "Merguez-Frites", "Piquet2Grève", "ServiceMinimum", "Banderole", "Hémicycle", "Le Perchoir",
  "49.3 Nuances", "Rame 12", "Sifflet", "Casserole", "Slogan", "Tracts et Cie", "Fumigène", "La Navette",
  "Suffrage", "Isoloir", "Dépouillement", "Bulletin Blanc", "Abstention", "Sondage Flash", "Petite Phrase", "Camion Sono",
  "Caténaire", "Aiguillage", "Retard 20 min", "Voiture 7", "Composté", "Ballast", "Dernier Métro", "Heure2Pointe",
  "Rond-Point", "Barricade", "Vuvuzela", "Grand Débat", "Doléances", "Amendement 404", "Navette Sénat", "Jour Férié",
];

// Trois paris inventés pour montrer tous les états : en attente de verdict, tranché, tranché.
const EXTRA = [
  {
    id: "demo-meteo",
    symbol: "METEO",
    cat: "divers",
    title: "Le bulletin météo de ce soir prononcera-t-il le mot « perturbation » ?",
    rules: "Oui si le mot « perturbation » est prononcé au moins une fois pendant le bulletin météo qui suit le journal de 20 heures. Pari de démonstration, inventé pour l'exemple.",
    closes: -2 * HOUR,
    resolveBy: DAY,
    outcomes: [
      { label: "Oui", pct: 80 },
      { label: "Non", pct: 20 },
    ],
  },
  {
    id: "demo-brest",
    symbol: "BREST",
    cat: "divers",
    title: "Pleuvra-t-il à Brest cette semaine ?",
    rules: "Oui si Météo-France relève au moins 1 mm de pluie à Brest entre lundi et dimanche. Pari de démonstration, inventé pour l'exemple.",
    closes: -3 * DAY,
    resolved: -20 * HOUR,
    winner: 0,
    verdict: "Il a plu. L'arbitre n'avait pas besoin de vérifier, mais il a vérifié quand même.",
    outcomes: [
      { label: "Oui", pct: 96 },
      { label: "Non", pct: 4 },
    ],
  },
  {
    id: "demo-8h12",
    symbol: "8H12",
    cat: "divers",
    title: "Le train de 8 h 12 partira-t-il à l'heure lundi ?",
    rules: "On regarde l'heure de départ réelle affichée en gare. « À l'heure » : moins de 5 minutes d'écart. Pari de démonstration, inventé pour l'exemple.",
    closes: -5 * DAY,
    resolved: -4 * DAY,
    winner: 1,
    verdict: "Parti à 8 h 26. Motif annoncé au micro : « régulation du trafic ».",
    outcomes: [
      { label: "À l'heure", pct: 35 },
      { label: "En retard", pct: 60 },
      { label: "Supprimé", pct: 5 },
    ],
  },
];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDemo() {
  const rand = mulberry(20270418);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const weighted = (weights) => {
    let r = rand() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
    return weights.length - 1;
  };

  // L'horloge de la démo : l'heure réelle tant que les paris de départ sont ouverts, sinon le soir du lancement.
  const t0 = Date.now();
  const inSeason = t0 > Date.parse("2026-11-01T00:00:00+01:00") && t0 < Date.parse("2026-12-09T00:00:00+01:00");
  const base = inSeason ? t0 : Date.parse("2026-11-28T18:30:00+01:00");
  const clock = () => base + (Date.now() - t0);
  const start = clock();

  const players = NAMES.map((name, i) => {
    const luck = rand();
    const settled = Math.floor(rand() * 10);
    const wagered = 300 + Math.floor(rand() * 4200);
    const p = {
      id: i + 2,
      name,
      fortune: Math.round((420 + 3100 * luck ** 2.4 + rand() * 380) / 5) * 5,
      settled,
      won: Math.min(settled, Math.round(settled * (0.1 + 0.75 * rand()))),
      wagered,
      mood: Math.round((rand() * 2 - 1) * 80 * wagered),
      profit: rand() < 0.62 ? Math.round(((luck - 0.4) * 900 + (rand() - 0.5) * 300) / 5) * 5 : null,
    };
    return p;
  });

  const STAKES = [10, 10, 20, 20, 30, 50, 50, 50, 80, 100, 100, 150, 200, 300];
  const markets = [];
  function addMarket(s, at) {
    const seeds = seedsFor(s.outcomes.map((o) => o.pct));
    const m = {
      id: s.id,
      symbol: s.symbol,
      cat: s.cat,
      title: s.title,
      rules: s.rules || "",
      status: at.resolved ? "resolved" : "open",
      closesAt: at.closes,
      resolveBy: at.resolveBy ?? null,
      winner: at.resolved ? s.winner : null,
      verdict: at.resolved ? s.verdict : null,
      source: null,
      resolvedAt: at.resolved ?? null,
      bettors: 0,
      pinned: !!s.pinned,
      createdAt: at.created,
      outcomes: s.outcomes.map((o, i) => ({ label: o.label, seed: seeds[i], pool: 0, grogne: o.grogne || 0 })),
      hist: [[at.created, seeds.slice()]],
      who: new Set(),
    };
    // Quelques jours de mises inventées, avec une issue qui a un peu plus la cote que prévu.
    const until = Math.min(at.closes, start);
    const tilt = m.outcomes.map(() => 0.6 + rand() * 1.1);
    const times = Array.from({ length: 8 + Math.floor(rand() * 34) }, () => at.created + rand() * (until - at.created)).sort((a, b) => a - b);
    for (const t of times) crowdBet(m, t, tilt);
    if (m.hist.length > 44) m.hist = m.hist.filter((_, i, all) => i % Math.ceil(all.length / 40) === 0 || i === all.length - 1);
    markets.push(m);
  }
  function crowdBet(m, t, tilt) {
    const i = weighted(m.outcomes.map((o, k) => (o.seed + o.pool * 0.5) * (tilt ? tilt[k] : 0.8 + rand() * 0.4)));
    m.outcomes[i].pool += pick(STAKES);
    m.who.add(pick(players).id);
    m.bettors = m.who.size + (mineOn(m.id).length ? 1 : 0);
    m.hist.push([t, m.outcomes.map((o) => o.seed + o.pool)]);
    if (m.hist.length > 60) m.hist.splice(1, 1);
  }

  let me = null;
  let myBets = []; // { market, outcome, amount, payout, at }
  const mineOn = (id) => myBets.filter((b) => b.market === id);

  for (const s of SEED_MARKETS) {
    const closes = Date.parse(s.closesAt);
    if (closes > start + HOUR) addMarket(s, { created: start - (3 + rand() * 4) * DAY, closes, resolveBy: s.resolveBy ? Date.parse(s.resolveBy) : null });
  }
  for (const s of EXTRA) addMarket(s, { created: start - 7 * DAY, closes: start + s.closes, resolveBy: s.resolveBy ? start + s.resolveBy : null, resolved: s.resolved ? start + s.resolved : null });

  // ---------------------------------------------------------------- les mêmes vues que le serveur

  function viewOf(m, now) {
    return {
      id: m.id,
      symbol: m.symbol,
      cat: m.cat,
      title: m.title,
      rules: m.rules,
      status: m.status === "open" && m.closesAt <= now ? "closed" : m.status,
      closesAt: m.closesAt,
      resolveBy: m.resolveBy,
      winner: m.winner,
      verdict: m.verdict,
      source: m.source,
      resolvedAt: m.resolvedAt,
      bettors: m.bettors,
      pinned: m.pinned,
      createdAt: m.createdAt,
      outcomes: m.outcomes.map((o) => ({ label: o.label, seed: o.seed, pool: o.pool, grogne: o.grogne })),
      total: m.outcomes.reduce((s, o) => s + o.pool, 0),
      hist: m.hist.slice(-60).map(([t, s]) => {
        const tot = s.reduce((a, b) => a + b, 0) || 1;
        return [t, ...s.map((x) => Math.round((x / tot) * 1000))];
      }),
    };
  }
  function meView(now) {
    const fortune = me.balance + me.staked;
    return {
      id: me.id,
      name: me.name,
      balance: me.balance,
      staked: me.staked,
      fortune,
      settled: me.settled,
      won: me.won,
      title: titleOf({ ...me, fortune }),
      bonus: fortune >= START ? "riche" : me.bonusDay === parisDay(now) ? "pris" : "dispo",
      since: me.createdAt,
    };
  }
  function mineAgg(id) {
    const by = new Map();
    for (const b of myBets) {
      if (id && b.market !== id) continue;
      const k = `${b.market}|${b.outcome}`;
      const row = by.get(k) || { market: b.market, outcome: b.outcome, amount: 0, payout: null, at: 0 };
      row.amount += b.amount;
      if (b.payout != null) row.payout = (row.payout || 0) + b.payout;
      row.at = Math.max(row.at, b.at);
      by.set(k, row);
    }
    return [...by.values()];
  }
  const sorted = () => markets.slice().sort((a, b) => b.pinned - a.pinned || a.closesAt - b.closesAt || a.id.localeCompare(b.id));
  const fail = (status, error, extra) => {
    throw Object.assign(new Error(error), { status, data: { error, ...extra } });
  };
  const needMe = () => me || fail(401, "Choisis d'abord un pseudo.", { needJoin: true });
  function nameProblem(name) {
    if (!name) return "Un pseudo de 2 à 16 caractères : lettres, chiffres, espace, point, tiret.";
    if (blockedName(name)) return "Ce pseudo n'est pas disponible.";
    return players.some((p) => nameKey(p.name) === nameKey(name)) ? "Ce pseudo est déjà pris." : null;
  }

  // ---------------------------------------------------------------- les routes

  let calls = 0;
  const routes = {
    "GET state"(_, now) {
      // À chaque passage, la fausse foule a misé un peu : les cotes bougent.
      if (calls++) {
        const open = markets.filter((m) => m.status === "open" && m.closesAt > now);
        for (let n = 1 + Math.floor(rand() * 3); n > 0 && open.length; n--) crowdBet(pick(open), now);
      }
      return { now, me: me ? meView(now) : null, mine: mineAgg().map(({ at, ...b }) => b), markets: sorted().map((m) => viewOf(m, now)), players: players.length + (me ? 1 : 0), turnstile: "" };
    },
    "POST join"(input, now) {
      if (me) fail(409, "Tu as déjà un compte sur cet appareil.");
      const name = cleanName(input?.name);
      const problem = nameProblem(name);
      if (problem) fail(400, problem);
      me = { id: 1, name, balance: START, staked: 0, wagered: 0, mood: 0, settled: 0, won: 0, bonusDay: null, createdAt: now };
      return { ok: true, me: meView(now) };
    },
    "POST bet"(input, now) {
      needMe();
      const m = markets.find((x) => x.id === input?.market);
      const outcome = Number(input?.outcome);
      const amount = Number(input?.amount);
      if (!Number.isInteger(amount) || amount < MIN_BET) fail(400, `La mise minimale est de ${MIN_BET} pavés.`);
      if (amount > MAX_PER_MARKET) fail(400, `Pas plus de ${MAX_PER_MARKET} pavés par pari.`);
      if (!m) fail(404, "Ce pari n'existe pas.");
      if (m.status !== "open" || m.closesAt <= now) fail(409, "Les paris sont clos sur celui-ci.");
      if (!m.outcomes[outcome]) fail(400, "Cette issue n'existe pas.");
      if (me.balance < amount) fail(409, `Il te manque ${amount - me.balance} pavés.`);
      const already = mineOn(m.id).reduce((s, b) => s + b.amount, 0);
      if (already + amount > MAX_PER_MARKET)
        fail(409, already >= MAX_PER_MARKET ? `Tu as atteint le plafond de ${MAX_PER_MARKET} pavés sur ce pari.` : `Plafond de ${MAX_PER_MARKET} pavés par pari : il te reste ${MAX_PER_MARKET - already} à miser ici.`);
      if (!already) m.bettors++;
      myBets.push({ market: m.id, outcome, amount, payout: null, at: now });
      me.balance -= amount;
      me.staked += amount;
      me.wagered += amount;
      me.mood += amount * m.outcomes[outcome].grogne;
      m.outcomes[outcome].pool += amount;
      m.hist.push([now, m.outcomes.map((o) => o.seed + o.pool)]);
      return { ok: true, market: viewOf(m, now), me: meView(now), mine: mineAgg(m.id).map(({ at, ...b }) => b) };
    },
    "POST bonus"(_, now) {
      needMe();
      const day = parisDay(now);
      if (me.balance + me.staked >= START) fail(409, `La caisse de grève est réservée aux fortunes de moins de ${START} pavés.`);
      if (me.bonusDay === day) fail(409, "Tu as déjà touché la caisse de grève aujourd'hui. Reviens demain.");
      me.balance += DAILY;
      me.bonusDay = day;
      return { ok: true, amount: DAILY, me: meView(now) };
    },
    "GET board"(_, now) {
      const mine = me ? { ...me, fortune: me.balance + me.staked } : null;
      const row = (p) => ({ id: p.id, name: p.name, fortune: p.fortune, title: titleOf(p), settled: p.settled, won: p.won, ...(p.profit != null ? { profit: p.profit } : {}) });
      const ranked = players.concat(mine && mine.wagered > 0 ? [mine] : []).sort((a, b) => b.fortune - a.fortune || a.id - b.id);
      return {
        month: parisMonth(now),
        all: ranked.slice(0, 50).map((p) => row({ ...p, profit: null })),
        monthly: players.filter((p) => p.profit != null).sort((a, b) => b.profit - a.profit).slice(0, 50).map(row),
        me: mine ? { id: mine.id, name: mine.name, fortune: mine.fortune, title: titleOf(mine), rank: mine.wagered > 0 ? ranked.indexOf(mine) + 1 : null, monthRank: null, profit: null } : null,
      };
    },
    "GET bets"(_, now) {
      needMe();
      const bets = mineAgg()
        .sort((a, b) => b.at - a.at)
        .map((b) => {
          const m = markets.find((x) => x.id === b.market);
          return { ...b, label: m.outcomes[b.outcome].label, title: m.title, symbol: m.symbol, cat: m.cat, status: m.status === "open" && m.closesAt <= now ? "closed" : m.status, closesAt: m.closesAt, winner: m.winner, verdict: m.verdict, source: m.source, resolvedAt: m.resolvedAt };
        });
      return { me: meView(now), bets };
    },
    "POST rename"(input, now) {
      needMe();
      const name = cleanName(input?.name);
      const problem = nameProblem(name);
      if (problem) fail(400, problem);
      me.name = name;
      return { ok: true, me: meView(now) };
    },
    "POST key"() {
      needMe();
      return { code: "DEM0X-DEM0X-DEM0X-DEM0X" };
    },
    "POST restore"() {
      fail(404, "En mode démo, il n'y a aucun compte à retrouver.");
    },
    "POST logout": leave,
    "POST forget": leave,
  };
  function leave() {
    // En démo, quitter efface tout : les mises sortent aussi des cagnottes.
    for (const b of myBets) {
      const m = markets.find((x) => x.id === b.market);
      m.outcomes[b.outcome].pool -= b.amount;
    }
    for (const m of markets) m.bettors = m.who.size;
    me = null;
    myBets = [];
    return { ok: true };
  }

  return async function call(method, path, body) {
    await new Promise((done) => setTimeout(done, 90 + Math.random() * 120));
    const route = routes[`${method} ${path}`];
    if (!route) fail(404, "Route inconnue.");
    return JSON.parse(JSON.stringify(route(body, clock())));
  };
}
