/**
 * The backend seam.
 *
 * Every screen gets its dashboard data through this interface. Components
 * never import `data.ts`, `initialFilesystemNodes`, or the simulation engine
 * directly, and they never branch on which backend is active - so switching
 * between demo and live is a matter of returning a different implementation
 * from `createBackend()`, with no component changes.
 *
 * Two implementations exist:
 *
 *   demoBackend  - wraps the existing fixtures and simulation, unchanged.
 *                  Demo mode must behave exactly as it does today.
 *   tauriBackend - real `invoke` + Tauri `listen`. Skeleton until M1 agrees
 *                  on command names.
 *
 * --- The seed / load split ------------------------------------------------
 *
 * `seed()` is synchronous because the dashboard cannot render its first frame
 * with empty collections: `events[0]`, `canaries[0]` and similar reads are
 * unguarded throughout App.tsx, so an async-only load would crash before the
 * first payload arrived.
 *
 * `seedIsComplete` says whether the seed already *is* the dashboard. Demo
 * returns true - its fixtures are local, so it paints fully populated with no
 * loading flash, which is what "demo behaves exactly as today" requires.
 * Live returns false: its seed is an empty placeholder, and the UI shows a
 * connection state instead of rendering empty tables.
 */

import type {
  ActivityEvent,
  CanaryAsset,
  FilesystemNode,
  ScanState,
  ThreatIncident,
} from "../types";
// Imported as values because this is the factory. The adapters themselves
// import this module for types only (`import type`, erased at build), and get
// their helpers from `backendError.ts` - so there is no runtime cycle.
import { demoBackend } from "./demoBackend";
import { tauriBackend } from "./tauriBackend";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Mirrors RuntimeInfo returned by the Tauri `get_runtime_info` command. */
export interface RuntimeInfo {
  appName: string;
  platform: string;
  mode: string;
}

/** Everything the dashboard needs to paint one screen. */
export interface DashboardSnapshot {
  nodes: FilesystemNode[];
  events: ActivityEvent[];
  canaries: CanaryAsset[];
  incidents: ThreatIncident[];
  scan: ScanState;
}

/**
 * A backend failure, shaped to `schemas/error.schema.json`.
 *
 * `retryable` distinguishes "the native runtime is not up yet, try again"
 * from "this configuration is wrong" - the UI needs that to decide whether
 * to offer a retry.
 */
export interface BackendFailure {
  schema_version: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
  retryable: boolean;
}

export type BackendKind = "demo" | "live";

/** `loading` only ever occurs for backends where `seedIsComplete` is false. */
export type BackendStatus = "loading" | "ready" | "error";

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export interface DashboardBackend {
  /** Which implementation this is. The UI may label with it; it may not branch on it. */
  readonly kind: BackendKind;

  /** Short label for the persistent demo/live indicator: `DEMO` or `LIVE`. */
  readonly label: string;

  /** One-line description for tooltips and the Settings page. */
  readonly description: string;

  /**
   * Whether App.tsx's in-app simulation is the source of telemetry.
   *
   * This exists so the automatic feed can switch itself off on a live
   * backend. If it kept running, simulated events would be injected into a
   * live dashboard alongside real ones - which is precisely the "never show
   * simulated data as real" rule this project cannot break.
   *
   * Demo is true (its feed IS the simulation); live is false (its feed is
   * the `subscribe` channel).
   */
  readonly simulatedFeed: boolean;

  /**
   * Whether `seed()` is already the final dashboard with nothing to load.
   *
   * True for demo so the first frame is fully populated with no loading flash.
   * False for live, whose seed is an empty placeholder.
   */
  readonly seedIsComplete: boolean;

  /** Synchronous snapshot for the first frame, and the baseline for reset. */
  seed(): DashboardSnapshot;

  /** Full load. Called once on mount; resolves with the authoritative data. */
  loadDashboard(signal: AbortSignal): Promise<DashboardSnapshot>;

  /**
   * Native runtime identity for the top bar.
   *
   * Both backends call the same Tauri command, because the runtime exists
   * regardless of which dashboard backend is active. Rejecting here is what
   * produces `BROWSER PREVIEW` today and must keep doing so.
   */
  getRuntimeInfo(signal: AbortSignal): Promise<RuntimeInfo>;

  // --- writes ------------------------------------------------------------
  // Demo implements these as no-ops: demo state lives in React and must not
  // change behaviour. Live persists to SQLite.

  saveCanaryStatus(canaryId: string, status: CanaryAsset["status"]): Promise<void>;
  saveIncidentStatus(
    incidentId: string,
    status: ThreatIncident["status"],
  ): Promise<void>;
  saveCanary(canary: CanaryAsset): Promise<void>;
  saveEvents(events: ActivityEvent[]): Promise<void>;

  /**
   * Subscribe to live event batches.
   *
   * Returns a disposer. `onError` is not optional in spirit: a subscription
   * that fails silently would leave a LIVE indicator on screen with no data
   * behind it, so failures must reach the caller. Demo never errors.
   *
   * Demo's feed is the in-app simulation, not backend data, so demo never
   * emits and returns a no-op disposer.
   */
  subscribe(
    onEvents: (events: ActivityEvent[]) => void,
    onError?: (error: unknown) => void,
  ): () => void;
}

// ---------------------------------------------------------------------------
// Failure shaping
// ---------------------------------------------------------------------------

// Re-exported here so consumers only need one import. The implementation
// lives in `backendError.ts` because the adapters must import it without
// importing this module (which imports them) - see the note in that file.
export { describeFailure, failure, isFailure, toFailure } from "./backendError";

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

/**
 * Which backend this session should use.
 *
 * Defaults to demo. `?backend=live` selects the Tauri backend so the seam can
 * be exercised without a UI change - and, in a browser, so the failure path is
 * observable: live must surface an error rather than quietly showing demo data.
 *
 * The Settings toggle can call `createBackend(kind)` directly once it exists;
 * this stays the fallback so the URL remains the testable entry point.
 */
export function selectBackendKind(): BackendKind {
  if (typeof window === "undefined") return "demo";

  const fromQuery = new URLSearchParams(window.location.search).get("backend");
  if (fromQuery === "live" || fromQuery === "tauri") return "live";
  if (fromQuery === "demo") return "demo";

  return "demo";
}

/** Build the backend for this session. */
export function createBackend(kind: BackendKind = selectBackendKind()): DashboardBackend {
  return kind === "live" ? tauriBackend() : demoBackend();
}
