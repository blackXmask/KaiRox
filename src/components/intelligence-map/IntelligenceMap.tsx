import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  Activity, ArrowRight, Check, ChevronDown, FileCode2,
  Folder, Gauge, HardDrive, LocateFixed, Maximize, Minus, Pause, Play,
  Plus, Radar, RotateCcw, ScanLine, Shield, ShieldAlert,
} from "lucide-react";
import type {
  ActivityEvent,
  CanaryAsset,
  FilesystemNode,
  PageKey,
  ScanState,
  SimulationSpeed,
  ThreatIncident,
} from "../../types";

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 550;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.4;

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

interface MapPointer {
  pointerId: number;
  clientX: number;
  clientY: number;
  viewX: number;
  viewY: number;
  nodeId: string | null;
  moved: boolean;
}

interface IntelligenceMapProps {
  nodes: FilesystemNode[];
  events: ActivityEvent[];
  canaries: CanaryAsset[];
  incidents: ThreatIncident[];
  selectedNode: FilesystemNode | null;
  scan: ScanState;
  scannedNodeIds: ReadonlySet<string>;
  simulationRunning: boolean;
  simulationSpeed: SimulationSpeed;
  selectNode: (nodeId: string) => void;
  deselectNode: () => void;
  setSimulationRunning: (running: boolean) => void;
  setSimulationSpeed: (speed: SimulationSpeed) => void;
  resetSimulation: () => void;
  generateScenario: (scenario: "suspicious" | "canary") => void;
  startScan: () => void;
  cancelScan: () => void;
  navigate: (page: PageKey) => void;
}

function nodeClass(node: FilesystemNode): string {
  return [
    "graph-node",
    `node-${node.type}`,
    `risk-${node.risk.toLowerCase()}`,
    `status-${node.status.toLowerCase()}`,
  ].join(" ");
}

function nodeGlyph(node: FilesystemNode): string {
  switch (node.type) {
    case "agent": return "K";
    case "volume": return "▰";
    case "directory": return "▰";
    case "process": return "◉";
    case "canary": return "◇";
    case "threat": return "!";
    case "suspicious": return "!";
    default: return "·";
  }
}

function nodeRadius(node: FilesystemNode): number {
  switch (node.type) {
    case "agent": return 22;
    case "volume": return 16;
    case "directory": return 10;
    case "canary":
    case "threat":
    case "suspicious": return 11;
    case "process": return 8;
    default: return 7;
  }
}

function connectionPath(parent: FilesystemNode, node: FilesystemNode): string {
  const dx = node.x - parent.x;
  const dy = node.y - parent.y;
  const length = Math.hypot(dx, dy) || 1;
  const direction = [...`${parent.id}:${node.id}`].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 ? 1 : -1;
  const bend = Math.min(54, length * 0.18) * direction;
  const offsetX = (-dy / length) * bend;
  const offsetY = (dx / length) * bend;
  const firstControlX = parent.x + dx / 3 + offsetX;
  const firstControlY = parent.y + dy / 3 + offsetY;
  const secondControlX = parent.x + (dx * 2) / 3 + offsetX;
  const secondControlY = parent.y + (dy * 2) / 3 + offsetY;

  return `M ${parent.x} ${parent.y} C ${firstControlX} ${firstControlY} ${secondControlX} ${secondControlY} ${node.x} ${node.y}`;
}

function MapMetric({ label, value }: { label: string; value: string }) {
  return <div className="metric-line"><span>{label}</span><b>{value}</b></div>;
}

function CollapseToggle({ expanded, controls, onClick }: { expanded: boolean; controls: string; onClick: () => void }) {
  return (
    <button
      className="collapse-toggle"
      type="button"
      aria-label={expanded ? "Collapse panel" : "Expand panel"}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <ChevronDown size={13} />
    </button>
  );
}

export default function IntelligenceMap({
  nodes,
  events,
  canaries,
  incidents,
  selectedNode,
  scan,
  scannedNodeIds,
  simulationRunning,
  simulationSpeed,
  selectNode,
  deselectNode,
  setSimulationRunning,
  setSimulationSpeed,
  resetSimulation,
  generateScenario,
  startScan,
  cancelScan,
  navigate,
}: IntelligenceMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const pointerRef = useRef<MapPointer | null>(null);
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const animationRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useState({
    overview: false,
    selectedNode: false,
    legend: false,
  });
  function togglePanel(panel: keyof typeof collapsedPanels) {
    setCollapsedPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }
  const canaryCount = canaries.length;
  const activeCount = canaries.filter((canary) => canary.status === "Active").length;
  const threatenedNodes = nodes.filter((node) => node.risk === "Critical" || node.risk === "High");
  const lastEvent = events[0];
  const selectedNodeEvents = selectedNode
    ? events.filter((event) => event.nodeId === selectedNode.id)
    : [];
  const selectedNodeIncidents = selectedNode
    ? incidents.filter((incident) => incident.nodeId === selectedNode.id)
    : [];

  function applyTransform(next: ViewTransform, animate = false) {
    transformRef.current = next;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    const update = () => {
      if (contentRef.current) {
        contentRef.current.setAttribute("transform", `translate(${next.x} ${next.y}) scale(${next.scale})`);
      }
      setZoom(next.scale);
      animationRef.current = null;
    };
    if (animate) animationRef.current = requestAnimationFrame(update);
    else update();
  }

  function mapPoint(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: (clientX - rect.left) * VIEWBOX_WIDTH / rect.width,
      y: (clientY - rect.top) * VIEWBOX_HEIGHT / rect.height,
    };
  }

  function zoomAt(clientX: number, clientY: number, scale: number) {
    const point = mapPoint(clientX, clientY);
    if (!point) return;
    const current = transformRef.current;
    const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    const worldX = (point.x - current.x) / current.scale;
    const worldY = (point.y - current.y) / current.scale;
    applyTransform({
      x: point.x - worldX * nextScale,
      y: point.y - worldY * nextScale,
      scale: nextScale,
    });
  }

  function panBy(deltaX: number, deltaY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const current = transformRef.current;
    applyTransform({
      x: current.x - deltaX * VIEWBOX_WIDTH / rect.width,
      y: current.y - deltaY * VIEWBOX_HEIGHT / rect.height,
      scale: current.scale,
    });
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = mapPoint(event.clientX, event.clientY);
    if (!point) return;
    const target = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-node-id]") : null;
    pointerRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewX: point.x,
      viewY: point.y,
      nodeId: target?.dataset.nodeId ?? null,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointer.clientX;
    const deltaY = event.clientY - pointer.clientY;
    if (!pointer.moved && Math.hypot(deltaX, deltaY) < 3) return;
    pointer.moved = true;
    setIsPanning(true);
    const point = mapPoint(event.clientX, event.clientY);
    if (!point) return;
    const current = transformRef.current;
    applyTransform({
      x: current.x + point.x - pointer.viewX,
      y: current.y + point.y - pointer.viewY,
      scale: current.scale,
    }, true);
    pointer.viewX = point.x;
    pointer.viewY = point.y;
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointer.moved) return;
    if (pointer.nodeId) selectNode(pointer.nodeId);
    else deselectNode();
  }

  function fitAllNodes() {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((node) => node.x));
    const maxX = Math.max(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxY = Math.max(...nodes.map((node) => node.y));
    const padding = 90;
    const scale = Math.max(MIN_ZOOM, Math.min(1, (VIEWBOX_WIDTH - padding * 2) / Math.max(1, maxX - minX), (VIEWBOX_HEIGHT - padding * 2) / Math.max(1, maxY - minY)));
    applyTransform({
      x: (VIEWBOX_WIDTH - (minX + maxX) * scale) / 2,
      y: (VIEWBOX_HEIGHT - (minY + maxY) * scale) / 2,
      scale,
    }, true);
  }

  function zoomFromCenter(factor: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, transformRef.current.scale * factor);
  }

  function centerOnSelectedNode() {
    if (!selectedNode) return;
    const scale = transformRef.current.scale;
    applyTransform({
      x: VIEWBOX_WIDTH / 2 - selectedNode.x * scale,
      y: VIEWBOX_HEIGHT / 2 - selectedNode.y * scale,
      scale,
    }, true);
  }

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey || event.deltaMode === WheelEvent.DOM_DELTA_LINE || Math.abs(event.deltaY) >= 80) {
        const factor = Math.exp(-event.deltaY * 0.0013);
        zoomAt(event.clientX, event.clientY, transformRef.current.scale * factor);
      } else {
        panBy(event.deltaX, event.deltaY);
      }
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const selectedCanary = selectedNode
    ? canaries.find((canary) => canary.nodeId === selectedNode.id)
    : undefined;

  return (
    <section className="map-panel panel">
      <div className={`map-viewport ${isPanning ? "is-panning" : ""}`}>
        <div className="map-art" />
        <div className="map-grain" />
        <svg
          ref={svgRef}
          className="map-svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          role="application"
          aria-label="Interactive simulated filesystem intelligence map. Drag to pan, scroll to zoom."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { pointerRef.current = null; setIsPanning(false); }}
          onDoubleClick={(event) => {
            event.preventDefault();
            zoomAt(event.clientX, event.clientY, transformRef.current.scale * 1.35);
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <g ref={contentRef} className="map-content">
            <g className="map-connections">
              {nodes.filter((node) => node.parentId).map((node) => {
                const parent = nodesById.get(node.parentId!);
                if (!parent) return null;
                const center = parent.type === "agent";
                const routeClass = node.risk === "Critical" || node.risk === "High"
                  ? "connection-threat"
                  : node.type === "directory" || node.type === "volume" ? "connection-directory" : "connection-normal";
                return (
                  <path
                    key={`edge-${node.id}`}
                    className={`map-connection ${routeClass} ${center ? "primary-connection" : ""}`}
                    d={connectionPath(parent, node)}
                  />
                );
              })}
            </g>
            <g className="map-threats">
              {threatenedNodes.map((node) => {
                const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
                return parent ? <g key={`threat-${node.id}`} className="threat-visual">
                  <path d={`M ${node.x} ${node.y - 12} L ${node.x} ${Math.max(31, node.y - 82)}`} />
                </g> : null;
              })}
            </g>
            <g className="map-nodes">
              {nodes.map((node) => {
                const radius = nodeRadius(node);
                const labelLeft = node.x > 790;
                const labelX = labelLeft ? -radius - 7 : radius + 7;
                const textAnchor = labelLeft ? "end" : "start";
                const scanned = scannedNodeIds.has(node.id);
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    className={`${nodeClass(node)} ${selectedNode?.id === node.id ? "is-selected" : ""} ${scanned ? "is-scanned" : ""}`}
                    transform={`translate(${node.x} ${node.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.name}, ${node.type}, ${node.risk} risk, ${node.status}`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectNode(node.id);
                      }
                    }}
                  >
                    {scanned && <circle className="node-scan-ring" r={radius + 8} />}
                    <circle className="node-halo" r={radius + 4} />
                    <circle className="node-body" r={radius} />
                    <text className="node-glyph" y={node.type === "agent" ? 7 : 4}>{nodeGlyph(node)}</text>
                    <text className={`node-label ${node.type === "agent" ? "node-label-core" : ""}`} x={node.type === "agent" ? 0 : labelX} y={node.type === "agent" ? radius + 16 : -2} textAnchor={node.type === "agent" ? "middle" : textAnchor}>{node.name}</text>
                    {node.type !== "file" && node.type !== "process" && node.type !== "agent" && (
                      <text className="node-sub-label" x={node.type === "volume" ? labelX : labelX} y={10} textAnchor={textAnchor}>
                        {node.type === "volume" ? `${node.eventCount} events · ${node.status}` : node.type.toUpperCase()}
                      </text>
                    )}
                    {node.eventCount > 0 && <circle className="node-event-dot" cx={radius - 1} cy={-radius + 1} r="3" />}
                  </g>
                );
              })}
            </g>
            <g className="map-packets" aria-hidden="true">
              {nodes.filter((node) => node.parentId && node.eventCount > 0 && node.risk !== "Critical").slice(0, 7).map((node, index) => {
                const parent = nodesById.get(node.parentId!);
                return parent ? <circle key={`packet-${node.id}`} className="packet" r="3" pathLength="1">
                  <animateMotion dur={`${4 + index % 3}s`} begin={`${index * -0.65}s`} repeatCount="indefinite" path={connectionPath(parent, node)} />
                </circle> : null;
              })}
            </g>
          </g>
        </svg>

        <div className="map-topline">
          <span><i className={simulationRunning ? "green-dot" : "amber-dot"} />{simulationRunning ? "SIMULATED TELEMETRY ACTIVE" : "SIMULATION PAUSED"}</span>
          <span>{scan.status === "scanning" || scan.status === "initializing" ? `SCAN ${scan.progress}%` : "SAMPLE DATA · NOT A REAL FILESYSTEM"}</span>
        </div>
        <div className={`map-overview floating-panel ${collapsedPanels.overview ? "is-collapsed" : ""}`}>
          <div className="floating-heading">
            <span className="eyebrow">SYSTEM OVERVIEW</span>
            <span className="live-tag"><i className={simulationRunning ? "green-dot" : "amber-dot"} />{simulationRunning ? "SIMULATED" : "PAUSED"}</span>
            <CollapseToggle expanded={!collapsedPanels.overview} controls="system-overview-content" onClick={() => togglePanel("overview")} />
          </div>
          <div id="system-overview-content" hidden={collapsedPanels.overview}>
            <MapMetric label="Volumes discovered" value={String(nodes.filter((node) => node.type === "volume").length).padStart(2, "0")} />
            <MapMetric label="Indexed directories" value={`${scan.scannedDirectories.toLocaleString()} / ${scan.totalDirectories.toLocaleString()}`} />
            <MapMetric label="Indexed files" value={`${scan.scannedFiles.toLocaleString()} / ${scan.totalFiles.toLocaleString()}`} />
            <MapMetric label="Canary assets" value={`${activeCount} active / ${canaryCount}`} />
            <div className="scan-progress-copy"><span>{scan.status === "idle" ? "Scan ready" : scan.message}</span><b>{scan.progress}%</b></div>
            <div className="scan-progress-track"><i style={{ width: `${scan.progress}%` }} /></div>
          </div>
        </div>
        <div className={`selected-node floating-panel ${collapsedPanels.selectedNode ? "is-collapsed" : ""}`}>
          <div className="floating-heading">
            <span className="eyebrow">SELECTED NODE</span>
            <span className="node-counter">{selectedNode ? `${selectedNode.eventCount} EVENTS` : "NONE"}</span>
            <CollapseToggle expanded={!collapsedPanels.selectedNode} controls="selected-node-content" onClick={() => togglePanel("selectedNode")} />
          </div>
          <div id="selected-node-content" hidden={collapsedPanels.selectedNode}>
            {selectedNode ? (
              <div className="selected-node-main">
                <span className="file-tile"><NodeIcon node={selectedNode} /></span>
                <div><b>{selectedNode.name}</b><small>{selectedNode.path}</small><label className={selectedNode.risk === "Critical" ? "critical" : ""}><i />{selectedCanary ? `CANARY · ${selectedCanary.status.toUpperCase()}` : `${selectedNode.risk.toUpperCase()} RISK · ${selectedNode.status.toUpperCase()}`}</label><small>{selectedNodeEvents.length} events · {selectedNodeIncidents.length} incidents{lastEvent ? ` · last ${lastEvent.time}` : ""}</small></div>
              </div>
            ) : <div className="no-node-selected">Click a node to inspect it</div>}
          </div>
        </div>

        <div className={`map-legend floating-panel ${collapsedPanels.legend ? "is-collapsed" : ""}`}>
          <div className="floating-heading">
            <span className="eyebrow">MAP LEGEND</span>
            <span className="legend-live"><i className="green-dot" />LIVE</span>
            <CollapseToggle expanded={!collapsedPanels.legend} controls="map-legend-content" onClick={() => togglePanel("legend")} />
          </div>
          <div id="map-legend-content" className="legend-columns" hidden={collapsedPanels.legend}>
            <span><i className="legend-host" />Agent / volume</span><span><i className="legend-line cyan" />Normal activity</span>
            <span><i className="legend-folder" />Directory node</span><span><i className="legend-line amber" />Suspicious activity</span>
            <span><i className="legend-file" />File / process</span><span><i className="legend-line red" />Canary / threat</span>
            <span><i className="legend-canary" />Canary asset</span><span><i className="legend-beam" />Threat indicator</span>
          </div>
        </div>
        <MapSimulationControls
          running={simulationRunning}
          speed={simulationSpeed}
          scan={scan}
          setRunning={setSimulationRunning}
          setSpeed={setSimulationSpeed}
          reset={resetSimulation}
          generate={generateScenario}
          startScan={startScan}
          cancelScan={cancelScan}
        />
        <div className="map-minimap" aria-hidden="true">
          <span className="mini-path p1" /><span className="mini-path p2" /><span className="mini-path p3" />
          <span className="mini-viewport" style={{ transform: `scale(${1 / zoom})` }} /><i />
        </div>
        <div className="map-zoom" aria-label="Map controls">
          <button onClick={() => zoomFromCenter(1.18)} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
          <button onClick={() => zoomFromCenter(1 / 1.18)} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
          <button onClick={() => applyTransform({ x: 0, y: 0, scale: 1 }, true)} aria-label="Reset view" title="Reset view"><RotateCcw size={14} /></button>
          <button onClick={fitAllNodes} aria-label="Fit all nodes" title="Fit all nodes"><Maximize size={14} /></button>
          <button onClick={centerOnSelectedNode} disabled={!selectedNode} aria-label="Center selected node" title="Center selected node"><LocateFixed size={14} /></button>
          <small>{Math.round(zoom * 100)}%</small>
        </div>
        <div className="map-coordinates"><span>N 41.02°</span><span>W 87.64°</span></div>
        {selectedNode && (
          <button className="map-focus-link" onClick={() => navigate("explorer")}>
            <ArrowRight size={12} />Reveal selected node in explorer
          </button>
        )}
      </div>
    </section>
  );
}

function NodeIcon({ node }: { node: FilesystemNode }) {
  if (node.type === "volume") return <HardDrive size={18} />;
  if (node.type === "directory") return <Folder size={18} />;
  if (node.type === "canary" || node.type === "threat" || node.type === "suspicious") return <ShieldAlert size={18} />;
  if (node.type === "agent") return <Radar size={18} />;
  if (node.type === "process") return <Activity size={18} />;
  return <FileCode2 size={18} />;
}

function MapSimulationControls({
  running,
  speed,
  scan,
  setRunning,
  setSpeed,
  reset,
  generate,
  startScan,
  cancelScan,
}: {
  running: boolean;
  speed: SimulationSpeed;
  scan: ScanState;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: SimulationSpeed) => void;
  reset: () => void;
  generate: (scenario: "suspicious" | "canary") => void;
  startScan: () => void;
  cancelScan: () => void;
}) {
  const scanning = scan.status === "scanning" || scan.status === "initializing" || scan.status === "suspicious";
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`map-simulation-controls ${collapsed ? "is-collapsed" : ""}`}>
      <div className="simulation-controls-heading">
        <span className={running ? "green-dot" : "amber-dot"} />DEMO SIMULATION
        <CollapseToggle expanded={!collapsed} controls="demo-simulation-content" onClick={() => setCollapsed((current) => !current)} />
      </div>
      <div id="demo-simulation-content" hidden={collapsed}>
        <div className="simulation-actions">
          <button className={`simulation-button ${running ? "active" : ""}`} onClick={() => setRunning(!running)} title={running ? "Pause simulation" : "Start simulation"}>
            {running ? <Pause size={12} /> : <Play size={12} />}{running ? "Pause" : "Start"}
          </button>
          <button className="simulation-button" onClick={reset} title="Reset simulated filesystem, events and incidents"><RotateCcw size={12} />Reset</button>
          <label className="speed-control"><Gauge size={12} /><select aria-label="Simulation speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value) as SimulationSpeed)}>
            <option value="0.5">½×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>
          </select></label>
        </div>
        <div className="simulation-actions scenario-actions">
          <button className="simulation-button scan-button" onClick={scanning ? cancelScan : startScan} title={scanning ? "Cancel simulated scan" : "Scan the simulated filesystem"}>
            <ScanLine size={12} />{scanning ? "Cancel scan" : scan.status === "completed" ? "Scan again" : "Scan filesystem"}
          </button>
          <button className="simulation-button suspicious-test" onClick={() => generate("suspicious")} title="Generate four linked suspicious sample file events">Test suspicious</button>
          <button className="simulation-button canary-test" onClick={() => generate("canary")} title="Generate a simulated canary trigger and incident">Test canary</button>
        </div>
        {scan.status !== "idle" && (
          <div className={`scan-status scan-${scan.status}`}>
            <span>{scan.status === "completed" ? <Check size={11} /> : scan.status === "cancelled" ? <RotateCcw size={11} /> : <ScanLine size={11} />}</span>
            <b>{scan.message}</b>
            <small>{scan.scannedDirectories}/{scan.totalDirectories} dirs · {scan.scannedFiles}/{scan.totalFiles} files</small>
            {scan.riskScore !== null && <em>DEMO RISK {Math.round(scan.riskScore * 100)}%</em>}
          </div>
        )}
        <div className="simulation-disclaimer"><Shield size={10} />SIMULATED INVENTORY ONLY · NO DEVICE FILES ARE SCANNED</div>
      </div>
    </div>
  );
}

export { type IntelligenceMapProps };
