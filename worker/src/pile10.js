// Pile 10 (app 10) : le classement du jour. On rappuie au bout de 10 s pile, à l'instinct.
// Une ligne par essai envoyé ; le classement montre le meilleur écart de chaque nom, pour la journée (heure de Paris).

const APP = "10";
const TOP = 10;
const MAX_PER_NET = 300; // essais envoyés par réseau et par jour
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'’_-]{0,15}$/u;

async function top(env, day) {
  const { results } = await env.DB.prepare(
    `SELECT name, ms, gap FROM (
       SELECT name, ms, gap, created_at,
              ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY gap ASC, created_at ASC) AS r
       FROM pile10_scores WHERE day = ?)
     WHERE r = 1 ORDER BY gap ASC, created_at ASC LIMIT ?`,
  ).bind(day, TOP).all();
  return results || [];
}

export async function pile10(request, env, now, route, h) {
  if (!h.released(APP, now) && !(await h.preview(request, env, now))) return h.json({ error: "Pas encore sorti." }, 404);
  const day = h.parisDate(now);
  if (route === "GET /api/pile10/scores") {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM pile10_scores WHERE day = ?").bind(day).first();
    return h.json({ day, tries: n?.n || 0, scores: await top(env, day) }, 200, { "cache-control": "public, max-age=5" });
  }
  if (route !== "POST /api/pile10/scores") return h.json({ error: "Route inconnue." }, 404);

  const input = await h.readJson(request);
  if (!input) return h.json({ error: "Requête invalide." }, 400);
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const ms = Number(input.ms);
  if (!NAME_RE.test(name)) return h.json({ error: "Un nom de 1 à 16 lettres ou chiffres." }, 400);
  // Au-delà de 5 s d'écart, ce n'est plus de l'instinct.
  if (!Number.isInteger(ms) || ms < 5000 || ms > 15000) return h.json({ error: "Essai invalide." }, 400);
  const gap = Math.abs(ms - 10000);

  const { ipHash } = await h.ipHashFor(request, env, `pile10|${day}`);
  if ((await h.hit(env, day, `p10:${ipHash.slice(0, 24)}`)) > MAX_PER_NET)
    return h.json({ error: "Trop d'essais depuis ce réseau aujourd'hui. Reviens demain !" }, 429);
  await env.DB.prepare("INSERT INTO pile10_scores (day, name, ms, gap, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(day, name, ms, gap, ipHash, now).run();
  const better = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT lower(name) AS k, MIN(gap) AS best FROM pile10_scores WHERE day = ? GROUP BY k) WHERE best < ?",
  ).bind(day, gap).first();
  return h.json({ ok: true, rank: (better?.n || 0) + 1, scores: await top(env, day) });
}
