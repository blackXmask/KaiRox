-- KAIROX storage schema v1
-- Mirrors schemas/*.schema.json. Contract source of truth lives in schemas/.

CREATE TABLE IF NOT EXISTS events (
  event_id       TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  timestamp      TEXT NOT NULL,                 -- ISO-8601 UTC
  event_type     TEXT NOT NULL CHECK (event_type IN
                   ('file_created','file_modified','file_deleted','file_renamed','directory_changed')),
  file_path      TEXT NOT NULL,
  old_path       TEXT,                          -- only set for file_renamed
  process_pid    INTEGER,                       -- nullable: ReadDirectoryChangesW exposes no PID
  process_name   TEXT,
  source         TEXT NOT NULL CHECK (source IN ('windows_collector','simulation')),
  size_bytes     INTEGER,                       -- nullable: unknown on file_deleted
  window_start   TEXT,
  window_end     TEXT,
  ingested_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp    ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type_time    ON events(event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_path         ON events(file_path);
CREATE INDEX IF NOT EXISTS idx_events_source_time  ON events(source, timestamp);

CREATE TABLE IF NOT EXISTS detections (
  detection_id   TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  timestamp      TEXT NOT NULL,
  risk_level     TEXT NOT NULL CHECK (risk_level IN ('critical','high','medium','low','info')),
  score          INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  reason         TEXT NOT NULL,
  engine         TEXT NOT NULL,
  model_version  TEXT NOT NULL,
  window_start   TEXT,
  window_end     TEXT
);

CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp);
CREATE INDEX IF NOT EXISTS idx_detections_risk      ON detections(risk_level, timestamp);

-- A detection cites events; an event may feed several detections.
CREATE TABLE IF NOT EXISTS detection_events (
  detection_id TEXT NOT NULL REFERENCES detections(detection_id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL REFERENCES events(event_id)         ON DELETE CASCADE,
  PRIMARY KEY (detection_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_detection_events_event ON detection_events(event_id);

CREATE TABLE IF NOT EXISTS incidents (
  incident_id     TEXT PRIMARY KEY,
  schema_version  INTEGER NOT NULL,
  display_id      TEXT,                          -- human-readable label shown in the UI (INC-001)
  title           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('open','investigating','resolved')),
  risk_level      TEXT NOT NULL CHECK (risk_level IN ('critical','high','medium','low')),
  first_seen      TEXT NOT NULL,
  last_seen       TEXT NOT NULL,
  category        TEXT,
  attribution     TEXT,
  detection_rule  TEXT,
  classification  TEXT,
  canary_id       TEXT,
  path            TEXT,
  node_id         TEXT,
  summary         TEXT,
  origin          TEXT NOT NULL CHECK (origin IN ('demo','real')),
  CHECK (last_seen >= first_seen)
);

CREATE INDEX IF NOT EXISTS idx_incidents_first_seen ON incidents(first_seen);
CREATE INDEX IF NOT EXISTS idx_incidents_risk       ON incidents(risk_level, first_seen);
CREATE INDEX IF NOT EXISTS idx_incidents_status     ON incidents(status, first_seen);

CREATE TABLE IF NOT EXISTS canaries (
  canary_id      TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  display_id     TEXT,                          -- human-readable label shown in the UI (CAN-001)
  canary_path    TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('active','triggered','missing')),
  origin         TEXT NOT NULL CHECK (origin IN ('demo','real')),
  name           TEXT,
  volume         TEXT,
  type           TEXT,
  last_trigger   TEXT,                          -- nullable: never triggered
  trigger_count  INTEGER NOT NULL DEFAULT 0 CHECK (trigger_count >= 0),
  node_id        TEXT
);

CREATE INDEX IF NOT EXISTS idx_canaries_status ON canaries(status);
CREATE INDEX IF NOT EXISTS idx_canaries_path   ON canaries(canary_path);
