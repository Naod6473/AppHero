// API de Soiffard (app « trouve le bar le plus proche » + KOTB, King of the Bar).
//
// - GET  /api/soiffard/bars?lat=&lon=   bars, pubs, brasseries, biergartens et boîtes à 2 km (OpenStreetMap via Overpass, en cache)
// - POST /api/soiffard/visit            enregistre un passage au comptoir (temps vérifié côté téléphone)
// - GET  /api/soiffard/bar?id=n123      top 10 de la semaine d'un bar
// - GET  /api/soiffard/kings?ids=a,b    le roi de chaque bar demandé
// - GET  /api/soiffard/week             classement de la semaine (bars différents, puis temps)
// - GET  /api/soiffard/me?player=…      les couronnes que je tiens cette semaine
//
// Vie privée : la position n'est jamais stockée. Pour chercher les bars, le téléphone l'arrondit
// déjà à ~100 m ; le serveur ne garde que l'identifiant du bar, la durée et un pseudo.
// Semaine : du lundi 6 h au lundi 6 h suivant (heure de Paris).

import { OVERPASS, overpassQuery, parseOverpass } from "../../apps/26-soiffard/lib.js";
export { overpassQuery, parseOverpass };

const CACHE_SECONDS = 900;
const MAX_VISIT = 4 * 3600; // un passage compte au plus 4 h
const MIN_VISIT = 60;
const MAX_VISITS_PER_IP_DAY = 40;

export async function soiffardApi(request, env, ctx, url, now, h) {
  const route = `${request.method} ${url.pathname.replace(/\/$/, "")}`;
  switch (route) {
    case "GET /api/soiffard/bars":
      return bars(request, ctx, url, h);
    case "POST /api/soiffard/visit":
      return visit(request, env, now, h);
    case "GET /api/soiffard/bar":
      return barTop(env, url, now, h);
    case "GET /api/soiffard/kings":
      return kings(env, url, now, h);
    case "GET /api/soiffard/week":
      return week(env, now, h);
    case "GET /api/soiffard/me":
      return me(env, url, now, h);
  }
  return h.json({ error: "Route inconnue." }, 404);
}

// ---------------------------------------------------------------- semaine

// Clé de semaine ISO (« 2026-W47 »), décalée de 6 h : la nuit du dimanche compte encore pour la semaine.
export function weekKey(ms) {
  const paris = new Date(ms + 3600000 - 6 * 3600000); // Paris = UTC+1 pendant tout le défi
  const d = new Date(Date.UTC(paris.getUTCFullYear(), paris.getUTCMonth(), paris.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- bars (OpenStreetMap)


async function bars(request, ctx, url, h) {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
    return h.json({ error: "Position invalide." }, 400);
  }
  // Arrondi à 3 décimales (≈ 100 m) : la recherche reste précise, et le cache sert tout le quartier.
  const rlat = lat.toFixed(3);
  const rlon = lon.toFixed(3);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(`https://apphero.cloud/__cache/soiffard/bars/${rlat}/${rlon}`);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const body = new URLSearchParams({ data: overpassQuery(rlat, rlon) });
  let data = null;
  const tried = [];
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: body.toString(),
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Soiffard/1.0 (https://apphero.cloud)" },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        data = await res.json();
        break;
      }
      tried.push(`${new URL(endpoint).host} ${res.status}`);
    } catch (err) {
      tried.push(`${new URL(endpoint).host} ${err?.name || "erreur"}`);
    }
  }
  if (!data) {
    console.error("overpass", tried.join(", "));
    return h.json({ error: "OpenStreetMap ne répond pas. Réessaie dans un instant.", tried }, 502);
  }
  const res = h.json({ bars: parseOverpass(data), at: Date.now() }, 200, { "cache-control": `public, max-age=${CACHE_SECONDS}` });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------------------------------------------------------------- KOTB

const PLAYER = /^[a-z0-9]{16,40}$/;
const BAR = /^[nwr]\d{1,12}$/;

export function cleanPseudo(s) {
  const p = String(s || "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  return p.length >= 2 ? p : null;
}

async function visit(request, env, now, h) {
  const input = await h.readJson(request);
  if (!input) return h.json({ error: "Requête invalide." }, 400);
  const player = String(input.player || "");
  const pseudo = cleanPseudo(input.pseudo);
  const bar = String(input.bar?.id || "");
  const barName = String(input.bar?.name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80);
  const seconds = Math.round(Number(input.seconds));
  if (!PLAYER.test(player) || !pseudo || !BAR.test(bar) || !barName) return h.json({ error: "Requête invalide." }, 400);
  if (!Number.isFinite(seconds) || seconds < MIN_VISIT) return h.json({ error: "Reste au moins une minute au comptoir." }, 400);
  const credited = Math.min(seconds, MAX_VISIT);

  const { ipHash } = await h.ipHashFor(request, env, now);
  const dayStart = now - 86400000;
  const ipCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM soiffard_visits WHERE ip_hash = ? AND created_at > ?").bind(ipHash, dayStart).first();
  if ((ipCount?.n || 0) >= MAX_VISITS_PER_IP_DAY) return h.json({ error: "Trop de passages aujourd'hui depuis ce réseau." }, 429);

  // Pas de passages qui se chevauchent : on ne peut pas être dans deux bars en même temps.
  const last = await env.DB.prepare("SELECT created_at FROM soiffard_visits WHERE player = ? ORDER BY created_at DESC LIMIT 1").bind(player).first();
  if (last && now - last.created_at < credited * 1000 - 120000) {
    return h.json({ error: "Ce passage chevauche le précédent." }, 409);
  }

  const wk = weekKey(now);
  const before = await kingOf(env, wk, bar);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO soiffard_players (id, pseudo, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET pseudo = excluded.pseudo, updated_at = excluded.updated_at",
    ).bind(player, pseudo, now, now),
    env.DB.prepare("INSERT INTO soiffard_visits (player, bar, bar_name, seconds, week, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      player,
      bar,
      barName,
      credited,
      wk,
      ipHash,
      now,
    ),
  ]);
  const top = await topOf(env, wk, bar, 10);
  const mine = top.findIndex((r) => r.player === player);
  const king = top[0] || null;
  return h.json({
    ok: true,
    credited,
    rank: mine >= 0 ? mine + 1 : null,
    king: king ? { pseudo: king.pseudo, seconds: king.seconds, me: king.player === player } : null,
    tookCrown: !!king && king.player === player && (!before || before.player !== player),
    dethroned: before && king && king.player === player && before.player !== player ? before.pseudo : null,
    top: top.map((r) => ({ pseudo: r.pseudo, seconds: r.seconds, me: r.player === player })),
  });
}

async function topOf(env, wk, bar, limit) {
  const { results } = await env.DB.prepare(
    `SELECT v.player AS player, p.pseudo AS pseudo, SUM(v.seconds) AS seconds
       FROM soiffard_visits v JOIN soiffard_players p ON p.id = v.player
      WHERE v.week = ? AND v.bar = ?
      GROUP BY v.player ORDER BY seconds DESC, MIN(v.created_at) ASC LIMIT ?`,
  )
    .bind(wk, bar, limit)
    .all();
  return results;
}

async function kingOf(env, wk, bar) {
  const top = await topOf(env, wk, bar, 1);
  return top[0] || null;
}

async function barTop(env, url, now, h) {
  const bar = String(url.searchParams.get("id") || "");
  const player = String(url.searchParams.get("player") || "");
  if (!BAR.test(bar)) return h.json({ error: "Bar inconnu." }, 400);
  const top = await topOf(env, weekKey(now), bar, 10);
  return h.json(
    { week: weekKey(now), top: top.map((r) => ({ pseudo: r.pseudo, seconds: r.seconds, me: r.player === player })) },
    200,
    { "cache-control": "no-store" },
  );
}

async function kings(env, url, now, h) {
  const ids = String(url.searchParams.get("ids") || "")
    .split(",")
    .filter((id) => BAR.test(id))
    .slice(0, 80);
  if (!ids.length) return h.json({ kings: {} });
  const marks = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT v.bar AS bar, v.player AS player, p.pseudo AS pseudo, SUM(v.seconds) AS seconds
       FROM soiffard_visits v JOIN soiffard_players p ON p.id = v.player
      WHERE v.week = ? AND v.bar IN (${marks})
      GROUP BY v.bar, v.player`,
  )
    .bind(weekKey(now), ...ids)
    .all();
  const out = {};
  for (const r of results) {
    if (!out[r.bar] || r.seconds > out[r.bar].seconds) out[r.bar] = { pseudo: r.pseudo, seconds: r.seconds };
  }
  return h.json({ kings: out }, 200, { "cache-control": "public, max-age=30" });
}

async function week(env, now, h) {
  const { results } = await env.DB.prepare(
    `SELECT p.pseudo AS pseudo, v.player AS player, COUNT(DISTINCT v.bar) AS bars, SUM(v.seconds) AS seconds
       FROM soiffard_visits v JOIN soiffard_players p ON p.id = v.player
      WHERE v.week = ?
      GROUP BY v.player ORDER BY bars DESC, seconds DESC LIMIT 20`,
  )
    .bind(weekKey(now))
    .all();
  return h.json(
    { week: weekKey(now), top: results.map((r) => ({ pseudo: r.pseudo, bars: r.bars, seconds: r.seconds, id: r.player.slice(0, 6) })) },
    200,
    { "cache-control": "public, max-age=30" },
  );
}

async function me(env, url, now, h) {
  const player = String(url.searchParams.get("player") || "");
  if (!PLAYER.test(player)) return h.json({ error: "Joueur inconnu." }, 400);
  const wk = weekKey(now);
  const { results } = await env.DB.prepare(
    `SELECT v.bar AS bar, MAX(v.bar_name) AS name, v.player AS player, SUM(v.seconds) AS seconds
       FROM soiffard_visits v
      WHERE v.week = ? AND v.bar IN (SELECT DISTINCT bar FROM soiffard_visits WHERE week = ? AND player = ?)
      GROUP BY v.bar, v.player`,
  )
    .bind(wk, wk, player)
    .all();
  const best = {};
  for (const r of results) {
    if (!best[r.bar] || r.seconds > best[r.bar].seconds) best[r.bar] = r;
  }
  const crowns = Object.values(best)
    .filter((r) => r.player === player)
    .map((r) => ({ id: r.bar, name: r.name, seconds: r.seconds }));
  return h.json({ week: wk, crowns });
}
