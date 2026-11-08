//! Event persistence.
//!
//! Writes are batched inside a single transaction: at ransomware burst rates
//! a per-row commit would fsync once per event and destroy throughput.
//!
//! Duplicate ids are skipped via `ON CONFLICT(event_id) DO NOTHING` so retries
//! across the JSONL boundary are safe. Note this is deliberately *not*
//! `INSERT OR IGNORE`: that would also swallow CHECK violations, silently
//! dropping events with an unknown `source` or `event_type`. Bad data must
//! surface as an error, not vanish.

use crate::storage::database::in_transaction;
use crate::storage::rows::EventRow;
use crate::storage::StorageError;
use rusqlite::{Connection, Row};

const COLUMNS: &str = "event_id, schema_version, timestamp, event_type, file_path, \
                       old_path, process_pid, process_name, source, size_bytes, \
                       window_start, window_end, ingested_at";

const INSERT: &str = "INSERT INTO events \
    (event_id, schema_version, timestamp, event_type, file_path, old_path, \
     process_pid, process_name, source, size_bytes, window_start, window_end, ingested_at) \
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) \
    ON CONFLICT(event_id) DO NOTHING";

pub struct EventRepo<'c> {
    conn: &'c Connection,
}

impl<'c> EventRepo<'c> {
    pub fn new(conn: &'c Connection) -> Self {
        Self { conn }
    }

    /// Insert a window of events atomically. Returns how many rows were new.
    pub fn insert_batch(&self, events: &[EventRow]) -> Result<usize, StorageError> {
        if events.is_empty() {
            return Ok(0);
        }

        in_transaction(self.conn, |conn| {
            let mut inserted = 0usize;
            {
                let mut stmt = conn.prepare(INSERT)?;
                for event in events {
                    inserted += stmt.execute(rusqlite::params![
                        event.event_id,
                        event.schema_version,
                        event.timestamp,
                        event.event_type,
                        event.file_path,
                        event.old_path,
                        event.process_pid,
                        event.process_name,
                        event.source,
                        event.size_bytes,
                        event.window_start,
                        event.window_end,
                        event.ingested_at,
                    ])?;
                }
            }
            Ok(inserted)
        })
    }

    /// Most recent events, newest first.
    pub fn recent(&self, limit: u32, offset: u32) -> Result<Vec<EventRow>, StorageError> {
        let sql = format!("SELECT {COLUMNS} FROM events ORDER BY timestamp DESC, rowid DESC LIMIT ?1 OFFSET ?2");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![limit, offset], EventRow::from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Total stored events.
    pub fn count(&self) -> Result<u64, StorageError> {
        let total: i64 = self.conn.query_row("SELECT COUNT(*) FROM events", [], |r| r.get(0))?;
        Ok(total.max(0) as u64)
    }

    /// Events observed at or after `since_iso` (ISO-8601 UTC).
    pub fn count_since(&self, since_iso: &str) -> Result<u64, StorageError> {
        let total: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM events WHERE timestamp >= ?1",
            rusqlite::params![since_iso],
            |r| r.get(0),
        )?;
        Ok(total.max(0) as u64)
    }

    /// Per-source counts. Used to show `simulation` vs `windows_collector`
    /// volumes so the dashboard never implies live coverage it does not have.
    pub fn count_by_source(&self) -> Result<Vec<(String, u64)>, StorageError> {
        let mut stmt = self
            .conn
            .prepare("SELECT source, COUNT(*) FROM events GROUP BY source ORDER BY source")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?.max(0) as u64))
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Retention helper: drop events older than `before_iso`.
    pub fn delete_before(&self, before_iso: &str) -> Result<usize, StorageError> {
        let deleted = self.conn.execute(
            "DELETE FROM events WHERE timestamp < ?1",
            rusqlite::params![before_iso],
        )?;
        Ok(deleted)
    }
}

impl EventRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            event_id: row.get(0)?,
            schema_version: row.get(1)?,
            timestamp: row.get(2)?,
            event_type: row.get(3)?,
            file_path: row.get(4)?,
            old_path: row.get(5)?,
            process_pid: row.get(6)?,
            process_name: row.get(7)?,
            source: row.get(8)?,
            size_bytes: row.get(9)?,
            window_start: row.get(10)?,
            window_end: row.get(11)?,
            ingested_at: row.get(12)?,
        })
    }
}
