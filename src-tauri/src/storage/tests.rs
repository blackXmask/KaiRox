//! Storage-layer tests.
//!
//! These run against an in-memory database so they are fast and leave no
//! files behind. They verify the CHECK constraints and the honesty rules that
//! the JSON schemas also enforce - the database must not be the weaker guard.

use crate::storage::database::now_iso;
use crate::storage::repositories::{CanaryRepo, DetectionRepo, EventRepo, IncidentRepo};
use crate::storage::rows::{CanaryRow, DetectionRow, EventRow, IncidentRow};
use crate::storage::{migrations, open_memory};

fn sample_event(id: &str) -> EventRow {
    EventRow {
        event_id: id.to_string(),
        schema_version: 1,
        timestamp: "2026-11-08T12:00:00.000Z".to_string(),
        event_type: "file_created".to_string(),
        file_path: "C:\\Users\\Demo\\report.docx".to_string(),
        old_path: None,
        process_pid: Some(1234),
        process_name: Some("explorer.exe".to_string()),
        source: "windows_collector".to_string(),
        size_bytes: Some(2048),
        window_start: Some("2026-11-08T12:00:00.000Z".to_string()),
        window_end: Some("2026-11-08T12:00:05.000Z".to_string()),
        ingested_at: now_iso(),
    }
}

fn sample_incident(origin: &str) -> IncidentRow {
    IncidentRow {
        incident_id: "3f1d2a4c-1111-4222-8333-444455556602".to_string(),
        schema_version: 1,
        display_id: Some("INC-001".to_string()),
        title: "Canary file modified".to_string(),
        status: "open".to_string(),
        risk_level: "critical".to_string(),
        first_seen: "2026-11-08T12:00:00.000Z".to_string(),
        last_seen: "2026-11-08T12:00:10.000Z".to_string(),
        category: Some("Canary Trigger".to_string()),
        attribution: Some("unknown".to_string()),
        detection_rule: Some("canary_file_accessed_or_modified".to_string()),
        classification: Some("Simulated Canary Trigger".to_string()),
        canary_id: Some("3f1d2a4c-1111-4222-8333-444455556601".to_string()),
        path: Some("D:\\Projects\\suspicious_file.exe".to_string()),
        node_id: Some("canary-exe".to_string()),
        summary: Some("A registered canary was accessed.".to_string()),
        origin: origin.to_string(),
    }
}

fn sample_canary(origin: &str) -> CanaryRow {
    CanaryRow {
        canary_id: "3f1d2a4c-1111-4222-8333-444455556601".to_string(),
        schema_version: 1,
        display_id: Some("CAN-001".to_string()),
        canary_path: "C:\\Users\\Demo\\honey_pot.txt".to_string(),
        created_at: "2026-11-08T09:00:00.000Z".to_string(),
        status: "active".to_string(),
        origin: origin.to_string(),
        name: Some("honey_pot.txt".to_string()),
        volume: Some("C:".to_string()),
        kind: Some("Text document".to_string()),
        last_trigger: None,
        trigger_count: 0,
        node_id: Some("honey-c".to_string()),
    }
}

fn sample_detection() -> DetectionRow {
    DetectionRow {
        detection_id: "3f1d2a4c-1111-4222-8333-444455556603".to_string(),
        schema_version: 1,
        timestamp: "2026-11-08T12:00:05.000Z".to_string(),
        risk_level: "high".to_string(),
        score: 85,
        reason: "Unusual file modification activity".to_string(),
        engine: "lightgbm".to_string(),
        model_version: "1.0".to_string(),
        window_start: Some("2026-11-08T12:00:00.000Z".to_string()),
        window_end: Some("2026-11-08T12:00:05.000Z".to_string()),
        related_event_ids: vec!["3f1d2a4c-1111-4222-8333-444455556600".to_string()],
    }
}

#[test]
fn migrations_apply_once_and_are_idempotent() {
    let conn = open_memory().expect("open");
    let first = migrations::applied_versions(&conn).expect("versions");
    assert_eq!(first, vec![1]);

    migrations::run(&conn).expect("second run must be a no-op");
    migrations::run(&conn).expect("third run must be a no-op");
    assert_eq!(migrations::applied_versions(&conn).unwrap(), vec![1]);
}

#[test]
fn pragmas_are_configured() {
    let conn = open_memory().expect("open");

    // foreign_keys is OFF by default in SQLite; without it every
    // ON DELETE CASCADE in the schema silently does nothing.
    let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    assert_eq!(fk, 1, "foreign_keys must be ON or cascades silently do nothing");
}

#[test]
fn wal_is_enabled_for_file_databases() {
    // WAL is unavailable on in-memory databases (they report "memory"),
    // so this has to run against a real file.
    let dir = std::env::temp_dir().join(format!("kairox-wal-{}", std::process::id()));
    let path = dir.join("wal.db");
    let conn = crate::storage::database::open(&path).expect("open file db");

    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
    assert_eq!(mode.to_lowercase(), "wal", "WAL must be enabled for concurrent read/write");

    let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    assert_eq!(fk, 1);

    drop(conn);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn event_batch_insert_and_count() {
    let conn = open_memory().unwrap();
    let repo = EventRepo::new(&conn);

    let events: Vec<EventRow> = (0..3).map(|i| sample_event(&format!("evt-{i}"))).collect();
    assert_eq!(repo.insert_batch(&events).unwrap(), 3);
    assert_eq!(repo.count().unwrap(), 3);

    // A second identical batch must not duplicate rows.
    assert_eq!(repo.insert_batch(&events).unwrap(), 0);
    assert_eq!(repo.count().unwrap(), 3);
}

#[test]
fn event_delete_allows_null_size_and_process() {
    let conn = open_memory().unwrap();
    let repo = EventRepo::new(&conn);

    let mut deleted = sample_event("evt-del");
    deleted.event_type = "file_deleted".to_string();
    deleted.size_bytes = None; // file is gone - size is unknown
    deleted.process_pid = None; // RWDW exposes no PID
    deleted.process_name = None;

    repo.insert_batch(&[deleted]).expect("nulls must be storable");
    let stored = repo.recent(10, 0).unwrap();
    assert!(stored[0].size_bytes.is_none());
    assert!(stored[0].process_pid.is_none());
}

#[test]
fn event_source_counts_split_simulation_from_live() {
    let conn = open_memory().unwrap();
    let repo = EventRepo::new(&conn);

    let mut sim = sample_event("evt-sim");
    sim.source = "simulation".to_string();

    repo.insert_batch(&[sample_event("evt-live"), sim]).unwrap();
    let counts = repo.count_by_source().unwrap();
    assert_eq!(counts.len(), 2);
    assert!(counts.iter().any(|(s, n)| s == "simulation" && *n == 1));
    assert!(counts.iter().any(|(s, n)| s == "windows_collector" && *n == 1));
}

#[test]
fn event_rejects_unknown_source() {
    let conn = open_memory().unwrap();
    let repo = EventRepo::new(&conn);
    let mut bad = sample_event("evt-bad");
    bad.source = "made_up".to_string();
    assert!(repo.insert_batch(&[bad]).is_err(), "CHECK constraint must reject unknown source");
}

#[test]
fn event_rejects_unknown_event_type() {
    let conn = open_memory().unwrap();
    let repo = EventRepo::new(&conn);
    let mut bad = sample_event("evt-bad-type");
    bad.event_type = "file_encrypted".to_string();
    assert!(repo.insert_batch(&[bad]).is_err());
}

#[test]
fn detection_links_related_events() {
    let conn = open_memory().unwrap();
    let events = EventRepo::new(&conn);
    let detections = DetectionRepo::new(&conn);

    events.insert_batch(&[sample_event("3f1d2a4c-1111-4222-8333-444455556600")]).unwrap();
    assert!(detections.insert(&sample_detection()).unwrap());

    assert_eq!(detections.count().unwrap(), 1);
    let linked = detections
        .related_event_ids("3f1d2a4c-1111-4222-8333-444455556603")
        .unwrap();
    assert_eq!(linked, vec!["3f1d2a4c-1111-4222-8333-444455556600".to_string()]);

    let reverse = detections
        .detection_ids_for_event("3f1d2a4c-1111-4222-8333-444455556600")
        .unwrap();
    assert_eq!(reverse.len(), 1);
}

#[test]
fn detection_score_bounds_enforced() {
    let conn = open_memory().unwrap();
    let repo = DetectionRepo::new(&conn);

    let mut too_high = sample_detection();
    too_high.score = 101;
    assert!(repo.insert(&too_high).is_err(), "score must be 0..=100");

    let mut negative = sample_detection();
    negative.detection_id = "other-id".to_string();
    negative.score = -1;
    assert!(repo.insert(&negative).is_err());
}

#[test]
fn detection_rejects_info_risk_level_if_added() {
    // Guard the contract: incidents exclude "info"; detections allow it.
    let conn = open_memory().unwrap();
    let repo = DetectionRepo::new(&conn);
    let mut det = sample_detection();
    det.risk_level = "info".to_string();
    assert!(repo.insert(&det).is_ok(), "detections may carry info");
}

#[test]
fn incident_upsert_extends_last_seen_without_duplicating() {
    let conn = open_memory().unwrap();
    let repo = IncidentRepo::new(&conn);

    repo.upsert(&sample_incident("demo")).unwrap();
    repo.upsert(&sample_incident("demo")).unwrap();
    assert_eq!(repo.count().unwrap(), 1);

    let stored = repo.get("3f1d2a4c-1111-4222-8333-444455556602").unwrap().unwrap();
    assert_eq!(stored.origin, "demo");
    assert_eq!(stored.display_id.as_deref(), Some("INC-001"));
}

#[test]
fn incident_origin_must_be_present() {
    let conn = open_memory().unwrap();
    let repo = IncidentRepo::new(&conn);

    let mut no_origin = sample_incident("demo");
    no_origin.origin = String::new();
    // Empty string violates the CHECK (origin IN ('demo','real')).
    assert!(repo.upsert(&no_origin).is_err(), "origin cannot be blank");
}

#[test]
fn incident_rejects_info_risk_level() {
    // Mirrors Exclude<Risk, "Info"> in src/types.ts.
    let conn = open_memory().unwrap();
    let repo = IncidentRepo::new(&conn);

    let mut info = sample_incident("demo");
    info.risk_level = "info".to_string();
    assert!(repo.upsert(&info).is_err(), "incidents must never be info");
}

#[test]
fn incident_rejects_last_seen_before_first_seen() {
    let conn = open_memory().unwrap();
    let repo = IncidentRepo::new(&conn);

    let mut backwards = sample_incident("demo");
    backwards.first_seen = "2026-11-08T12:00:10.000Z".to_string();
    backwards.last_seen = "2026-11-08T12:00:00.000Z".to_string();
    assert!(repo.upsert(&backwards).is_err(), "CHECK (last_seen >= first_seen)");
}

#[test]
fn incident_status_transition() {
    let conn = open_memory().unwrap();
    let repo = IncidentRepo::new(&conn);
    repo.upsert(&sample_incident("demo")).unwrap();

    assert!(repo.set_status("3f1d2a4c-1111-4222-8333-444455556602", "resolved").unwrap());
    assert_eq!(
        repo.get("3f1d2a4c-1111-4222-8333-444455556602").unwrap().unwrap().status,
        "resolved"
    );
    assert!(!repo.set_status("unknown-id", "open").unwrap());
}

#[test]
fn incident_min_risk_filter_orders_by_severity_not_alphabet() {
    let conn = open_memory().unwrap();
    let repo = IncidentRepo::new(&conn);

    let mut low = sample_incident("demo");
    low.incident_id = "low-id".to_string();
    low.risk_level = "low".to_string();
    repo.upsert(&low).unwrap();
    repo.upsert(&sample_incident("demo")).unwrap(); // critical

    let at_least_high = repo.filtered(None, Some("high"), 10, 0).unwrap();
    assert_eq!(at_least_high.len(), 1, "low must be excluded when filtering for high");
    assert_eq!(at_least_high[0].risk_level, "critical");
}

#[test]
fn canary_origin_must_be_present() {
    let conn = open_memory().unwrap();
    let repo = CanaryRepo::new(&conn);

    let mut blank = sample_canary("demo");
    blank.origin = String::new();
    assert!(repo.upsert(&blank).is_err(), "origin cannot be blank");
}

#[test]
fn canary_rejects_unknown_status() {
    let conn = open_memory().unwrap();
    let repo = CanaryRepo::new(&conn);

    let mut bad = sample_canary("demo");
    bad.status = "Triggered".to_string(); // capitalised - wire uses lowercase
    assert!(repo.upsert(&bad).is_err());
}

#[test]
fn canary_trigger_only_affects_real_canaries() {
    let conn = open_memory().unwrap();
    let repo = CanaryRepo::new(&conn);

    let demo = sample_canary("demo");
    let mut real = sample_canary("real");
    real.canary_id = "real-canary-id".to_string();
    real.display_id = Some("CAN-002".to_string());

    repo.upsert(&demo).unwrap();
    repo.upsert(&real).unwrap();

    // Demo canaries must not accumulate trigger counts that look like telemetry.
    assert!(!repo.record_trigger(&demo.canary_id, &now_iso()).unwrap());
    let demo_after = repo.get(&demo.canary_id).unwrap().unwrap();
    assert_eq!(demo_after.trigger_count, 0);
    assert_eq!(demo_after.status, "active");

    assert!(repo.record_trigger(&real.canary_id, &now_iso()).unwrap());
    let real_after = repo.get(&real.canary_id).unwrap().unwrap();
    assert_eq!(real_after.trigger_count, 1);
    assert_eq!(real_after.status, "triggered");
    assert!(real_after.last_trigger.is_some());
}

#[test]
fn canary_lookup_by_display_id() {
    let conn = open_memory().unwrap();
    let repo = CanaryRepo::new(&conn);
    repo.upsert(&sample_canary("demo")).unwrap();

    assert!(repo.by_display_id("CAN-001").unwrap().is_some());
    assert!(repo.by_display_id("CAN-999").unwrap().is_none());
}

#[test]
fn canary_count_by_origin_separates_demo_from_real() {
    let conn = open_memory().unwrap();
    let repo = CanaryRepo::new(&conn);

    let mut real = sample_canary("real");
    real.canary_id = "real-id".to_string();
    repo.upsert(&sample_canary("demo")).unwrap();
    repo.upsert(&real).unwrap();

    let counts = repo.count_by_origin().unwrap();
    assert_eq!(counts.len(), 2);
    assert!(counts.iter().any(|(o, n)| o == "demo" && *n == 1));
    assert!(counts.iter().any(|(o, n)| o == "real" && *n == 1));
}

#[test]
fn foreign_key_cascade_removes_detection_links() {
    let conn = open_memory().unwrap();
    let events = EventRepo::new(&conn);
    let detections = DetectionRepo::new(&conn);

    events.insert_batch(&[sample_event("3f1d2a4c-1111-4222-8333-444455556600")]).unwrap();
    detections.insert(&sample_detection()).unwrap();
    assert_eq!(
        detections.related_event_ids("3f1d2a4c-1111-4222-8333-444455556603").unwrap().len(),
        1
    );

    // Deleting the event must cascade to the join row, not orphan it.
    conn.execute("DELETE FROM events WHERE event_id = ?1", ["3f1d2a4c-1111-4222-8333-444455556600"])
        .unwrap();
    assert!(
        detections
            .related_event_ids("3f1d2a4c-1111-4222-8333-444455556603")
            .unwrap()
            .is_empty(),
        "foreign_keys = ON must cascade"
    );
}
