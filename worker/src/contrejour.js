// Contre-jour (app 27) : le tableau des scores partagé. Un nom libre court, pas de compte.
// On garde chaque partie envoyée ; le classement ne montre que le meilleur score de chaque nom.

const APP = "27";
const TOP = 10;
const MAX_PER_IP = 40; // parties envoyées par réseau et par jour (l'empreinte d'IP change chaque jour)
const PERSOS = ["Le Vieux", "La Môme", "Le Borgne"];

// L'écran défile à 13 m/s au plus (520 px/s, 40 px par mètre), et le perso peut gagner
// un peu d'avance dans l'écran : au-delà, le score est impossible.
const ceiling = (dur) => Math.floor(dur * 13) + 30;

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{0,11}$/u;

async function top(env) {
  const { results } = await env.DB.prepare(
    `SELECT name, m, kos, perso FROM (
       SELECT name, m, kos, perso, created_at,
              ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY m DESC, created_at ASC) AS r
       FROM cj_scores)
     WHERE r = 1 ORDER BY m DESC, created_at ASC LIMIT ?`,
  ).bind(TOP).all();
  return (results || []).map((s) => ({ ...s, perso: PERSOS[s.perso] || "" }));
}

export async function contreJour(request, env, now, route, h) {
  if (!h.released(APP, now) && !(await h.preview(request, env))) return h.json({ error: "Le jeu n'est pas encore sorti." }, 404);
  if (route === "GET /api/cj/scores") return h.json({ scores: await top(env) }, 200, { "cache-control": "public, max-age=10" });
  if (route !== "POST /api/cj/scores") return h.json({ error: "Route inconnue." }, 404);

  const input = await h.readJson(request);
  if (!input) return h.json({ error: "Requête invalide." }, 400);
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const m = Number(input.m), kos = Number(input.kos), perso = Number(input.perso), dur = Number(input.dur);
  if (!NAME_RE.test(name)) return h.json({ error: "Un nom de 1 à 12 lettres ou chiffres." }, 400);
  if (!Number.isInteger(dur) || dur < 1 || dur > 7200) return h.json({ error: "Partie invalide." }, 400);
  if (!Number.isInteger(m) || m < 1 || m > ceiling(dur)) return h.json({ error: "Score invalide." }, 400);
  if (!Number.isInteger(kos) || kos < 0 || kos > Math.ceil(m / 4)) return h.json({ error: "Score invalide." }, 400);
  if (!Number.isInteger(perso) || perso < 0 || perso >= PERSOS.length) return h.json({ error: "Perso invalide." }, 400);

  const { ipHash } = await h.ipHashFor(request, env, now);
  const sent = await env.DB.prepare("SELECT COUNT(*) AS n FROM cj_scores WHERE ip_hash = ?").bind(ipHash).first();
  if ((sent?.n || 0) >= MAX_PER_IP) return h.json({ error: "Trop de parties envoyées depuis ce réseau aujourd'hui." }, 429);
  await env.DB.prepare("INSERT INTO cj_scores (name, m, kos, perso, dur, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(name, m, kos, perso, dur, ipHash, now).run();
  const better = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT lower(name) AS k, MAX(m) AS best FROM cj_scores GROUP BY k) WHERE best > ?",
  ).bind(m).first();
  return h.json({ ok: true, rank: (better?.n || 0) + 1, scores: await top(env) });
}
