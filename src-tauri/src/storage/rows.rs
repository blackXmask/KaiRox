//! Storage row types.
//!
//! These mirror `schemas/*.schema.json` field-for-field. They are deliberately
//! plain: no serde annotations for the wire, no UI display formatting.
//! Conversion to wire DTOs and to frontend display types happens at the
//! boundaries (`services/` and the TypeScript adapter respectively).

/// `schemas/event.schema.json`
#[derive(Debug, Clone, PartialEq)]
pub struct EventRow {
    pub event_id: String,
    pub schema_version: i64,
    pub timestamp: String,
    pub event_type: String,
    pub file_path: String,
    pub old_path: Option<String>,
    pub process_pid: Option<i64>,
    pub process_name: Option<String>,
    pub source: String,
    pub size_bytes: Option<i64>,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    pub ingested_at: String,
}

/// `schemas/detection.schema.json`
#[derive(Debug, Clone, PartialEq)]
pub struct DetectionRow {
    pub detection_id: String,
    pub schema_version: i64,
    pub timestamp: String,
    pub risk_level: String,
    pub score: i64,
    pub reason: String,
    pub engine: String,
    pub model_version: String,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    /// Populated from `related_event_ids`; written through `detection_events`.
    pub related_event_ids: Vec<String>,
}

/// `schemas/incident.schema.json`
#[derive(Debug, Clone, PartialEq)]
pub struct IncidentRow {
    pub incident_id: String,
    pub schema_version: i64,
    /// Human-readable label shown in the UI (`INC-001`). Nullable: live
    /// incidents may only have the uuid.
    pub display_id: Option<String>,
    pub title: String,
    pub status: String,
    pub risk_level: String,
    pub first_seen: String,
    pub last_seen: String,
    pub category: Option<String>,
    pub attribution: Option<String>,
    pub detection_rule: Option<String>,
    pub classification: Option<String>,
    pub canary_id: Option<String>,
    pub path: Option<String>,
    pub node_id: Option<String>,
    pub summary: Option<String>,
    /// `demo` or `real`. NOT NULL by design: a simulated incident must never
    /// be presented as a real one.
    pub origin: String,
}

/// `schemas/canary.schema.json`
#[derive(Debug, Clone, PartialEq)]
pub struct CanaryRow {
    pub canary_id: String,
    pub schema_version: i64,
    /// Human-readable label shown in the UI (`CAN-001`). Nullable.
    pub display_id: Option<String>,
    pub canary_path: String,
    pub created_at: String,
    pub status: String,
    /// `demo` or `real`. NOT NULL by design.
    pub origin: String,
    pub name: Option<String>,
    pub volume: Option<String>,
    pub kind: Option<String>,
    pub last_trigger: Option<String>,
    pub trigger_count: i64,
    pub node_id: Option<String>,
}

// `schemas/error.schema.json` is already shaped for the wire by `StorageError`.
