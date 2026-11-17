// Worker Apphéro : sert le site statique (dist/), garde chaque app cachée
// jusqu'à son publishAt, et gère les j'aime, les votes, les visites et les tirages de la roue.
import manifest from "../generated/apps.json";
import CRITERES from "../../shared/criteres.json";
import { BALLOTS, DAYS, ballotStatus, wheelDays, CHALLENGE_END, REVEAL_AT, LAUNCH_AT, DRAW_LOCK_AT, parisDate, isReleased } from "../../shared/calendar.js";
import { CRITERIA, criterionLabel, drawCalendar } from "../../shared/criteria.js";

const MAX_PER_IP = 8; // un foyer ou un bureau partage souvent la même IP
const COOKIE = "ah_id";
const PREVIEW_COOKIE = "ah_preview";
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

      // Avant le lancement : toutes les pages affichent le rideau (compte à rebours), sauf pour l'organisateur.
      if (now < Date.parse(LAUNCH_AT) && isPage(path) && !(await isPreview(request, env))) {
        const page = await env.ASSETS.fetch(new Request(new URL("/rideau/", request.url)));
        return new Response(page.body, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-apphero-rideau": "1" },
        });
      }

      // Liens courts pour X : /05 -> /apps/05-nom/
      const short = path.match(/^\/(\d{2})\/?$/);
      if (short) {
        const app = releasedApp(short[1], now);
        if (app) return Response.redirect(`${url.origin}/apps/${app.slug}/`, 302);
        return notFound(request, env);
      }

      // Les apps : invisibles avant leur heure de sortie.
      const m = path.match(/^\/apps\/([^/]+)(\/.*)?$/);
      const app = m ? manifest.find((a) => a.slug === m[1]) : null;
      if (m) {
        if (!app || !isReleased(app.publishAt, now)) return notFound(request, env);
        const rest = m[2] || "";
        if (rest === "" || rest === "/" || rest === "/index.html") {
          if (request.method === "GET" && !isBot(request)) ctx.waitUntil(countView(env, app.id));
        }
      }

      const res = await env.ASSETS.fetch(request);
      if (res.status === 404) return notFound(request, env);
      // Les apps sont copiées telles quelles : on y ajoute le petit script de mesure d'audience.
      if (app && (res.headers.get("content-type") || "").includes("text/html")) {
        // …et la fiche de l'app (fabrication, j'aime / bof, retour à l'accueil).
        const crit = await loadCriteria(env);
        const info = JSON.stringify(publicApp(app, crit)).replace(/</g, "\\u003c");
        return new HTMLRewriter()
          .on("head", {
            element: (el) =>
              el.append(`<script src="/t.js" defer></script><script>window.AH_APP=${info}</script><script src="/fiche.js" defer></script>`, { html: true }),
          })
          .transform(res);
      }
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
    case "POST /api/react":
      return react(request, env, now);
    case "POST /api/ballot":
      return castBallot(request, env, now);
    case "GET /api/bilan":
      return bilan(env, now);
    case "GET /api/draws":
      return json({ draws: await listDraws(env) }, 200, { "cache-control": "public, max-age=30" });
    case "POST /api/admin/draws":
      return saveDraw(request, env, now);
    case "POST /api/admin/criteria/draw":
      return drawCriteria(request, env, now);
    case "POST /api/t":
      return collect(request, env, ctx, now);
    case "GET /api/admin/stats":
      return isAdmin(request, env) ? stats(env, url, now) : json({ error: "Code organisateur incorrect." }, 401);
    case "POST /api/admin/preview":
      return previewOn(request, env);
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

function publicApp(a, crit) {
  const { num, id, slug, title, tagline, publishAt, date, color, tags, criterion, making, logo } = a;
  const c = crit?.[id];
  const theme = c ? [c, ...(c.extra || [])].map(criterionLabel).join(" + ") : null;
  return { num, id, slug, title, tagline, publishAt, date, theme, color, tags, criterion, making, logo: logo || null };
}

// Le critère tiré pour chaque case : { "05": { key, detail, extra } }. Petit, relu à chaque fois.
async function loadCriteria(env) {
  try {
    const { results } = await env.DB.prepare("SELECT day, data FROM criteria").all();
    const out = {};
    for (const r of results) {
      const c = JSON.parse(r.data);
      if (CRITERIA[c.key]) out[r.day] = { key: c.key, detail: c.detail || null, extra: (c.extra || []).filter((e) => CRITERIA[e.key]) };
    }
    return out;
  } catch (err) {
    console.error("loadCriteria", err);
    return {};
  }
}

// Le tirage en direct des 30 défis (bouton de /tirage/, réservé à l'organisateur).
// Possible jusqu'au lancement ; ensuite le calendrier est figé.
async function drawCriteria(request, env, now) {
  if (!isAdmin(request, env)) return json({ error: "Code organisateur incorrect." }, 401);
  if (now >= Date.parse(DRAW_LOCK_AT)) return json({ error: "Le tirage est fait : le calendrier ne bouge plus." }, 409);
  const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const out = drawCalendar(DAYS, rand);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM criteria"),
    ...Object.entries(out).map(([day, c]) => env.DB.prepare("INSERT INTO criteria (day, data) VALUES (?, ?)").bind(day, JSON.stringify(c))),
  ]);
  return json({ ok: true, criteria: out });
}

// Les critères restent secrets jusqu'au lancement, sauf pour l'organisateur (page de révélation à filmer).
async function visibleCriteria(request, env, now) {
  if (now < Date.parse(REVEAL_AT) && !isAdmin(request, env) && !(await isPreview(request, env))) return null;
  return loadCriteria(env);
}

// Tous les compteurs utiles en une requête (quelques dizaines de lignes au plus).
async function loadTallies(env) {
  const { results } = await env.DB.prepare("SELECT kind, bucket, app, n FROM tallies WHERE n > 0").all();
  const likes = {};
  const views = {};
  const ballots = {};
  let visitors = 0;
  for (const r of results) {
    if (r.kind === "like") likes[r.app] = r.n;
    else if (r.kind === "view") views[r.app] = r.n;
    else if (r.kind === "ballot") (ballots[r.bucket] ||= []).push({ app: r.app, n: r.n });
    else if (r.kind === "visitors") visitors = r.n;
  }
  return { likes, views, ballots, visitors };
}

// Résultat d'un scrutin, avec départage par les j'aime puis par l'ordre de sortie.
function ranking(rows = [], likes) {
  return rows.slice().sort((a, b) => b.n - a.n || (likes[b.app] || 0) - (likes[a.app] || 0) || a.app.localeCompare(b.app));
}

// Les scrutins tels que le public les voit : candidates, statut, et résultats une fois clos.
function ballotsView(t, now) {
  const out = [];
  const winners = [];
  for (const b of BALLOTS) {
    const status = ballotStatus(b, now);
    let candidates;
    if (b.final) {
      const known = winners.filter(Boolean);
      candidates = known.length === winners.length ? [...known, ...b.extra] : null; // null = pas encore connues
    } else {
      candidates = b.apps;
    }
    const sorted = ranking(t.ballots[b.id], t.likes);
    const closed = status === "closed";
    // Sans aucune voix, c'est l'app la plus aimée de la semaine qui passe.
    const pool = b.final ? candidates || [] : b.apps;
    const fallback = pool.length ? ranking(pool.map((app) => ({ app, n: 0 })), t.likes)[0].app : null;
    const winner = closed ? sorted[0]?.app || fallback : null;
    if (!b.final) winners.push(winner);
    out.push({
      id: b.id,
      label: b.label,
      final: !!b.final,
      opensAt: b.opensAt,
      closesAt: b.closesAt,
      status,
      candidates,
      // Les résultats restent cachés pendant le vote, pour ne pas influencer.
      results: closed ? sorted.slice(0, 3) : null,
      winner,
      total: closed ? sorted.reduce((s, r) => s + r.n, 0) : null,
    });
  }
  return out;
}

async function state(request, env, now) {
  const crit = await visibleCriteria(request, env, now);
  const apps = manifest.filter((a) => isReleased(a.publishAt, now)).map((a) => publicApp(a, crit));
  const voter = readVoter(request); // pas de cookie tant que la personne n'a ni aimé ni voté
  const [t, mine] = await Promise.all([
    loadTallies(env),
    voter
      ? env.DB.batch([
          env.DB.prepare("SELECT app, value FROM reactions WHERE voter = ?").bind(voter),
          env.DB.prepare("SELECT ballot, app FROM ballot_votes WHERE voter = ?").bind(voter),
        ])
      : Promise.resolve(null),
  ]);
  const top = (obj) =>
    Object.entries(obj)
      .map(([app, n]) => ({ app, n }))
      .sort((a, b) => b.n - a.n || a.app.localeCompare(b.app))
      .slice(0, 5);
  const myReactions = {};
  const myBallots = {};
  if (mine) {
    for (const r of mine[0].results) myReactions[r.app] = r.value;
    for (const r of mine[1].results) myBallots[r.ballot] = r.app;
  }
  return json({
    now,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    revealAt: REVEAL_AT,
    criteria: crit,
    apps,
    likes: t.likes,
    rankings: { likes: top(t.likes), views: top(t.views) },
    visitors: t.visitors,
    ballots: ballotsView(t, now),
    me: { reactions: myReactions, ballots: myBallots },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Le cookie technique n'est déposé qu'au premier j'aime ou au premier vote.
function voterOrNew(request) {
  const existing = readVoter(request);
  const voter = existing || crypto.randomUUID();
  const headers = existing ? {} : { "set-cookie": `${COOKIE}=${voter}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax` };
  return { voter, headers };
}

async function ipHashFor(request, env, now) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return { ip, ipHash: await sha256(`${env.IP_SALT || "apphero"}|${parisDate(now)}|${ip}`) };
}

const bumpTally = (env, kind, bucket, app, delta) =>
  env.DB.prepare("INSERT INTO tallies (kind, bucket, app, n) VALUES (?, ?, ?, ?) ON CONFLICT (kind, bucket, app) DO UPDATE SET n = n + excluded.n").bind(
    kind,
    bucket,
    app,
    delta,
  );

async function react(request, env, now) {
  const input = await readJson(request);
  if (!input) return json({ error: "Requête invalide." }, 400);
  const app = releasedApp(String(input.app || ""), now);
  if (!app) return json({ error: "Cette app n'est pas encore sortie." }, 400);
  const value = Number(input.value);
  if (![1, -1, 0].includes(value)) return json({ error: "Réaction invalide." }, 400);

  const { voter, headers } = voterOrNew(request);
  const { ipHash } = await ipHashFor(request, env, now);
  const row = await env.DB.prepare(
    "SELECT (SELECT value FROM reactions WHERE app = ?1 AND voter = ?2) AS current, (SELECT COUNT(*) FROM reactions WHERE app = ?1 AND ip_hash = ?3) AS fromIp",
  )
    .bind(app.id, voter, ipHash)
    .first();
  const current = row?.current ?? 0;
  if (current === value) return json({ ok: true, value }, 200, headers);
  if (current === 0 && (row?.fromIp || 0) >= MAX_PER_IP) return json({ error: "Trop de réactions depuis ce réseau aujourd'hui." }, 429, headers);

  const kind = (v) => (v === 1 ? "like" : "bof");
  const stmts = [];
  if (value === 0) stmts.push(env.DB.prepare("DELETE FROM reactions WHERE app = ? AND voter = ?").bind(app.id, voter));
  else
    stmts.push(
      env.DB.prepare(
        "INSERT INTO reactions (app, voter, value, ip_hash, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (app, voter) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      ).bind(app.id, voter, value, ipHash, now),
    );
  if (current !== 0) stmts.push(bumpTally(env, kind(current), "ALL", app.id, -1));
  if (value !== 0) stmts.push(bumpTally(env, kind(value), "ALL", app.id, 1));
  await env.DB.batch(stmts);
  return json({ ok: true, value }, 200, headers);
}

async function castBallot(request, env, now) {
  const input = await readJson(request);
  if (!input) return json({ error: "Requête invalide." }, 400);
  const def = BALLOTS.find((b) => b.id === input.ballot);
  if (!def) return json({ error: "Ce vote n'existe pas." }, 400);
  if (ballotStatus(def, now) !== "open") return json({ error: "Ce vote n'est pas ouvert." }, 400);
  const view = ballotsView(await loadTallies(env), now).find((b) => b.id === def.id);
  const appId = String(input.app || "");
  if (!view.candidates?.includes(appId) || !releasedApp(appId, now)) return json({ error: "Cette app ne fait pas partie de ce vote." }, 400);

  const { voter, headers } = voterOrNew(request);
  const { ip, ipHash } = await ipHashFor(request, env, now);
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET, input.token, ip);
    if (!ok) return json({ error: "Vérification anti-robot échouée, réessaie." }, 403, headers);
  }
  const row = await env.DB.prepare(
    "SELECT (SELECT app FROM ballot_votes WHERE ballot = ?1 AND voter = ?2) AS mine, (SELECT COUNT(*) FROM ballot_votes WHERE ballot = ?1 AND ip_hash = ?3) AS fromIp",
  )
    .bind(def.id, voter, ipHash)
    .first();
  if (row?.mine) return json({ error: "Tu as déjà voté pour ce tour.", mine: row.mine }, 409, headers);
  if ((row?.fromIp || 0) >= MAX_PER_IP) return json({ error: "Trop de votes depuis ce réseau." }, 429, headers);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ballot_votes (ballot, voter, app, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(def.id, voter, appId, ipHash, now),
      bumpTally(env, "ballot", def.id, appId, 1),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE") || String(err).includes("PRIMARY")) return json({ error: "Tu as déjà voté pour ce tour." }, 409, headers);
    throw err;
  }
  return json({ ok: true, mine: appId }, 200, headers);
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
  if (!wheelDays(await loadCriteria(env)).some((w) => w.forDay === d.forDay)) return json({ error: "Ce jour n'a pas de tirage." }, 400);
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

function readVoter(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9-]{36})`));
  return m ? m[1] : null;
}

// Une page HTML (pas un fichier .js, .css, image…). Les fichiers restent servis : ils ne dévoilent rien.
function isPage(path) {
  if (path.startsWith("/rideau/") || path === "/rideau") return false;
  const last = path.split("/").pop();
  return !last.includes(".") || last.endsWith(".html");
}

// L'aperçu organisateur : un cookie signé avec ADMIN_TOKEN, posé après saisie du code sur le rideau.
const previewValue = (env) => sha256(`${env.ADMIN_TOKEN}|preview`);
async function isPreview(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${PREVIEW_COOKIE}=([a-f0-9]{64})`));
  return !!m && m[1] === (await previewValue(env));
}
async function previewOn(request, env) {
  if (!isAdmin(request, env)) return json({ error: "Code organisateur incorrect." }, 401);
  const cookie = `${PREVIEW_COOKIE}=${await previewValue(env)}; Path=/; Max-Age=172800; HttpOnly; Secure; SameSite=Lax`;
  return json({ ok: true }, 200, { "set-cookie": cookie });
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

// ---------------------------------------------------------------- mesure d'audience (sans cookie)

const EVENT_NAME = /^[a-z_]{1,32}$/;
const RETENTION_MS = 395 * 86400000; // 13 mois

function browserOf(ua) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Autre";
}
function osOf(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Autre";
}
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

async function collect(request, env, ctx, now) {
  const ok = new Response(null, { status: 204 });
  if (isBot(request)) return ok;
  const text = await request.text();
  if (text.length > 8000) return ok;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return ok;
  }
  const events = Array.isArray(data?.events) ? data.events.slice(0, 20) : [];
  if (!events.length) return ok;
  let path = "/";
  try {
    path = new URL(String(data.path || "/"), "https://apphero.cloud").pathname.slice(0, 120);
  } catch {
    /* chemin par défaut */
  }
  const appMatch = path.match(/^\/apps\/(\d{2})-/);
  const ua = request.headers.get("user-agent") || "";
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const day = parisDate(now);
  const visitor = (await sha256(`${env.IP_SALT || "apphero"}|stats|${day}|${ip}|${ua}`)).slice(0, 16);
  const hour = new Date(now + 3600000).getUTCHours();
  const country = clip(request.cf?.country, 2);
  const browser = browserOf(ua);
  const os = osOf(ua);
  const stmts = [];
  for (const ev of events) {
    const name = String(ev?.n || "");
    if (!EVENT_NAME.test(name)) continue;
    const p = ev.p && typeof ev.p === "object" ? ev.p : {};
    const props = {};
    for (const [k, v] of Object.entries(p).slice(0, 8)) {
      if (/^[a-z_]{1,16}$/.test(k) && ["string", "number", "boolean"].includes(typeof v)) props[k] = typeof v === "string" ? v.slice(0, 160) : v;
    }
    const app = appMatch ? appMatch[1] : /^\d{2}$/.test(String(props.app || "")) ? String(props.app) : null;
    const isPage = name === "page";
    stmts.push(
      env.DB.prepare(
        "INSERT INTO events (ts, day, hour, visitor, name, path, app, props, country, device, browser, os, lang, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        now,
        day,
        hour,
        visitor,
        name,
        path,
        app,
        JSON.stringify(props),
        country,
        isPage ? clip(props.device, 12) : null,
        isPage ? browser : null,
        isPage ? os : null,
        isPage ? clip(props.lang, 2) : null,
        isPage ? clip(props.ref, 80) || null : null,
      ),
    );
  }
  // Compteur public : une personne par jour (même empreinte du jour = même personne).
  if (events.some((e) => e?.n === "page")) {
    ctx.waitUntil(
      (async () => {
        const r = await env.DB.prepare("INSERT OR IGNORE INTO seen (day, visitor) VALUES (?, ?)").bind(day, visitor).run();
        if (r.meta?.changes) await bumpTally(env, "visitors", "ALL", "-", 1).run();
        if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM seen WHERE day < ?").bind(parisDate(now - 2 * 86400000)).run();
      })().catch((err) => console.error("seen", err)),
    );
  }
  if (stmts.length) {
    // De temps en temps, on efface ce qui a plus de 13 mois.
    if (Math.random() < 0.01) stmts.push(env.DB.prepare("DELETE FROM events WHERE ts < ?").bind(now - RETENTION_MS));
    ctx.waitUntil(env.DB.batch(stmts).catch((err) => console.error("collect", err)));
  }
  return ok;
}

// Les 20 marqueurs, agrégés pour la page /stats/ (réservée à l'organisateur).
async function stats(env, url, now) {
  const days = Math.max(1, Math.min(400, Number(url.searchParams.get("days")) || 30));
  const since = parisDate(now - (days - 1) * 86400000);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(since, ...args);
  const top = (col, name = "page", limit = 10) =>
    q(`SELECT ${col} AS k, COUNT(*) AS n FROM events WHERE day >= ? AND name = ? AND ${col} IS NOT NULL AND ${col} != '' GROUP BY k ORDER BY n DESC LIMIT ${limit}`, name);
  const prop = (key, name, limit = 10) =>
    q(
      `SELECT json_extract(props, '$.${key}') AS k, COUNT(*) AS n FROM events WHERE day >= ? AND name = ? AND k IS NOT NULL AND k != '' GROUP BY k ORDER BY n DESC LIMIT ${limit}`,
      name,
    );
  const queries = {
    perDay: q("SELECT day, SUM(name = 'page') AS views, COUNT(DISTINCT visitor) AS visitors FROM events WHERE day >= ? GROUP BY day ORDER BY day"),
    totals: q(
      "SELECT SUM(name = 'page') AS views, COUNT(DISTINCT day || visitor) AS visitors, AVG(CASE WHEN name = 'fin' THEN json_extract(props, '$.active') END) AS active FROM events WHERE day >= ?",
    ),
    bounce: q(
      "SELECT COUNT(*) AS visits, SUM(pages = 1) AS single FROM (SELECT day, visitor, SUM(name = 'page') AS pages FROM events WHERE day >= ? GROUP BY day, visitor HAVING pages > 0)",
    ),
    pages: q(
      "SELECT path AS k, SUM(name = 'page') AS n, ROUND(AVG(CASE WHEN name = 'fin' THEN json_extract(props, '$.active') END)) AS active, ROUND(AVG(CASE WHEN name = 'page' THEN json_extract(props, '$.load') END)) AS load FROM events WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 15",
    ),
    scroll: q("SELECT json_extract(props, '$.scroll') AS k, COUNT(*) AS n FROM events WHERE day >= ? AND name = 'fin' GROUP BY k ORDER BY k"),
    refs: top("ref"),
    utm: prop("utm", "page"),
    devices: top("device"),
    browsers: top("browser"),
    os: top("os"),
    countries: top("country"),
    langs: top("lang"),
    hours: q("SELECT hour AS k, COUNT(*) AS n FROM events WHERE day >= ? AND name = 'page' GROUP BY hour ORDER BY hour"),
    opens: q("SELECT app AS k, COUNT(*) AS n FROM events WHERE day >= ? AND name = 'ouvrir_app' AND app IS NOT NULL GROUP BY app ORDER BY n DESC LIMIT 30"),
    outbound: prop("host", "sortie"),
    deck: prop("how", "deck"),
    wheel: q(
      "SELECT SUM(name = 'page' AND path LIKE '/roue/%') AS views, SUM(name = 'roue_revoir') AS replays FROM events WHERE day >= ?",
    ),
    appTime: q(
      "SELECT app AS k, SUM(name = 'page') AS n, ROUND(AVG(CASE WHEN name = 'fin' THEN json_extract(props, '$.active') END)) AS active FROM events WHERE day >= ? AND path LIKE '/apps/%' AND app IS NOT NULL GROUP BY app ORDER BY app",
    ),
    reactions: env.DB.prepare("SELECT app AS k, SUM(CASE WHEN kind = 'like' THEN n END) AS likes, SUM(CASE WHEN kind = 'bof' THEN n END) AS bofs FROM tallies WHERE kind IN ('like', 'bof') GROUP BY app ORDER BY app"),
    ballots: env.DB.prepare("SELECT bucket AS k, SUM(n) AS n FROM tallies WHERE kind = 'ballot' GROUP BY bucket ORDER BY bucket"),
    errors: q("SELECT json_extract(props, '$.msg') AS k, path, COUNT(*) AS n FROM events WHERE day >= ? AND name = 'erreur' GROUP BY k, path ORDER BY n DESC LIMIT 10"),
  };
  const keys = Object.keys(queries);
  const res = await env.DB.batch(keys.map((k) => queries[k]));
  const out = { days, since };
  keys.forEach((k, i) => (out[k] = res[i].results));
  out.totals = out.totals[0];
  out.bounce = out.bounce[0];
  out.wheel = out.wheel[0];
  return json(out);
}

// ---------------------------------------------------------------- le bilan de fin de défi

async function bilan(env, now) {
  if (now < Date.parse(CHALLENGE_END)) return json({ ready: false, at: CHALLENGE_END });
  const apps = manifest.filter((a) => isReleased(a.publishAt, now));
  const crit = await loadCriteria(env);
  const sum = (k) => apps.reduce((s, a) => s + (Number(a.making?.[k]) || 0), 0);
  const t = await loadTallies(env);
  const ballots = ballotsView(t, now);
  const final = ballots.find((b) => b.final);
  const rank = (obj) =>
    Object.entries(obj)
      .map(([app, n]) => ({ app, n }))
      .sort((a, b) => b.n - a.n || a.app.localeCompare(b.app));
  return json(
    {
      ready: true,
      apps: apps.map((a) => publicApp(a, crit)),
      totals: {
        apps: apps.length,
        buildMinutes: sum("buildMinutes"),
        thinkingMinutes: sum("thinkingMinutes"),
        tokens: sum("tokens"),
        prompts: sum("prompts"),
        lines: sum("lines"),
        likes: Object.values(t.likes).reduce((s, n) => s + n, 0),
        votes: Object.values(t.ballots).flat().reduce((s, r) => s + r.n, 0),
        visitors: t.visitors,
      },
      topLikes: rank(t.likes).slice(0, 3),
      topViews: rank(t.views).slice(0, 3),
      weekly: ballots.filter((b) => !b.final).map((b) => ({ id: b.id, winner: b.winner })),
      winner: final?.winner || null,
      finalResults: final?.results || [],
    },
    200,
    { "cache-control": "public, max-age=300" },
  );
}
