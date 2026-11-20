// Préavis (app 11) : des paris pour rire sur l'actualité sociale et politique, en pavés fictifs.
// Aucun argent, aucun lot : seulement un classement.
//
// Côté public (/api/preavis/…) :
// - GET  state     les paris en cours et récents, mon compte, mes mises
// - POST join      créer son compte (un pseudo) : 1 000 pavés, et un cookie pour le retrouver
// - POST bet       miser sur une issue
// - POST bonus     la caisse de grève (+50 par jour tant que la fortune est sous 1 000)
// - GET  board     les classements (général, et du mois)
// - GET  bets      l'historique de mes paris
// - POST rename, key, restore, logout, forget   gérer son compte
//
// Côté arbitre (/api/admin/preavis/…, protégé par le code organisateur dans index.js) :
// - GET  all       tous les paris, brouillons compris, le journal et quelques compteurs
// - POST market    créer ou modifier un pari
// - POST close, resolve, void, reopen, delete
// - GET  players, POST moderate
//
// Pari mutuel : les règles de calcul sont dans apps/11-preavis/lib.js, partagées avec l'app.
// Chaque écriture qui touche aux pavés passe par un seul lot (transaction D1) dont les conditions
// sont vérifiées dans les requêtes elles-mêmes : deux requêtes simultanées ne peuvent ni dépenser
// deux fois les mêmes pavés, ni payer deux fois le même pari.

import { START, DAILY, MIN_BET, MAX_PER_MARKET, MAX_OUTCOMES, CATS, seedsFor, cleanName, nameKey, blockedName, titleOf, parisDay, parisMonth } from "../../apps/11-preavis/lib.js";
import { SEED_MARKETS } from "../../apps/11-preavis/paris.js";

const APP = "11";
const COOKIE = "pv_id";
const COOKIE_PATH = "/api/preavis"; // le cookie ne part que vers cette API, jamais vers les pages
const COOKIE_AGE = 400 * 86400; // le maximum que gardent les navigateurs
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // base 32 de Crockford : ni I, ni L, ni O, ni U
const SECRET_RE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const MAX_JOINS_PER_NET = 10; // comptes créés par réseau et par jour
const MAX_BETS_PER_DAY = 150; // mises par personne et par jour
const MAX_RESTORES_PER_NET = 10; // codes de reprise essayés par réseau et par jour
const MAX_RENAMES_PER_DAY = 3;
const RECENT_MS = 45 * 86400000; // un pari tranché reste affiché 45 jours
const HIST_STEP = 30 * 60000; // un point de courbe par demi-heure au plus
const HIST_MAX = 200;

const MARKET_COLS = "id, symbol, cat, title, rules, status, closes_at, resolve_by, winner, verdict, source, resolved_at, bettors, hist, pinned, created_at";
const VISIBLE = "status = 'open' OR (status IN ('resolved', 'void') AND resolved_at > ?1)";

export async function preavis(request, env, ctx, url, now, h) {
  const path = url.pathname.replace(/\/$/, "");
  const admin = path.startsWith("/api/admin/preavis/");
  // Avant la sortie de l'app, seul l'arbitre (ou l'aperçu organisateur) passe.
  if (!admin && !h.released(APP, now) && !(await h.preview(request, env, now))) return h.json({ error: "Les paris ne sont pas encore ouverts." }, 404);
  const route = `${request.method} ${admin ? "admin/" : ""}${path.split("/").pop()}`;
  switch (route) {
    case "GET state":
      return state(request, env, now, h);
    case "POST join":
      return join(request, env, now, h);
    case "POST bet":
      return bet(request, env, now, h);
    case "POST bonus":
      return bonus(request, env, now, h);
    case "GET board":
      return board(request, env, now, h);
    case "GET bets":
      return myBets(request, env, now, h);
    case "POST rename":
      return rename(request, env, now, h);
    case "POST key":
      return showKey(request, env, h);
    case "POST restore":
      return restore(request, env, now, h);
    case "POST logout":
      return h.json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
    case "POST forget":
      return forget(request, env, now, h);
    case "GET admin/all":
      return adminAll(env, now, h);
    case "POST admin/market":
      return saveMarket(request, env, now, h);
    case "POST admin/close":
      return closeMarket(request, env, now, h);
    case "POST admin/resolve":
      return resolve(request, env, now, h);
    case "POST admin/void":
      return voidMarket(request, env, now, h);
    case "POST admin/reopen":
      return reopen(request, env, now, h);
    case "POST admin/delete":
      return deleteMarket(request, env, now, h);
    case "GET admin/players":
      return adminPlayers(env, url, h);
    case "POST admin/moderate":
      return moderate(request, env, now, h);
  }
  return h.json({ error: "Route inconnue." }, 404);
}

// ---------------------------------------------------------------- outils

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const clip = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, n) : "");
const toMs = (v) => {
  const t = typeof v === "number" ? v : Date.parse(String(v || ""));
  return Number.isFinite(t) && t > 0 ? Math.round(t) : null;
};
// Un lien de source : http(s) seulement, pour qu'il ne puisse rien exécuter dans la page.
function cleanUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}
function slug(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
}

// Le compte : un secret tiré au hasard, gardé dans un cookie que les scripts ne peuvent pas lire.
// La base ne garde que son empreinte.
const cookie = (secret, age = COOKIE_AGE) => `${COOKIE}=${secret}; Path=${COOKIE_PATH}; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
function newSecret() {
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(20))) s += ALPHABET[b & 31];
  return s;
}
function readSecret(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)pv_id=([0-9A-HJKMNP-TV-Z]{20})(?:;|$)/);
  return m ? m[1] : null;
}
const keyOf = (secret) => sha256(`preavis|${secret}`);
async function currentPlayer(request, env) {
  const secret = readSecret(request);
  if (!secret) return null;
  return env.DB.prepare("SELECT * FROM pv_players WHERE key = ?").bind(await keyOf(secret)).first();
}

function meView(p, now) {
  const fortune = p.balance + p.staked;
  return {
    id: p.id,
    name: p.name,
    balance: p.balance,
    staked: p.staked,
    fortune,
    settled: p.settled,
    won: p.won,
    title: titleOf({ ...p, fortune }),
    // La caisse de grève : « dispo », « pris » (déjà touchée aujourd'hui) ou « riche » (1 000 pavés ou plus).
    bonus: fortune >= START ? "riche" : p.bonus_day === parisDay(now) ? "pris" : "dispo",
    since: p.created_at,
  };
}

function parseHist(raw) {
  try {
    const h = JSON.parse(raw || "[]");
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}
// La courbe d'un pari : [instant, cagnottes] ; un point par demi-heure au plus, 200 points au plus.
function nextHist(raw, now, sizes) {
  const hist = parseHist(raw);
  const last = hist[hist.length - 1];
  if (hist.length > 1 && last && now - last[0] < HIST_STEP && Math.floor(last[0] / HIST_STEP) === Math.floor(now / HIST_STEP)) hist[hist.length - 1] = [now, sizes];
  else hist.push([now, sizes]);
  // Trop long : on garde un point sur deux dans la moitié la plus ancienne.
  if (hist.length > HIST_MAX) {
    const half = Math.floor(hist.length / 2);
    const old = hist.slice(0, half).filter((_, i) => i % 2 === 0);
    return JSON.stringify([...old, ...hist.slice(half)]);
  }
  return JSON.stringify(hist);
}

function marketView(m, outcomes, now, full = false) {
  const status = m.status === "open" && m.closes_at <= now ? "closed" : m.status;
  const hist = parseHist(m.hist)
    .slice(full ? -HIST_MAX : -60)
    .map(([t, s]) => {
      const tot = s.reduce((a, b) => a + b, 0) || 1;
      return [t, ...s.map((x) => Math.round((x / tot) * 1000))];
    });
  return {
    id: m.id,
    symbol: m.symbol,
    cat: m.cat,
    title: m.title,
    rules: m.rules,
    status,
    closesAt: m.closes_at,
    resolveBy: m.resolve_by,
    winner: m.winner,
    verdict: m.verdict,
    source: m.source,
    resolvedAt: m.resolved_at,
    bettors: m.bettors,
    pinned: !!m.pinned,
    createdAt: m.created_at,
    outcomes,
    total: outcomes.reduce((s, o) => s + o.pool, 0),
    hist,
  };
}
function groupMarkets(markets, outcomes, now, full) {
  const by = {};
  for (const o of outcomes) (by[o.market] ||= []).push({ label: o.label, seed: o.seed, pool: o.pool, grogne: o.grogne });
  return markets.map((m) => marketView(m, by[m.id] || [], now, full));
}

const log = (env, now, action, market, data) =>
  env.DB.prepare("INSERT INTO pv_log (ts, action, market, data) VALUES (?, ?, ?, ?)").bind(now, action, market || null, data ? JSON.stringify(data).slice(0, 2000) : null);

// ---------------------------------------------------------------- les paris de départ

function insertMarket(env, m, now) {
  const seeds = seedsFor(m.outcomes.map((o) => o.pct));
  if (!seeds) throw new Error(`Estimation de départ invalide pour ${m.id}`);
  return [
    env.DB.prepare(
      "INSERT OR IGNORE INTO pv_markets (id, symbol, cat, title, rules, status, closes_at, resolve_by, hist, pinned, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
    ).bind(m.id, m.symbol, m.cat, m.title, m.rules || "", m.status, m.closesAt, m.resolveBy ?? null, JSON.stringify([[now, seeds]]), m.pinned ? 1 : 0, now),
    ...m.outcomes.map((o, i) =>
      env.DB.prepare("INSERT OR IGNORE INTO pv_outcomes (market, idx, label, seed, pool, grogne) VALUES (?, ?, ?, ?, 0, ?)").bind(m.id, i, o.label, seeds[i], o.grogne || 0),
    ),
  ];
}

// À la toute première visite, la salle ouvre avec les paris de départ (apps/11-preavis/paris.js).
// Une seule fois : ensuite, c'est l'arbitre qui ajoute, modifie ou retire des paris.
async function seed(env, now) {
  const done = await env.DB.prepare("SELECT v FROM pv_meta WHERE k = 'seed'").first();
  if (done) return false;
  const stmts = [env.DB.prepare("INSERT OR IGNORE INTO pv_meta (k, v) VALUES ('seed', ?)").bind(String(now))];
  for (const s of SEED_MARKETS) {
    const closesAt = Date.parse(s.closesAt);
    if (!(closesAt > now + 3600000)) continue; // déjà clos, ou presque
    stmts.push(...insertMarket(env, { ...s, closesAt, resolveBy: s.resolveBy ? Date.parse(s.resolveBy) : null, status: "open" }, now));
  }
  await env.DB.batch(stmts);
  return true;
}

// ---------------------------------------------------------------- lecture

async function readVisible(env, now, secretKey) {
  const since = now - RECENT_MS;
  const stmts = [
    env.DB.prepare(`SELECT ${MARKET_COLS} FROM pv_markets WHERE ${VISIBLE} ORDER BY pinned DESC, closes_at ASC, id ASC`).bind(since),
    env.DB.prepare(
      `SELECT o.market, o.idx, o.label, o.seed, o.pool, o.grogne FROM pv_outcomes o JOIN pv_markets m ON m.id = o.market WHERE ${VISIBLE.replace(/\b(status|resolved_at)\b/g, "m.$1")} ORDER BY o.market, o.idx`,
    ).bind(since),
    env.DB.prepare("SELECT MAX(id) AS n FROM pv_players"),
  ];
  if (secretKey) {
    stmts.push(
      env.DB.prepare("SELECT * FROM pv_players WHERE key = ?").bind(secretKey),
      env.DB.prepare(
        "SELECT market, outcome, SUM(amount) AS amount, SUM(payout) AS payout FROM pv_bets WHERE player = (SELECT id FROM pv_players WHERE key = ?) GROUP BY market, outcome",
      ).bind(secretKey),
    );
  }
  const res = await env.DB.batch(stmts);
  return {
    markets: groupMarkets(res[0].results, res[1].results, now),
    players: res[2].results[0]?.n || 0,
    player: secretKey ? res[3].results[0] || null : null,
    mine: secretKey ? res[4].results : [],
  };
}

async function state(request, env, now, h) {
  const secret = readSecret(request);
  const key = secret ? await keyOf(secret) : null;
  let data = await readVisible(env, now, key);
  if (!data.markets.length && (await seed(env, now))) data = await readVisible(env, now, key);
  const headers = {};
  if (secret && !data.player) headers["set-cookie"] = cookie("", 0); // cookie d'un compte qui n'existe plus
  if (data.player && now - data.player.seen_at > 7 * 86400000) {
    // Une fois par semaine : on note le passage et on prolonge le cookie.
    await env.DB.prepare("UPDATE pv_players SET seen_at = ? WHERE id = ?").bind(now, data.player.id).run();
    headers["set-cookie"] = cookie(secret);
  }
  return h.json(
    {
      now,
      me: data.player ? meView(data.player, now) : null,
      mine: data.mine,
      markets: data.markets,
      players: data.players,
      // L'anti-robot n'est demandé à l'inscription que si le serveur peut le vérifier.
      turnstile: env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY || "" : "",
    },
    200,
    headers,
  );
}

async function myBets(request, env, now, h) {
  const p = await currentPlayer(request, env);
  if (!p) return h.json({ error: "Choisis d'abord un pseudo.", needJoin: true }, 401);
  const { results } = await env.DB.prepare(
    `SELECT b.market, b.outcome, SUM(b.amount) AS amount, SUM(b.payout) AS payout, MAX(b.created_at) AS at,
            m.title, m.symbol, m.cat, m.status, m.closes_at, m.winner, m.verdict, m.source, m.resolved_at, o.label
     FROM pv_bets b JOIN pv_markets m ON m.id = b.market JOIN pv_outcomes o ON o.market = b.market AND o.idx = b.outcome
     WHERE b.player = ? GROUP BY b.market, b.outcome ORDER BY at DESC LIMIT 300`,
  )
    .bind(p.id)
    .all();
  return h.json({
    me: meView(p, now),
    bets: results.map((r) => ({
      market: r.market,
      outcome: r.outcome,
      label: r.label,
      amount: r.amount,
      payout: r.payout,
      at: r.at,
      title: r.title,
      symbol: r.symbol,
      cat: r.cat,
      status: r.status === "open" && r.closes_at <= now ? "closed" : r.status,
      closesAt: r.closes_at,
      winner: r.winner,
      verdict: r.verdict,
      source: r.source,
      resolvedAt: r.resolved_at,
    })),
  });
}

async function board(request, env, now, h) {
  const month = parisMonth(now);
  const me = await currentPlayer(request, env);
  const cols = "p.id, p.name, p.balance, p.staked, p.wagered, p.mood, p.settled, p.won";
  const stmts = [
    env.DB.prepare(`SELECT ${cols} FROM pv_players p WHERE p.banned = 0 AND p.wagered > 0 ORDER BY p.fortune DESC, p.id ASC LIMIT 50`),
    env.DB.prepare(
      `SELECT ${cols}, g.profit FROM pv_gains g JOIN pv_players p ON p.id = g.player WHERE g.month = ?1 AND p.banned = 0 ORDER BY g.profit DESC, g.player ASC LIMIT 50`,
    ).bind(month),
  ];
  if (me && !me.banned) {
    stmts.push(
      env.DB.prepare("SELECT COUNT(*) AS n FROM pv_players WHERE banned = 0 AND wagered > 0 AND fortune > ?").bind(me.balance + me.staked),
      env.DB.prepare(
        "SELECT g.profit, (SELECT COUNT(*) FROM pv_gains g2 JOIN pv_players p ON p.id = g2.player WHERE g2.month = ?1 AND p.banned = 0 AND g2.profit > g.profit) AS ahead FROM pv_gains g WHERE g.month = ?1 AND g.player = ?2",
      ).bind(month, me.id),
    );
  }
  const res = await env.DB.batch(stmts);
  const row = (r) => {
    const fortune = r.balance + r.staked;
    return { id: r.id, name: r.name, fortune, title: titleOf({ ...r, fortune }), settled: r.settled, won: r.won, ...(r.profit != null ? { profit: r.profit } : {}) };
  };
  const mine = res[3]?.results[0];
  return h.json(
    {
      month,
      all: res[0].results.map(row),
      monthly: res[1].results.map(row),
      me:
        me && !me.banned
          ? {
              id: me.id,
              name: me.name,
              fortune: me.balance + me.staked,
              title: titleOf({ ...me, fortune: me.balance + me.staked }),
              rank: me.wagered > 0 ? res[2].results[0].n + 1 : null,
              monthRank: mine ? mine.ahead + 1 : null,
              profit: mine ? mine.profit : null,
            }
          : null,
    },
    200,
    { "cache-control": "private, max-age=15" },
  );
}

// ---------------------------------------------------------------- le compte

async function nameProblem(env, name, exceptId = 0) {
  if (!name) return "Un pseudo de 2 à 16 caractères : lettres, chiffres, espace, point, tiret.";
  if (blockedName(name)) return "Ce pseudo n'est pas disponible.";
  const taken = await env.DB.prepare("SELECT id FROM pv_players WHERE name_key = ?").bind(nameKey(name)).first();
  return taken && taken.id !== exceptId ? "Ce pseudo est déjà pris." : null;
}

async function join(request, env, now, h) {
  const input = await h.readJson(request);
  if (!input) return h.json({ error: "Requête invalide." }, 400);
  if (await currentPlayer(request, env)) return h.json({ error: "Tu as déjà un compte sur cet appareil." }, 409);
  const name = cleanName(input.name);
  const problem = await nameProblem(env, name);
  if (problem) return h.json({ error: problem }, 400);

  const day = parisDay(now);
  const { ip, ipHash } = await h.ipHashFor(request, env, `preavis|${day}`);
  if (env.TURNSTILE_SECRET && !(await h.verifyTurnstile(env.TURNSTILE_SECRET, input.token, ip)))
    return h.json({ error: "Vérification anti-robot échouée, réessaie." }, 403);
  if ((await h.hit(env, day, `pvj:${ipHash.slice(0, 24)}`)) > MAX_JOINS_PER_NET)
    return h.json({ error: "Beaucoup de comptes ont déjà été créés depuis ton réseau aujourd'hui. Réessaie demain." }, 429);

  const secret = newSecret();
  try {
    await env.DB.prepare("INSERT INTO pv_players (key, name, name_key, balance, ip_hash, created_at, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(await keyOf(secret), name, nameKey(name), START, ipHash.slice(0, 24), now, now)
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) return h.json({ error: "Ce pseudo est déjà pris." }, 400);
    throw err;
  }
  const p = await env.DB.prepare("SELECT * FROM pv_players WHERE key = ?").bind(await keyOf(secret)).first();
  return h.json({ ok: true, me: meView(p, now) }, 200, { "set-cookie": cookie(secret) });
}

async function rename(request, env, now, h) {
  const p = await currentPlayer(request, env);
  if (!p) return h.json({ error: "Choisis d'abord un pseudo.", needJoin: true }, 401);
  if (p.banned) return h.json({ error: "Ce compte a été suspendu par l'arbitre." }, 403);
  const input = await h.readJson(request);
  const name = cleanName(input?.name);
  const problem = await nameProblem(env, name, p.id);
  if (problem) return h.json({ error: problem }, 400);
  if ((await h.hit(env, parisDay(now), `pvn:${p.id}`)) > MAX_RENAMES_PER_DAY) return h.json({ error: "Trois changements de pseudo par jour, pas plus." }, 429);
  try {
    await env.DB.prepare("UPDATE pv_players SET name = ?, name_key = ? WHERE id = ?").bind(name, nameKey(name), p.id).run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) return h.json({ error: "Ce pseudo est déjà pris." }, 400);
    throw err;
  }
  return h.json({ ok: true, me: meView({ ...p, name }, now) });
}

// Le code de reprise : le secret du cookie, lisible, pour retrouver son compte sur un autre appareil.
async function showKey(request, env, h) {
  const secret = readSecret(request);
  const p = secret ? await currentPlayer(request, env) : null;
  if (!p) return h.json({ error: "Choisis d'abord un pseudo.", needJoin: true }, 401);
  return h.json({ code: secret.match(/.{5}/g).join("-") });
}

async function restore(request, env, now, h) {
  const input = await h.readJson(request);
  const day = parisDay(now);
  const { ipHash } = await h.ipHashFor(request, env, `preavis|${day}`);
  if ((await h.hit(env, day, `pvr:${ipHash.slice(0, 24)}`)) > MAX_RESTORES_PER_NET) return h.json({ error: "Trop d'essais aujourd'hui. Réessaie demain." }, 429);
  const code = String(input?.code || "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-Z]/g, "");
  const p = SECRET_RE.test(code) ? await env.DB.prepare("SELECT * FROM pv_players WHERE key = ?").bind(await keyOf(code)).first() : null;
  if (!p) return h.json({ error: "Ce code de reprise ne correspond à aucun compte." }, 404);
  return h.json({ ok: true, me: meView(p, now) }, 200, { "set-cookie": cookie(code) });
}

// Supprimer son compte : le pseudo est libéré, le compte devient anonyme et injoignable.
// Les mises déjà faites restent dans les cagnottes (sinon les cotes des autres changeraient).
async function forget(request, env, now, h) {
  const p = await currentPlayer(request, env);
  if (!p) return h.json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
  await env.DB.batch([
    env.DB.prepare("UPDATE pv_players SET name = 'Parieur parti', name_key = 'parieurparti' || id, key = 'parti:' || id, ip_hash = '', banned = 1 WHERE id = ?").bind(p.id),
    env.DB.prepare("DELETE FROM pv_gains WHERE player = ?").bind(p.id),
  ]);
  return h.json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
}

async function bonus(request, env, now, h) {
  const p = await currentPlayer(request, env);
  if (!p) return h.json({ error: "Choisis d'abord un pseudo.", needJoin: true }, 401);
  if (p.banned) return h.json({ error: "Ce compte a été suspendu par l'arbitre." }, 403);
  const day = parisDay(now);
  const r = await env.DB.prepare(
    "UPDATE pv_players SET balance = balance + ?1, bonus_day = ?2, seen_at = ?3 WHERE id = ?4 AND (bonus_day IS NULL OR bonus_day < ?2) AND balance + staked < ?5",
  )
    .bind(DAILY, day, now, p.id, START)
    .run();
  if (!r.meta?.changes) {
    const rich = p.balance + p.staked >= START;
    return h.json({ error: rich ? `La caisse de grève est réservée aux fortunes de moins de ${START} pavés.` : "Tu as déjà touché la caisse de grève aujourd'hui. Reviens demain." }, 409);
  }
  const fresh = await env.DB.prepare("SELECT * FROM pv_players WHERE id = ?").bind(p.id).first();
  return h.json({ ok: true, amount: DAILY, me: meView(fresh, now) });
}

// ---------------------------------------------------------------- miser

async function bet(request, env, now, h) {
  const p = await currentPlayer(request, env);
  if (!p) return h.json({ error: "Choisis d'abord un pseudo.", needJoin: true }, 401);
  if (p.banned) return h.json({ error: "Ce compte a été suspendu par l'arbitre." }, 403);
  const input = await h.readJson(request);
  const id = String(input?.market || "");
  const outcome = Number(input?.outcome);
  const amount = Number(input?.amount);
  if (!ID_RE.test(id) || !Number.isInteger(outcome) || outcome < 0 || outcome >= MAX_OUTCOMES) return h.json({ error: "Pari invalide." }, 400);
  if (!Number.isInteger(amount) || amount < MIN_BET) return h.json({ error: `La mise minimale est de ${MIN_BET} pavés.` }, 400);
  if (amount > MAX_PER_MARKET) return h.json({ error: `Pas plus de ${MAX_PER_MARKET} pavés par pari.` }, 400);

  // D'abord une lecture, pour répondre clairement si la mise est impossible.
  const [mr, or, sr] = await env.DB.batch([
    env.DB.prepare(`SELECT ${MARKET_COLS} FROM pv_markets WHERE id = ? AND status != 'draft'`).bind(id),
    env.DB.prepare("SELECT idx, label, seed, pool, grogne FROM pv_outcomes WHERE market = ? ORDER BY idx").bind(id),
    env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM pv_bets WHERE market = ? AND player = ?").bind(id, p.id),
  ]);
  const m = mr.results[0];
  if (!m) return h.json({ error: "Ce pari n'existe pas." }, 404);
  if (m.status !== "open" || m.closes_at <= now) return h.json({ error: "Les paris sont clos sur celui-ci." }, 409);
  if (!or.results[outcome]) return h.json({ error: "Cette issue n'existe pas." }, 400);
  if (p.balance < amount) return h.json({ error: `Il te manque ${amount - p.balance} pavés.` }, 409);
  const already = sr.results[0].n;
  if (already + amount > MAX_PER_MARKET)
    return h.json({ error: already >= MAX_PER_MARKET ? `Tu as atteint le plafond de ${MAX_PER_MARKET} pavés sur ce pari.` : `Plafond de ${MAX_PER_MARKET} pavés par pari : il te reste ${MAX_PER_MARKET - already} à miser ici.` }, 409);
  if ((await h.hit(env, parisDay(now), `pvb:${p.id}`)) > MAX_BETS_PER_DAY) return h.json({ error: "Ça fait beaucoup de paris pour aujourd'hui. Reviens demain." }, 429);

  // Puis l'écriture, en un seul lot. La première requête revérifie tout (pari ouvert, solde, plafond) ;
  // les suivantes ne passent que si la mise a bien été inscrite (son identifiant existe).
  const uid = crypto.randomUUID();
  const placed = "EXISTS (SELECT 1 FROM pv_bets WHERE uid = ?1)";
  const sizes = or.results.map((o, i) => o.seed + o.pool + (i === outcome ? amount : 0));
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pv_bets (uid, market, player, outcome, amount, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE (SELECT balance FROM pv_players WHERE id = ?3 AND banned = 0) >= ?5
         AND EXISTS (SELECT 1 FROM pv_markets m JOIN pv_outcomes o ON o.market = m.id WHERE m.id = ?2 AND m.status = 'open' AND m.closes_at > ?6 AND o.idx = ?4)
         AND (SELECT COALESCE(SUM(amount), 0) FROM pv_bets WHERE market = ?2 AND player = ?3) + ?5 <= ?7`,
    ).bind(uid, id, p.id, outcome, amount, now, MAX_PER_MARKET),
    env.DB.prepare(
      `UPDATE pv_players SET balance = balance - ?2, staked = staked + ?2, wagered = wagered + ?2,
              mood = mood + ?2 * (SELECT grogne FROM pv_outcomes WHERE market = ?3 AND idx = ?4), seen_at = ?5
       WHERE id = ?6 AND ${placed}`,
    ).bind(uid, amount, id, outcome, now, p.id),
    env.DB.prepare(`UPDATE pv_outcomes SET pool = pool + ?2 WHERE market = ?3 AND idx = ?4 AND ${placed}`).bind(uid, amount, id, outcome),
    env.DB.prepare(
      `UPDATE pv_markets SET bettors = bettors + ((SELECT COUNT(*) FROM pv_bets WHERE market = ?2 AND player = ?3) = 1), hist = ?4, updated_at = ?5 WHERE id = ?2 AND ${placed}`,
    ).bind(uid, id, p.id, nextHist(m.hist, now, sizes), now),
    env.DB.prepare(`SELECT ${MARKET_COLS} FROM pv_markets WHERE id = ?`).bind(id),
    env.DB.prepare("SELECT market, idx, label, seed, pool, grogne FROM pv_outcomes WHERE market = ? ORDER BY idx").bind(id),
    env.DB.prepare("SELECT * FROM pv_players WHERE id = ?").bind(p.id),
    env.DB.prepare("SELECT market, outcome, SUM(amount) AS amount, SUM(payout) AS payout FROM pv_bets WHERE market = ? AND player = ? GROUP BY market, outcome").bind(id, p.id),
  ]);
  if (!res[0].meta?.changes) return h.json({ error: "La mise n'a pas pu être enregistrée (clôture, solde ou plafond). Recharge la page." }, 409);
  return h.json({
    ok: true,
    market: groupMarkets(res[4].results, res[5].results, now)[0],
    me: meView(res[6].results[0], now),
    mine: res[7].results,
  });
}

// ---------------------------------------------------------------- l'arbitre

async function adminAll(env, now, h) {
  const res = await env.DB.batch([
    env.DB.prepare(`SELECT ${MARKET_COLS}, updated_at FROM pv_markets ORDER BY (status = 'draft') DESC, (status = 'open') DESC, closes_at ASC, id ASC`),
    env.DB.prepare("SELECT market, idx, label, seed, pool, grogne FROM pv_outcomes ORDER BY market, idx"),
    env.DB.prepare("SELECT COUNT(*) AS players, COALESCE(SUM(wagered), 0) AS wagered, COALESCE(SUM(balance + staked), 0) AS money, COALESCE(SUM(wagered > 0), 0) AS active FROM pv_players WHERE banned = 0"),
    env.DB.prepare("SELECT COUNT(*) AS bets FROM pv_bets"),
    env.DB.prepare("SELECT ts, action, market, data FROM pv_log ORDER BY id DESC LIMIT 80"),
  ]);
  const by = {};
  for (const o of res[1].results) (by[o.market] ||= []).push({ label: o.label, seed: o.seed, pool: o.pool, grogne: o.grogne });
  return h.json({
    now,
    // Pour l'arbitre : le vrai statut (un brouillon reste un brouillon), et la courbe entière.
    markets: res[0].results.map((m) => ({ ...marketView(m, by[m.id] || [], now, true), raw: m.status })),
    totals: { ...res[2].results[0], ...res[3].results[0] },
    log: res[4].results,
    seeded: !!(await env.DB.prepare("SELECT v FROM pv_meta WHERE k = 'seed'").first()),
  });
}

async function saveMarket(request, env, now, h) {
  const d = await h.readJson(request);
  if (!d || typeof d !== "object") return h.json({ error: "Requête invalide." }, 400);
  const title = clip(d.title, 180);
  if (title.length < 8) return h.json({ error: "Il faut une question (8 caractères au moins)." }, 400);
  if (!CATS[d.cat]) return h.json({ error: "Rubrique inconnue." }, 400);
  const rules = clip(d.rules, 1500);
  const closesAt = toMs(d.closesAt);
  if (!closesAt) return h.json({ error: "Date de clôture invalide." }, 400);
  const resolveBy = toMs(d.resolveBy);
  const pinned = d.pinned ? 1 : 0;
  const draft = d.status === "draft";
  const outs = (Array.isArray(d.outcomes) ? d.outcomes : []).map((o) => ({
    label: clip(o?.label, 48),
    pct: Number(o?.pct),
    grogne: Math.max(-100, Math.min(100, Math.round(Number(o?.grogne) || 0))),
  }));
  if (outs.length < 2 || outs.length > MAX_OUTCOMES || outs.some((o) => !o.label)) return h.json({ error: `Il faut de 2 à ${MAX_OUTCOMES} issues, chacune avec un nom.` }, 400);
  const symbol =
    String(d.symbol || "")
      .toUpperCase()
      .replace(/[^A-Z0-9.]/g, "")
      .slice(0, 12) || slug(title).replace(/-/g, "").toUpperCase().slice(0, 8);

  let id = d.id ? String(d.id) : "";
  const existing = id ? await env.DB.prepare("SELECT status, hist FROM pv_markets WHERE id = ?").bind(id).first() : null;

  if (!existing) {
    // Nouveau pari.
    if (!id) {
      const base = slug(title) || "pari";
      id = base.length >= 3 ? base : `pari-${base}`;
      for (let n = 2; await env.DB.prepare("SELECT 1 AS x FROM pv_markets WHERE id = ?").bind(id).first(); n++) id = `${base.slice(0, 32)}-${n}`;
    }
    if (!ID_RE.test(id)) return h.json({ error: "Identifiant invalide (minuscules, chiffres et tirets)." }, 400);
    if (!seedsFor(outs.map((o) => o.pct))) return h.json({ error: "L'estimation de départ doit faire 100 % au total, avec au moins 1 % par issue." }, 400);
    if (!draft && closesAt <= now) return h.json({ error: "La clôture doit être dans le futur." }, 400);
    await env.DB.batch([
      ...insertMarket(env, { id, symbol, cat: d.cat, title, rules, status: draft ? "draft" : "open", closesAt, resolveBy, pinned, outcomes: outs }, now),
      log(env, now, draft ? "brouillon" : "ouverture", id, { title }),
    ]);
    return h.json({ ok: true, id });
  }

  if (existing.status === "resolved" || existing.status === "void") return h.json({ error: "Ce pari est déjà tranché. Annule d'abord le verdict pour le modifier." }, 409);
  const count = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM pv_bets WHERE market = ?1) AS bets, (SELECT COUNT(*) FROM pv_outcomes WHERE market = ?1) AS outs").bind(id).first();
  const stmts = [];
  let status = existing.status;
  if (status === "draft" && !draft) status = "open";
  else if (status === "open" && draft && !count.bets) status = "draft";
  if (count.bets) {
    // Des mises existent : on ne touche plus ni au nombre d'issues ni à la mise de la maison.
    if (outs.length !== count.outs) return h.json({ error: "Des mises existent déjà : on ne peut plus ajouter ni retirer d'issue." }, 409);
    outs.forEach((o, i) => stmts.push(env.DB.prepare("UPDATE pv_outcomes SET label = ?, grogne = ? WHERE market = ? AND idx = ?").bind(o.label, o.grogne, id, i)));
  } else {
    const seeds = seedsFor(outs.map((o) => o.pct));
    if (!seeds) return h.json({ error: "L'estimation de départ doit faire 100 % au total, avec au moins 1 % par issue." }, 400);
    stmts.push(env.DB.prepare("DELETE FROM pv_outcomes WHERE market = ?1 AND NOT EXISTS (SELECT 1 FROM pv_bets WHERE market = ?1)").bind(id));
    outs.forEach((o, i) =>
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO pv_outcomes (market, idx, label, seed, pool, grogne) VALUES (?, ?, ?, ?, 0, ?)").bind(id, i, o.label, seeds[i], o.grogne)),
    );
    stmts.push(env.DB.prepare("UPDATE pv_markets SET hist = ?1 WHERE id = ?2 AND NOT EXISTS (SELECT 1 FROM pv_bets WHERE market = ?2)").bind(JSON.stringify([[now, seeds]]), id));
  }
  stmts.push(
    env.DB.prepare(
      "UPDATE pv_markets SET symbol = ?2, cat = ?3, title = ?4, rules = ?5, status = ?6, closes_at = ?7, resolve_by = ?8, pinned = ?9, updated_at = ?10 WHERE id = ?1 AND status IN ('draft', 'open')",
    ).bind(id, symbol, d.cat, title, rules, status, closesAt, resolveBy, pinned, now),
    log(env, now, "modification", id, { title, status }),
  );
  await env.DB.batch(stmts);
  return h.json({ ok: true, id });
}

async function closeMarket(request, env, now, h) {
  const d = await h.readJson(request);
  const id = String(d?.id || "");
  const r = await env.DB.prepare("UPDATE pv_markets SET closes_at = ?1, updated_at = ?1 WHERE id = ?2 AND status = 'open' AND closes_at > ?1").bind(now, id).run();
  if (!r.meta?.changes) return h.json({ error: "Ce pari n'est pas ouvert aux mises." }, 409);
  await log(env, now, "clôture", id).run();
  return h.json({ ok: true });
}

// Le verdict. cutoff (facultatif) = l'heure où l'issue a été connue : les mises arrivées après sont
// remboursées et ne comptent pas dans le partage. Le garde « statut = open » est dans chaque requête,
// et le changement de statut vient en dernier : un double clic ne paie pas deux fois.
async function resolve(request, env, now, h) {
  const d = await h.readJson(request);
  const id = String(d?.id || "");
  const winner = Number(d?.winner);
  const m = await env.DB.prepare("SELECT status, created_at, (SELECT COUNT(*) FROM pv_outcomes WHERE market = ?1) AS outs FROM pv_markets WHERE id = ?1").bind(id).first();
  if (!m) return h.json({ error: "Ce pari n'existe pas." }, 404);
  if (m.status !== "open") return h.json({ error: m.status === "draft" ? "Un brouillon ne se tranche pas." : "Ce pari est déjà tranché." }, 409);
  if (!Number.isInteger(winner) || winner < 0 || winner >= m.outs) return h.json({ error: "Choisis l'issue gagnante." }, 400);
  const verdict = clip(d.verdict, 600) || null;
  const source = d.source ? cleanUrl(d.source) : null;
  if (d.source && !source) return h.json({ error: "La source doit être un lien qui commence par http:// ou https://." }, 400);
  let cut = now;
  if (d.cutoff != null && d.cutoff !== "") {
    cut = toMs(d.cutoff);
    if (!cut || cut > now || cut < m.created_at) return h.json({ error: "L'heure de l'événement doit être entre l'ouverture du pari et maintenant." }, 400);
  }
  const month = parisMonth(now);
  const open = "(SELECT status FROM pv_markets WHERE id = ?1) = 'open'";
  const res = await env.DB.batch([
    env.DB.prepare(
      `UPDATE pv_bets SET payout = CASE
         WHEN created_at > ?3 THEN amount
         WHEN outcome = ?2 THEN amount
           * ((SELECT SUM(seed) FROM pv_outcomes WHERE market = ?1) + (SELECT COALESCE(SUM(amount), 0) FROM pv_bets WHERE market = ?1 AND created_at <= ?3))
           / ((SELECT seed FROM pv_outcomes WHERE market = ?1 AND idx = ?2) + (SELECT COALESCE(SUM(amount), 0) FROM pv_bets WHERE market = ?1 AND outcome = ?2 AND created_at <= ?3))
         ELSE 0 END
       WHERE market = ?1 AND ${open}`,
    ).bind(id, winner, cut),
    env.DB.prepare(
      `UPDATE pv_players SET balance = balance + a.pay, staked = staked - a.amt, settled = settled + 1, won = won + (a.pay > a.amt)
       FROM (SELECT player, SUM(payout) AS pay, SUM(amount) AS amt FROM pv_bets WHERE market = ?1 GROUP BY player) AS a
       WHERE pv_players.id = a.player AND ${open}`,
    ).bind(id),
    env.DB.prepare(
      `INSERT INTO pv_gains (month, player, profit) SELECT ?2, player, SUM(payout) - SUM(amount) FROM pv_bets WHERE market = ?1 AND ${open} GROUP BY player
       ON CONFLICT (month, player) DO UPDATE SET profit = profit + excluded.profit`,
    ).bind(id, month),
    env.DB.prepare(
      "UPDATE pv_markets SET status = 'resolved', winner = ?2, verdict = ?3, source = ?4, month = ?5, resolved_at = ?6, closes_at = MIN(closes_at, ?7), updated_at = ?6 WHERE id = ?1 AND status = 'open'",
    ).bind(id, winner, verdict, source, month, now, cut),
  ]);
  if (!res[3].meta?.changes) return h.json({ error: "Ce pari vient d'être tranché par ailleurs." }, 409);
  await log(env, now, "verdict", id, { winner, verdict, source, cutoff: cut === now ? null : cut }).run();
  return h.json({ ok: true });
}

// Pari annulé : tout le monde récupère sa mise.
async function voidMarket(request, env, now, h) {
  const d = await h.readJson(request);
  const id = String(d?.id || "");
  const verdict = clip(d?.verdict, 600) || null;
  const source = d?.source ? cleanUrl(d.source) : null;
  const open = "(SELECT status FROM pv_markets WHERE id = ?1) = 'open'";
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE pv_bets SET payout = amount WHERE market = ?1 AND ${open}`).bind(id),
    env.DB.prepare(
      `UPDATE pv_players SET balance = balance + a.amt, staked = staked - a.amt
       FROM (SELECT player, SUM(amount) AS amt FROM pv_bets WHERE market = ?1 GROUP BY player) AS a
       WHERE pv_players.id = a.player AND ${open}`,
    ).bind(id),
    env.DB.prepare(
      "UPDATE pv_markets SET status = 'void', winner = NULL, verdict = ?2, source = ?3, month = NULL, resolved_at = ?4, closes_at = MIN(closes_at, ?4), updated_at = ?4 WHERE id = ?1 AND status = 'open'",
    ).bind(id, verdict, source, now),
  ]);
  if (!res[2].meta?.changes) return h.json({ error: "Ce pari n'est pas en attente de verdict." }, 409);
  await log(env, now, "annulation", id, { verdict }).run();
  return h.json({ ok: true });
}

// Annuler un verdict (erreur d'issue, source démentie…) : on reprend ce qui a été versé, on rend les mises
// à leur place « en jeu », et le pari attend de nouveau son verdict. Un solde peut passer sous zéro
// si les gains ont déjà été rejoués : il remontera au prochain verdict, ou avec la caisse de grève.
async function reopen(request, env, now, h) {
  const d = await h.readJson(request);
  const id = String(d?.id || "");
  const m = await env.DB.prepare("SELECT status FROM pv_markets WHERE id = ?").bind(id).first();
  if (!m) return h.json({ error: "Ce pari n'existe pas." }, 404);
  if (m.status !== "resolved" && m.status !== "void") return h.json({ error: "Ce pari n'a pas de verdict à annuler." }, 409);
  const was = `(SELECT status FROM pv_markets WHERE id = ?1) = '${m.status}'`;
  const agg = "(SELECT player, SUM(payout) AS pay, SUM(amount) AS amt FROM pv_bets WHERE market = ?1 GROUP BY player) AS a";
  const stmts =
    m.status === "resolved"
      ? [
          env.DB.prepare(
            `UPDATE pv_players SET balance = balance - a.pay, staked = staked + a.amt, settled = settled - 1, won = won - (a.pay > a.amt) FROM ${agg} WHERE pv_players.id = a.player AND ${was}`,
          ).bind(id),
          env.DB.prepare(
            `UPDATE pv_gains SET profit = profit - (a.pay - a.amt) FROM ${agg} WHERE pv_gains.player = a.player AND pv_gains.month = (SELECT month FROM pv_markets WHERE id = ?1) AND ${was}`,
          ).bind(id),
        ]
      : [env.DB.prepare(`UPDATE pv_players SET balance = balance - a.amt, staked = staked + a.amt FROM ${agg} WHERE pv_players.id = a.player AND ${was}`).bind(id)];
  const res = await env.DB.batch([
    ...stmts,
    env.DB.prepare(`UPDATE pv_bets SET payout = NULL WHERE market = ?1 AND ${was}`).bind(id),
    env.DB.prepare(
      `UPDATE pv_markets SET status = 'open', winner = NULL, verdict = NULL, source = NULL, month = NULL, resolved_at = NULL, updated_at = ?2 WHERE id = ?1 AND status = '${m.status}'`,
    ).bind(id, now),
  ]);
  if (!res[stmts.length + 1].meta?.changes) return h.json({ error: "Ce pari a changé entre-temps. Recharge la page." }, 409);
  await log(env, now, "verdict annulé", id, { was: m.status }).run();
  return h.json({ ok: true });
}

// Supprimer un pari : seulement tant que personne n'a misé dessus.
async function deleteMarket(request, env, now, h) {
  const d = await h.readJson(request);
  const id = String(d?.id || "");
  const none = "NOT EXISTS (SELECT 1 FROM pv_bets WHERE market = ?1)";
  const res = await env.DB.batch([
    env.DB.prepare(`DELETE FROM pv_outcomes WHERE market = ?1 AND ${none}`).bind(id),
    env.DB.prepare(`DELETE FROM pv_markets WHERE id = ?1 AND ${none}`).bind(id),
  ]);
  if (!res[1].meta?.changes) return h.json({ error: "Ce pari n'existe pas, ou des mises existent déjà dessus : dans ce cas, annule-le plutôt (tout le monde est remboursé)." }, 409);
  await log(env, now, "suppression", id).run();
  return h.json({ ok: true });
}

async function adminPlayers(env, url, h) {
  const q = nameKey(url.searchParams.get("q") || "").slice(0, 16);
  const { results } = await env.DB.prepare(
    "SELECT id, name, balance, staked, wagered, settled, won, banned, created_at, seen_at, substr(ip_hash, 1, 6) AS net FROM pv_players WHERE name_key LIKE ? ORDER BY id DESC LIMIT 100",
  )
    .bind(`%${q}%`)
    .all();
  return h.json({ players: results });
}

// Modération : remplacer un pseudo déplacé, suspendre ou rétablir un compte.
async function moderate(request, env, now, h) {
  const d = await h.readJson(request);
  const id = Number(d?.player);
  if (!Number.isInteger(id)) return h.json({ error: "Joueur inconnu." }, 400);
  let stmt;
  if (d.action === "rename") stmt = env.DB.prepare("UPDATE pv_players SET name = 'Parieur n° ' || id, name_key = 'parieurn' || id WHERE id = ?").bind(id);
  else if (d.action === "ban") stmt = env.DB.prepare("UPDATE pv_players SET banned = 1 WHERE id = ?").bind(id);
  else if (d.action === "unban") stmt = env.DB.prepare("UPDATE pv_players SET banned = 0 WHERE id = ? AND key NOT LIKE 'parti:%'").bind(id);
  else return h.json({ error: "Action inconnue." }, 400);
  const res = await stmt.run();
  if (!res.meta?.changes) return h.json({ error: "Joueur inconnu." }, 404);
  await log(env, now, `modération : ${d.action}`, null, { player: id }).run();
  return h.json({ ok: true });
}
