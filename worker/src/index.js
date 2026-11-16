// Worker Apphéro : sert le site statique (dist/), garde chaque app cachée
// jusqu'à son publishAt, et gère le vote, les visites et les tirages de la roue.
import manifest from "../generated/apps.json";
import CRITERES from "../../shared/criteres.json";
import { WEEKS, WHEEL_DAYS, parisDate, isReleased } from "../../shared/calendar.js";

const MAX_VOTES_PER_IP_PER_DAY = 5; // un foyer ou un bureau partage souvent la même IP
const COOKIE = "ah_id";
const SLICES = 20;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const now = currentTime(env);
    const path = url.pathname;

    if (url.hostname === "www.apphero.cloud") {
      url.hostname = "apphero.cloud";
      return Response.redirect(url.toString(), 301);
    }

    try {
      if (path.startsWith("/api/")) return await api(request, env, ctx, url, now);

      // Liens courts pour X : /05 -> /apps/05-nom/
      const short = path.match(/^\/(\d{2})\/?$/);
      if (short) {
        const app = releasedApp(short[1], now);
        if (app) return Response.redirect(`${url.origin}/apps/${app.slug}/`, 302);
        return notFound(request, env);
      }

      // Les apps : invisibles avant leur heure de sortie.
      const m = path.match(/^\/apps\/([^/]+)(\/.*)?$/);
      if (m) {
        const app = manifest.find((a) => a.slug === m[1]);
        if (!app || !isReleased(app.publishAt, now)) return notFound(request, env);
        const rest = m[2] || "";
        if (rest === "" || rest === "/" || rest === "/index.html") {
          if (request.method === "GET" && !isBot(request)) ctx.waitUntil(countView(env, app.id));
        }
      }

      const res = await env.ASSETS.fetch(request);
      if (res.status === 404) return notFound(request, env);
      return res;
    } catch (err) {
      console.error(err);
      return json({ error: "Oups, erreur du serveur." }, 500);
    }
  },
};

// ---------------------------------------------------------------- API

async function api(request, env, ctx, url, now) {
  const route = `${request.method} ${url.pathname.replace(/\/$/, "")}`;
  switch (route) {
    case "GET /api/state":
      return state(request, env, now);
    case "POST /api/vote":
      return vote(request, env, now);
    case "GET /api/draws":
      return json({ draws: await listDraws(env) }, 200, { "cache-control": "public, max-age=30" });
    case "POST /api/admin/draws":
      return saveDraw(request, env, now);
    case "POST /api/admin/check":
      return isAdmin(request, env) ? json({ ok: true }) : json({ error: "Code organisateur incorrect." }, 401);
  }
  const del = route.match(/^DELETE \/api\/admin\/draws\/(\d{4}-\d{2}-\d{2})$/);
  if (del) {
    if (!isAdmin(request, env)) return json({ error: "Code organisateur incorrect." }, 401);
    await env.DB.prepare("DELETE FROM draws WHERE for_day = ?").bind(del[1]).run();
    return json({ ok: true });
  }
  return json({ error: "Route inconnue." }, 404);
}

function publicApp(a) {
  const { num, id, slug, title, tagline, publishAt, date, theme, color, tags, criterion } = a;
  return { num, id, slug, title, tagline, publishAt, date, theme, color, tags, criterion };
}

async function state(request, env, now) {
  const apps = manifest.filter((a) => isReleased(a.publishAt, now)).map(publicApp);
  const today = parisDate(now);
  const { voter, setCookie } = voterId(request);

  const startedWeeks = WEEKS.filter((w) => !w.final && Date.parse(w.from) <= now);
  const top = (kind, bucket, limit = 3) =>
    env.DB.prepare("SELECT app, n FROM tallies WHERE kind = ? AND bucket = ? AND n > 0 ORDER BY n DESC, app ASC LIMIT ?").bind(kind, bucket, limit);

  const queries = [
    top("vote", "ALL", 5),
    top("view", "ALL", 5),
    env.DB.prepare("SELECT app FROM votes WHERE day = ? AND voter = ?").bind(today, voter),
    ...startedWeeks.map((w) => top("vote", w.id, 1)),
  ];
  const results = await env.DB.batch(queries);
  const [votesTop, viewsTop, mine, ...weekTops] = results.map((r) => r.results);

  const weeks = {};
  startedWeeks.forEach((w, i) => {
    weeks[w.id] = { leader: weekTops[i][0] || null, closed: Date.parse(w.to) <= now };
  });

  const body = {
    now,
    today,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    repoUrl: env.REPO_URL || "",
    apps,
    rankings: { votes: votesTop, views: viewsTop },
    weeks,
    myVote: mine[0]?.app || null,
  };
  return json(body, 200, setCookie ? { "set-cookie": setCookie } : {});
}

async function vote(request, env, now) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }
  const app = releasedApp(String(input.app || ""), now);
  if (!app) return json({ error: "Cette app n'est pas encore sortie." }, 400);

  const { voter, setCookie, fresh } = voterId(request);
  const headers = setCookie ? { "set-cookie": setCookie } : {};
  // Un cookie tout neuf ne peut pas voter : ça bloque les scripts qui jettent leurs cookies.
  if (fresh) return json({ error: "Recharge la page puis vote à nouveau." }, 400, headers);

  const ip = request.headers.get("cf-connecting-ip") || "local";
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET, input.token, ip);
    if (!ok) return json({ error: "Vérification anti-robot échouée, réessaie." }, 403, headers);
  }

  const today = parisDate(now);
  const ipHash = await sha256(`${env.IP_SALT || "apphero"}|${today}|${ip}`);
  const already = await env.DB.prepare(
    "SELECT (SELECT app FROM votes WHERE day = ?1 AND voter = ?2) AS mine, (SELECT COUNT(*) FROM votes WHERE day = ?1 AND ip_hash = ?3) AS fromIp",
  )
    .bind(today, voter, ipHash)
    .first();
  if (already?.mine) return json({ error: "Tu as déjà voté aujourd'hui. Reviens demain !", myVote: already.mine }, 409, headers);
  if ((already?.fromIp || 0) >= MAX_VOTES_PER_IP_PER_DAY) return json({ error: "Trop de votes depuis ce réseau aujourd'hui." }, 429, headers);

  const week = WEEKS.find((w) => !w.final && Date.parse(w.from) <= now && now < Date.parse(w.to));
  const bump = (bucket) =>
    env.DB.prepare("INSERT INTO tallies (kind, bucket, app, n) VALUES ('vote', ?, ?, 1) ON CONFLICT (kind, bucket, app) DO UPDATE SET n = n + 1").bind(
      bucket,
      app.id,
    );
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO votes (app, day, voter, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(app.id, today, voter, ipHash, now),
      bump("ALL"),
      ...(week ? [bump(week.id)] : []),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) return json({ error: "Tu as déjà voté aujourd'hui. Reviens demain !" }, 409, headers);
    throw err;
  }
  return json({ ok: true, myVote: app.id }, 200, headers);
}

async function countView(env, appId) {
  try {
    await env.DB.prepare("INSERT INTO tallies (kind, bucket, app, n) VALUES ('view', 'ALL', ?, 1) ON CONFLICT (kind, bucket, app) DO UPDATE SET n = n + 1")
      .bind(appId)
      .run();
  } catch (err) {
    console.error("countView", err);
  }
}

async function listDraws(env) {
  const { results } = await env.DB.prepare("SELECT for_day, slices, k, label, idea, created_at FROM draws ORDER BY for_day DESC").all();
  return results.map((r) => ({ forDay: r.for_day, slices: JSON.parse(r.slices), k: r.k, label: r.label, idea: r.idea, createdAt: r.created_at }));
}

async function saveDraw(request, env, now) {
  if (!isAdmin(request, env)) return json({ error: "Code organisateur incorrect." }, 401);
  let d;
  try {
    d = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }
  if (!WHEEL_DAYS.some((w) => w.forDay === d.forDay)) return json({ error: "Ce jour n'a pas de tirage." }, 400);
  if (!Array.isArray(d.slices) || d.slices.length !== SLICES || !d.slices.every((s) => CRITERES.includes(s)) || new Set(d.slices).size !== SLICES)
    return json({ error: "La roue doit contenir 20 critères différents de la liste." }, 400);
  if (!Number.isInteger(d.k) || d.k < 0 || d.k >= SLICES) return json({ error: "Index tiré invalide." }, 400);
  const idea = typeof d.idea === "string" && d.idea.trim() ? d.idea.trim().slice(0, 1200) : null;
  await env.DB.prepare(
    "INSERT INTO draws (for_day, slices, k, label, idea, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (for_day) DO UPDATE SET slices = excluded.slices, k = excluded.k, label = excluded.label, idea = excluded.idea, created_at = excluded.created_at",
  )
    .bind(d.forDay, JSON.stringify(d.slices), d.k, d.slices[d.k], idea, now)
    .run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- outils

function currentTime(env) {
  // DEV_NOW (dans .dev.vars, jamais en production) permet de simuler une date.
  if (env.DEV_NOW) {
    const t = Date.parse(env.DEV_NOW);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function releasedApp(id, now) {
  const app = manifest.find((a) => a.id === id);
  return app && isReleased(app.publishAt, now) ? app : null;
}

async function notFound(request, env) {
  const page = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
  return new Response(page.body, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function voterId(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9-]{36})`));
  if (m) return { voter: m[1], setCookie: null, fresh: false };
  const id = crypto.randomUUID();
  return {
    voter: id,
    fresh: true,
    setCookie: `${COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
  };
}

function isAdmin(request, env) {
  const token = env.ADMIN_TOKEN;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function isBot(request) {
  return /bot|crawl|spider|preview|slurp|facebookexternalhit|embedly/i.test(request.headers.get("user-agent") || "");
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = await res.json();
  return data.success === true;
}
