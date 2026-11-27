-- Base D1 d'Apphéro. Rejouable sans risque (IF NOT EXISTS).

-- J'aime / Bof : une réaction par personne et par app, modifiable.
-- voter = identifiant aléatoire du cookie ; ip_hash = empreinte salée du réseau, propre à chaque app
-- (ou à chaque scrutin) : elle ne permet pas de rapprocher deux apps entre elles.
CREATE TABLE IF NOT EXISTS reactions (
  app TEXT NOT NULL,
  voter TEXT NOT NULL,
  value INTEGER NOT NULL, -- 1 = j'aime, -1 = bof
  ip_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (app, voter)
);
CREATE INDEX IF NOT EXISTS reactions_ip ON reactions (ip_hash, updated_at);

-- Votes de la semaine et de la finale : une voix par personne et par scrutin.
CREATE TABLE IF NOT EXISTS ballot_votes (
  ballot TEXT NOT NULL,
  voter TEXT NOT NULL,
  app TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (ballot, voter)
);
CREATE INDEX IF NOT EXISTS ballot_votes_ip ON ballot_votes (ballot, ip_hash);

-- Compteurs agrégés, pour que les classements ne relisent jamais toute la table des votes.
-- kind = 'like', 'bof', 'view' (bucket 'ALL') ou 'ballot' (bucket = S1 à S5, F).
CREATE TABLE IF NOT EXISTS tallies (
  kind TEXT NOT NULL,
  bucket TEXT NOT NULL,
  app TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, bucket, app)
);
CREATE INDEX IF NOT EXISTS tallies_rank ON tallies (kind, bucket, n DESC);

-- Tirages de la roue : les 20 critères affichés, l'index tiré, et l'idée d'app si l'IA en a fourni une.
CREATE TABLE IF NOT EXISTS draws (
  id INTEGER PRIMARY KEY,
  for_day TEXT NOT NULL UNIQUE,
  slices TEXT NOT NULL,
  k INTEGER NOT NULL,
  label TEXT NOT NULL,
  idea TEXT,
  created_at INTEGER NOT NULL
);

-- Sukkel (app 03) : une ligne par appui sur la touche Espace. ms = durée tenue (mesurée par le serveur),
-- beat_at = dernier signe de vie pendant l'appui, name = pseudo si la personne s'inscrit au tableau.
CREATE TABLE IF NOT EXISTS sukkel_runs (
  id TEXT PRIMARY KEY,
  provider TEXT,
  ip_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  beat_at INTEGER NOT NULL,
  ended_at INTEGER,
  ms INTEGER,
  name TEXT
);
CREATE INDEX IF NOT EXISTS sukkel_runs_ms ON sukkel_runs (ms DESC);
CREATE INDEX IF NOT EXISTS sukkel_runs_ip ON sukkel_runs (ip_hash);

-- Mesure d'audience maison, sans cookie. Une ligne par événement.
-- visitor = empreinte de (sel secret, jour, IP, navigateur) : elle change chaque jour,
-- on ne peut ni remonter à l'IP ni suivre quelqu'un d'un jour à l'autre.
CREATE TABLE IF NOT EXISTS events (
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  visitor TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  app TEXT,
  props TEXT,
  country TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  lang TEXT,
  ref TEXT
);
CREATE INDEX IF NOT EXISTS events_day ON events (day, name);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);

-- Visiteurs déjà comptés aujourd'hui (empreinte du jour), pour le compteur public.
-- On n'en garde que 2 jours.
CREATE TABLE IF NOT EXISTS seen (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (day, visitor)
);

-- Le critère tiré au sort pour chaque case (une ligne par app, 01 à 30), révélé au lancement.
-- data = {"key": "langage", "detail": "Rust", "extra": [{"key": "...", "detail": null}]}
CREATE TABLE IF NOT EXISTS criteria (
  day TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Compteurs du jour par réseau (empreinte) : plafond de la mesure d'audience, essais de code organisateur.
-- On n'en garde que 2 jours.
CREATE TABLE IF NOT EXISTS quota (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

-- Bubble (app 04) : une ligne par partie envoyée au classement. ms = cri le plus long (millisecondes),
-- lvl = niveau atteint, dur = durée de la partie (secondes). ip_hash = empreinte salée du réseau, propre à Bubble.
CREATE TABLE IF NOT EXISTS bubble_scores (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  ms INTEGER NOT NULL,
  lvl INTEGER NOT NULL,
  dur INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bubble_scores_rank ON bubble_scores (ms DESC);

-- Le coffre de Mamie (app 09) : un coffre à mots de passe partagé en famille.
-- doc = le coffre CHIFFRÉ sur l'appareil (AES-GCM) : le serveur ne peut pas le lire.
-- write_hash = empreinte de la clé d'écriture, dérivée de la clé du coffre : seul un membre peut modifier.
CREATE TABLE IF NOT EXISTS coffres (
  id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  doc TEXT NOT NULL,
  write_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Le coffre de Mamie : les documents (photos de CNI, permis…), chiffrés sur l'appareil comme le coffre.
CREATE TABLE IF NOT EXISTS coffre_fichiers (
  coffre_id TEXT NOT NULL,
  fid TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (coffre_id, fid)
);

-- Pile 10 (app 10) : une ligne par essai envoyé au classement du jour. ms = temps appuyé (millisecondes),
-- gap = écart à 10 000 ms, day = date de Paris. ip_hash = empreinte salée du réseau, propre à Pile 10.
CREATE TABLE IF NOT EXISTS pile10_scores (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  ms INTEGER NOT NULL,
  gap INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pile10_scores_day ON pile10_scores (day, gap);
