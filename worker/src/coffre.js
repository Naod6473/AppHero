// Le coffre de Mamie (app 09) : on range ici une version CHIFFRÉE du coffre, rien d'autre.
// Le chiffrement et le déchiffrement se font sur le téléphone ; le serveur ne voit ni les mots de passe,
// ni les noms des sites, ni les membres. Pour modifier un coffre, il faut sa clé d'écriture
// (dérivée de la clé du coffre) : on n'en garde que l'empreinte.

const APP = "09";
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const HEX_RE = /^[a-f0-9]{64}$/;
const MAX_DOC = 300000; // ~ 300 Ko chiffrés : des centaines de fiches
const MAX_NEW_PER_NET = 20; // coffres créés par réseau et par jour
const MAX_WRITES_PER_NET = 600; // enregistrements par réseau et par jour

function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function validDoc(doc) {
  if (typeof doc !== "string" || doc.length < 20 || doc.length > MAX_DOC) return false;
  try {
    const d = JSON.parse(doc);
    return d && d.v === 1 && typeof d.iv === "string" && typeof d.ct === "string" && typeof d.salt === "string";
  } catch {
    return false;
  }
}

export async function coffre(request, env, now, route, h) {
  if (!h.released(APP, now) && !(await h.preview(request, env, now))) return h.json({ error: "L'app n'est pas encore sortie." }, 404);
  const day = h.parisDate(now);

  if (route === "POST /api/coffre") {
    const input = await h.readJson(request);
    if (!input || !validDoc(input.doc) || !HEX_RE.test(String(input.write || ""))) return h.json({ error: "Coffre invalide." }, 400);
    const { ipHash } = await h.ipHashFor(request, env, `coffre|${day}`);
    if ((await h.hit(env, day, `cn:${ipHash.slice(0, 24)}`)) > MAX_NEW_PER_NET)
      return h.json({ error: "Trop de coffres créés depuis ce réseau aujourd'hui." }, 429);
    const id = newId();
    await env.DB.prepare("INSERT INTO coffres (id, rev, doc, write_hash, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)")
      .bind(id, input.doc, await h.sha256(`coffre|${input.write}`), now, now).run();
    return h.json({ ok: true, id, rev: 1 });
  }

  // Les documents : un fichier chiffré par page (photo de CNI, de permis…).
  const mf = route.match(/^(GET|PUT|POST) \/api\/coffre\/([^/]+)\/f\/([a-f0-9]{16})(\/suppr)?$/);
  if (mf) return fichier(request, env, now, h, mf, day);

  const m = route.match(/^(GET|PUT) \/api\/coffre\/([^/]+)$/);
  if (!m || !ID_RE.test(m[2])) return h.json({ error: "Route inconnue." }, 404);
  const id = m[2];
  const row = await env.DB.prepare("SELECT rev, doc, write_hash FROM coffres WHERE id = ?").bind(id).first();
  if (!row) return h.json({ error: "Ce coffre n'existe pas." }, 404);

  if (m[1] === "GET") return h.json({ rev: row.rev, doc: row.doc });

  const input = await h.readJson(request);
  if (!input || !validDoc(input.doc) || !HEX_RE.test(String(input.write || "")) || !Number.isInteger(input.rev))
    return h.json({ error: "Requête invalide." }, 400);
  if ((await h.sha256(`coffre|${input.write}`)) !== row.write_hash) return h.json({ error: "Clé refusée." }, 403);
  const { ipHash } = await h.ipHashFor(request, env, `coffre|${day}`);
  if ((await h.hit(env, day, `cw:${ipHash.slice(0, 24)}`)) > MAX_WRITES_PER_NET)
    return h.json({ error: "Trop d'enregistrements aujourd'hui." }, 429);
  // Un autre membre a enregistré entre-temps : on renvoie sa version, l'appareil fusionne puis réessaie.
  // Changement de clé (un membre retiré) : la nouvelle clé d'écriture remplace l'ancienne.
  const nouvelle = input.newWrite == null ? null : String(input.newWrite);
  if (nouvelle != null && !HEX_RE.test(nouvelle)) return h.json({ error: "Requête invalide." }, 400);
  const res = nouvelle
    ? await env.DB.prepare("UPDATE coffres SET rev = rev + 1, doc = ?, write_hash = ?, updated_at = ? WHERE id = ? AND rev = ?")
      .bind(input.doc, await h.sha256(`coffre|${nouvelle}`), now, id, input.rev).run()
    : await env.DB.prepare("UPDATE coffres SET rev = rev + 1, doc = ?, updated_at = ? WHERE id = ? AND rev = ?")
      .bind(input.doc, now, id, input.rev).run();
  if (!res.meta?.changes) {
    const cur = await env.DB.prepare("SELECT rev, doc FROM coffres WHERE id = ?").bind(id).first();
    return h.json({ error: "conflit", rev: cur.rev, doc: cur.doc }, 409);
  }
  return h.json({ ok: true, rev: input.rev + 1 });
}

const MAX_FICHIER = 1500000; // ~ 1,1 Mo d'image une fois chiffrée et encodée
const MAX_FICHIERS = 120; // pages par coffre

async function fichier(request, env, now, h, m, day) {
  const [, method, id, fid, suppr] = m;
  if (!ID_RE.test(id)) return h.json({ error: "Route inconnue." }, 404);
  const row = await env.DB.prepare("SELECT write_hash FROM coffres WHERE id = ?").bind(id).first();
  if (!row) return h.json({ error: "Ce coffre n'existe pas." }, 404);
  if (method === "GET") {
    const f = await env.DB.prepare("SELECT data FROM coffre_fichiers WHERE coffre_id = ? AND fid = ?").bind(id, fid).first();
    return f ? h.json({ data: f.data }) : h.json({ error: "Document introuvable." }, 404);
  }
  const input = await h.readJson(request);
  if (!input || !HEX_RE.test(String(input.write || ""))) return h.json({ error: "Requête invalide." }, 400);
  if ((await h.sha256(`coffre|${input.write}`)) !== row.write_hash) return h.json({ error: "Clé refusée." }, 403);
  if (method === "POST" && suppr) {
    await env.DB.prepare("DELETE FROM coffre_fichiers WHERE coffre_id = ? AND fid = ?").bind(id, fid).run();
    return h.json({ ok: true });
  }
  if (method !== "PUT" || suppr) return h.json({ error: "Route inconnue." }, 404);
  const data = input.data;
  if (typeof data !== "string" || data.length < 20 || data.length > MAX_FICHIER) return h.json({ error: "Document trop lourd." }, 400);
  try { const d = JSON.parse(data); if (typeof d.iv !== "string" || typeof d.ct !== "string") throw 0; } catch { return h.json({ error: "Document invalide." }, 400); }
  const { ipHash } = await h.ipHashFor(request, env, `coffre|${day}`);
  if ((await h.hit(env, day, `cf:${ipHash.slice(0, 24)}`)) > 300) return h.json({ error: "Trop d'envois aujourd'hui." }, 429);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM coffre_fichiers WHERE coffre_id = ?").bind(id).first();
  if ((n?.n || 0) >= MAX_FICHIERS) return h.json({ error: "Le coffre est plein (120 pages)." }, 400);
  await env.DB.prepare("INSERT INTO coffre_fichiers (coffre_id, fid, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (coffre_id, fid) DO UPDATE SET data = excluded.data")
    .bind(id, fid, data, now).run();
  return h.json({ ok: true });
}
