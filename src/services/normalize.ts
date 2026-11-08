/**
 * Wire <-> display normalization.
 *
 * The wire (`wire.ts`, `schemas/`) and the UI (`types.ts`) deliberately differ:
 *
 *   wire                       display
 *   -------------------------  ----------------------------
 *   "critical"                 "Critical"
 *   "2026-10-23T14:32:17Z"     "2026-10-23 14:32:17"
 *   canary_id = uuid           id = "CAN-001"
 *   process = {pid,name}|null  process = "explorer.exe (4321)"
 *   source = "simulation"      simulated = true
 *
 * Converting at one boundary means the UI never has to know the wire rules,
 * and the wire never has to carry display formatting.
 *
 * Time is stored and formatted in UTC so output is deterministic. Showing the
 * user's local time instead is a UI decision that has not been made yet; the
 * wire value is UTC either way, so changing it later is a display-only change.
 */

import type {
  ActivityEvent,
  CanaryAsset,
  Risk,
  ScanState,
  ThreatIncident,
} from "../types";
import type {
  WireCanary,
  WireCanaryStatus,
  WireEvent,
  WireEventType,
  WireIncident,
  WireIncidentRiskLevel,
  WireIncidentStatus,
  WireOrigin,
  WireProcess,
  WireRiskLevel,
  WireScan,
} from "./wire";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS: { [key: string]: string | undefined } = {
  file_created: "File Created",
  file_modified: "File Modified",
  file_deleted: "File Deleted",
  file_renamed: "File Renamed",
  directory_changed: "Directory Changed",
};

const RISK_LABELS: { [key in WireRiskLevel]: Risk } = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

const INCIDENT_RISK_LABELS: { [key in WireIncidentRiskLevel]: Exclude<Risk, "Info"> } = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const INCIDENT_STATUS_LABELS: { [key in WireIncidentStatus]: ThreatIncident["status"] } = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
};

const CANARY_STATUS_LABELS: { [key in WireCanaryStatus]: CanaryAsset["status"] } = {
  active: "Active",
  triggered: "Triggered",
  missing: "Missing",
};

/** Shown when a nullable display field has no value. Matches existing UI copy. */
const EMPTY = "—";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseUtc(iso: string): Date | null {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** ISO-8601 UTC -> `HH:MM:SS`. Matches the simulation's time column. */
export function formatClock(iso: string): string {
  const date = parseUtc(iso);
  if (!date) return EMPTY;
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/** ISO-8601 UTC -> `YYYY-MM-DD HH:MM:SS`. */
export function formatDateTime(iso: string): string {
  const date = parseUtc(iso);
  if (!date) return EMPTY;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${formatClock(iso)}`;
}

/** ISO-8601 UTC -> `YYYY-MM-DD HH:MM`. Used for canary registration times. */
export function formatDateShort(iso: string): string {
  const date = parseUtc(iso);
  if (!date) return EMPTY;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** `C:\\Users\\...` -> `C:`. Mirrors simulation's getVolumePath. */
export function volumeFromPath(path: string): string {
  return /^[A-Za-z]:/.exec(path)?.[0].toUpperCase() ?? EMPTY;
}

/** `{pid: 4321, name: "explorer.exe"}` -> `explorer.exe (4321)`. */
function formatProcess(process: WireProcess | null): string {
  if (!process) return "unknown";
  return `${process.name} (${process.pid})`;
}

/** `file_renamed` -> `File Renamed`. Unknown types pass through untouched. */
export function eventTypeToDisplay(eventType: WireEventType | string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function riskToDisplay(risk: WireRiskLevel): Risk {
  return RISK_LABELS[risk] ?? "Info";
}

export function incidentRiskToDisplay(
  risk: WireIncidentRiskLevel,
): Exclude<Risk, "Info"> {
  return INCIDENT_RISK_LABELS[risk];
}

// ---------------------------------------------------------------------------
// Wire -> display
// ---------------------------------------------------------------------------

export interface EventDisplayOptions {
  /**
   * Local render key. Wire events carry a uuid, but selection and React keys
   * use a number - see ActivityEvent.id.
   */
  id?: number;
  /**
   * Risk assigned by the detection layer. Raw telemetry carries none: a file
   * being written is not itself malicious. Defaults to "Info" until an
   * assessment exists, so an unassessed event is never shown as a threat.
   */
  risk?: Risk;
  /**
   * Map-node id for this path. The wire event does not carry one, so the
   * caller must resolve it against the node tree. Unknown paths get "".
   */
  nodeId?: string | null;
}

export function toDisplayEvent(
  wire: WireEvent,
  options: EventDisplayOptions = {},
): ActivityEvent {
  const timestampMs = Date.parse(wire.timestamp);
  return {
    id: options.id ?? 0,
    eventId: wire.event_id,
    time: formatClock(wire.timestamp),
    timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
    eventType: eventTypeToDisplay(wire.event_type),
    path: wire.file_path,
    process: formatProcess(wire.process),
    volume: volumeFromPath(wire.file_path),
    risk: options.risk ?? "Info",
    nodeId: options.nodeId ?? "",
    simulated: wire.source === "simulation",
    source: wire.source,
  };
}

/** A batch of wire events, each normalized. `id` seeds the local keys. */
export function toDisplayEvents(
  wire: WireEvent[],
  options: EventDisplayOptions = {},
): ActivityEvent[] {
  const firstId = options.id ?? 1;
  return wire.map((event, index) =>
    toDisplayEvent(event, { ...options, id: firstId + index }),
  );
}

export function toDisplayCanary(wire: WireCanary): CanaryAsset {
  return {
    id: wire.display_id ?? wire.canary_id,
    nodeId: wire.node_id ?? "",
    name: wire.name ?? EMPTY,
    path: wire.canary_path,
    volume: wire.volume ?? EMPTY,
    type: wire.type ?? EMPTY,
    status: CANARY_STATUS_LABELS[wire.status],
    registered: formatDateShort(wire.created_at),
    lastTrigger: wire.last_trigger ? formatClock(wire.last_trigger) : "Never",
    triggerCount: wire.trigger_count,
  };
}

export interface IncidentDisplayOptions {
  /**
   * Resolves a wire canary uuid to the label the UI shows (`CAN-003`).
   * Without it the raw uuid is displayed, which is correct but unreadable.
   */
  resolveCanaryId?: (canaryId: string) => string | undefined;
}

export function toDisplayIncident(
  wire: WireIncident,
  options: IncidentDisplayOptions = {},
): ThreatIncident {
  return {
    id: wire.display_id ?? wire.incident_id,
    title: wire.title,
    time: formatDateTime(wire.first_seen),
    severity: incidentRiskToDisplay(wire.risk_level),
    category: wire.category ?? EMPTY,
    attribution: wire.attribution ?? EMPTY,
    detectionRule: wire.detection_rule ?? EMPTY,
    classification: wire.classification ?? EMPTY,
    canaryId: wire.canary_id
      ? options.resolveCanaryId?.(wire.canary_id) ?? wire.canary_id
      : EMPTY,
    path: wire.path ?? EMPTY,
    nodeId: wire.node_id ?? "",
    status: INCIDENT_STATUS_LABELS[wire.status],
    summary: wire.summary ?? "",
  };
}

/** Wire scan status and ScanStatus are the same union by design. */
export function toDisplayScan(wire: WireScan): ScanState {
  return {
    status: wire.status,
    progress: wire.progress,
    scannedDirectories: wire.scanned_directories,
    totalDirectories: wire.total_directories,
    scannedFiles: wire.scanned_files,
    totalFiles: wire.total_files,
    riskScore: wire.risk_score,
    message: wire.message,
  };
}

// ---------------------------------------------------------------------------
// Display -> wire
// ---------------------------------------------------------------------------

/**
 * New uuid for a wire record.
 *
 * `crypto.randomUUID` needs a secure context, which Tauri provides
 * (`tauri://localhost` / `http://localhost`).
 */
export function newWireId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error(
    "crypto.randomUUID is unavailable; wire ids must be uuids (see schemas/*.schema.json)",
  );
}

/**
 * Build a wire canary from a UI record.
 *
 * The caller supplies `canaryId` because the display shape has no uuid - the
 * UI only ever shows the readable label.
 */
export function toWireCanary(
  display: CanaryAsset,
  options: { canaryId: string; origin?: WireOrigin; createdAt?: string },
): WireCanary {
  return {
    schema_version: 1,
    canary_id: options.canaryId,
    display_id: display.id,
    canary_path: display.path,
    created_at: options.createdAt ?? new Date().toISOString(),
    status:
      display.status === "Triggered"
        ? "triggered"
        : display.status === "Missing"
          ? "missing"
          : "active",
    origin: options.origin ?? "demo",
    name: display.name,
    volume: display.volume,
    type: display.type,
    last_trigger: display.lastTrigger === "Never" ? null : display.lastTrigger,
    trigger_count: display.triggerCount,
    node_id: display.nodeId,
  };
}

/**
 * Build a wire incident from a UI record.
 *
 * `canary_id` needs the canary's uuid, which the display shape does not hold -
 * pass `canaryId` (or null when the incident is not linked to a canary).
 * `firstSeen` must be provided as ISO-8601; `lastSeen` defaults to it.
 */
export function toWireIncident(
  display: ThreatIncident,
  options: {
    incidentId: string;
    canaryId?: string | null;
    origin?: WireOrigin;
    firstSeen?: string;
    lastSeen?: string;
  },
): WireIncident {
  const firstSeen = options.firstSeen ?? new Date().toISOString();
  return {
    schema_version: 1,
    incident_id: options.incidentId,
    display_id: display.id,
    title: display.title,
    status:
      display.status === "Investigating"
        ? "investigating"
        : display.status === "Resolved"
          ? "resolved"
          : "open",
    risk_level:
      display.severity === "Critical"
        ? "critical"
        : display.severity === "High"
          ? "high"
          : display.severity === "Medium"
            ? "medium"
            : "low",
    first_seen: firstSeen,
    last_seen: options.lastSeen ?? firstSeen,
    category: nullIfEmpty(display.category),
    attribution: nullIfEmpty(display.attribution),
    detection_rule: nullIfEmpty(display.detectionRule),
    classification: nullIfEmpty(display.classification),
    canary_id: options.canaryId ?? null,
    path: nullIfEmpty(display.path),
    node_id: nullIfEmpty(display.nodeId),
    summary: nullIfEmpty(display.summary),
    origin: options.origin ?? "demo",
  };
}

/** The UI uses "—" for "no value"; the wire uses null. */
function nullIfEmpty(value: string): string | null {
  return !value || value === EMPTY ? null : value;
}
