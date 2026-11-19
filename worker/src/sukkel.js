// Sukkel (app 03) : le chrono de la touche Espace, mesuré par le serveur.
// start -> une partie (id secret) ; beat toutes les 10 s pendant l'appui ; stop -> durée.
// La durée retenue s'arrête au dernier signe de vie + 25 s : impossible de « lâcher » en coulisse
// puis de revenir dire stop une heure plus tard. Ensuite, un pseudo pour le tableau.

const APP = "03";
const TOP = 10;
const MAX_STARTS_PER_IP = 300; // parties lancées par réseau et par jour (l'empreinte d'IP change chaque jour)
const GRACE_MS = 25000;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{0,15}$/u;
const ID_RE = /^[a-f0-9-]{36}$/;

async function top(env) {
  const { results } = await env.DB.prepare(
    `SELECT name, ms FROM (
       SELECT name, ms, ended_at,
              ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY ms DESC, ended_at ASC) AS r
       FROM sukkel_runs WHERE name IS NOT NULL)
     WHERE r = 1 ORDER BY ms DESC, ended_at ASC LIMIT ?`,
  ).bind(TOP).all();
  return results || [];
}

async function rankOf(env, ms) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM (SELECT lower(name) AS k, MAX(ms) AS best FROM sukkel_runs WHERE name IS NOT NULL GROUP BY k) WHERE best > ?",
  ).bind(ms).first();
  return (row?.n || 0) + 1;
}

export async function sukkel(request, env, now, route, h) {
  if (!h.released(APP, now) && !(await h.preview(request, env))) return h.json({ error: "L'app n'est pas encore sortie." }, 404);
  if (route === "GET /api/sukkel/scores") {
    const total = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(ms), 0) AS ms FROM sukkel_runs WHERE ended_at IS NOT NULL").first();
    return h.json({ scores: await top(env), runs: total?.n || 0, wasted: total?.ms || 0 }, 200, { "cache-control": "public, max-age=10" });
  }

  const input = (await h.readJson(request)) || {};

  if (route === "POST /api/sukkel/start") {
    const { ipHash } = await h.ipHashFor(request, env, now);
    const sent = await env.DB.prepare("SELECT COUNT(*) AS n FROM sukkel_runs WHERE ip_hash = ?").bind(ipHash).first();
    if ((sent?.n || 0) >= MAX_STARTS_PER_IP) return h.json({ error: "Trop d'essais depuis ce réseau aujourd'hui." }, 429);
    const id = crypto.randomUUID();
    const provider = ["claude", "chatgpt", "mistral"].includes(input.provider) ? input.provider : null;
    await env.DB.prepare("INSERT INTO sukkel_runs (id, provider, ip_hash, started_at, beat_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, provider, ipHash, now, now).run();
    return h.json({ id });
  }

  const id = String(input.id || "");
  if (!ID_RE.test(id)) return h.json({ error: "Partie inconnue." }, 400);
  const run = await env.DB.prepare("SELECT started_at, beat_at, ended_at, ms, name FROM sukkel_runs WHERE id = ?").bind(id).first();
  if (!run) return h.json({ error: "Partie inconnue." }, 404);

  if (route === "POST /api/sukkel/beat") {
    if (run.ended_at) return h.json({ error: "Partie terminée." }, 409);
    if (now - run.beat_at > GRACE_MS) return h.json({ error: "Trop tard." }, 409);
    await env.DB.prepare("UPDATE sukkel_runs SET beat_at = ? WHERE id = ? AND ended_at IS NULL").bind(now, id).run();
    return h.json({ ok: true });
  }

  if (route === "POST /api/sukkel/stop") {
    if (!run.ended_at) {
      const end = Math.min(now, run.beat_at + GRACE_MS);
      // Le navigateur sait à la milliseconde quand le doigt s'est levé ; on le croit, sans dépasser le serveur.
      const client = Number(input.ms);
      let ms = end - run.started_at;
      if (Number.isFinite(client) && client >= 0 && client < ms) ms = Math.round(client);
      await env.DB.prepare("UPDATE sukkel_runs SET ended_at = ?, ms = ? WHERE id = ? AND ended_at IS NULL").bind(now, ms, id).run();
      run.ms = ms;
    }
    return h.json({ ms: run.ms, rank: await rankOf(env, run.ms) });
  }

  if (route === "POST /api/sukkel/name") {
    if (!run.ended_at) return h.json({ error: "Lâche d'abord la touche." }, 409);
    if (run.name) return h.json({ error: "Ce temps est déjà au tableau." }, 409);
    const name = String(input.name || "").trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(name)) return h.json({ error: "Un pseudo de 1 à 16 lettres ou chiffres." }, 400);
    await env.DB.prepare("UPDATE sukkel_runs SET name = ? WHERE id = ? AND name IS NULL").bind(name, id).run();
    return h.json({ ok: true, rank: await rankOf(env, run.ms), scores: await top(env) });
  }

  return h.json({ error: "Route inconnue." }, 404);
}
