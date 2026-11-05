import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity, AlertTriangle, Archive, ArrowDownToLine, ArrowRight, Bell,
  Check, ChevronRight, Clock3, Copy, Cpu, File, FileCode2, FileSearch,
  Folder, FolderOpen, Gauge, HardDrive, ListFilter, LockKeyhole,
  Monitor, MoreHorizontal, Network, Pause, Play, Plus, Radar, Search,
  Settings, Shield, ShieldAlert, ShieldCheck, Sparkles, Terminal, X, Zap,
} from "lucide-react";
import { initialCanaries, initialIncidents, riskClass } from "./data";
import IntelligenceMap from "./components/intelligence-map/IntelligenceMap";
import { initialFilesystemNodes } from "./simulation/filesystemSimulator";
import {
  applyActivityEvents,
  createInitialEvents,
  createScanCompletedEvent,
  createSimulationEvents,
  createTestScenarioEvents,
} from "./simulation/simulationEngine";
import type { ActivityEvent, CanaryAsset, FilesystemNode, PageKey, Risk, ScanState, SimulationSpeed, ThreatIncident } from "./types";

const navigation: Array<{ key: PageKey; label: string; icon: typeof Radar }> = [
  { key: "dashboard", label: "Intelligence Map", icon: Radar },
  { key: "explorer", label: "Filesystem Explorer", icon: FolderOpen },
  { key: "telemetry", label: "Live Telemetry", icon: Activity },
  { key: "canaries", label: "Canary Registry", icon: ShieldAlert },
  { key: "incidents", label: "Threat Incidents", icon: Shield },
  { key: "detection", label: "Detection Engine", icon: Gauge },
  { key: "health", label: "System Health", icon: Cpu },
  { key: "settings", label: "Settings", icon: Settings },
];

const eventFilters = ["All", "File events", "Canary events", "Detection events"];
const incidentFilters = ["All", "Critical", "High", "Medium", "Low"];
interface SettingsState {
  monitoring: boolean;
  canaryDetection: boolean;
  analytics: boolean;
  advanced: boolean;
  demo: boolean;
  logging: boolean;
  encryption: boolean;
}
interface RuntimeInfo {
  appName: string;
  platform: string;
  mode: string;
}
const initialScan: ScanState = {
  status: "idle", progress: 0, scannedDirectories: 0,
  totalDirectories: initialFilesystemNodes.filter((node) => node.type === "directory").length,
  scannedFiles: 0, totalFiles: initialFilesystemNodes.filter((node) => ["file", "canary", "suspicious", "threat"].includes(node.type)).length,
  riskScore: null, message: "Ready to scan demonstration data",
};
function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [nodes, setNodes] = useState(() => applyActivityEvents(
    initialFilesystemNodes,
    createInitialEvents(Date.now(), initialFilesystemNodes),
  ));
  const [events, setEvents] = useState(() => createInitialEvents(Date.now(), initialFilesystemNodes));
  const [canaries, setCanaries] = useState(initialCanaries);
  const [incidents, setIncidents] = useState(initialIncidents);
  const [selectedEventId, setSelectedEventId] = useState<number>(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("canary-exe");
  const [selectedCanaryId, setSelectedCanaryId] = useState(initialCanaries[2].id);
  const [selectedIncidentId, setSelectedIncidentId] = useState(initialIncidents[0].id);
  const [telemetryFilter, setTelemetryFilter] = useState("All");
  const [canaryFilter, setCanaryFilter] = useState("All");
  const [incidentFilter, setIncidentFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [feedPaused, setFeedPaused] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>(1);
  const [scan, setScan] = useState<ScanState>(initialScan);
  const [scannedNodeIds, setScannedNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState("projects");
  const [notice, setNotice] = useState("");
  const [lastUpdate, setLastUpdate] = useState("Never");
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [settings, setSettings] = useState<SettingsState>({
    monitoring: true, canaryDetection: true, analytics: false,
    advanced: false, demo: true, logging: true, encryption: false,
  });
  const nodesRef = useRef(nodes);
  const scanStateRef = useRef(scan);
  const eventSequence = useRef(8);
  const nextEventId = useRef(9);
  const scanTimer = useRef<number | null>(null);
  const scanCompletionQueued = useRef(false);

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedCanary = canaries.find((canary) => canary.id === selectedCanaryId) ?? canaries[0];
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0];
  const triggeredCount = canaries.filter((canary) => canary.status === "Triggered").length;
  const activeCount = canaries.filter((canary) => canary.status === "Active").length;
  const incidentCount = incidents.filter((incident) => incident.status !== "Resolved").length;
  const currentTime = Date.now();
  const eventsPerSecond = events.filter((event) => currentTime - event.timestampMs < 60_000).length / 60;

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    scanStateRef.current = scan;
  }, [scan]);

  function addEvents(newEvents: ActivityEvent[]) {
    if (newEvents.length === 0) return;
    setEvents((current) => [...newEvents, ...current].slice(0, 120));
    setNodes((current) => applyActivityEvents(current, newEvents));
    setSelectedEventId(newEvents[0].id);
    const triggered = settings.canaryDetection
      ? newEvents.filter((event) => event.eventType.toLowerCase().includes("canary"))
      : [];
    const suspicious = newEvents.filter((event) => (event.risk === "High" || event.risk === "Critical")
      && (settings.canaryDetection || !event.eventType.toLowerCase().includes("canary")));
    if (suspicious.length) {
      setIncidents((current) => {
        const fresh = suspicious.filter((event) => !current.some((incident) => incident.nodeId === event.nodeId && incident.status !== "Resolved"));
        return [
          ...fresh.map((event): ThreatIncident => ({
            id: `INC-SIM-${event.id}`,
            title: event.eventType.toLowerCase().includes("canary") ? "Simulated canary access" : "Simulated suspicious activity",
            time: new Date(event.timestampMs).toLocaleString(),
            severity: event.risk === "Critical" ? "Critical" : "High",
            category: event.eventType.toLowerCase().includes("canary") ? "Canary Trigger" : "Suspicious Activity",
            attribution: event.process,
            detectionRule: event.eventType.toLowerCase().includes("canary") ? "simulated_canary_access" : "simulated_behavioral_anomaly",
            classification: "Demonstration alert",
            canaryId: canaries.find((canary) => canary.nodeId === event.nodeId)?.id ?? "—",
            path: event.path,
            nodeId: event.nodeId,
            status: "Open",
            summary: `Simulated activity: ${event.eventType} from ${event.process}. No actual filesystem access occurred.`,
          })),
          ...current,
        ];
      });
    }
    if (triggered.length) {
      const triggeredNodeIds = new Set(triggered.map((event) => event.nodeId));
      setCanaries((current) => current.map((canary) => triggeredNodeIds.has(canary.nodeId)
        ? { ...canary, status: "Triggered", triggerCount: canary.triggerCount + 1, lastTrigger: triggered[0].time }
        : canary));
    }
  }

  useEffect(() => {
    if (feedPaused || !settings.monitoring) return;
    const timer = window.setInterval(() => {
      const next = createSimulationEvents(eventSequence.current, nextEventId.current, nodesRef.current);
      eventSequence.current += 1;
      nextEventId.current += next.length;
      addEvents(next);
    }, 4200 / simulationSpeed);
    return () => window.clearInterval(timer);
  }, [feedPaused, settings.monitoring, simulationSpeed]);

  useEffect(() => {
    if (scan.status === "initializing") {
      const timer = window.setTimeout(() => setScan((current) => ({
        ...current,
        status: "scanning",
        message: "Traversing simulated filesystem",
      })), 350);
      return () => window.clearTimeout(timer);
    }
    if (scan.status !== "scanning" && scan.status !== "suspicious") return;
    scanTimer.current = window.setInterval(() => {
      const current = scanStateRef.current;
      if (current.status !== "scanning" && current.status !== "suspicious") return;
      const progress = Math.min(100, current.progress + 5);
      const scanned = nodes.slice(0, Math.ceil(nodes.length * progress / 100));
      setScannedNodeIds(new Set(scanned.map((node) => node.id)));
      const directories = scanned.filter((node) => node.type === "directory").length;
      const files = scanned.filter((node) => ["file", "canary", "suspicious", "threat"].includes(node.type)).length;
      if (progress === 100) {
        if (scanCompletionQueued.current) return;
        scanCompletionQueued.current = true;
        if (scanTimer.current !== null) window.clearInterval(scanTimer.current);
        scanTimer.current = null;
        const riskScore = Math.min(1, nodes.filter((node) => node.risk === "Critical" || node.risk === "High").length
          / Math.max(1, nodes.filter((node) => ["file", "canary", "suspicious", "threat"].includes(node.type)).length));
        const completed: ScanState = {
          ...current, status: "completed", progress, scannedDirectories: directories,
          scannedFiles: files, riskScore, message: "Demo scan completed",
        };
        scanStateRef.current = completed;
        setScan(completed);
        const completion = createScanCompletedEvent(nextEventId.current, nodesRef.current);
        nextEventId.current += 1;
        window.setTimeout(() => addEvents([completion]), 0);
        return;
      }
      const suspiciousFound = scanned.some((node) => node.risk === "Critical" || node.risk === "High");
      const next: ScanState = {
        ...current,
        status: suspiciousFound && progress >= 65 ? "suspicious" : "scanning",
        progress,
        scannedDirectories: directories,
        scannedFiles: files,
        message: suspiciousFound && progress >= 65 ? "Suspicious sample nodes identified" : "Traversing simulated filesystem",
      };
      scanStateRef.current = next;
      setScan(next);
    }, 90);
    return () => {
      if (scanTimer.current !== null) window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    };
  }, [scan.status, nodes, events]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let active = true;
    invoke<RuntimeInfo>("get_runtime_info")
      .then((info) => {
        if (active) setRuntimeInfo(info);
      })
      .catch((error: unknown) => {
        if (active) setRuntimeError(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, []);

  const visibleEvents = useMemo(() => events.filter((event) => {
    const filterMatch = telemetryFilter === "All"
      || (telemetryFilter === "Canary events" && event.eventType.toLowerCase().includes("canary"))
      || (telemetryFilter === "File events" && /file|directory/i.test(event.eventType))
      || (telemetryFilter === "Detection events" && ["Critical", "High", "Medium"].includes(event.risk));
    const term = search.trim().toLowerCase();
    return filterMatch && (!term || `${event.path} ${event.eventType} ${event.process}`.toLowerCase().includes(term));
  }), [events, search, telemetryFilter]);

  const visibleCanaries = useMemo(() => canaries.filter((canary) => {
    const matchesStatus = canaryFilter === "All" || canary.status === canaryFilter;
    const term = search.trim().toLowerCase();
    return matchesStatus && (!term || `${canary.id} ${canary.name} ${canary.path} ${canary.volume}`.toLowerCase().includes(term));
  }), [canaries, canaryFilter, search]);

  const visibleIncidents = useMemo(() => incidents.filter((incident) => {
    const matchesSeverity = incidentFilter === "All" || incident.severity === incidentFilter;
    const term = search.trim().toLowerCase();
    return matchesSeverity && (!term || `${incident.id} ${incident.title} ${incident.category} ${incident.path}`.toLowerCase().includes(term));
  }), [incidents, incidentFilter, search]);

  function addCanary() {
    const next = canaries.length + 1;
    const id = `CAN-${String(next).padStart(3, "0")}`;
    const canary: CanaryAsset = {
      nodeId: `demo-canary-${next}`,
      id, name: `demo_decoy_${String(next).padStart(3, "0")}.txt`,
      path: `D:\\Projects\\demo_decoy_${String(next).padStart(3, "0")}.txt`,
      volume: "D:", type: "Text document", status: "Active",
      registered: new Date().toLocaleString(), lastTrigger: "Never", triggerCount: 0,
    };
    const parent = nodes.find((node) => node.id === "projects");
    const newNode: FilesystemNode = {
      id: canary.nodeId, name: canary.name, type: "canary",
      x: 880 + (next % 3) * 24, y: 145 + (next % 4) * 22, risk: "Low",
      status: "Active", parentId: parent?.id ?? "volume-d", path: canary.path,
      eventCount: 0, fileType: "TXT · canary file", size: "4 KB", modified: new Date().toLocaleString(),
    };
    setNodes((current) => [...current, newNode]);
    setCanaries((current) => [canary, ...current]);
    setSelectedCanaryId(canary.id);
    setCanaryFilter("All");
    setSearch("");
    setNotice(`${canary.id} added to the demo registry`);
  }

  function toggleCanary() {
    if (!selectedCanary) return;
    const status = selectedCanary.status === "Missing" ? "Active" : "Missing";
    setCanaries((current) => current.map((canary) => canary.id === selectedCanary.id ? { ...canary, status } : canary));
    setNodes((current) => current.map((node) => node.id === selectedCanary.nodeId
      ? { ...node, status: status === "Missing" ? "Deleted" : "Active" }
      : node));
    setNotice(`Demo canary marked ${status.toLowerCase()}`);
  }

  function updateIncidentStatus() {
    if (!selectedIncident) return;
    const next = selectedIncident.status === "Open" ? "Investigating"
      : selectedIncident.status === "Investigating" ? "Resolved" : "Open";
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? { ...incident, status: next } : incident));
    setNotice(`${selectedIncident.id} moved to ${next}`);
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setNotice("Path copied to clipboard");
    } catch (error) {
      setNotice(error instanceof Error ? `Could not copy path: ${error.message}` : "Could not copy path");
    }
  }

  function openIncidentForEvent(event: ActivityEvent) {
    const incident = incidents.find((item) => item.path.toLowerCase() === event.path.toLowerCase())
      ?? (event.eventType.toLowerCase().includes("canary") ? incidents.find((item) => item.category.toLowerCase().includes("canary")) : undefined);
    if (incident) {
      setSelectedIncidentId(incident.id);
      setIncidentFilter("All");
      setPage("incidents");
    } else {
      setNotice("No matching sample incident for this event");
    }
  }

  function openIncidentForCanary(canary: CanaryAsset) {
    const incident = incidents.find((item) => item.canaryId === canary.id);
    if (!incident) {
      setNotice("No incident is associated with this sample canary");
      return;
    }
    setSelectedIncidentId(incident.id);
    setIncidentFilter("All");
    setPage("incidents");
  }

  function selectNavigation(key: PageKey) {
    setSearch("");
    setPage(key);
  }

  function generateScenario(scenario: "suspicious" | "canary") {
    const generated = createTestScenarioEvents(scenario, nextEventId.current, nodesRef.current);
    nextEventId.current += generated.length;
    eventSequence.current += generated.length;
    addEvents(generated);
    setNotice(scenario === "canary" ? "Simulated canary trigger generated" : "Suspicious sample activity generated");
  }

  function resetSimulation() {
    const resetEvents = createInitialEvents(Date.now(), initialFilesystemNodes);
    const resetNodes = applyActivityEvents(initialFilesystemNodes, resetEvents);
    setNodes(resetNodes);
    nodesRef.current = resetNodes;
    setEvents(resetEvents);
    eventSequence.current = 8;
    nextEventId.current = 9;
    setCanaries(initialCanaries);
    setIncidents(initialIncidents);
    setSelectedEventId(resetEvents[0].id);
    setSelectedNodeId(null);
    setScan(initialScan);
    setScannedNodeIds(new Set());
    setFeedPaused(false);
    setSettings((current) => ({ ...current, monitoring: true }));
    setNotice("Demonstration simulation reset");
  }

  function startScan() {
    if (scanTimer.current !== null) window.clearInterval(scanTimer.current);
    scanCompletionQueued.current = false;
    setScannedNodeIds(new Set());
    setScan({
      ...initialScan,
      totalDirectories: nodes.filter((node) => node.type === "directory").length,
      totalFiles: nodes.filter((node) => ["file", "canary", "suspicious", "threat"].includes(node.type)).length,
      status: "initializing",
      message: "Preparing demonstration scan",
    });
  }

  function cancelScan() {
    if (scanTimer.current !== null) window.clearInterval(scanTimer.current);
    scanTimer.current = null;
    scanCompletionQueued.current = true;
    setScan((current) => ({ ...current, status: "cancelled", message: "Demo scan cancelled" }));
  }

  function selectEvent(eventId: number) {
    setSelectedEventId(eventId);
    const event = events.find((item) => item.id === eventId);
    if (event) setSelectedNodeId(event.nodeId);
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} navigate={selectNavigation} simulationRunning={!feedPaused && settings.monitoring} />
      <div className="workspace">
        <TopBar canaryCount={canaries.length} volumeCount={nodes.filter((node) => node.type === "volume").length}
          eventRate={feedPaused || !settings.monitoring ? "—" : eventsPerSecond.toFixed(2)}
          incidentCount={incidentCount} paused={feedPaused || !settings.monitoring}
          lastEvent={events[0]} runtimeInfo={runtimeInfo} runtimeError={runtimeError} navigate={selectNavigation} />
        <main className="page-content">
          {page === "dashboard" && (
            <Dashboard
              nodes={nodes} events={events} selectedEvent={selectedEvent} selectedNode={selectedNode}
              selectEvent={selectEvent} selectNode={setSelectedNodeId} deselectNode={() => setSelectedNodeId(null)}
              canaries={canaries} incidents={incidents} incidentCount={incidentCount} triggeredCount={triggeredCount}
              activeCount={activeCount} navigate={selectNavigation} scan={scan} scannedNodeIds={scannedNodeIds}
              simulationRunning={!feedPaused && settings.monitoring} simulationSpeed={simulationSpeed}
              setSimulationRunning={(running) => {
                setFeedPaused(!running);
                if (running) setSettings((current) => ({ ...current, monitoring: true }));
              }} setSimulationSpeed={setSimulationSpeed}
              resetSimulation={resetSimulation} generateScenario={generateScenario} startScan={startScan} cancelScan={cancelScan}
              copyPath={copyPath} openIncident={openIncidentForEvent} setNotice={setNotice}
              feedPaused={feedPaused || !settings.monitoring} toggleFeed={() => {
                if (feedPaused || !settings.monitoring) {
                  setSettings((current) => ({ ...current, monitoring: true }));
                  setFeedPaused(false);
                } else setFeedPaused(true);
              }}
            />
          )}
          {page === "telemetry" && (
            <TelemetryPage events={visibleEvents} filter={telemetryFilter} setFilter={setTelemetryFilter}
              search={search} setSearch={setSearch} selectedId={selectedEventId} selectEvent={selectEvent}
              paused={feedPaused || !settings.monitoring} toggleFeed={() => {
                if (feedPaused || !settings.monitoring) {
                  setSettings((current) => ({ ...current, monitoring: true }));
                  setFeedPaused(false);
                } else setFeedPaused(true);
              }} />
          )}
          {page === "canaries" && (
            <CanariesPage canaries={visibleCanaries} allCanaries={canaries} selected={selectedCanary} filter={canaryFilter}
              setFilter={setCanaryFilter} search={search} setSearch={setSearch} selectCanary={(id) => {
                setSelectedCanaryId(id);
                const canary = canaries.find((item) => item.id === id);
                if (canary) setSelectedNodeId(canary.nodeId);
              }}
              volumeCount={nodes.filter((node) => node.type === "volume").length} copyPath={copyPath}
              addCanary={addCanary} toggleCanary={toggleCanary} viewMap={() => setPage("dashboard")}
              viewIncident={openIncidentForCanary} />
          )}
          {page === "incidents" && (
            <IncidentsPage incidents={visibleIncidents} allIncidents={incidents} lastEvent={events[0]}
              selected={selectedIncident} filter={incidentFilter}
              setFilter={setIncidentFilter} search={search} setSearch={setSearch}
              selectIncident={(id) => {
                setSelectedIncidentId(id);
                const incident = incidents.find((item) => item.id === id);
                if (incident) setSelectedNodeId(incident.nodeId);
              }} updateStatus={updateIncidentStatus} />
          )}
          {page === "explorer" && (
            <ExplorerPage nodes={nodes} events={events} canaries={canaries} incidents={incidents}
              selectedNodeId={selectedNodeId} selectNode={setSelectedNodeId}
              selectedFolder={selectedFolder} setSelectedFolder={setSelectedFolder}
              search={search} setSearch={setSearch} navigateMap={() => setPage("dashboard")} />
          )}
          {page === "detection" && <DetectionPage events={events} incidents={incidents} scan={scan} analyticsEnabled={settings.analytics} />}
          {page === "health" && <HealthPage paused={feedPaused || !settings.monitoring} nodes={nodes} events={events} canaries={canaries} incidents={incidents} scan={scan} runtimeInfo={runtimeInfo} navigate={selectNavigation} />}
          {page === "settings" && (
            <SettingsPage settings={settings} setSettings={setSettings} lastUpdate={lastUpdate}
              checkUpdates={() => { setLastUpdate(new Date().toLocaleTimeString()); setNotice("KAIROX is up to date (demo)"); }} />
          )}
        </main>
      </div>
      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  );
}

function Sidebar({ page, navigate, simulationRunning }: { page: PageKey; navigate: (key: PageKey) => void; simulationRunning: boolean }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/assets/kairox_logo_banner.png" alt="KAIROX · Detect, Contain, Recover" />
        <span>LOCAL ENDPOINT <i /> UI PROTOTYPE</span>
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {navigation.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`nav-item ${page === key ? "active" : ""}`} onClick={() => navigate(key)}>
            <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            {page === key && <ChevronRight className="nav-chevron" size={14} />}
          </button>
        ))}
      </nav>
      <div className="endpoint-card">
        <div className="endpoint-icon"><Monitor size={18} /></div>
        <div className="endpoint-copy"><strong>DESKTOP-ABDULLAH</strong><span>Local endpoint</span></div>
        <span className={`status-dot ${simulationRunning ? "" : "paused-dot"}`} />
        <small className={simulationRunning ? "" : "simulation-paused"}>{simulationRunning ? "SIMULATION ACTIVE" : "SIMULATION PAUSED"}</small>
        <label>SIMULATED DATA</label>
      </div>
      <div className="sidebar-foot"><span className="green-dot" />Prototype mode <span className="version">v0.2</span></div>
    </aside>
  );
}

function TopBar({ canaryCount, volumeCount, eventRate, incidentCount, paused, lastEvent, runtimeInfo, runtimeError, navigate }: {
  canaryCount: number; volumeCount: number; eventRate: string; incidentCount: number; paused: boolean; lastEvent: ActivityEvent;
  runtimeInfo: RuntimeInfo | null; runtimeError: string; navigate: (key: PageKey) => void;
}) {
  return (
    <header className="topbar">
      <div className="machine-chip"><Monitor size={17} /><div><strong>DESKTOP-ABDULLAH</strong><span>Windows 11 · Local endpoint</span></div></div>
      <div className="top-stat"><span className="green-dot" /><div><strong>Agent</strong><small>Running · demo</small></div></div>
      <div className="top-stat"><span className={`green-dot ${paused ? "paused-dot" : ""}`} /><div><strong>Monitoring</strong><small>{paused ? "Feed paused" : "Active · demo"}</small></div></div>
      <div className="top-stat"><HardDrive size={17} /><div><strong>{String(volumeCount).padStart(2, "0")}</strong><small>Volumes</small></div></div>
      <div className="top-stat"><Shield size={17} /><div><strong>{String(canaryCount).padStart(2, "0")}</strong><small>Canaries</small></div></div>
      <div className="top-stat"><Zap size={17} /><div><strong>{eventRate}</strong><small>Events/s</small></div></div>
      <div className="top-stat incident-stat"><AlertTriangle size={17} /><div><strong>{String(incidentCount).padStart(2, "0")}</strong><small>Incidents</small></div></div>
      <div className="runtime-state" title={runtimeError || (runtimeInfo ? `${runtimeInfo.appName} · ${runtimeInfo.platform}` : "Checking native desktop runtime")}>
        <i className={runtimeInfo ? "green-dot" : runtimeError ? "amber-dot" : "blue-dot"} />
        <span>{runtimeInfo ? `TAURI DESKTOP · ${runtimeInfo.platform.toUpperCase()}` : runtimeError ? "BROWSER PREVIEW" : "CONNECTING TO TAURI"}</span>
      </div>
      <div className="last-event"><span>LAST EVENT</span><strong>{new Date(lastEvent.timestampMs).toLocaleTimeString()}</strong></div>
      <button className="icon-button notification-button" aria-label="View incidents" title="Open threat incidents" onClick={() => navigate("incidents")}><Bell size={17} />{incidentCount > 0 && <i />}</button>
    </header>
  );
}

function Dashboard(props: {
  nodes: FilesystemNode[]; selectedNode: FilesystemNode | null; selectNode: (id: string) => void; deselectNode: () => void;
  events: ActivityEvent[]; selectedEvent: ActivityEvent; selectEvent: (id: number) => void;
  canaries: CanaryAsset[]; incidents: ThreatIncident[]; incidentCount: number; triggeredCount: number; activeCount: number;
  navigate: (key: PageKey) => void; scan: ScanState; scannedNodeIds: ReadonlySet<string>;
  simulationRunning: boolean; simulationSpeed: SimulationSpeed; setSimulationRunning: (running: boolean) => void;
  setSimulationSpeed: (speed: SimulationSpeed) => void; resetSimulation: () => void;
  generateScenario: (scenario: "suspicious" | "canary") => void; startScan: () => void; cancelScan: () => void;
  copyPath: (path: string) => void; openIncident: (event: ActivityEvent) => void; setNotice: (notice: string) => void;
  feedPaused: boolean; toggleFeed: () => void;
}) {
  return (
    <div className="dashboard-layout">
      <section className="dashboard-center">
        <MapPanel {...props} />
        <div className="monitoring-grid">
          <EventsPanel {...props} />
          <ActivityPanel events={props.events} />
          <PosturePanel paused={props.feedPaused} canaries={props.canaries} incidents={props.incidents} scan={props.scan} />
        </div>
      </section>
      <Inspector node={props.selectedNode} nodes={props.nodes} events={props.events} incidents={props.incidents} canaries={props.canaries}
        copyPath={props.copyPath} selectEvent={props.selectEvent} openIncident={props.openIncident} setNotice={props.setNotice} />
    </div>
  );
}

function MapPanel(props: {
  nodes: FilesystemNode[]; events: ActivityEvent[]; canaries: CanaryAsset[]; incidents: ThreatIncident[];
  selectedNode: FilesystemNode | null; selectNode: (id: string) => void; deselectNode: () => void;
  scan: ScanState; scannedNodeIds: ReadonlySet<string>; simulationRunning: boolean; simulationSpeed: SimulationSpeed;
  setSimulationRunning: (running: boolean) => void; setSimulationSpeed: (speed: SimulationSpeed) => void;
  resetSimulation: () => void; generateScenario: (scenario: "suspicious" | "canary") => void;
  startScan: () => void; cancelScan: () => void; navigate: (key: PageKey) => void;
}) {
  return <IntelligenceMap {...props} />;
}

function EventsPanel(props: {
  events: ActivityEvent[]; selectedEvent: ActivityEvent; selectEvent: (id: number) => void;
  feedPaused: boolean; toggleFeed: () => void; navigate: (key: PageKey) => void;
}) {
  return (
    <section className="panel data-panel">
      <div className="panel-header"><div className="panel-title"><span className="title-icon"><Activity size={14} /></span><span>LIVE FILESYSTEM EVENTS</span><i className="green-dot" /><small>{props.feedPaused ? "PAUSED" : "REAL-TIME"}</small></div>
        <button className="text-button" onClick={props.toggleFeed}>{props.feedPaused ? <Play size={12} /> : <Pause size={12} />}{props.feedPaused ? "Resume" : "Pause"}</button></div>
      <div className="event-table compact">
        <div className="event-row event-head"><span>TIME</span><span>TYPE</span><span>PATH</span><span>PROCESS</span><span>RISK</span></div>
        {props.events.slice(0, 5).map((event) => <button key={event.id} className={`event-row ${event.id === props.selectedEvent.id ? "selected" : ""}`} onClick={() => props.selectEvent(event.id)}>
          <span className="mono">{event.time}</span><span className={`event-type ${riskClass(event.risk)}`}>{event.eventType}<small>SIM</small></span><span className="path-cell">{event.path}</span><span className="process-cell">{event.process}</span><span><RiskBadge risk={event.risk} /></span>
        </button>)}
      </div>
      <button className="panel-footer-link" onClick={() => props.navigate("telemetry")}>View all events <ArrowRight size={12} /></button>
    </section>
  );
}

function ActivityPanel({ events }: { events: ActivityEvent[] }) {
  const grouped = Array.from({ length: 24 }, () => ({ normal: 0, suspicious: 0, canary: 0, critical: 0 }));
  events.slice(0, 72).forEach((event, index) => {
    const bucket = grouped[23 - (index % 24)];
    if (event.eventType.toLowerCase().includes("canary")) bucket.canary += 1;
    else if (event.risk === "Critical") bucket.critical += 1;
    else if (event.risk === "High" || event.risk === "Medium") bucket.suspicious += 1;
    else bucket.normal += 1;
  });
  const maximum = Math.max(1, ...grouped.map((bucket) => bucket.normal + bucket.suspicious + bucket.canary + bucket.critical));
  return (
    <section className="panel activity-panel">
      <div className="panel-header"><div className="panel-title"><span className="title-icon"><Clock3 size={14} /></span><span>EVENT ACTIVITY</span><small className="panel-subtitle">LAST 60 MIN</small></div><button className="more-button" aria-label="More activity options"><MoreHorizontal size={17} /></button></div>
      <div className="activity-chart">
        <div className="chart-y-labels"><span>30</span><span>20</span><span>10</span><span>0</span></div>
        <div className="chart-bars">{grouped.map((bucket, index) => <div key={index} className="chart-bar-group">
          <i style={{ height: `${Math.max(3, bucket.normal / maximum * 100)}%` }} />
          <i className="alert" style={{ height: `${bucket.suspicious / maximum * 100}%` }} />
          <i className="canary" style={{ height: `${bucket.canary / maximum * 100}%` }} />
          <i className="critical" style={{ height: `${bucket.critical / maximum * 100}%` }} />
        </div>)}</div>
      </div>
      <div className="chart-time"><span>13:30</span><span>14:00</span><span>14:35</span></div>
      <div className="chart-legend"><span><i className="legend-blue" />Normal</span><span><i className="legend-amber" />Suspicious</span><span><i className="legend-red" />Canary</span><span><i className="legend-critical" />Critical</span></div>
    </section>
  );
}

function PosturePanel({ paused, canaries, incidents, scan }: { paused: boolean; canaries: CanaryAsset[]; incidents: ThreatIncident[]; scan: ScanState }) {
  const hasOpenThreat = incidents.some((incident) => incident.status !== "Resolved" && incident.severity === "Critical");
  const missingCanary = canaries.some((canary) => canary.status === "Missing");
  const riskPenalty = incidents.filter((incident) => incident.status !== "Resolved").reduce((sum, incident) => sum + (incident.severity === "Critical" ? 15 : incident.severity === "High" ? 8 : 3), 0);
  const score = Math.max(0, 100 - riskPenalty - (missingCanary ? 10 : 0));
  const signals = [
    ["Agent lifecycle", "Running · demo", "good"],
    ["Canary management", missingCanary ? "Attention" : "Healthy", missingCanary ? "warn" : "good"],
    ["Filesystem telemetry", paused ? "Paused" : "Active · simulated", paused ? "warn" : "good"],
    ["Feature extraction", scan.status === "scanning" || scan.status === "suspicious" ? "Scanning" : "Ready", "good"],
    ["Detection engine", hasOpenThreat ? "Alert present" : "Healthy", hasOpenThreat ? "warn" : "good"],
    ["Response orchestration", "Demo only", "blue"],
  ];
  return <section className="panel posture-panel">
    <div className="panel-header"><div className="panel-title"><span className="title-icon"><ShieldCheck size={14} /></span><span>SECURITY POSTURE</span></div><span className="posture-score">{score}<span>/100</span></span></div>
    <div className="posture-list">{signals.map(([name, state, tone]) => <div className="posture-row" key={name}><span className={`posture-icon ${tone}`}><Check size={10} /></span><span>{name}</span><b className={tone}>{state}</b></div>)}</div>
    <div className="posture-foot"><span className={hasOpenThreat || missingCanary ? "amber-dot" : "green-dot"} />{hasOpenThreat || missingCanary ? "Review demo alerts and registry" : "Simulated components operational"}</div>
  </section>;
}

function Inspector({ node, nodes, events, incidents, canaries, copyPath, selectEvent, openIncident, setNotice }: {
  node: FilesystemNode | null; nodes: FilesystemNode[]; events: ActivityEvent[]; incidents: ThreatIncident[]; canaries: CanaryAsset[];
  copyPath: (path: string) => void; selectEvent: (id: number) => void;
  openIncident: (event: ActivityEvent) => void; setNotice: (notice: string) => void;
}) {
  const [tab, setTab] = useState("File Details");
  const relatedEvents = node ? events.filter((event) => event.nodeId === node.id) : [];
  const lastEvent = relatedEvents[0];
  const relatedIncidents = node ? incidents.filter((incident) => incident.nodeId === node.id) : [];
  const canary = node ? canaries.find((item) => item.nodeId === node.id) : undefined;
  const parentPath = nodes.find((candidate) => candidate.id === node?.parentId)?.path ?? "—";
  if (!node) return <aside className="panel inspector inspector-empty"><div className="no-node-selected">Select a map node to inspect its simulated details</div><div className="demo-disclaimer"><ShieldCheck size={13} />Demonstration data only · no files are collected</div></aside>;
  return (
    <aside className="panel inspector">
      <div className="inspector-tabs"><button className={tab === "File Details" ? "active" : ""} onClick={() => setTab("File Details")}>File Details</button><button className={tab === "Events" ? "active" : ""} onClick={() => setTab("Events")}>Events</button><button className={tab === "Related" ? "active" : ""} onClick={() => setTab("Related")}>Related</button><button className="icon-button" aria-label="More details"><MoreHorizontal size={17} /></button></div>
      {tab === "File Details" ? <div className="inspector-content">
        <div className="file-summary"><span className="file-tile large"><FileCode2 size={23} /></span><div><h2>{node.name}</h2><span className={`status-label ${riskClass(node.risk)}`}><i />{node.risk} · {node.status}</span></div></div>
        <div className="detail-path"><div><small>PATH</small><span title={node.path}>{node.path}</span></div><button onClick={() => void copyPath(node.path)} aria-label="Copy path"><Copy size={14} /></button></div>
        <div className="detail-list">
          <DetailRow label="Size" value={node.size} /><DetailRow label="Type" value={node.fileType} />
          <DetailRow label="Modified" value={node.modified} /><DetailRow label="Parent" value={parentPath} />
          <DetailRow label="Event count" value={node.eventCount} />
          <DetailRow label="Risk level" value={<RiskBadge risk={node.risk} />} /><DetailRow label="Canary status" value={canary?.status ?? "Not a canary"} />
          <DetailRow label="Last event" value={lastEvent ? `${lastEvent.eventType} · ${lastEvent.time}` : "No event recorded"} />
          <DetailRow label="Related incidents" value={String(relatedIncidents.length)} />
        </div>
        <div className="reason-block"><h3>DEMONSTRATION DATA</h3><p>Sample node from the simulated Windows filesystem topology. This view does not read or monitor actual files.</p></div>
        {lastEvent && <button className="outline-action danger-outline" onClick={() => openIncident(lastEvent)}><ShieldAlert size={15} />View related incident<ArrowRight size={14} /></button>}
        <div className="quick-actions"><h3>QUICK ACTIONS</h3><button className="outline-action" onClick={() => setNotice("Reveal in Tree is a demo action")}><FolderOpen size={15} />Reveal in Tree<ArrowRight size={14} /></button><button className="outline-action" onClick={() => void copyPath(node.path)}><Copy size={15} />Copy Path<ArrowRight size={14} /></button></div>
        <div className="demo-disclaimer"><ShieldCheck size={13} />Sample record · No system data collected</div>
      </div> : <div className="inspector-content inspector-alt">
        <div className="eyebrow">{tab === "Events" ? "RECENT SIMULATED ACTIVITY" : "RELATED OBJECTS"}</div>
        {tab === "Events" ? relatedEvents.length ? relatedEvents.slice(0, 8).map((event) => <button className="timeline-item timeline-event" key={event.id} onClick={() => selectEvent(event.id)}><i className={`timeline-dot ${event.risk === "Critical" ? "red" : event.risk === "High" || event.risk === "Medium" ? "amber" : "cyan"}`} /><div><b>{event.eventType}</b><span>{event.time} · {event.process}</span></div></button>) : <div className="no-node-selected">No simulated events for this node.</div> :
          <>{relatedIncidents.map((incident) => <RelatedItem key={incident.id} icon={<ShieldAlert size={15} />} title={incident.id} subtitle={`${incident.title} · ${incident.status}`} />)}
            {lastEvent && <RelatedItem icon={<Terminal size={15} />} title={lastEvent.process} subtitle="Associated process · simulated data" />}
            <RelatedItem icon={<HardDrive size={15} />} title={node.parentId ? nodes.find((candidate) => candidate.id === node.parentId)?.name ?? node.parentId : "Endpoint root"} subtitle={parentPath} /></>}
      </div>}
    </aside>
  );
}

function RelatedItem({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="related-item"><span>{icon}</span><div><b>{title}</b><small>{subtitle}</small></div><ChevronRight size={14} /></div>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="detail-row"><span>{label}</span><b>{value}</b></div>;
}

function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={`risk-badge ${riskClass(risk)}`}><i />{risk}</span>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-box"><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><kbd>⌘ K</kbd></label>;
}

function FilterChips({ items, selected, onSelect }: { items: string[]; selected: string; onSelect: (value: string) => void }) {
  return <div className="filter-chips">{items.map((item) => <button className={selected === item ? "active" : ""} onClick={() => onSelect(item)} key={item}>{item}</button>)}</div>;
}

function TelemetryPage({ events, filter, setFilter, search, setSearch, selectedId, selectEvent, paused, toggleFeed }: {
  events: ActivityEvent[]; filter: string; setFilter: (filter: string) => void; search: string; setSearch: (search: string) => void;
  selectedId: number; selectEvent: (id: number) => void; paused: boolean; toggleFeed: () => void;
}) {
  return <div className="inner-page">
    <PageHeading eyebrow="EVENT STREAM" title="Live filesystem telemetry" subtitle="Normalized endpoint activity · sample records only"
      action={<button className="primary-button" onClick={toggleFeed}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "Resume feed" : "Pause feed"}</button>} />
    <div className="panel table-toolbar"><FilterChips items={eventFilters} selected={filter} onSelect={setFilter} /><SearchBox value={search} onChange={setSearch} placeholder="Search events, paths, or processes" /></div>
    <section className="panel full-table"><div className="table-caption"><span><span className="green-dot" />{paused ? "FEED PAUSED" : "STREAMING SAMPLE DATA"}</span><span>{events.length} events in view</span></div>
      <div className="event-table full">
        <div className="event-row event-head"><span>TIME</span><span>EVENT TYPE</span><span>PATH</span><span>PROCESS</span><span>VOLUME</span><span>RISK</span></div>
        {events.map((event) => <button key={event.id} className={`event-row ${selectedId === event.id ? "selected" : ""}`} onClick={() => selectEvent(event.id)}>
          <span className="mono">{event.time}</span><span className={`event-type ${riskClass(event.risk)}`}>{event.eventType}<small>SIM</small></span><span className="path-cell">{event.path}</span><span className="process-cell">{event.process}</span><span>{event.volume}</span><span><RiskBadge risk={event.risk} /></span>
        </button>)}
        {events.length === 0 && <div className="empty-state"><FileSearch size={24} /><b>No events match this view</b><span>Try a different filter or search term.</span></div>}
      </div>
    </section>
  </div>;
}

function CanariesPage({ canaries, allCanaries, selected, filter, setFilter, search, setSearch, selectCanary, addCanary, toggleCanary, viewMap, viewIncident, volumeCount, copyPath }: {
  canaries: CanaryAsset[]; allCanaries: CanaryAsset[]; selected: CanaryAsset; filter: string; setFilter: (filter: string) => void; search: string; setSearch: (search: string) => void;
  selectCanary: (id: string) => void; addCanary: () => void; toggleCanary: () => void; viewMap: () => void; viewIncident: (canary: CanaryAsset) => void;
  volumeCount: number; copyPath: (path: string) => void;
}) {
  const filters = ["All", "Active", "Triggered", "Missing"];
  return <div className="inner-page">
    <PageHeading eyebrow="DECEPTION LAYER" title="Canary registry" subtitle="Demo decoy assets and their simulated lifecycle"
      action={<button className="primary-button" onClick={addCanary}><Plus size={15} />Register canary</button>} />
    <div className="page-stats"><StatCard icon={<ShieldCheck size={17} />} label="TOTAL ASSETS" value={String(allCanaries.length).padStart(2, "0")} tone="cyan" /><StatCard icon={<Activity size={17} />} label="ACTIVE" value={String(allCanaries.filter((item) => item.status === "Active").length).padStart(2, "0")} tone="green" /><StatCard icon={<ShieldAlert size={17} />} label="TRIGGERED" value={String(allCanaries.filter((item) => item.status === "Triggered").length).padStart(2, "0")} tone="red" /><StatCard icon={<Archive size={17} />} label="VOLUMES" value={String(volumeCount).padStart(2, "0")} tone="blue" /></div>
    <div className="panel table-toolbar"><FilterChips items={filters} selected={filter} onSelect={setFilter} /><SearchBox value={search} onChange={setSearch} placeholder="Search registry" /></div>
    <div className="split-content">
      <section className="panel full-table"><div className="event-table canary-table">
        <div className="event-row event-head"><span>ID</span><span>ASSET</span><span>PATH</span><span>VOLUME</span><span>STATUS</span><span>LAST TRIGGER</span></div>
        {canaries.map((canary) => <button key={canary.id} className={`event-row ${selected?.id === canary.id ? "selected" : ""}`} onClick={() => selectCanary(canary.id)}>
          <span className="mono muted">{canary.id}</span><span className="asset-name"><FileCode2 size={15} />{canary.name}</span><span className="path-cell">{canary.path}</span><span>{canary.volume}</span><span><StateBadge state={canary.status} /></span><span className="muted">{canary.lastTrigger}</span>
        </button>)}
      </div></section>
      {selected && <section className="panel detail-card">
        <div className="panel-header"><div className="panel-title"><span className="title-icon"><Shield size={14} /></span>CANARY DETAILS</div><span className="small-id">{selected.id}</span></div>
        <div className="detail-hero"><span className="file-tile large amber-tile"><Shield size={22} /></span><div><h2>{selected.name}</h2><StateBadge state={selected.status} /></div></div>
        <div className="detail-path"><div><small>PATH</small><span title={selected.path}>{selected.path}</span></div><button aria-label="Copy path" onClick={() => copyPath(selected.path)}><Copy size={14} /></button></div>
        <div className="detail-list"><DetailRow label="Type" value={selected.type} /><DetailRow label="Volume" value={selected.volume} /><DetailRow label="Registered" value={selected.registered} /><DetailRow label="Last trigger" value={selected.lastTrigger} /><DetailRow label="Trigger count" value={selected.triggerCount} /></div>
        <div className="detail-actions"><button className="outline-action" onClick={viewMap}><Radar size={15} />View in Map<ArrowRight size={14} /></button><button className="outline-action danger-outline" onClick={() => viewIncident(selected)}><ShieldAlert size={15} />View Incident<ArrowRight size={14} /></button><button className="secondary-button" onClick={toggleCanary}>{selected.status === "Missing" ? "Mark active" : "Mark missing"}</button></div>
        <div className="demo-disclaimer"><ShieldCheck size={13} />Synthetic inventory only · no decoy files are created</div>
      </section>}
    </div>
  </div>;
}

function IncidentsPage({ incidents, allIncidents, lastEvent, selected, filter, setFilter, search, setSearch, selectIncident, updateStatus }: {
  incidents: ThreatIncident[]; allIncidents: ThreatIncident[]; lastEvent: ActivityEvent;
  selected: ThreatIncident; filter: string; setFilter: (filter: string) => void;
  search: string; setSearch: (search: string) => void; selectIncident: (id: string) => void; updateStatus: () => void;
}) {
  const openCount = allIncidents.filter((incident) => incident.status === "Open").length;
  const investigatingCount = allIncidents.filter((incident) => incident.status === "Investigating").length;
  const resolvedCount = allIncidents.filter((incident) => incident.status === "Resolved").length;
  return <div className="inner-page">
    <PageHeading eyebrow="INVESTIGATION" title="Threat incidents" subtitle="Review sample detections and associated evidence" action={<span className="incident-count"><i className="red-dot" />{incidents.length} records shown</span>} />
    <div className="page-stats"><StatCard icon={<ShieldAlert size={17} />} label="OPEN" value={String(openCount).padStart(2, "0")} tone="red" /><StatCard icon={<Activity size={17} />} label="INVESTIGATING" value={String(investigatingCount).padStart(2, "0")} tone="amber" /><StatCard icon={<ShieldCheck size={17} />} label="RESOLVED" value={String(resolvedCount).padStart(2, "0")} tone="green" /><StatCard icon={<Clock3 size={17} />} label="LAST EVENT" value={lastEvent.time} tone="blue" /></div>
    <div className="panel table-toolbar"><FilterChips items={incidentFilters} selected={filter} onSelect={setFilter} /><SearchBox value={search} onChange={setSearch} placeholder="Search incidents" /></div>
    <div className="split-content">
      <section className="panel full-table"><div className="event-table incident-table">
        <div className="event-row event-head"><span>ID</span><span>TIME</span><span>SEVERITY</span><span>CLASSIFICATION</span><span>ATTRIBUTION</span><span>STATUS</span></div>
        {incidents.map((incident) => <button key={incident.id} className={`event-row ${selected?.id === incident.id ? "selected" : ""}`} onClick={() => selectIncident(incident.id)}>
          <span className="mono">{incident.id}</span><span className="mono muted">{incident.time}</span><span><RiskBadge risk={incident.severity} /></span><span>{incident.category}</span><span className="path-cell">{incident.attribution}</span><span><StateBadge state={incident.status} /></span>
        </button>)}
      </div></section>
      {selected && <section className="panel detail-card incident-detail">
        <div className="panel-header"><div className="panel-title"><span className="title-icon red"><ShieldAlert size={14} /></span>INCIDENT DETAILS</div><span className="small-id">{selected.id}</span></div>
        <div className="incident-labels"><RiskBadge risk={selected.severity} /><span className="type-pill">{selected.category}</span></div>
        <h2 className="incident-title">{selected.title}</h2><p className="muted-text">{selected.time}</p>
        <div className="reason-block"><h3>SUMMARY</h3><p>{selected.summary}</p></div>
        <div className="detail-list"><DetailRow label="Path" value={selected.path} /><DetailRow label="Canary" value={selected.canaryId} /><DetailRow label="Attribution" value={selected.attribution} /><DetailRow label="Classification" value={selected.classification} /></div>
        <div className="rule-box"><span>DETECTION RULE</span><code>{selected.detectionRule}</code></div>
        <button className={`outline-action ${selected.severity === "Critical" ? "danger-outline" : ""}`} onClick={updateStatus}><Activity size={15} />{selected.status === "Open" ? "Begin investigation" : selected.status === "Investigating" ? "Mark resolved" : "Reopen incident"}<ArrowRight size={14} /></button>
        <div className="demo-disclaimer"><ShieldCheck size={13} />Illustrative incident · not a real detection</div>
      </section>}
    </div>
  </div>;
}

function StateBadge({ state }: { state: string }) {
  const tone = state === "Triggered" || state === "Open" ? "red" : state === "Missing" || state === "Investigating" ? "amber" : state === "Resolved" ? "blue" : "green";
  return <span className={`state-badge ${tone}`}><i />{state}</span>;
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return <div className="panel stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><small>{label}</small><b>{value}</b></div><div className={`stat-spark ${tone}`}><i /><i /><i /><i /><i /><i /><i /></div></div>;
}

function ExplorerPage({ nodes, events, canaries, incidents, selectedNodeId, selectNode, selectedFolder, setSelectedFolder, search, setSearch, navigateMap }: {
  nodes: FilesystemNode[]; events: ActivityEvent[]; canaries: CanaryAsset[]; incidents: ThreatIncident[];
  selectedNodeId: string | null; selectNode: (id: string) => void;
  selectedFolder: string; setSelectedFolder: (folder: string) => void; search: string; setSearch: (search: string) => void; navigateMap: () => void;
}) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const selectedFolderNode = nodesById.get(selectedFolder) ?? nodes.find((node) => node.type === "directory") ?? nodes[0];
  const selectedRecord = nodesById.get(selectedNodeId ?? "") ?? selectedFolderNode;
  const treeNodes = nodes.filter((node) => node.type === "volume" || node.type === "directory");
  const term = search.trim().toLowerCase();
  const children = selectedFolderNode ? nodes.filter((node) => node.parentId === selectedFolderNode.id) : [];
  const files = children.filter((node) => `${node.name} ${node.fileType} ${node.status} ${node.path}`.toLowerCase().includes(term));
  const ancestry: FilesystemNode[] = [];
  let cursor: FilesystemNode | undefined = selectedFolderNode;
  while (cursor && cursor.type !== "agent") {
    ancestry.unshift(cursor);
    cursor = cursor.parentId ? nodesById.get(cursor.parentId) : undefined;
  }
  const selectedCanary = selectedRecord ? canaries.find((canary) => canary.nodeId === selectedRecord.id) : undefined;
  const childEvents = selectedRecord ? events.filter((event) => event.path.toLowerCase().startsWith(selectedRecord.path.toLowerCase())).slice(0, 5) : [];
  const relatedIncidents = selectedRecord ? incidents.filter((incident) => incident.nodeId === selectedRecord.id) : [];
  const descendantCanaries = selectedRecord ? canaries.filter((canary) => {
    let node = nodesById.get(canary.nodeId);
    while (node) {
      if (node.id === selectedRecord.id) return true;
      node = node.parentId ? nodesById.get(node.parentId) : undefined;
    }
    return false;
  }).length : 0;
  const depthOf = (node: FilesystemNode) => {
    let depth = 0;
    let parent = node.parentId ? nodesById.get(node.parentId) : undefined;
    while (parent && parent.type !== "agent") {
      depth += 1;
      parent = parent.parentId ? nodesById.get(parent.parentId) : undefined;
    }
    return Math.min(depth, 4);
  };
  return <div className="inner-page">
    <PageHeading eyebrow="SAFE INVENTORY" title="Filesystem explorer" subtitle="Browse a fictional endpoint inventory · no device files are inspected"
      action={<button className="secondary-button" onClick={navigateMap}><Radar size={14} />Jump to map</button>} />
    <div className="explorer-layout">
      <section className="panel folder-tree"><div className="panel-header"><div className="panel-title"><FolderOpen size={14} />DIRECTORY TREE</div><button className="icon-button"><MoreHorizontal size={17} /></button></div>
        <div className="tree-root"><Monitor size={15} />This PC</div>
        {treeNodes.map((node) => <button key={node.id} style={{ paddingLeft: `${10 + depthOf(node) * 11}px` }}
          className={`tree-folder selectable ${selectedFolder === node.id ? "selected" : ""} ${node.type === "volume" ? "tree-volume" : ""}`}
          onClick={() => { setSelectedFolder(node.id); selectNode(node.id); }}>
          {node.type === "volume" ? <HardDrive size={14} /> : <Folder size={14} />}{node.name}<ChevronRight size={13} />
        </button>)}
        <div className="tree-footnote"><ShieldCheck size={13} />Sample filesystem</div>
      </section>
      <section className="panel explorer-files">
        <div className="breadcrumb"><span>This PC</span>{ancestry.map((node) => <Fragment key={node.id}><ChevronRight size={13} /><span>{node.name}</span></Fragment>)}</div>
        <div className="explorer-toolbar"><span>{files.length} items</span><SearchBox value={search} onChange={setSearch} placeholder="Search this folder" /></div>
        <div className="event-table file-table"><div className="event-row event-head"><span>NAME</span><span>TYPE</span><span>MODIFIED</span><span>STATE</span></div>
          {files.map((node) => <button className={`event-row ${node.id === selectedNodeId ? "selected" : ""}`} key={node.id}
            onClick={() => { selectNode(node.id); if (node.type === "directory" || node.type === "volume") setSelectedFolder(node.id); }}>
            <span className="asset-name">{node.type === "directory" ? <Folder size={15} /> : <File size={15} />}{node.name}</span>
            <span>{node.fileType}</span><span className="muted">{node.modified}</span>
            <span><StateBadge state={canaries.find((canary) => canary.nodeId === node.id)?.status ?? node.status} /></span>
          </button>)}
          {files.length === 0 && <div className="empty-state">No sample files found.</div>}
        </div>
        <div className="explorer-note"><LockKeyhole size={13} />This explorer displays demo records only and never reads local files.</div>
      </section>
      <section className="panel directory-card"><div className="panel-header"><div className="panel-title">SELECTED OBJECT</div><MoreHorizontal size={17} /></div>
        <span className="folder-hero">{selectedRecord?.type === "volume" ? <HardDrive size={22} /> : selectedRecord?.type === "directory" ? <Folder size={22} /> : <File size={22} />}</span>
        <h2>{selectedRecord?.name ?? "No selection"}</h2><span className="directory-path">{selectedRecord?.path ?? "—"}</span>
        <div className="detail-list">
          <DetailRow label="Type" value={selectedRecord?.fileType ?? "—"} /><DetailRow label="Size" value={selectedRecord?.size ?? "—"} />
          <DetailRow label="Modified" value={selectedRecord?.modified ?? "—"} /><DetailRow label="Children" value={selectedRecord?.type === "directory" || selectedRecord?.type === "volume" ? nodes.filter((node) => node.parentId === selectedRecord.id).length : "—"} />
          <DetailRow label="Canary assets" value={descendantCanaries} /><DetailRow label="Incidents" value={relatedIncidents.length} />
          <DetailRow label="Monitoring" value={<StateBadge state={selectedCanary?.status ?? selectedRecord?.status ?? "Unknown"} />} />
        </div>
        <h3 className="section-eyebrow">RECENT EVENTS</h3>
        {childEvents.length ? childEvents.slice(0, 3).map((event) => <div className="recent-item" key={event.id}><i className={event.risk === "Critical" ? "red-dot" : "green-dot"} />{event.time} · {event.eventType}</div>) : <div className="recent-item">No related sample events</div>}
        <button className="outline-action" onClick={navigateMap}><Radar size={15} />Locate on intelligence map<ArrowRight size={14} /></button>
      </section>
    </div>
  </div>;
}

function DetectionPage({ events, incidents, scan, analyticsEnabled }: {
  events: ActivityEvent[]; incidents: ThreatIncident[]; scan: ScanState; analyticsEnabled: boolean;
}) {
  const recentEvents = events.slice(0, 3);
  const anomalousEvents = events.filter((event) => event.risk === "Critical" || event.risk === "High" || event.risk === "Medium");
  const calculatedRiskScore = Math.min(1, events.slice(0, 20).reduce((score, event) => score + (
    event.risk === "Critical" ? 0.35 : event.risk === "High" ? 0.22 : event.risk === "Medium" ? 0.1 : event.risk === "Low" ? 0.02 : 0.005
  ), 0) / 1.5);
  const riskScore = analyticsEnabled ? calculatedRiskScore : null;
  const activeIncidents = incidents.filter((incident) => incident.status !== "Resolved").length;
  const highestRisk = recentEvents.some((event) => event.risk === "Critical") ? "CRITICAL"
    : recentEvents.some((event) => event.risk === "High") ? "HIGH"
      : recentEvents.some((event) => event.risk === "Medium") ? "ELEVATED" : "LOW";
  return <div className="inner-page">
    <PageHeading eyebrow="EXPLAINABLE ANALYSIS" title="Detection engine" subtitle="Explore how example signals are correlated into a risk assessment" />
    <div className="detection-summary">
      <DetectionCard icon={<ListFilter size={18} />} title="RULE ENGINE" value={`${activeIncidents} active`} detail="Derived from sample incidents" tone={activeIncidents ? "amber" : "green"} />
      <DetectionCard icon={<Sparkles size={18} />} title="SUPERVISED MODEL" value="Not loaded" detail="No inference model is connected" tone="cyan" />
      <DetectionCard icon={<Activity size={18} />} title="ANOMALY SIGNALS" value={String(anomalousEvents.length)} detail="Elevated-risk sample events" tone="purple" />
    </div>
    <div className="detection-layout">
      <section className="panel evidence-panel"><div className="panel-header"><div className="panel-title"><span className="title-icon"><Network size={14} /></span>CORRELATED EVIDENCE</div><span className="type-pill">DEMO · {incidents.find((incident) => incident.status !== "Resolved")?.id ?? "NO ACTIVE INCIDENT"}</span></div>
        <div className="evidence-timeline">{recentEvents.map((event) => <EvidenceRow key={event.id}
          tone={event.risk === "Critical" ? "red" : event.risk === "High" || event.risk === "Medium" ? "amber" : "blue"}
          title={event.eventType} score={event.risk.toUpperCase()} detail={`${event.path} · ${event.process}`} />)}
          {recentEvents.length === 0 && <div className="empty-state">No sample events are available.</div>}
        </div>
        <div className="reason-block"><h3>WHY THIS SCORE?</h3><p>Derived from the risk weights of the latest 20 shared sample events. It is an interface demonstration score, not a probability or a real detection. {scan.status === "completed" ? `The last demonstration scan examined ${scan.scannedFiles} files and ${scan.scannedDirectories} directories.` : "Run a demonstration scan to add scan results to the shared event stream."}</p></div>
      </section>
      <section className="panel assessment-panel"><div className="panel-header"><div className="panel-title"><span className="title-icon red"><Gauge size={14} /></span>SAMPLE RISK ASSESSMENT</div><span className="type-pill">DEMO DATA</span></div>
        <div className="risk-score">{riskScore === null ? "—" : riskScore.toFixed(2)}<span>/ 1.00</span></div><span className="muted-text">{analyticsEnabled ? "Derived demo activity score · not a probability" : "Automatic analytics are disabled in settings"}</span><div className="score-track"><i style={{ width: `${(riskScore ?? 0) * 100}%` }} /></div>
        <div className="assessment-alert"><AlertTriangle size={15} />{analyticsEnabled ? `${highestRisk} · DEMONSTRATION` : "ANALYTICS PAUSED · DEMO"}</div><p className="fine-print">No files are analyzed by this prototype. The score changes with the shared event store and is for interface demonstration only.</p>
      </section>
    </div>
    <div className="panel disclaimer-banner"><ShieldCheck size={16} /><span><b>Safe demonstration mode</b> · This dashboard uses synthetic data. Detection, scoring, and response functions are illustrative only.</span></div>
  </div>;
}

function DetectionCard({ icon, title, value, detail, tone }: { icon: React.ReactNode; title: string; value: string; detail: string; tone: string }) {
  return <div className="panel detection-card"><span className={`stat-icon ${tone}`}>{icon}</span><small>{title}</small><b className={tone}>{value}</b><span>{detail}</span></div>;
}

function EvidenceRow({ tone, title, score, detail }: { tone: string; title: string; score: string; detail: string }) {
  return <div className="evidence-row"><span className={`evidence-icon ${tone}`}><Activity size={14} /></span><div><b>{title}</b><small>{detail}</small></div><strong className={tone}>{score}</strong></div>;
}

function HealthPage({ paused, nodes, events, canaries, incidents, scan, runtimeInfo, navigate }: {
  paused: boolean; nodes: FilesystemNode[]; events: ActivityEvent[]; canaries: CanaryAsset[];
  incidents: ThreatIncident[]; scan: ScanState; runtimeInfo: RuntimeInfo | null; navigate: (key: PageKey) => void;
}) {
  const openIncidents = incidents.filter((incident) => incident.status !== "Resolved").length;
  const triggeredCanaries = canaries.filter((canary) => canary.status === "Triggered").length;
  const health = [
    ["Application runtime", runtimeInfo ? `${runtimeInfo.appName} · ${runtimeInfo.platform}` : "Browser preview", runtimeInfo ? "Connected" : "Preview", runtimeInfo ? "green" : "cyan", Monitor],
    ["Canary registry", `${canaries.length} sample assets · ${triggeredCanaries} triggered`, triggeredCanaries ? "Alert" : "Healthy", triggeredCanaries ? "amber" : "green", ShieldCheck],
    ["Filesystem telemetry", `${events.length} simulated events`, paused ? "Paused" : "Streaming", paused ? "amber" : "cyan", Activity],
    ["Filesystem index", `${nodes.filter((node) => node.type === "directory").length} directories · ${nodes.filter((node) => ["file", "canary", "suspicious", "threat"].includes(node.type)).length} files`, "Sample topology", "cyan", HardDrive],
    ["Detection engine", `${openIncidents} active sample incidents`, openIncidents ? "Review" : "Ready", openIncidents ? "amber" : "green", Gauge],
    ["Response orchestration", "No system actions enabled", "Demo only", "muted", LockKeyhole],
  ] as const;
  const scanLabel = scan.status === "completed" ? `${scan.scannedFiles}/${scan.totalFiles} files scanned (demo)`
    : scan.status === "scanning" || scan.status === "suspicious" ? `Demo scan ${scan.progress}%`
      : "No completed demo scan";
  const overall = openIncidents || triggeredCanaries ? "REVIEW SAMPLE ALERTS" : paused ? "SIMULATION PAUSED" : "DEMO SYSTEM READY";
  return <div className="inner-page">
    <PageHeading eyebrow="PROTOTYPE STATUS" title="System health" subtitle="Live indicators for the local demo environment" action={<span className="health-summary"><i className={openIncidents || triggeredCanaries ? "amber-dot" : "green-dot"} />{overall}</span>} />
    <div className="health-banner panel"><div className="health-pulse"><ShieldCheck size={24} /></div><div><b>Demonstration environment status</b><span>All values below derive from shared simulated data. This prototype does not run an endpoint agent.</span></div><span className="health-spark">{scanLabel}<small>SCAN STATUS</small></span></div>
    <div className="health-grid">{health.map(([name, description, state, tone, Icon]) => {
      const target: PageKey = name === "Canary registry" ? "canaries"
        : name === "Filesystem telemetry" ? "telemetry"
          : name === "Detection engine" ? "detection" : "settings";
      return <section className="panel health-card" key={name}><div className={`health-icon ${tone}`}><Icon size={17} /></div><div className="health-copy"><h2>{name}</h2><p>{description}</p><div className="health-state"><i className={`dot-${tone}`} />{state}<span>· SAMPLE</span></div></div><button className="icon-button" aria-label={`Open ${name}`} onClick={() => navigate(target)}><ChevronRight size={16} /></button></section>;
    })}</div>
    <div className="panel disclaimer-banner"><ShieldCheck size={16} /><span><b>Prototype status only</b> · No monitoring service, detection model, or response orchestration runs on this device.</span></div>
  </div>;
}

function SettingsPage({ settings, setSettings, lastUpdate, checkUpdates }: {
  settings: SettingsState; setSettings: (settings: SettingsState) => void; lastUpdate: string; checkUpdates: () => void;
}) {
  const toggle = (key: keyof SettingsState) => setSettings({ ...settings, [key]: !settings[key] });
  const options: Array<[keyof SettingsState, string, string]> = [
    ["monitoring", "Real-time monitoring", "Play the simulated telemetry feed continuously"],
    ["canaryDetection", "Canary detection", "Include demo canary activity in the event stream"],
    ["analytics", "Automatic analytics", "Refresh illustrative risk scores in the interface"],
    ["advanced", "Advanced mode", "Show extended sample correlation details"],
    ["demo", "Demo protection", "Keep all application actions in prototype mode"],
  ];
  return <div className="inner-page">
    <PageHeading eyebrow="PREFERENCES" title="Settings" subtitle="Adjust local prototype preferences · no operating-system settings are changed" />
    <div className="settings-layout">
      <section className="panel settings-card"><div className="panel-header"><div className="panel-title"><span className="title-icon"><SlidersIcon /></span>CORRELATION SETTINGS</div><span className="type-pill">LOCAL</span></div>
        {options.map(([key, title, detail]) => <SettingRow key={key} title={title} detail={detail} checked={settings[key]} onChange={() => toggle(key)} />)}
      </section>
      <section className="panel settings-card"><div className="panel-header"><div className="panel-title"><span className="title-icon"><LockKeyhole size={14} /></span>SECURITY & PRIVACY</div></div>
        <SettingRow title="Enable demo logging" detail="Record actions in the in-memory sample log" checked={settings.logging} onChange={() => toggle("logging")} />
        <SettingRow title="Encrypt database" detail="Illustrative preference · no database is connected" checked={settings.encryption} onChange={() => toggle("encryption")} />
        <div className="setting-row"><div><b>Auto-lock</b><span>Lock the dashboard after inactivity</span></div><select defaultValue="15"><option>5 min</option><option>10 min</option><option>15</option><option>30 min</option><option>60 min</option></select></div>
        <div className="privacy-callout"><ShieldCheck size={15} /><span><b>Privacy by design</b>No filesystem collection or process inspection is active.</span></div>
      </section>
      <section className="panel about-card"><div className="panel-header"><div className="panel-title">ABOUT KAIROX</div><MoreHorizontal size={17} /></div>
        <div className="about-brand"><span className="about-emblem">K</span><div><b>KAIROX</b><small>ENDPOINT INTELLIGENCE</small></div></div>
        <p>Detect at the decisive moment.</p><span className="type-pill">VERSION 0.2.0 · TAURI</span>
        <div className="about-demo"><span className="green-dot" /><b>DEMO MODE ACTIVE</b><small>This is a demonstration environment using sample data. No endpoint telemetry is collected.</small></div>
        <button className="primary-button full-width" onClick={checkUpdates}><ArrowDownToLine size={14} />Check for updates</button>
        <small className="last-update">Last checked: {lastUpdate}</small>
      </section>
    </div>
  </div>;
}

function SlidersIcon() {
  return <ListFilter size={14} />;
}

function SettingRow({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange: () => void }) {
  return <div className="setting-row"><div><b>{title}</b><span>{detail}</span></div><button className={`toggle-switch ${checked ? "on" : ""}`} onClick={onChange} role="switch" aria-checked={checked} aria-label={title}><i /></button></div>;
}

export default App;
