/**
 * Demo backend - the reference implementation of the seam.
 *
 * It wraps the existing fixtures and simulation unchanged: `data.ts`,
 * `initialFilesystemNodes`, and `createInitialEvents`/`applyActivityEvents`
 * are exactly what App.tsx seeded its state with inline before the seam
 * existed, so `seed()` reproduces those `useState` initializers line for
 * line. Demo mode must behave exactly as it does today, and this is where
 * that guarantee lives.
 *
 * Writes are no-ops by design, not omissions. Demo state lives in React and
 * has never been persisted; making it persist would be a behaviour change.
 * `tauriBackend` is where writes become real.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  DashboardBackend,
  DashboardSnapshot,
  RuntimeInfo,
} from "./backend";
import { failure } from "./backendError";
import { initialCanaries, initialIncidents } from "../data";
import { initialFilesystemNodes } from "../simulation/filesystemSimulator";
import {
  applyActivityEvents,
  createInitialEvents,
} from "../simulation/simulationEngine";
import type {
  ActivityEvent,
  CanaryAsset,
  ScanState,
  ThreatIncident,
} from "../types";

/**
 * Scan baseline for the demo fixtures.
 *
 * Derived from the simulated node tree, so it belongs to the demo backend
 * rather than to App.tsx - a live backend reports its own scan state.
 */
const initialScan: ScanState = {
  status: "idle",
  progress: 0,
  scannedDirectories: 0,
  totalDirectories: initialFilesystemNodes.filter((node) => node.type === "directory").length,
  scannedFiles: 0,
  totalFiles: initialFilesystemNodes.filter((node) =>
    ["file", "canary", "suspicious", "threat"].includes(node.type),
  ).length,
  riskScore: null,
  message: "Ready to scan demonstration data",
};

/**
 * Synchronous first-frame snapshot.
 *
 * This is the body of App.tsx's original `useState` initializers:
 *
 *   nodes     = applyActivityEvents(initialFilesystemNodes, createInitialEvents(...))
 *   events    = createInitialEvents(...)
 *   canaries  = initialCanaries
 *   incidents = initialIncidents
 *   scan      = initialScan
 *
 * Called fresh on every reset so event timestamps come from "now", which is
 * what `resetSimulation` did with `createInitialEvents(Date.now(), ...)`.
 */
function seed(): DashboardSnapshot {
  const events = createInitialEvents(Date.now(), initialFilesystemNodes);
  return {
    nodes: applyActivityEvents(initialFilesystemNodes, events),
    events,
    canaries: initialCanaries,
    incidents: initialIncidents,
    scan: initialScan,
  };
}

export function demoBackend(): DashboardBackend {
  return {
    kind: "demo",
    label: "DEMO",
    description: "Simulated endpoint using bundled fixture data. No files are monitored.",
    // The in-app simulation loop is this backend's telemetry feed.
    simulatedFeed: true,
    // Fixtures are local, so the first frame is already the finished
    // dashboard: no loading state, no empty tables, no flash.
    seedIsComplete: true,

    seed,

    async loadDashboard(_signal: AbortSignal): Promise<DashboardSnapshot> {
      return seed();
    },

    /**
     * Calls the same Tauri command the app always has, regardless of which
     * dashboard backend is active - the native runtime exists independently
     * of where dashboard data comes from.
     *
     * In a browser this rejects, which is what produces `BROWSER PREVIEW` in
     * the top bar today. That must keep happening.
     */
    async getRuntimeInfo(signal: AbortSignal): Promise<RuntimeInfo> {
      if (signal.aborted) {
        throw failure("BACKEND_ABORTED", "Runtime info request aborted", {
          retryable: true,
        });
      }
      return invoke<RuntimeInfo>("get_runtime_info");
    },

    // --- writes ----------------------------------------------------------
    // Deliberately empty. Demo records are React state and have never been
    // persisted; persisting them now would change demo behaviour.

    async saveCanaryStatus(
      _canaryId: string,
      _status: CanaryAsset["status"],
    ): Promise<void> {},

    async saveIncidentStatus(
      _incidentId: string,
      _status: ThreatIncident["status"],
    ): Promise<void> {},

    async saveCanary(_canary: CanaryAsset): Promise<void> {},

    async saveEvents(_events: ActivityEvent[]): Promise<void> {},

    /**
     * Demo never emits. Its telemetry feed is the in-app simulation loop in
     * App.tsx, which is not backend data - so there is nothing for the
     * backend to push, and the disposer is a no-op.
     */
    subscribe(_onEvents: (events: ActivityEvent[]) => void): () => void {
      return () => {};
    },
  };
}
