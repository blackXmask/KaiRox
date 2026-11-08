//! Incident persistence.
//!
//! `origin` is enforced NOT NULL by the schema. A simulated incident must
//! never be stored in a way that lets it be displayed as a real one.

use crate::storage::rows::IncidentRow;
use crate::storage::StorageError;
use rusqlite::{Connection, OptionalExtension, Row};

const COLUMNS: &str = "incident_id, schema_version, display_id, title, status, risk_level, \
                       first_seen, last_seen, category, attribution, detection_rule, \
                       classification, canary_id, path, node_id, summary, origin";

const UPSERT: &str = "INSERT INTO incidents \
    (incident_id, schema_version, display_id, title, status, risk_level, first_seen, \
     last_seen, category, attribution, detection_rule, classification, canary_id, path, \
     node_id, summary, origin) \
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17) \
    ON CONFLICT(incident_id) DO UPDATE SET \
        title = excluded.title, \
        status = excluded.status, \
        risk_level = excluded.risk_level, \
        first_seen = excluded.first_seen, \
        last_seen = excluded.last_seen, \
        category = excluded.category, \
        attribution = excluded.attribution, \
        detection_rule = excluded.detection_rule, \
        classification = excluded.classification, \
        canary_id = excluded.canary_id, \
        path = excluded.path, \
        node_id = excluded.node_id, \
        summary = excluded.summary, \
        origin = excluded.origin";

pub struct IncidentRepo<'c> {
    conn: &'c Connection,
}

impl<'c> IncidentRepo<'c> {
    pub fn new(conn: &'c Connection) -> Self {
        Self { conn }
    }

    /// Insert or update an incident.
    ///
    /// Re-reporting the same incident extends `last_seen` rather than
    /// duplicating the row, which is what the timeline view expects.
    pub fn upsert(&self, incident: &IncidentRow) -> Result<(), StorageError> {
        self.conn.execute(
            UPSERT,
            rusqlite::params![
                incident.incident_id,
                incident.schema_version,
                incident.display_id,
                incident.title,
                incident.status,
                incident.risk_level,
                incident.first_seen,
                incident.last_seen,
                incident.category,
                incident.attribution,
                incident.detection_rule,
                incident.classification,
                incident.canary_id,
                incident.path,
                incident.node_id,
                incident.summary,
                incident.origin,
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, incident_id: &str) -> Result<Option<IncidentRow>, StorageError> {
        let sql = format!("SELECT {COLUMNS} FROM incidents WHERE incident_id = ?1");
        let mut stmt = self.conn.prepare(&sql)?;
        let row = stmt
            .query_row(rusqlite::params![incident_id], IncidentRow::from_row)
            .optional()?;
        Ok(row)
    }

    /// Most recent incidents, newest first.
    pub fn recent(&self, limit: u32, offset: u32) -> Result<Vec<IncidentRow>, StorageError> {
        let sql = format!(
            "SELECT {COLUMNS} FROM incidents ORDER BY first_seen DESC LIMIT ?1 OFFSET ?2"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![limit, offset], IncidentRow::from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Filter by status and/or minimum risk. `min_risk` uses the wire order
    /// critical > high > medium > low.
    pub fn filtered(
        &self,
        status: Option<&str>,
        min_risk: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<IncidentRow>, StorageError> {
        let mut sql = format!("SELECT {COLUMNS} FROM incidents WHERE 1 = 1");
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(status) = status {
            sql.push_str(" AND status = ?");
            args.push(Box::new(status.to_string()));
        }
        if let Some(risk) = min_risk {
            // Rank on the wire ordering rather than alphabetical order.
            sql.push_str(" AND CASE risk_level WHEN 'critical' THEN 4 WHEN 'high' THEN 3 \
                          WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END >= \
                          CASE ? WHEN 'critical' THEN 4 WHEN 'high' THEN 3 \
                          WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END");
            args.push(Box::new(risk.to_string()));
        }

        sql.push_str(" ORDER BY first_seen DESC LIMIT ? OFFSET ?");
        args.push(Box::new(limit));
        args.push(Box::new(offset));

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(args.iter()), IncidentRow::from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn count(&self) -> Result<u64, StorageError> {
        let total: i64 = self.conn.query_row("SELECT COUNT(*) FROM incidents", [], |r| r.get(0))?;
        Ok(total.max(0) as u64)
    }

    /// Transition an incident's status. Returns false when the id is unknown.
    pub fn set_status(&self, incident_id: &str, status: &str) -> Result<bool, StorageError> {
        let changed = self.conn.execute(
            "UPDATE incidents SET status = ?1 WHERE incident_id = ?2",
            rusqlite::params![status, incident_id],
        )?;
        Ok(changed > 0)
    }

    /// Incidents linked to a canary, for the canary detail panel.
    pub fn for_canary(&self, canary_id: &str) -> Result<Vec<IncidentRow>, StorageError> {
        let sql = format!(
            "SELECT {COLUMNS} FROM incidents WHERE canary_id = ?1 ORDER BY first_seen DESC"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![canary_id], IncidentRow::from_row)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }
}

impl IncidentRow {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            incident_id: row.get(0)?,
            schema_version: row.get(1)?,
            display_id: row.get(2)?,
            title: row.get(3)?,
            status: row.get(4)?,
            risk_level: row.get(5)?,
            first_seen: row.get(6)?,
            last_seen: row.get(7)?,
            category: row.get(8)?,
            attribution: row.get(9)?,
            detection_rule: row.get(10)?,
            classification: row.get(11)?,
            canary_id: row.get(12)?,
            path: row.get(13)?,
            node_id: row.get(14)?,
            summary: row.get(15)?,
            origin: row.get(16)?,
        })
    }
}
