// Tests de Préavis (app 11) : les règles du jeu (lib.js) et l'API (worker/src/preavis.js).
// L'API est appelée directement, sur une base SQLite en mémoire qui imite D1 (même schéma, mêmes requêtes).
// Lancer : npm test (Node 22.13 ou plus récent, pour node:sqlite).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import * as lib from "../apps/11-preavis/lib.js";
import { SEED_MARKETS } from "../apps/11-preavis/paris.js";
import { preavis } from "../worker/src/preavis.js";

const SCHEMA = readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8");
const T0 = Date.parse("2026-11-28T18:30:00+01:00"); // le soir du lancement
const DAY = 86400000;

// ---------------------------------------------------------------- une fausse base D1

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const isRead = (sql) => /^\s*(SELECT|WITH)\b/i.test(sql);
  const exec = (s) => {
    const st = db.prepare(s.sql);
    if (isRead(s.sql) || /\bRETURNING\b/i.test(s.sql)) return { results: st.all(...s.params), meta: { changes: 0 } };
    const r = st.run(...s.params);
    return { results: [], meta: { changes: Number(r.changes) } };
  };
  const prepare = (sql, params = []) => ({
    sql,
    params,
    bind: (...p) => prepare(sql, p),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => exec({ sql, params }),
  });
  return {
    raw: db,
    prepare,
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = stmts.map(exec);
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

// Les outils que worker/src/index.js passe au module (mêmes signatures).
function helpers(opt = {}) {
  return {
    json: (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }),
    readJson: async (request) => {
      try {
        return await request.json();
      } catch {
        return null;
      }
    },
    ipHashFor: async (request) => ({ ip: "203.0.113.7", max: 0, ipHash: (request.headers.get("x-net") || "a").repeat(64).slice(0, 64) }),
    hit: async (env, day, key) => (await env.DB.prepare("INSERT INTO quota (day, key, n) VALUES (?, ?, 1) ON CONFLICT (day, key) DO UPDATE SET n = n + 1 RETURNING n").bind(day, key).first())?.n || 1,
    verifyTurnstile: async (secret, token) => token === "jeton-valide",
    released: () => opt.released !== false,
    preview: async () => !!opt.preview,
  };
}

function world(opt) {
  const env = { DB: fakeD1(), ...(opt?.env || {}) };
  const h = helpers(opt);
  async function call(method, path, { body, cookie, now = T0, admin = false, net } = {}) {
    const url = new URL(`https://apphero.cloud/api/${admin ? "admin/" : ""}preavis/${path}`);
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (net) headers["x-net"] = net;
    if (body) headers["content-type"] = "application/json";
    const res = await preavis(new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env, {}, url, now, h);
    const set = res.headers.get("set-cookie");
    return { status: res.status, data: await res.json(), set, cookie: set ? set.split(";")[0] : null };
  }
  const get = (path, o) => call("GET", path, o);
  const post = (path, body, o) => call("POST", path, { ...o, body: body ?? {} });
  const admin = (path, body, o) => call(body === undefined ? "GET" : "POST", path, { ...o, body, admin: true });
  async function join(name, o) {
    const r = await post("join", { name }, o);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.cookie;
  }
  const player = (name) => env.DB.raw.prepare("SELECT * FROM pv_players WHERE name = ?").get(name);
  // Un pari simple, oui / non, ouvert par l'arbitre : la maison pose 250 sur Oui et 750 sur Non.
  async function market(id = "test-pari", over = {}) {
    const r = await admin("market", {
      id,
      title: "Une question de test, oui ou non ?",
      cat: "greves",
      symbol: "TEST",
      rules: "Règle de test.",
      closesAt: T0 + 10 * DAY,
      status: "open",
      outcomes: [
        { label: "Oui", pct: 25, grogne: 100 },
        { label: "Non", pct: 75, grogne: -60 },
      ],
      ...over,
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.id;
  }
  return { env, call, get, post, admin, join, player, market };
}

// ---------------------------------------------------------------- les règles du jeu

test("la mise de la maison suit l'estimation de départ", () => {
  assert.deepEqual(lib.seedsFor([25, 75]), [250, 750]);
  assert.deepEqual(lib.seedsFor([33.3, 33.3, 33.4]), [333, 333, 334]);
  assert.deepEqual(lib.seedsFor([1, 99]), [10, 990]);
  assert.equal(lib.seedsFor([50, 40]), null, "le total doit faire 100");
  assert.equal(lib.seedsFor([100]), null, "il faut au moins deux issues");
  assert.equal(lib.seedsFor([0, 100]), null, "au moins 1 % par issue");
  assert.equal(lib.seedsFor([20, 20, 20, 20, 10, 5, 5]), null, "six issues au plus");
});

test("cotes, parts et gains du pari mutuel", () => {
  const outs = [
    { seed: 250, pool: 600 },
    { seed: 750, pool: 300 },
  ];
  assert.deepEqual(lib.sizes(outs), [850, 1050]);
  assert.ok(Math.abs(lib.odds(outs)[0] - 1900 / 850) < 1e-9);
  assert.ok(Math.abs(lib.shares(outs).reduce((s, x) => s + x, 0) - 1) < 1e-9, "les parts font 100 %");
  assert.ok(Math.abs(lib.odds(outs).reduce((s, x) => s + 1 / x, 0) - 1) < 1e-9, "aucune combinaison de mises n'est gagnante à coup sûr");
  assert.equal(lib.payout(100, outs, 0), 223);
  assert.equal(lib.payout(500, outs, 0), 1117);
  assert.equal(lib.payout(300, outs, 1), Math.floor((300 * 1900) / 1050));
  // Une mise fait baisser sa propre cote : on touche moins que mise × cote affichée.
  const fresh = [
    { seed: 250, pool: 0 },
    { seed: 750, pool: 0 },
  ];
  assert.equal(lib.quote(fresh, 0, 100), Math.floor((100 * 1100) / 350));
  assert.ok(lib.quote(fresh, 0, 100) < 100 * lib.odds(fresh)[0]);
  assert.ok(lib.quote(fresh, 0, 100) > 100, "une mise gagnante rapporte toujours plus que la mise");
});

test("les gagnants ne touchent jamais plus que le pot", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let round = 0; round < 200; round++) {
    const n = 2 + Math.floor(rnd() * 5);
    const outs = Array.from({ length: n }, () => ({ seed: 10 + Math.floor(rnd() * 900), pool: 0 }));
    const bets = Array.from({ length: Math.floor(rnd() * 30) }, () => ({ o: Math.floor(rnd() * n), a: 10 + Math.floor(rnd() * 490) }));
    for (const b of bets) outs[b.o].pool += b.a;
    const pot = lib.sizes(outs).reduce((s, x) => s + x, 0);
    for (let w = 0; w < n; w++) {
      const paid = bets.filter((b) => b.o === w).reduce((s, b) => s + lib.payout(b.a, outs, w), 0);
      assert.ok(paid <= pot - outs[w].seed + 1e-9 || paid <= pot, "payé au plus le pot");
      for (const b of bets.filter((x) => x.o === w)) assert.ok(lib.payout(b.a, outs, w) >= b.a, "un gagnant récupère au moins sa mise");
    }
  }
});

test("le grognomètre reste entre 0 et 100", () => {
  const m = (grognes, pools, status = "open") => ({ status, outcomes: grognes.map((grogne, i) => ({ grogne, seed: 100, pool: pools[i] })) });
  assert.equal(lib.grogneIndex([]), null);
  assert.equal(lib.grogneIndex([m([0, 0], [0, 0])]), null, "un pari sans note de grogne ne compte pas");
  assert.equal(lib.grogneIndex([m([100, -100], [0, 0])]), 50);
  assert.equal(lib.grogneIndex([m([100, -100], [9900, 0])]), 100 - 1);
  assert.equal(lib.grogneIndex([m([100, -100], [0, 9900])]), 1);
  assert.equal(lib.grogneIndex([m([100, -100], [9900, 0], "resolved")]), null, "un pari tranché ne compte plus");
  assert.equal(lib.grogneLabel(null), "En attente");
  assert.equal(lib.grogneLabel(0), "Calme plat");
  assert.equal(lib.grogneLabel(100), "Ça va péter");
});

test("les titres suivent le parcours", () => {
  assert.equal(lib.titleOf({ fortune: 1000, wagered: 0, settled: 0, won: 0 }), "Bleu");
  assert.equal(lib.titleOf({ fortune: 1200, wagered: 900, mood: 900 * 80, settled: 2, won: 1 }), "Cassandre");
  assert.equal(lib.titleOf({ fortune: 1200, wagered: 900, mood: -900 * 80, settled: 2, won: 1 }), "Candide");
  assert.equal(lib.titleOf({ fortune: 1200, wagered: 900, mood: 0, settled: 2, won: 1 }), "Normand");
  assert.equal(lib.titleOf({ fortune: 1200, wagered: 900, mood: 0, settled: 10, won: 8 }), "Prophète");
  assert.equal(lib.titleOf({ fortune: 1200, wagered: 900, mood: 0, settled: 10, won: 1 }), "Chat noir");
  assert.equal(lib.titleOf({ fortune: 6000, wagered: 900, mood: 0, settled: 2, won: 1 }), "Rentier");
  assert.equal(lib.titleOf({ fortune: 40, wagered: 900, mood: 0, settled: 2, won: 1 }), "Fauché");
  for (const t of ["Bleu", "Cassandre", "Candide", "Normand", "Prophète", "Chat noir", "Rentier", "Fauché"]) assert.ok(lib.TITLES[t], `le titre ${t} a sa description`);
});

test("les pseudos : nettoyage, doublons, refus", () => {
  assert.equal(lib.cleanName("  Jean   Préavis "), "Jean Préavis");
  assert.equal(lib.cleanName("a"), null);
  assert.equal(lib.cleanName("x".repeat(17)), null);
  assert.equal(lib.cleanName("<script>"), null);
  assert.equal(lib.cleanName("Zoé_22"), "Zoé_22");
  assert.equal(lib.nameKey("Éléonore Œil-de-Bœuf"), "eleonoreoeildeboeuf");
  assert.equal(lib.nameKey("SIMON"), lib.nameKey("simon"));
  for (const bad of ["Admin", "L'arbitre", "arbitre2", "Vrai Préavis", "Apphéro officiel", "Parieur n° 3", "Parieur parti", "con"]) assert.equal(lib.blockedName(bad), true, bad);
  for (const ok of ["Simon", "Mamie Pavé", "Concorde", "Quai 9"]) assert.equal(lib.blockedName(ok), false, ok);
});

test("les jours et les semaines se comptent à l'heure de Paris, été comme hiver", () => {
  assert.equal(lib.parisDay(Date.parse("2026-11-28T18:30:00+01:00")), "2026-11-28");
  assert.equal(lib.parisDay(Date.parse("2026-12-31T23:30:00Z")), "2027-01-01");
  assert.equal(lib.parisDay(Date.parse("2027-03-28T00:30:00+01:00")), "2027-03-28");
  assert.equal(lib.parisDay(Date.parse("2027-03-28T21:59:00Z")), "2027-03-28", "après le passage à l'heure d'été");
  assert.equal(lib.parisDay(Date.parse("2027-03-28T22:01:00Z")), "2027-03-29");
  assert.equal(lib.parisMonth(Date.parse("2027-04-30T22:30:00Z")), "2027-05");
  assert.equal(lib.weekKey(Date.parse("2026-11-28T12:00:00+01:00")), "2026-W48");
  assert.equal(lib.weekKey(Date.parse("2026-11-30T00:10:00+01:00")), "2026-W49", "la semaine change le lundi à minuit, heure de Paris");
  assert.equal(lib.weekKey(Date.parse("2027-01-01T12:00:00+01:00")), "2026-W53");
  assert.equal(lib.weekKey(Date.parse("2027-01-04T12:00:00+01:00")), "2027-W01");
});

test("le bingo : même semaine, même grille", () => {
  const a = lib.bingoGrid("2026-W48");
  assert.equal(a.length, 16);
  assert.equal(new Set(a).size, 16, "seize phrases différentes");
  assert.deepEqual(lib.bingoGrid("2026-W48"), a);
  assert.notDeepEqual(lib.bingoGrid("2026-W49"), a);
  assert.equal(new Set(lib.PHRASES).size, lib.PHRASES.length, "pas de phrase en double dans la réserve");
  const row = Array(16).fill(false).map((_, i) => i < 4);
  assert.deepEqual(lib.bingoLines(row), [[0, 1, 2, 3]]);
  const diag = Array(16).fill(false).map((_, i) => i % 5 === 0);
  assert.deepEqual(lib.bingoLines(diag), [[0, 5, 10, 15]]);
  assert.equal(lib.bingoLines(Array(16).fill(true)).length, 10);
  assert.equal(lib.bingoLines(Array(16).fill(false)).length, 0);
});

test("l'affichage des nombres", () => {
  assert.equal(lib.fmt(950), "950");
  assert.equal(lib.fmt(1234567), "1\u00a0234\u00a0567");
  assert.equal(lib.fmtOdds(2.345), "×2,35");
  assert.equal(lib.fmtOdds(16.66), "×16,7");
  assert.equal(lib.fmtOdds(250), "×250");
  assert.equal(lib.fmtOdds(0), "–");
  assert.equal(lib.fmtPct(0.256), "26\u00a0%");
});

test("les paris de départ tiennent debout", () => {
  const ids = new Set();
  const symbols = new Set();
  for (const m of SEED_MARKETS) {
    assert.match(m.id, /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, m.id);
    assert.ok(!ids.has(m.id) && !symbols.has(m.symbol), `${m.id} : identifiant et symbole uniques`);
    ids.add(m.id);
    symbols.add(m.symbol);
    assert.match(m.symbol, /^[A-Z0-9.]{2,12}$/, m.id);
    assert.ok(lib.CATS[m.cat], `${m.id} : rubrique connue`);
    assert.ok(m.title.length >= 8 && m.title.length <= 180 && m.title.trim().endsWith("?"), `${m.id} : une question`);
    assert.ok(m.rules.length > 40 && m.rules.length <= 1500, `${m.id} : une règle écrite`);
    assert.ok(lib.seedsFor(m.outcomes.map((o) => o.pct)), `${m.id} : estimation de départ valide`);
    for (const o of m.outcomes) {
      assert.ok(o.label && o.label.length <= 48, `${m.id} : nom d'issue`);
      assert.ok(Number.isInteger(o.grogne) && o.grogne >= -100 && o.grogne <= 100, `${m.id} : grogne`);
    }
    assert.equal(new Set(m.outcomes.map((o) => o.label)).size, m.outcomes.length, `${m.id} : issues distinctes`);
    const closes = Date.parse(m.closesAt);
    assert.ok(closes > T0, `${m.id} : encore ouvert au lancement`);
    assert.ok(closes < Date.parse("2027-05-03T00:00:00+02:00"), `${m.id} : clos avant la fin du jeu`);
    assert.match(m.closesAt, /[+-]\d\d:\d\d$/, `${m.id} : la date porte son décalage horaire`);
    if (m.resolveBy) assert.ok(Date.parse(m.resolveBy) >= closes, `${m.id} : verdict après la clôture`);
  }
  assert.ok(SEED_MARKETS.length >= 12);
});

// ---------------------------------------------------------------- l'API

test("avant la sortie de l'app, l'API publique est fermée (sauf aperçu organisateur)", async () => {
  const closed = world({ released: false });
  assert.equal((await closed.get("state")).status, 404);
  assert.equal((await closed.post("join", { name: "Simon" })).status, 404);
  // L'arbitre, lui, peut déjà préparer ses paris.
  assert.equal((await closed.admin("all")).status, 200);
  const preview = world({ released: false, preview: true });
  assert.equal((await preview.get("state")).status, 200);
});

test("à la première visite, la salle ouvre avec les paris de départ, une seule fois", async () => {
  const w = world();
  const first = await w.get("state");
  assert.equal(first.status, 200);
  assert.equal(first.data.markets.length, SEED_MARKETS.length);
  assert.equal(first.data.me, null);
  assert.equal(first.data.players, 0);
  assert.equal(first.data.turnstile, "");
  const m = first.data.markets.find((x) => x.id === "sncf-noel");
  assert.deepEqual(m.outcomes.map((o) => [o.seed, o.pool]), [[250, 0], [750, 0]]);
  assert.equal(m.status, "open");
  assert.equal(m.total, 0);
  assert.deepEqual(m.hist[0].slice(1), [250, 750]);
  assert.ok(first.data.markets[0].pinned, "les paris à la une viennent en premier");
  // L'arbitre retire tout : la salle ne se remplit pas une deuxième fois.
  for (const x of first.data.markets) assert.equal((await w.admin("delete", { id: x.id })).status, 200);
  assert.equal((await w.get("state")).data.markets.length, 0);
});

test("s'inscrire : un pseudo, 1 000 pavés, un cookie illisible par les scripts", async () => {
  const w = world();
  const r = await w.post("join", { name: "  Simon  " });
  assert.equal(r.status, 200);
  assert.deepEqual({ name: r.data.me.name, balance: r.data.me.balance, staked: r.data.me.staked, fortune: r.data.me.fortune, title: r.data.me.title, bonus: r.data.me.bonus }, { name: "Simon", balance: 1000, staked: 0, fortune: 1000, title: "Bleu", bonus: "riche" });
  assert.match(r.set, /^pv_id=[0-9A-HJKMNP-TV-Z]{20}; Path=\/api\/preavis; Max-Age=34560000; HttpOnly; Secure; SameSite=Lax$/);
  // La base ne garde que l'empreinte du secret.
  const row = w.player("Simon");
  assert.match(row.key, /^[a-f0-9]{64}$/);
  assert.ok(!row.key.includes(r.cookie.slice(6)));
  // Le compte suit le cookie.
  const st = await w.get("state", { cookie: r.cookie });
  assert.equal(st.data.me.name, "Simon");
  assert.equal(st.data.players, 1);
  // Mêmes lettres, autre casse ou autres accents : c'est le même pseudo.
  assert.equal((await w.post("join", { name: "SIMÔN" })).status, 400);
  assert.equal((await w.post("join", { name: "Sim.on" })).status, 400);
  for (const bad of ["x", "Admin", "arbitre", "<b>gras</b>", "", "Parieur n° 12"]) assert.equal((await w.post("join", { name: bad })).status, 400, bad);
  // Un seul compte par appareil.
  assert.equal((await w.post("join", { name: "Autre" }, { cookie: r.cookie })).status, 409);
  // Un cookie inconnu est effacé.
  const ghost = await w.get("state", { cookie: "pv_id=00000000000000000000" });
  assert.equal(ghost.data.me, null);
  assert.match(ghost.set, /^pv_id=; .*Max-Age=0/);
});

test("pas plus de dix comptes par réseau et par jour, et l'anti-robot quand il est branché", async () => {
  const w = world();
  for (let i = 0; i < 10; i++) await w.join(`Joueur ${i}`);
  assert.equal((await w.post("join", { name: "Le onzième" })).status, 429);
  assert.equal((await w.post("join", { name: "Autre réseau" }, { net: "b" })).status, 200);
  assert.equal((await w.post("join", { name: "Lendemain" }, { now: T0 + DAY })).status, 200);

  const guarded = world({ env: { TURNSTILE_SECRET: "secret", TURNSTILE_SITE_KEY: "cle-publique" } });
  assert.equal((await guarded.get("state")).data.turnstile, "cle-publique");
  assert.equal((await guarded.post("join", { name: "Robot" })).status, 403);
  assert.equal((await guarded.post("join", { name: "Humain", token: "jeton-valide" })).status, 200);
});

test("miser : le solde, les cagnottes et la cote bougent ensemble", async () => {
  const w = world();
  const id = await w.market();
  const simon = await w.join("Simon");
  const r = await w.post("bet", { market: id, outcome: 0, amount: 100 }, { cookie: simon });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.me.balance, r.data.me.staked, r.data.me.fortune], [900, 100, 1000]);
  assert.deepEqual(r.data.mine, [{ market: id, outcome: 0, amount: 100, payout: null }]);
  assert.deepEqual(r.data.market.outcomes.map((o) => o.pool), [100, 0]);
  assert.equal(r.data.market.bettors, 1);
  assert.equal(r.data.market.total, 100);
  // Une deuxième mise du même joueur : toujours un seul parieur.
  const again = await w.post("bet", { market: id, outcome: 1, amount: 50 }, { cookie: simon, now: T0 + 3600000 });
  assert.equal(again.data.market.bettors, 1);
  assert.equal(again.data.mine.length, 2);
  assert.ok(again.data.market.hist.length >= 2, "la courbe garde la trace des mises");
  const st = await w.get("state", { cookie: simon });
  assert.deepEqual(st.data.mine.map((b) => [b.outcome, b.amount]).sort(), [[0, 100], [1, 50]]);
  const row = w.player("Simon");
  assert.equal(row.wagered, 150);
  assert.equal(row.mood, 100 * 100 + 50 * -60);
});

test("miser : tout ce qui est refusé", async () => {
  const w = world();
  const id = await w.market();
  const simon = await w.join("Simon");
  const bet = (body, o) => w.post("bet", body, { cookie: simon, ...o });
  assert.equal((await w.post("bet", { market: id, outcome: 0, amount: 50 })).status, 401, "sans compte");
  assert.equal((await bet({ market: id, outcome: 0, amount: 5 })).status, 400, "sous la mise minimale");
  assert.equal((await bet({ market: id, outcome: 0, amount: 12.5 })).status, 400, "pas un entier");
  assert.equal((await bet({ market: id, outcome: 0, amount: -100 })).status, 400, "mise négative");
  assert.equal((await bet({ market: id, outcome: 0, amount: "100; DROP TABLE pv_players" })).status, 400);
  assert.equal((await bet({ market: id, outcome: 0, amount: 501 })).status, 400, "au-dessus du plafond");
  assert.equal((await bet({ market: id, outcome: 2, amount: 50 })).status, 400, "issue inconnue");
  assert.equal((await bet({ market: "pas-ce-pari", outcome: 0, amount: 50 })).status, 404);
  assert.equal((await bet({ market: id, outcome: 0, amount: 50 }, { now: T0 + 11 * DAY })).status, 409, "après la clôture");
  // Le plafond de 500 par pari compte toutes les mises de la personne.
  assert.equal((await bet({ market: id, outcome: 0, amount: 400 })).status, 200);
  const over = await bet({ market: id, outcome: 1, amount: 200 });
  assert.equal(over.status, 409);
  assert.match(over.data.error, /il te reste 100/);
  assert.equal((await bet({ market: id, outcome: 1, amount: 100 })).status, 200);
  assert.match((await bet({ market: id, outcome: 1, amount: 10 })).data.error, /plafond de 500/);
  // Pas assez de pavés.
  const b = await w.market("autre-pari");
  assert.equal((await bet({ market: b, outcome: 0, amount: 500 })).status, 200);
  const broke = await bet({ market: await w.market("troisieme"), outcome: 0, amount: 10 });
  assert.equal(broke.status, 409);
  assert.match(broke.data.error, /Il te manque 10 pavés/);
  // Un brouillon n'est pas ouvert aux mises, et n'apparaît pas dans la salle.
  const draft = await w.market("brouillon", { status: "draft" });
  assert.equal((await w.post("bet", { market: draft, outcome: 0, amount: 10 }, { cookie: await w.join("Zoé") })).status, 404);
  assert.ok(!(await w.get("state")).data.markets.some((m) => m.id === draft));
  // Rien n'a bougé : 1 000 pavés au départ, 1 000 de fortune.
  assert.deepEqual([w.player("Simon").balance, w.player("Simon").staked], [0, 1000]);
});

test("trois mises en même temps ne dépensent pas deux fois les mêmes pavés", async () => {
  const w = world();
  const ids = [await w.market("pari-a"), await w.market("pari-b"), await w.market("pari-c")];
  const simon = await w.join("Simon");
  const res = await Promise.all(ids.map((id) => w.post("bet", { market: id, outcome: 0, amount: 500 }, { cookie: simon })));
  assert.deepEqual(res.map((r) => r.status).sort(), [200, 200, 409]);
  const row = w.player("Simon");
  assert.deepEqual([row.balance, row.staked], [0, 1000]);
  const pools = w.env.DB.raw.prepare("SELECT SUM(pool) AS n FROM pv_outcomes").get().n;
  assert.equal(pools, 1000, "les cagnottes contiennent exactement ce qui a été misé");
});

test("le verdict paie les gagnants au prorata, une seule fois", async () => {
  const w = world();
  const id = await w.market();
  const [a, b, c] = [await w.join("Alice"), await w.join("Bruno"), await w.join("Chloé")];
  await w.post("bet", { market: id, outcome: 0, amount: 100 }, { cookie: a });
  await w.post("bet", { market: id, outcome: 0, amount: 500 }, { cookie: b });
  await w.post("bet", { market: id, outcome: 1, amount: 300 }, { cookie: c });
  assert.equal((await w.admin("resolve", { id, winner: 5 })).status, 400);
  assert.equal((await w.admin("resolve", { id, winner: 0, source: "javascript:alert(1)" })).status, 400, "la source doit être un lien http(s)");
  const r = await w.admin("resolve", { id, winner: 0, verdict: "C'est oui.", source: "https://example.org/source" }, { now: T0 + DAY });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // Pot : 1 000 (maison) + 900 (joueurs) = 1 900. Sur Oui : 250 + 600 = 850.
  const rows = ["Alice", "Bruno", "Chloé"].map((n) => w.player(n));
  assert.deepEqual(rows.map((p) => p.balance), [900 + 223, 500 + 1117, 700]);
  assert.deepEqual(rows.map((p) => p.staked), [0, 0, 0]);
  assert.deepEqual(rows.map((p) => [p.settled, p.won]), [[1, 1], [1, 1], [1, 0]]);
  const gains = w.env.DB.raw.prepare("SELECT player, profit, month FROM pv_gains ORDER BY player").all();
  assert.deepEqual(gains.map((g) => [g.profit, g.month]), [[123, "2026-11"], [617, "2026-11"], [-300, "2026-11"]]);
  // Déjà tranché : un deuxième verdict ne paie pas une deuxième fois.
  assert.equal((await w.admin("resolve", { id, winner: 1 })).status, 409);
  assert.equal(w.player("Alice").balance, 1123);
  // Dans la salle : le verdict, la source, et ce que chacun a touché.
  const st = await w.get("state", { cookie: a, now: T0 + DAY });
  const m = st.data.markets.find((x) => x.id === id);
  assert.deepEqual([m.status, m.winner, m.verdict, m.source], ["resolved", 0, "C'est oui.", "https://example.org/source"]);
  assert.deepEqual(st.data.mine, [{ market: id, outcome: 0, amount: 100, payout: 223 }]);
  // Plus de mise possible.
  assert.equal((await w.post("bet", { market: id, outcome: 0, amount: 10 }, { cookie: c })).status, 409);
  // Le classement du mois compte les gains des paris tranchés.
  const board = await w.get("board", { cookie: c, now: T0 + DAY });
  assert.deepEqual(board.data.monthly.map((p) => [p.name, p.profit]), [["Bruno", 617], ["Alice", 123], ["Chloé", -300]]);
  assert.deepEqual(board.data.all.map((p) => p.name), ["Bruno", "Alice", "Chloé"]);
  assert.deepEqual([board.data.me.rank, board.data.me.monthRank, board.data.me.profit], [3, 3, -300]);
  // Un pari tranché reste affiché 45 jours, puis quitte la salle.
  assert.ok((await w.get("state", { now: T0 + 40 * DAY })).data.markets.some((x) => x.id === id));
  assert.ok(!(await w.get("state", { now: T0 + 50 * DAY })).data.markets.some((x) => x.id === id));
});

test("les mises arrivées après l'événement sont remboursées", async () => {
  const w = world();
  const id = await w.market();
  const [a, b, c] = [await w.join("Alice"), await w.join("Bruno"), await w.join("Chloé")];
  await w.post("bet", { market: id, outcome: 0, amount: 100 }, { cookie: a, now: T0 + 1000 });
  await w.post("bet", { market: id, outcome: 1, amount: 300 }, { cookie: c, now: T0 + 2000 });
  // Bruno mise sur l'issue gagnante une heure après que tout le monde la connaît.
  await w.post("bet", { market: id, outcome: 0, amount: 500 }, { cookie: b, now: T0 + 2 * 3600000 });
  assert.equal((await w.admin("resolve", { id, winner: 0, cutoff: T0 + 10 * DAY }, { now: T0 + DAY })).status, 400, "l'événement ne peut pas être dans le futur");
  assert.equal((await w.admin("resolve", { id, winner: 0, cutoff: T0 + 3600000 }, { now: T0 + DAY })).status, 200);
  // Sans Bruno : pot = 1 000 + 400 = 1 400, sur Oui = 250 + 100 = 350. Alice touche 100 × 1400 / 350 = 400.
  assert.equal(w.player("Alice").balance, 900 + 400);
  assert.equal(w.player("Bruno").balance, 1000, "remboursé, ni gagnant ni perdant");
  assert.deepEqual([w.player("Bruno").won, w.player("Bruno").settled], [0, 1]);
  assert.equal(w.player("Chloé").balance, 700);
  assert.equal(w.env.DB.raw.prepare("SELECT closes_at FROM pv_markets WHERE id = ?").get(id).closes_at, T0 + 3600000);
});

test("un pari annulé rembourse tout le monde", async () => {
  const w = world();
  const id = await w.market();
  const [a, c] = [await w.join("Alice"), await w.join("Chloé")];
  await w.post("bet", { market: id, outcome: 0, amount: 100 }, { cookie: a });
  await w.post("bet", { market: id, outcome: 1, amount: 300 }, { cookie: c });
  assert.equal((await w.admin("void", { id, verdict: "La question n'a plus de sens." })).status, 200);
  assert.deepEqual(["Alice", "Chloé"].map((n) => [w.player(n).balance, w.player(n).staked, w.player(n).settled]), [[1000, 0, 0], [1000, 0, 0]]);
  assert.equal((await w.admin("void", { id })).status, 409);
  const st = await w.get("state", { cookie: a });
  assert.equal(st.data.markets.find((x) => x.id === id).status, "void");
  assert.equal(st.data.mine[0].payout, 100);
  assert.equal(w.env.DB.raw.prepare("SELECT COUNT(*) AS n FROM pv_gains").get().n, 0, "un pari annulé ne compte pas au classement du mois");
});

test("un verdict se corrige : on reprend ce qui a été versé, puis on tranche de nouveau", async () => {
  const w = world();
  const id = await w.market();
  const [a, c] = [await w.join("Alice"), await w.join("Chloé")];
  await w.post("bet", { market: id, outcome: 0, amount: 100 }, { cookie: a });
  await w.post("bet", { market: id, outcome: 1, amount: 300 }, { cookie: c });
  await w.admin("resolve", { id, winner: 0 });
  assert.equal(w.player("Alice").balance, 900 + Math.floor((100 * 1400) / 350));
  assert.equal((await w.admin("reopen", { id })).status, 200);
  assert.deepEqual(["Alice", "Chloé"].map((n) => [w.player(n).balance, w.player(n).staked, w.player(n).settled, w.player(n).won]), [[900, 100, 0, 0], [700, 300, 0, 0]]);
  assert.deepEqual(w.env.DB.raw.prepare("SELECT profit FROM pv_gains ORDER BY player").all().map((g) => g.profit), [0, 0]);
  assert.equal((await w.admin("reopen", { id })).status, 409);
  // Cette fois, c'est Non.
  assert.equal((await w.admin("resolve", { id, winner: 1 })).status, 200);
  assert.equal(w.player("Alice").balance, 900);
  assert.equal(w.player("Chloé").balance, 700 + Math.floor((300 * 1400) / 1050));
  // Annuler un pari annulé remet aussi les mises en jeu.
  const other = await w.market("autre-pari");
  await w.post("bet", { market: other, outcome: 0, amount: 50 }, { cookie: a });
  await w.admin("void", { id: other });
  assert.equal(w.player("Alice").staked, 0);
  assert.equal((await w.admin("reopen", { id: other })).status, 200);
  assert.deepEqual([w.player("Alice").balance, w.player("Alice").staked], [850, 50]);
});

test("la caisse de grève : 50 pavés par jour, seulement sous 1 000 de fortune", async () => {
  const w = world();
  const id = await w.market();
  const simon = await w.join("Simon");
  assert.equal((await w.post("bonus", {}, { cookie: simon })).status, 409, "à 1 000 pavés, pas de caisse");
  await w.post("bet", { market: id, outcome: 1, amount: 300 }, { cookie: simon });
  assert.equal((await w.post("bonus", {}, { cookie: simon })).status, 409, "la fortune compte aussi les pavés en jeu");
  await w.admin("resolve", { id, winner: 0 });
  assert.equal((await w.get("state", { cookie: simon })).data.me.bonus, "dispo");
  const r = await w.post("bonus", {}, { cookie: simon });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.amount, r.data.me.balance, r.data.me.bonus], [50, 750, "pris"]);
  assert.equal((await w.post("bonus", {}, { cookie: simon })).status, 409, "une fois par jour");
  assert.equal((await w.post("bonus", {}, { cookie: simon, now: T0 + DAY })).status, 200);
  assert.equal(w.player("Simon").balance, 800);
  assert.equal((await w.post("bonus", {})).status, 401);
});

test("le compte : code de reprise, changement de pseudo, déconnexion, suppression", async () => {
  const w = world();
  const simon = await w.join("Simon");
  const key = await w.post("key", {}, { cookie: simon });
  assert.match(key.data.code, /^([0-9A-HJKMNP-TV-Z]{5}-){3}[0-9A-HJKMNP-TV-Z]{5}$/);
  assert.equal((await w.post("key", {})).status, 401);
  // Sur un autre appareil : le code rend le compte (les O et les I mal recopiés sont pardonnés).
  const typed = key.data.code.toLowerCase().replace(/0/g, "o").replace(/1/g, "l");
  const back = await w.post("restore", { code: ` ${typed} ` });
  assert.equal(back.status, 200);
  assert.equal(back.data.me.name, "Simon");
  assert.equal(back.cookie, simon);
  assert.equal((await w.post("restore", { code: "AAAAA-AAAAA-AAAAA-AAAAA" })).status, 404);
  assert.equal((await w.post("restore", { code: "trop court" })).status, 404);
  // Changer de pseudo : mêmes règles qu'à l'inscription, trois fois par jour au plus.
  await w.join("Zoé");
  assert.equal((await w.post("rename", { name: "ZOE" }, { cookie: simon })).status, 400);
  assert.equal((await w.post("rename", { name: "Admin" }, { cookie: simon })).status, 400);
  assert.equal((await w.post("rename", { name: "Simone" }, { cookie: simon })).data.me.name, "Simone");
  assert.equal((await w.post("rename", { name: "SIMONE" }, { cookie: simon })).status, 200, "on peut changer la casse de son propre pseudo");
  assert.equal((await w.post("rename", { name: "Simon" }, { cookie: simon })).status, 200);
  assert.equal((await w.post("rename", { name: "Simon 4" }, { cookie: simon })).status, 429);
  // Se déconnecter efface le cookie, sans toucher au compte.
  const out = await w.post("logout", {}, { cookie: simon });
  assert.match(out.set, /^pv_id=; .*Max-Age=0/);
  assert.equal((await w.get("state", { cookie: simon })).data.me.name, "Simon");
  // Supprimer : le pseudo est libéré, le compte devient injoignable et sort des classements.
  const gone = await w.post("forget", {}, { cookie: simon });
  assert.match(gone.set, /^pv_id=; .*Max-Age=0/);
  assert.equal((await w.get("state", { cookie: simon })).data.me, null);
  assert.equal((await w.post("restore", { code: key.data.code })).status, 404);
  assert.equal(w.player("Simon"), undefined);
  assert.equal((await w.post("join", { name: "Simon" }, { net: "b" })).status, 200, "le pseudo est de nouveau libre");
});

test("mes paris et le classement général", async () => {
  const w = world();
  const id = await w.market();
  const [a, b] = [await w.join("Alice"), await w.join("Bruno")];
  await w.join("Spectateur");
  await w.post("bet", { market: id, outcome: 0, amount: 100 }, { cookie: a, now: T0 + 1000 });
  await w.post("bet", { market: id, outcome: 0, amount: 50 }, { cookie: a, now: T0 + 2000 });
  await w.post("bet", { market: id, outcome: 1, amount: 200 }, { cookie: b, now: T0 + 3000 });
  const mine = await w.get("bets", { cookie: a });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.data.bets.map((x) => [x.market, x.outcome, x.label, x.amount, x.payout, x.status]), [[id, 0, "Oui", 150, null, "open"]]);
  assert.equal((await w.get("bets")).status, 401);
  // Le général ne classe que ceux qui ont parié ; à fortune égale, le plus ancien d'abord.
  const board = await w.get("board", { cookie: b });
  assert.deepEqual(board.data.all.map((p) => [p.name, p.fortune]), [["Alice", 1000], ["Bruno", 1000]]);
  assert.equal(board.data.me.rank, 1, "à égalité, personne n'est devant");
  assert.equal(board.data.month, "2026-11");
  assert.deepEqual(board.data.monthly, []);
  // Un compte suspendu sort du classement et ne peut plus miser.
  assert.equal((await w.admin("moderate", { player: w.player("Alice").id, action: "ban" })).status, 200);
  assert.deepEqual((await w.get("board")).data.all.map((p) => p.name), ["Bruno"]);
  assert.equal((await w.post("bet", { market: id, outcome: 0, amount: 10 }, { cookie: a })).status, 403);
  assert.equal((await w.admin("moderate", { player: w.player("Alice").id, action: "unban" })).status, 200);
  // Un pseudo déplacé est remplacé.
  const bruno = w.player("Bruno").id;
  assert.equal((await w.admin("moderate", { player: bruno, action: "rename" })).status, 200);
  assert.equal((await w.get("state", { cookie: b })).data.me.name, `Parieur n° ${bruno}`);
  assert.equal((await w.admin("moderate", { player: 9999, action: "ban" })).status, 404);
  assert.equal((await w.admin("players?q=ali")).data.players.length, 1);
});

test("l'arbitre : créer, modifier, clore, supprimer", async () => {
  const w = world();
  const bad = (over) => w.admin("market", { title: "Une question de test ?", cat: "greves", closesAt: T0 + DAY, status: "open", outcomes: [{ label: "Oui", pct: 50 }, { label: "Non", pct: 50 }], ...over });
  assert.equal((await bad({ title: "Court" })).status, 400);
  assert.equal((await bad({ cat: "sport" })).status, 400);
  assert.equal((await bad({ closesAt: "pas une date" })).status, 400);
  assert.equal((await bad({ closesAt: T0 - 1000 })).status, 400, "clôture déjà passée");
  assert.equal((await bad({ outcomes: [{ label: "Seule", pct: 100 }] })).status, 400);
  assert.equal((await bad({ outcomes: [{ label: "Oui", pct: 60 }, { label: "Non", pct: 60 }] })).status, 400);
  assert.equal((await bad({ outcomes: [{ label: "", pct: 50 }, { label: "Non", pct: 50 }] })).status, 400);
  // Sans identifiant, il est tiré de la question ; deux fois la même question, deux paris.
  const one = await bad({});
  const two = await bad({});
  assert.deepEqual([one.data.id, two.data.id], ["une-question-de-test", "une-question-de-test-2"]);
  // Brouillon, puis ouverture.
  const id = await w.market("mon-pari", { status: "draft" });
  assert.equal((await w.admin("resolve", { id, winner: 0 })).status, 409, "un brouillon ne se tranche pas");
  const all = await w.admin("all");
  assert.equal(all.data.markets.find((m) => m.id === id).raw, "draft");
  assert.equal((await w.admin("market", { id, title: "Une question corrigée ?", cat: "rue", closesAt: T0 + 5 * DAY, status: "open", outcomes: [{ label: "Oui", pct: 40 }, { label: "Non", pct: 35 }, { label: "Ni l'un ni l'autre", pct: 25 }] })).status, 200);
  const st = await w.get("state");
  const m = st.data.markets.find((x) => x.id === id);
  assert.deepEqual([m.title, m.cat, m.status, m.outcomes.length], ["Une question corrigée ?", "rue", "open", 3]);
  assert.deepEqual(m.outcomes.map((o) => o.seed), [400, 350, 250]);
  // Dès qu'il y a des mises : plus question de changer le nombre d'issues ni la mise de la maison.
  const simon = await w.join("Simon");
  await w.post("bet", { market: id, outcome: 0, amount: 100 }, { cookie: simon });
  assert.equal((await w.admin("market", { id, title: "Une question corrigée ?", cat: "rue", closesAt: T0 + 5 * DAY, status: "open", outcomes: [{ label: "Oui", pct: 50 }, { label: "Non", pct: 50 }] })).status, 409);
  assert.equal((await w.admin("market", { id, title: "Une question re-corrigée ?", cat: "rue", closesAt: T0 + 6 * DAY, status: "open", outcomes: [{ label: "Oui !", pct: 1 }, { label: "Non", pct: 1 }, { label: "Bof", pct: 98 }] })).status, 200);
  const after = (await w.get("state")).data.markets.find((x) => x.id === id);
  assert.deepEqual(after.outcomes.map((o) => [o.label, o.seed, o.pool]), [["Oui !", 400, 100], ["Non", 350, 0], ["Bof", 250, 0]]);
  assert.equal((await w.admin("delete", { id })).status, 409, "des mises existent : on annule, on ne supprime pas");
  // Clore les mises tout de suite.
  assert.equal((await w.admin("close", { id })).status, 200);
  assert.equal((await w.get("state", { now: T0 + 1 })).data.markets.find((x) => x.id === id).status, "closed");
  assert.equal((await w.post("bet", { market: id, outcome: 0, amount: 10 }, { cookie: simon, now: T0 + 1 })).status, 409);
  assert.equal((await w.admin("close", { id }, { now: T0 + 1 })).status, 409);
  // Le journal garde ce qui s'est vraiment passé (pas les refus).
  const log = (await w.admin("all")).data.log.map((l) => l.action);
  assert.ok(log.includes("clôture") && log.includes("brouillon") && log.includes("modification"));
  assert.ok(!log.includes("suppression"));
  assert.equal((await w.admin("delete", { id: one.data.id })).status, 200);
  assert.ok((await w.admin("all")).data.log.some((l) => l.action === "suppression" && l.market === one.data.id));
  assert.equal((await w.admin("inconnu")).status, 404);
});
