//! Detection persistence, including the `detection_events` join that makes
//! `related_event_ids` queryable in both directions.

use crate::storage::database::in_transaction;
use crate::storage::rows::DetectionRow;
use crate::storage::StorageError;
use rusqlite::{Connection, Row};

const COLUMNS: &str = "detection_id, schema_version, timestamp, risk_level, score, \
                       reason, engine, model_version, window_start, window_end";

const INSERT: &str = "INSERT INTO detections \
    (detection_id, schema_version, timestamp, risk_level, score, reason, engine, \
     model_version, window_start, window_end) \
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
    ON CONFLICT(detection_id) DO NOTHING";

const LINK: &str = "INSERT OR IGNORE INTO detection_events (detection_id, event_id) VALUES (?1, ?2)";

pub struct DetectionRepo<'c> {
    conn: &'c Connection,
}

impl<'c> DetectionRepo<'c> {
    pub fn new(conn: &'c Connection) -> Self {
        Self { conn }
    }

    /// Insert a detection and its event links atomically.
    ///
    /// Event links are best-effort: a detection citing an event that has not
    /// been persisted yet must not discard the detection itself.
    pub fn insert(&self, detection: &DetectionRow) -> Result<bool, StorageError> {
        in_transaction(self.conn, |conn| {
            let inserted = conn.execute(
                INSERT,
                rusqlite::params![
                    detection.detection_id,
                    detection.schema_version,
                    detection.timestamp,
                    detection.risk_level,
                    detection.score,
                    detection.reason,
                    detection.engine,
                    detection.model_version,
                    detection.window_start,
                    detection.window_end,
                ],
            )?;

            if inserted == 0 {
                return Ok(false);
            }

            {
                let mut link = conn.prepare(LINK)?;
                for event_id in &detection.related_event_ids {
                    // Ignore dangling references rather than failing the write.
                    let _ = link.execute(rusqlite::params![detection.detection_id, event_id]);
                }
            }

            Ok(true)
        })
    }

    /// Most recent detections, newest first.
    pub fn recent(&self, limit: u32, offset: u32) -> Result<Vec<DetectionRow>, StorageError> {
        let sql = format!(
            "SELECT {COLUMNS} FROM detections ORDER BY timestamp DESC, rowid DESC LIMIT ?1 OFFSET ?2"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![limit, offset], DetectionRow::from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn count(&self) -> Result<u64, StorageError> {
        let total: i64 = self.conn.query_row("SELECT COUNT(*) FROM detections", [], |r| r.get(0))?;
        Ok(total.max(0) as u64)
    }

    /// Highest-risk detections first, for the dashboard's alert list.
    pub fn top_by_score(&self, limit: u32) -> Result<Vec<DetectionRow>, StorageError> {
        let sql = format!(
            "SELECT {COLUMNS} FROM detections ORDER BY score DESC, timestamp DESC LIMIT ?1"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![limit], DetectionRow::from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Event ids cited by a detection (`related_event_ids`).
    pub fn related_event_ids(&self, detection_id: &str) -> Result<Vec<String>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT event_id FROM detection_events WHERE detection_id = ?1 ORDER BY event_id",
        )?;
        let rows = stmt.query_map(rusqlite::params![detection_id], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Detections that cited a given event (reverse lookup for the timeline).
    pub fn detection_ids_for_event(&self, event_id: &str) -> Result<Vec<String>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT detection_id FROM detection_events WHERE event_id = ?1 ORDER BY detection_id",
        )?;
        let rows = stmt.query_map(rusqlite::params![event_id], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Latest detection timestamp, for the dashboard's "last detection" readout.
    pub fn latest_timestamp(&self) -> Result<Option<String>, StorageError> {
        let mut stmt = self
            .conn
            .prepare("SELECT timestamp FROM detections ORDER BY timestamp DESC LIMIT 1")?;
        let mut rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }
}

impl DetectionRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            detection_id: row.get(0)?,
            schema_version: row.get(1)?,
            timestamp: row.get(2)?,
            risk_level: row.get(3)?,
            score: row.get(4)?,
            reason: row.get(5)?,
            engine: row.get(6)?,
            model_version: row.get(7)?,
            window_start: row.get(8)?,
            window_end: row.get(9)?,
            related_event_ids: Vec::new(), // hydrated on demand
        })
    }
}
