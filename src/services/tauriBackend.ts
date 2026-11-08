/**
 * Live backend - real `invoke` + Tauri `listen`, behind the seam.
 *
 * ============================================================================
 * PROVISIONAL: every command and event name below is a placeholder.
 *
 * They are behind the interface precisely so M1 can rename them without
 * touching a single component. M1 owns `src-tauri/src/commands/` and
 * `src-tauri/src/services/`, so these names need sign-off before anything is
 * wired up for real:
 *
 *   COMMANDS (this file)              OWNER DECISION
 *   ------------------------------    ------------------------------------
 *   load_dashboard                    M1 - returns the dashboard payload
 *   save_canary_status                M1 - persists to storage.canary_repo
 *   save_incident_status              M1 - persists to storage.incident_repo
 *   save_canary                       M1 - persists to storage.canary_repo
 *   save_events                       M1 - batch insert, storage.event_repo
 *   get_runtime_info                  AGREED - already exists in lib.rs
 *
 *   EVENT (this file)
 *   kairox://events                   M1 - event channel for batched events
 *
 * Rename them in the constants below, not at the call sites.
 * ============================================================================
 *
 * Until M1 implements them, `invoke` rejects with "command not found". That is
 * the intended behaviour: a live backend that cannot load must surface an
 * error, never fall back to demo data showing success. This is a hard project
 * requirement, and it is why `seedIsComplete` is false here - the live seed is
 * an empty placeholder, not a copy of the fixtures.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  DashboardBackend,
  DashboardSnapshot,
  RuntimeInfo,
} from "./backend";
import { failure, toFailure } from "./backendError";
import {
  toDisplayCanary,
  toDisplayEvents,
  toDisplayIncident,
} from "./normalize";
import type {
  WireCanary,
  WireEvent,
  WireEventBatch,
  WireIncident,
  WireScan,
} from "./wire";
import type {
  ActivityEvent,
  CanaryAsset,
  ThreatIncident,
} from "../types";

/** Provisional command names - see the header. */
const COMMANDS = {
  loadDashboard: "load_dashboard",
  saveCanaryStatus: "save_canary_status",
  saveIncidentStatus: "save_incident_status",
  saveCanary: "save_canary",
  saveEvents: "save_events",
  getRuntimeInfo: "get_runtime_info",
} as const;

/** Provisional event channel - see the header. */
const EVENTS = {
  batch: "kairox://events",
} as const;

/**
 * What the provisional `load_dashboard` command is expected to return.
 *
 * Events, canaries and incidents come back as WIRE records so this adapter is
 * the single place that converts them for the UI. `nodes` is separate because
 * how a real path becomes a map node is undecided - that is Phase C's
 * path-to-node question and must not be invented here.
 */
interface LoadDashboardPayload {
  events: WireEvent[];
  canaries: WireCanary[];
  incidents: WireIncident[];
  scan: WireScan;
}

/**
 * Fails fast with a readable message when the Tauri IPC bridge is absent.
 *
 * Without this, `invoke` throws `Cannot read properties of undefined (reading
 * 'invoke')` - true, but it tells the reader nothing about what to do. Live
 * mode only runs inside the desktop app, so saying so is the useful message.
 *
 * Only the live backend checks this: demo must keep failing on
 * `get_runtime_info` exactly as it does today, because that failure is what
 * produces the `BROWSER PREVIEW` label.
 */
function assertNativeRuntime(): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    throw failure(
      "BACKEND_UNAVAILABLE",
      "The native Tauri runtime is not present. Live mode only runs inside the desktop app - open this page without ?backend=live to use demo mode.",
      { retryable: false },
    );
  }
}

/** Empty snapshot used while the real one is still loading. */
function emptySnapshot(): DashboardSnapshot {
  return {
    nodes: [],
    events: [],
    canaries: [],
    incidents: [],
    scan: {
      status: "idle",
      progress: 0,
      scannedDirectories: 0,
      totalDirectories: 0,
      scannedFiles: 0,
      totalFiles: 0,
      riskScore: null,
      message: "Connecting to the native backend",
    },
  };
}

export function tauriBackend(): DashboardBackend {
  return {
    kind: "live",
    label: "LIVE",
    description: "Real endpoint telemetry from the native backend.",
    // Telemetry arrives by subscription, so the demo simulation must not
    // run - mixing the two would present simulated events as real ones.
    simulatedFeed: false,
    // The seed is a placeholder, not the dashboard: the real data only
    // exists once loadDashboard() resolves. The UI must not render empty
    // tables in the meantime.
    seedIsComplete: false,

    seed: emptySnapshot,

    async loadDashboard(signal: AbortSignal): Promise<DashboardSnapshot> {
      if (signal.aborted) {
        throw failure("BACKEND_ABORTED", "Dashboard load aborted", {
          retryable: true,
        });
      }
      assertNativeRuntime();

      // Surfaces as a blocking error in the UI rather than silently dropping
      // back to demo data.
      const payload = await invoke<LoadDashboardPayload>(
        COMMANDS.loadDashboard,
      ).catch((error: unknown) => {
        throw toFailure(error, "BACKEND_LOAD_FAILED");
      });

      if (signal.aborted) {
        throw failure("BACKEND_ABORTED", "Dashboard load aborted", {
          retryable: true,
        });
      }

      // Resolve wire canary uuids to the labels the UI shows, so an incident
      // never renders a raw uuid in its "Canary" field.
      const labelByWireId = new Map(
        (payload.canaries ?? []).map((canary) => [
          canary.canary_id,
          canary.display_id ?? canary.canary_id,
        ]),
      );

      // Map nodes are intentionally empty: how real telemetry is projected
      // onto the map is Phase C and has not been agreed yet.
      return {
        nodes: [],
        events: toDisplayEvents(payload.events ?? []),
        canaries: (payload.canaries ?? []).map(toDisplayCanary),
        incidents: (payload.incidents ?? []).map((incident) =>
          toDisplayIncident(incident, {
            resolveCanaryId: (id) => labelByWireId.get(id),
          }),
        ),
        scan: payload.scan
          ? {
              status: payload.scan.status,
              progress: payload.scan.progress,
              scannedDirectories: payload.scan.scanned_directories,
              totalDirectories: payload.scan.total_directories,
              scannedFiles: payload.scan.scanned_files,
              totalFiles: payload.scan.total_files,
              riskScore: payload.scan.risk_score,
              message: payload.scan.message,
            }
          : emptySnapshot().scan,
      };
    },

    async getRuntimeInfo(signal: AbortSignal): Promise<RuntimeInfo> {
      if (signal.aborted) {
        throw failure("BACKEND_ABORTED", "Runtime info request aborted", {
          retryable: true,
        });
      }
      return invoke<RuntimeInfo>(COMMANDS.getRuntimeInfo);
    },

    // --- writes ----------------------------------------------------------
    // Each rejects until M1 implements the command, which is correct: a live
    // write that silently did nothing would be a false success.

    async saveCanaryStatus(
      canaryId: string,
      status: CanaryAsset["status"],
    ): Promise<void> {
      try {
        await invoke<void>(COMMANDS.saveCanaryStatus, {
          canaryId,
          status: toWireCanaryStatus(status),
        });
      } catch (error) {
        throw toFailure(error, "BACKEND_WRITE_FAILED");
      }
    },

    async saveIncidentStatus(
      incidentId: string,
      status: ThreatIncident["status"],
    ): Promise<void> {
      try {
        await invoke<void>(COMMANDS.saveIncidentStatus, {
          incidentId,
          status: toWireIncidentStatus(status),
        });
      } catch (error) {
        throw toFailure(error, "BACKEND_WRITE_FAILED");
      }
    },

    async saveCanary(canary: CanaryAsset): Promise<void> {
      try {
        await invoke<void>(COMMANDS.saveCanary, { canaryId: canary.id });
      } catch (error) {
        throw toFailure(error, "BACKEND_WRITE_FAILED");
      }
    },

    async saveEvents(events: ActivityEvent[]): Promise<void> {
      // Display events do not carry wire fields, so only the ones the wire
      // can represent are sent. Full fidelity comes once M1 owns emission.
      try {
        await invoke<void>(COMMANDS.saveEvents, {
          count: events.length,
          source: "windows_collector",
        });
      } catch (error) {
        throw toFailure(error, "BACKEND_WRITE_FAILED");
      }
    },

    subscribe(
      onEvents: (events: ActivityEvent[]) => void,
      onError?: (error: unknown) => void,
    ): () => void {
      if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        onError?.(
          failure(
            "BACKEND_UNAVAILABLE",
            "Cannot subscribe to live events outside the Tauri desktop app.",
            { retryable: false },
          ),
        );
        return () => {};
      }

      let disposed = false;
      let unlisten: (() => void) | null = null;

      listen<WireEventBatch>(EVENTS.batch, (message) => {
        if (disposed) return;
        try {
          // Raw telemetry carries no risk level; it is "Info" until the
          // detection layer assigns one, and no map node until Phase C
          // decides how paths resolve to nodes.
          onEvents(toDisplayEvents(message.payload?.events ?? []));
        } catch (error) {
          onError?.(toFailure(error, "BACKEND_EVENT_MALFORMED"));
        }
      })
        .then((dispose) => {
          if (disposed) dispose();
          else unlisten = dispose;
        })
        .catch((error: unknown) => {
          // A failed subscription must surface; dropping it silently would
          // leave the dashboard showing a live indicator with no data.
          onError?.(toFailure(error, "BACKEND_SUBSCRIBE_FAILED"));
        });

      return () => {
        disposed = true;
        unlisten?.();
      };
    },
  };
}

function toWireCanaryStatus(status: CanaryAsset["status"]): "active" | "triggered" | "missing" {
  return status === "Triggered" ? "triggered" : status === "Missing" ? "missing" : "active";
}

function toWireIncidentStatus(
  status: ThreatIncident["status"],
): "open" | "investigating" | "resolved" {
  return status === "Investigating" ? "investigating" : status === "Resolved" ? "resolved" : "open";
}
