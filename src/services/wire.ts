/**
 * KAIROX wire types.
 *
 * These mirror `schemas/*.schema.json` field for field. This is the shape that
 * travels over Tauri IPC and the shape that lives in SQLite:
 *
 *   - wire enums are lowercase      (`"critical"`, `"open"`, `"file_renamed"`)
 *   - timestamps are ISO-8601 UTC   (`"2026-10-23T14:32:17.000Z"`)
 *   - ids are uuids                 (`"5f2b7c1e-..."`)
 *
 * The UI renders a different shape - Capitalized enums, pre-formatted time
 * strings, readable `CAN-001` labels. `normalize.ts` converts between them.
 * Never render a wire value directly.
 *
 * These types are hand-written. Once the contracts are frozen they should be
 * generated from `schemas/` so they cannot drift. Until then,
 * `npm run validate:schemas` proves the fixtures and the demo records still
 * match the schemas these types describe.
 */

export const WIRE_SCHEMA_VERSION = 1;

export type WireRiskLevel = "critical" | "high" | "medium" | "low" | "info";

/** Incidents cannot be "info" - mirrors Exclude<Risk, "Info"> in types.ts. */
export type WireIncidentRiskLevel = "critical" | "high" | "medium" | "low";

export type WireIncidentStatus = "open" | "investigating" | "resolved";
export type WireCanaryStatus = "active" | "triggered" | "missing";

export type WireScanStatus =
  | "idle"
  | "initializing"
  | "scanning"
  | "suspicious"
  | "completed"
  | "cancelled";

/** Honesty flag. Never render a "demo" record as if it were real telemetry. */
export type WireOrigin = "demo" | "real";

export type WireEventType =
  | "file_created"
  | "file_modified"
  | "file_deleted"
  | "file_renamed"
  | "directory_changed";

export type WireEventSource = "windows_collector" | "simulation";

export type WireDetectionEngine = "rules" | "lightgbm" | "isolation_forest";

export interface WireProcess {
  pid: number;
  name: string;
}

/**
 * `schemas/event.schema.json`
 *
 * Raw file-system telemetry. Deliberately carries no `risk`: a file being
 * written is not itself malicious. Risk is assigned later by the detection
 * layer - see `toDisplayEvent`.
 */
export interface WireEvent {
  schema_version: number;
  event_id: string;
  timestamp: string;
  event_type: WireEventType;
  file_path: string;
  /** Only non-null for `file_renamed`; null for every other event type. */
  old_path: string | null;
  /** Null when the collector cannot attribute a process (RWDW gives no PID). */
  process: WireProcess | null;
  source: WireEventSource;
  /** Null when unknown (`file_deleted`) or not applicable (`directory_changed`). */
  size_bytes: number | null;
}

/** `schemas/event.schema.json` -> `$defs.EventBatch` */
export interface WireEventBatch {
  schema_version: number;
  window_start: string;
  window_end: string;
  events: WireEvent[];
}

/**
 * `schemas/detection.schema.json`
 *
 * `score` is 0-100 and is NOT a calibrated probability.
 */
export interface WireDetection {
  schema_version: number;
  detection_id: string;
  timestamp: string;
  related_event_ids: string[];
  risk_level: WireRiskLevel;
  score: number;
  reason: string;
  engine: WireDetectionEngine;
  model_version: string;
  window_start: string;
  window_end: string;
}

/** `schemas/incident.schema.json` */
export interface WireIncident {
  schema_version: number;
  incident_id: string;
  /**
   * Readable UI label (`INC-001`).
   *
   * Optional - absent from the schema's `required`, so a producer may omit it
   * entirely rather than send `null`. Live incidents may have no label yet.
   */
  display_id?: string | null;
  title: string;
  status: WireIncidentStatus;
  risk_level: WireIncidentRiskLevel;
  first_seen: string;
  last_seen: string;
  category: string | null;
  attribution: string | null;
  detection_rule: string | null;
  classification: string | null;
  canary_id: string | null;
  path: string | null;
  node_id: string | null;
  summary: string | null;
  /** `demo` or `real`. Never null - a simulated incident must be labelled. */
  origin: WireOrigin;
}

/** `schemas/canary.schema.json` */
export interface WireCanary {
  schema_version: number;
  canary_id: string;
  /**
   * Readable UI label (`CAN-001`).
   *
   * Optional - absent from the schema's `required`, so a producer may omit it
   * entirely rather than send `null`. Live canaries may have no label yet.
   */
  display_id?: string | null;
  canary_path: string;
  created_at: string;
  status: WireCanaryStatus;
  /** `demo` or `real`. Never null - a simulated canary must be labelled. */
  origin: WireOrigin;
  name: string | null;
  volume: string | null;
  type: string | null;
  last_trigger: string | null;
  trigger_count: number;
  node_id: string | null;
}

/** `schemas/scan.schema.json` */
export interface WireScan {
  schema_version: number;
  status: WireScanStatus;
  progress: number;
  scanned_directories: number;
  total_directories: number;
  scanned_files: number;
  total_files: number;
  risk_score: number | null;
  message: string;
}

/** `schemas/error.schema.json` */
export interface WireError {
  schema_version: number;
  /** SCREAMING_SNAKE_CASE - see the pattern in the schema. */
  code: string;
  message: string;
  details: Record<string, unknown>;
  retryable: boolean;
}
