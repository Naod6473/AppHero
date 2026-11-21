// Bubble (app 04) : le classement du cri le plus long. Un nom dit à voix haute, pas de compte.
// On garde chaque partie envoyée ; le classement ne montre que le meilleur cri de chaque nom.

const APP = "04";
const TOP = 10;
const MAX_PER_NET = 60; // parties envoyées par réseau et par jour
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'’_-]{0,19}$/u;

async function top(env) {
  const { results } = await env.DB.prepare(
    `SELECT name, ms, lvl FROM (
       SELECT name, ms, lvl, created_at,
              ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY ms DESC, lvl DESC, created_at ASC) AS r
       FROM bubble_scores)
     WHERE r = 1 ORDER BY ms DESC, lvl DESC, created_at ASC LIMIT ?`,
  ).bind(TOP).all();
  return results || [];
}

export async function bubble(request, env, now, route, h) {
  if (!h.released(APP, now) && !(await h.preview(request, env, now))) return h.json({ error: "Le jeu n'est pas encore sorti." }, 404);
  if (route === "GET /api/bubble/scores") return h.json({ scores: await top(env) }, 200, { "cache-control": "public, max-age=10" });
  if (route !== "POST /api/bubble/scores") return h.json({ error: "Route inconnue." }, 404);

  const input = await h.readJson(request);
  if (!input) return h.json({ error: "Requête invalide." }, 400);
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const ms = Number(input.ms), lvl = Number(input.lvl), dur = Number(input.dur);
  if (!NAME_RE.test(name)) return h.json({ error: "Un nom de 1 à 20 lettres ou chiffres." }, 400);
  if (!Number.isInteger(dur) || dur < 1 || dur > 7200) return h.json({ error: "Partie invalide." }, 400);
  // Un cri ne peut pas durer plus longtemps que la partie, ni dépasser 3 minutes.
  if (!Number.isInteger(ms) || ms < 0 || ms > Math.min(180000, dur * 1000 + 1000)) return h.json({ error: "Score invalide." }, 400);
  // Chaque bulle demande au moins une seconde de cri.
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > 500 || (lvl - 1) > dur) return h.json({ error: "Score invalide." }, 400);
  if (dur > lvl * 60 + 60) return h.json({ error: "Partie invalide." }, 400); // large : un appareil lent ralentit le jeu

  const day = h.parisDate(now);
  const { ipHash } = await h.ipHashFor(request, env, `bubble|${day}`);
  if ((await h.hit(env, day, `b:${ipHash.slice(0, 24)}`)) > MAX_PER_NET)
    return h.json({ error: "Trop de parties envoyées depuis ce réseau aujourd'hui." }, 429);
  await env.DB.prepare("INSERT INTO bubble_scores (name, ms, lvl, dur, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(name, ms, lvl, dur, ipHash, now).run();
  const better = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT lower(name) AS k, MAX(ms) AS best FROM bubble_scores GROUP BY k) WHERE best > ?",
  ).bind(ms).first();
  return h.json({ ok: true, rank: (better?.n || 0) + 1, scores: await top(env) });
}
