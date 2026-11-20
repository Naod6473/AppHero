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

-- Préavis (app 11) : des paris pour rire sur l'actualité sociale, en « pavés » fictifs. Aucun argent.
-- Joueurs. key = empreinte (SHA-256) du secret gardé dans le cookie pv_id : le secret n'est pas en base.
-- balance = pavés disponibles, staked = pavés engagés dans des paris pas encore tranchés,
-- mood = somme des mises pondérées par la « grogne » de l'issue choisie (pour le titre du joueur),
-- ip_hash = empreinte salée du réseau le jour de l'inscription (limite les comptes créés en série).
CREATE TABLE IF NOT EXISTS pv_players (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL,
  staked INTEGER NOT NULL DEFAULT 0,
  fortune INTEGER GENERATED ALWAYS AS (balance + staked) VIRTUAL,
  wagered INTEGER NOT NULL DEFAULT 0,
  mood INTEGER NOT NULL DEFAULT 0,
  settled INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  bonus_day TEXT,
  banned INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pv_players_rank ON pv_players (fortune DESC);

-- Les paris. status = draft (brouillon), open (ouvert, puis « clos » une fois closes_at passé),
-- resolved (tranché, winner = index de l'issue gagnante) ou void (annulé, tout le monde remboursé).
-- hist = la courbe des cagnottes, en JSON : [[instant, [cagnotte de chaque issue]], …].
CREATE TABLE IF NOT EXISTS pv_markets (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  cat TEXT NOT NULL,
  title TEXT NOT NULL,
  rules TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  closes_at INTEGER NOT NULL,
  resolve_by INTEGER,
  winner INTEGER,
  verdict TEXT,
  source TEXT,
  month TEXT,
  resolved_at INTEGER,
  bettors INTEGER NOT NULL DEFAULT 0,
  hist TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Les issues d'un pari. seed = la mise de la maison (fixe les cotes de départ), pool = les mises des joueurs,
-- grogne = de -100 (tout va bien) à +100 (ça chauffe), pour le grognomètre.
CREATE TABLE IF NOT EXISTS pv_outcomes (
  market TEXT NOT NULL,
  idx INTEGER NOT NULL,
  label TEXT NOT NULL,
  seed INTEGER NOT NULL,
  pool INTEGER NOT NULL DEFAULT 0,
  grogne INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (market, idx)
);

-- Une ligne par mise. payout = ce qu'elle a rapporté une fois le pari tranché (NULL tant qu'il ne l'est pas).
CREATE TABLE IF NOT EXISTS pv_bets (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  market TEXT NOT NULL,
  player INTEGER NOT NULL,
  outcome INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  payout INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pv_bets_market ON pv_bets (market, player);
CREATE INDEX IF NOT EXISTS pv_bets_player ON pv_bets (player, market);

-- Gains et pertes de chaque joueur par mois (mois du verdict), pour le classement du mois.
CREATE TABLE IF NOT EXISTS pv_gains (
  month TEXT NOT NULL,
  player INTEGER NOT NULL,
  profit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, player)
);
CREATE INDEX IF NOT EXISTS pv_gains_rank ON pv_gains (month, profit DESC);

-- Réglages (les paris de départ ont-ils été inscrits ?) et journal des gestes de l'arbitre.
CREATE TABLE IF NOT EXISTS pv_meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pv_log (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  action TEXT NOT NULL,
  market TEXT,
  data TEXT
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

-- Compteurs du jour par réseau (empreinte) : plafond de la mesure d'audience, essais de code organisateur.
-- On n'en garde que 2 jours.
CREATE TABLE IF NOT EXISTS quota (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);
