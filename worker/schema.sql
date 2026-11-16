-- Base D1 d'Apphéro. Rejouable sans risque (IF NOT EXISTS).

-- Un vote par personne et par jour (jour de Paris).
-- voter = identifiant anonyme du cookie ; ip_hash = empreinte de l'IP salée, qui change chaque jour.
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY,
  app TEXT NOT NULL,
  day TEXT NOT NULL,
  voter TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (day, voter)
);
CREATE INDEX IF NOT EXISTS votes_app ON votes (app);
CREATE INDEX IF NOT EXISTS votes_created ON votes (created_at);
CREATE INDEX IF NOT EXISTS votes_day_ip ON votes (day, ip_hash);

-- Compteurs agrégés, pour que les classements ne relisent jamais toute la table des votes.
-- kind = 'vote' ou 'view' ; bucket = 'ALL' (tout le défi) ou l'identifiant de semaine (S1 à S5).
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
