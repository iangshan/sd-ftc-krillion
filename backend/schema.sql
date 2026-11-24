CREATE TABLE IF NOT EXISTS game_revisions (
  revision INTEGER PRIMARY KEY CHECK (revision >= 1),
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_scores (
  attempt_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  tier_id TEXT,
  tier_label TEXT,
  points INTEGER NOT NULL CHECK (points >= 0),
  PRIMARY KEY (attempt_id, revision, question_id)
);

CREATE TABLE IF NOT EXISTS scores (
  attempt_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  date TEXT NOT NULL,
  PRIMARY KEY (attempt_id, revision)
);

CREATE INDEX IF NOT EXISTS scores_revision_idx ON scores (revision);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_by_expiry ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_signin_attempts (
  attempt_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_signin_attempts_by_expiry ON admin_signin_attempts (expires_at);
