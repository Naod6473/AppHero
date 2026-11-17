-- Base D1 d'Apphéro. Rejouable sans risque (IF NOT EXISTS).

-- J'aime / Bof : une réaction par personne et par app, modifiable.
-- voter = identifiant aléatoire du cookie ; ip_hash = empreinte salée de l'IP, qui change chaque jour.
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

-- Jet Flight (app 30) : le classement des meilleurs scores. Initiales de 3 caractères, pas de compte.
-- ip_hash = empreinte salée de l'IP du jour, pour limiter les envois.
CREATE TABLE IF NOT EXISTS jet_scores (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jet_scores_rank ON jet_scores (score DESC);
CREATE INDEX IF NOT EXISTS jet_scores_ip ON jet_scores (ip_hash);
