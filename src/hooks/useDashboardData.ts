/**
 * `useDashboardData` - where dashboard state lives and where it comes from.
 *
 * Before this hook, App.tsx seeded `nodes`, `events`, `canaries`, `incidents`
 * and `scan` from `data.ts` and the simulation engine directly, and called
 * `invoke("get_runtime_info")` itself. That meant the UI was welded to one
 * data source: adding a real backend would have meant editing every consumer.
 *
 * Now the hook owns those five states and obtains them from a
 * `DashboardBackend`. Components read state and call setters exactly as
 * before; they just no longer know where the initial values came from.
 *
 * What stays in App.tsx: selection, filters, the scan timers, and the
 * simulation loop. Those are UI concerns and demo behaviour. The hook owns
 * *where data comes from*; App.tsx owns *what the demo does with it*.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  Dispatch,
  SetStateAction,
} from "react";
import type {
  BackendFailure,
  BackendStatus,
  DashboardBackend,
  DashboardSnapshot,
  RuntimeInfo,
} from "../services/backend";
import { createBackend } from "../services/backend";
import { describeFailure, toFailure } from "../services/backendError";
import type {
  ActivityEvent,
  CanaryAsset,
  FilesystemNode,
  ScanState,
  ThreatIncident,
} from "../types";

export interface DashboardData {
  // --- state, extracted from App.tsx -------------------------------------
  nodes: FilesystemNode[];
  events: ActivityEvent[];
  canaries: CanaryAsset[];
  incidents: ThreatIncident[];
  scan: ScanState;

  // Raw setters: the demo simulation and UI handlers mutate these directly.
  setNodes: Dispatch<SetStateAction<FilesystemNode[]>>;
  setEvents: Dispatch<SetStateAction<ActivityEvent[]>>;
  setCanaries: Dispatch<SetStateAction<CanaryAsset[]>>;
  setIncidents: Dispatch<SetStateAction<ThreatIncident[]>>;
  setScan: Dispatch<SetStateAction<ScanState>>;

  // --- backend identity and health ---------------------------------------
  backend: DashboardBackend;
  /** `DEMO` or `LIVE` - for the persistent indicator. */
  backendLabel: string;
  backendDescription: string;
  /**
   * `error` blocks the dashboard: a failed live backend must never fall back
   * to demo data showing success.
   */
  status: BackendStatus;
  /** Blocking failure behind `status === "error"`. */
  backendFailure: BackendFailure | null;
  /** Clears the blocking failure so the user can retry. */
  retry(): void;

  // --- native runtime, surfaced to the top bar ---------------------------
  runtimeInfo: RuntimeInfo | null;
  runtimeError: string;

  // --- baselines ---------------------------------------------------------
  /** Memoized seed. Use for baseline defaults; it does not change over time. */
  seedSnapshot: DashboardSnapshot;
  /** Re-seed all five states from the backend and return the fresh snapshot. */
  resetToSeed(): DashboardSnapshot;

  // --- persistence, bound to the active backend --------------------------
  // Each resolves to null on success, or a shaped failure for the caller to
  // surface. They do not touch state: optimistic updates stay with the caller
  // so existing handlers keep working unchanged.
  persistCanaryStatus(
    canaryId: string,
    status: CanaryAsset["status"],
  ): Promise<BackendFailure | null>;
  persistIncidentStatus(
    incidentId: string,
    status: ThreatIncident["status"],
  ): Promise<BackendFailure | null>;
  persistCanary(canary: CanaryAsset): Promise<BackendFailure | null>;
  persistEvents(events: ActivityEvent[]): Promise<BackendFailure | null>;

  /**
   * Integration point for Phase E. Not called automatically: routing live
   * batches needs App.tsx's `addEvents`, which also derives incidents and
   * canary triggers. Wiring it here would duplicate that logic.
   */
  subscribeToLive(
    onEvents: (events: ActivityEvent[]) => void,
    onError: (error: unknown) => void,
  ): () => void;
}

/**
 * @param override Explicit backend for tests. Defaults to `createBackend()`,
 * which selects from the URL (`?backend=live`).
 */
export function useDashboardData(override?: DashboardBackend): DashboardData {
  // Lazy init so exactly one backend exists for the lifetime of the app.
  // Creating it per render would re-run every effect below.
  const [backend] = useState<DashboardBackend>(() => override ?? createBackend());

  // Exactly one seed(), split across the five states. Calling seed() per state
  // would generate a different event set each time, leaving `nodes` derived
  // from one batch and `events` holding another.
  const [seedSnapshot] = useState<DashboardSnapshot>(() => backend.seed());

  const [nodes, setNodes] = useState<FilesystemNode[]>(seedSnapshot.nodes);
  const [events, setEvents] = useState<ActivityEvent[]>(seedSnapshot.events);
  const [canaries, setCanaries] = useState<CanaryAsset[]>(seedSnapshot.canaries);
  const [incidents, setIncidents] = useState<ThreatIncident[]>(seedSnapshot.incidents);
  const [scan, setScan] = useState<ScanState>(seedSnapshot.scan);

  const [status, setStatus] = useState<BackendStatus>(() =>
    backend.seedIsComplete ? "ready" : "loading",
  );
  const [backendFailure, setBackendFailure] = useState<BackendFailure | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [runtimeError, setRuntimeError] = useState("");

  const [retryToken, setRetryToken] = useState(0);

  // --- load ---------------------------------------------------------------
  useEffect(() => {
    if (backend.seedIsComplete) {
      // The seed already IS the dashboard. Calling loadDashboard would swap in
      // a freshly generated copy for no reason, so demo state is left exactly
      // as seeded - that is the "demo behaves exactly as today" guarantee.
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setBackendFailure(null);

    backend
      .loadDashboard(controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        setNodes(snapshot.nodes);
        setEvents(snapshot.events);
        setCanaries(snapshot.canaries);
        setIncidents(snapshot.incidents);
        setScan(snapshot.scan);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBackendFailure(toFailure(error, "BACKEND_LOAD_FAILED"));
        setStatus("error");
      });

    return () => controller.abort();
  }, [backend, retryToken]);

  // --- native runtime -----------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();

    backend
      .getRuntimeInfo(controller.signal)
      .then((info) => {
        if (!controller.signal.aborted) setRuntimeInfo(info);
      })
      .catch((error: unknown) => {
        // Soft failure: the top bar shows BROWSER PREVIEW. This must not
        // block the dashboard - it is the same behaviour as before the seam.
        if (!controller.signal.aborted) setRuntimeError(describeFailure(error));
      });

    return () => controller.abort();
  }, [backend, retryToken]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  // --- baselines ----------------------------------------------------------
  const resetToSeed = useCallback((): DashboardSnapshot => {
    // Called fresh so event timestamps reflect the reset moment, matching
    // createInitialEvents(Date.now(), ...) as resetSimulation did before.
    const fresh = backend.seed();
    setNodes(fresh.nodes);
    setEvents(fresh.events);
    setCanaries(fresh.canaries);
    setIncidents(fresh.incidents);
    setScan(fresh.scan);
    return fresh;
  }, [backend]);

  // --- persistence --------------------------------------------------------
  const run = useCallback(
    async (operation: () => Promise<void>): Promise<BackendFailure | null> => {
      try {
        await operation();
        return null;
      } catch (error) {
        return toFailure(error, "BACKEND_WRITE_FAILED");
      }
    },
    [],
  );

  const persistCanaryStatus = useCallback(
    (canaryId: string, status: CanaryAsset["status"]) =>
      run(() => backend.saveCanaryStatus(canaryId, status)),
    [backend, run],
  );

  const persistIncidentStatus = useCallback(
    (incidentId: string, status: ThreatIncident["status"]) =>
      run(() => backend.saveIncidentStatus(incidentId, status)),
    [backend, run],
  );

  const persistCanary = useCallback(
    (canary: CanaryAsset) => run(() => backend.saveCanary(canary)),
    [backend, run],
  );

  const persistEvents = useCallback(
    (batch: ActivityEvent[]) => run(() => backend.saveEvents(batch)),
    [backend, run],
  );

  const subscribeToLive = useCallback(
    (onEvents: (events: ActivityEvent[]) => void, onError: (error: unknown) => void) =>
      backend.subscribe(onEvents, onError),
    [backend],
  );

  return {
    nodes,
    events,
    canaries,
    incidents,
    scan,
    setNodes,
    setEvents,
    setCanaries,
    setIncidents,
    setScan,

    backend,
    backendLabel: backend.label,
    backendDescription: backend.description,
    status,
    backendFailure,
    retry,

    runtimeInfo,
    runtimeError,

    seedSnapshot,
    resetToSeed,

    persistCanaryStatus,
    persistIncidentStatus,
    persistCanary,
    persistEvents,

    subscribeToLive,
  };
}
