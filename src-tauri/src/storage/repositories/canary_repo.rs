//! Canary persistence.
//!
//! `origin` is enforced NOT NULL by the schema. A demo canary must never be
//! displayed as a real monitored file - this is a project-level rule, not a
//! display preference.

use crate::storage::rows::CanaryRow;
use crate::storage::StorageError;
use rusqlite::{Connection, OptionalExtension, Row};

const COLUMNS: &str = "canary_id, schema_version, display_id, canary_path, created_at, \
                       status, origin, name, volume, \"type\", last_trigger, \
                       trigger_count, node_id";

const UPSERT: &str = "INSERT INTO canaries \
    (canary_id, schema_version, display_id, canary_path, created_at, status, origin, \
     name, volume, \"type\", last_trigger, trigger_count, node_id) \
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) \
    ON CONFLICT(canary_id) DO UPDATE SET \
        display_id = excluded.display_id, \
        canary_path = excluded.canary_path, \
        created_at = excluded.created_at, \
        status = excluded.status, \
        origin = excluded.origin, \
        name = excluded.name, \
        volume = excluded.volume, \
        \"type\" = excluded.\"type\", \
        last_trigger = excluded.last_trigger, \
        trigger_count = excluded.trigger_count, \
        node_id = excluded.node_id";

pub struct CanaryRepo<'c> {
    conn: &'c Connection,
}

impl<'c> CanaryRepo<'c> {
    pub fn new(conn: &'c Connection) -> Self {
        Self { conn }
    }

    pub fn upsert(&self, canary: &CanaryRow) -> Result<(), StorageError> {
        self.conn.execute(
            UPSERT,
            rusqlite::params![
                canary.canary_id,
                canary.schema_version,
                canary.display_id,
                canary.canary_path,
                canary.created_at,
                canary.status,
                canary.origin,
                canary.name,
                canary.volume,
                canary.kind,
                canary.last_trigger,
                canary.trigger_count,
                canary.node_id,
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, canary_id: &str) -> Result<Option<CanaryRow>, StorageError> {
        let sql = format!("SELECT {COLUMNS} FROM canaries WHERE canary_id = ?1");
        let mut stmt = self.conn.prepare(&sql)?;
        let row = stmt
            .query_row(rusqlite::params![canary_id], CanaryRow::from_row)
            .optional()?;
        Ok(row)
    }

    /// Look up by display label (`CAN-001`). Returns None for live canaries
    /// that only have a uuid.
    pub fn by_display_id(&self, display_id: &str) -> Result<Option<CanaryRow>, StorageError> {
        let sql = format!("SELECT {COLUMNS} FROM canaries WHERE display_id = ?1");
        let mut stmt = self.conn.prepare(&sql)?;
        let row = stmt
            .query_row(rusqlite::params![display_id], CanaryRow::from_row)
            .optional()?;
        Ok(row)
    }

    /// All canaries ordered by creation time.
    pub fn all(&self) -> Result<Vec<CanaryRow>, StorageError> {
        let sql = format!("SELECT {COLUMNS} FROM canaries ORDER BY created_at ASC");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([], CanaryRow::from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn count_by_origin(&self) -> Result<Vec<(String, u64)>, StorageError> {
        let mut stmt = self
            .conn
            .prepare("SELECT origin, COUNT(*) FROM canaries GROUP BY origin ORDER BY origin")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?.max(0) as u64))
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn set_status(&self, canary_id: &str, status: &str) -> Result<bool, StorageError> {
        let changed = self.conn.execute(
            "UPDATE canaries SET status = ?1 WHERE canary_id = ?2",
            rusqlite::params![status, canary_id],
        )?;
        Ok(changed > 0)
    }

    /// Record a trigger. Only ever called for canaries with `origin = 'real'`;
    /// demo canaries must not accumulate trigger counts that look like real
    /// telemetry.
    pub fn record_trigger(&self, canary_id: &str, at_iso: &str) -> Result<bool, StorageError> {
        let changed = self.conn.execute(
            "UPDATE canaries \
             SET status = 'triggered', last_trigger = ?1, trigger_count = trigger_count + 1 \
             WHERE canary_id = ?2 AND origin = 'real'",
            rusqlite::params![at_iso, canary_id],
        )?;
        Ok(changed > 0)
    }
}

impl CanaryRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            canary_id: row.get(0)?,
            schema_version: row.get(1)?,
            display_id: row.get(2)?,
            canary_path: row.get(3)?,
            created_at: row.get(4)?,
            status: row.get(5)?,
            origin: row.get(6)?,
            name: row.get(7)?,
            volume: row.get(8)?,
            kind: row.get(9)?,
            last_trigger: row.get(10)?,
            trigger_count: row.get(11)?,
            node_id: row.get(12)?,
        })
    }
}
