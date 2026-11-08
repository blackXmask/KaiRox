export type PageKey =
  | "dashboard"
  | "explorer"
  | "telemetry"
  | "canaries"
  | "incidents"
  | "detection"
  | "health"
  | "settings";

export type Risk = "Critical" | "High" | "Medium" | "Low" | "Info";

export type FilesystemNodeType =
  | "agent"
  | "volume"
  | "directory"
  | "file"
  | "canary"
  | "suspicious"
  | "threat"
  | "process";

export interface FilesystemNode {
  id: string;
  name: string;
  type: FilesystemNodeType;
  x: number;
  y: number;
  risk: Risk;
  status: "Active" | "Monitoring" | "Modified" | "Created" | "Deleted" | "Triggered" | "Scanning";
  parentId: string | null;
  path: string;
  eventCount: number;
  fileType: string;
  size: string;
  modified: string;
}

export interface ActivityEvent {
  /**
   * Local render key. Wire events carry a uuid (`eventId`), but the UI keys
   * selection and React lists on this number - see normalize.toDisplayEvent.
   */
  id: number;
  /** The wire/DB uuid for this event, when it came from a real event record. */
  eventId?: string;
  time: string;
  timestampMs: number;
  eventType: string;
  path: string;
  process: string;
  volume: string;
  risk: Risk;
  nodeId: string;
  /** True when the event came from the simulator, not from a live collector. */
  simulated: boolean;
  /** Which wire source produced this event. Replaces reading `simulated`. */
  source: "windows_collector" | "simulation";
}

export interface CanaryAsset {
  id: string;
  nodeId: string;
  name: string;
  path: string;
  volume: string;
  type: string;
  status: "Active" | "Triggered" | "Missing";
  registered: string;
  lastTrigger: string;
  triggerCount: number;
}

export interface ThreatIncident {
  id: string;
  title: string;
  time: string;
  severity: Exclude<Risk, "Info">;
  category: string;
  attribution: string;
  detectionRule: string;
  classification: string;
  canaryId: string;
  path: string;
  nodeId: string;
  status: "Open" | "Investigating" | "Resolved";
  summary: string;
}

export type ScanStatus =
  | "idle"
  | "initializing"
  | "scanning"
  | "suspicious"
  | "completed"
  | "cancelled";

export interface ScanState {
  status: ScanStatus;
  progress: number;
  scannedDirectories: number;
  totalDirectories: number;
  scannedFiles: number;
  totalFiles: number;
  riskScore: number | null;
  message: string;
}

export type SimulationSpeed = 0.5 | 1 | 2 | 4;
