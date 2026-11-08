import type { ActivityEvent, FilesystemNode, Risk } from "../types";
import { getVolumePath } from "./filesystemSimulator";

interface EventSeed {
  nodeId: string;
  eventType: string;
  risk: Risk;
  process: string;
}

const routineEvents: EventSeed[] = [
  { nodeId: "report", eventType: "File Modified", risk: "Low", process: "explorer.exe (4321)" },
  { nodeId: "downloads", eventType: "Directory Traversal", risk: "Info", process: "Kairox.Demo" },
  { nodeId: "archive", eventType: "File Created", risk: "Low", process: "Kairox.Demo" },
  { nodeId: "installer", eventType: "File Renamed", risk: "Medium", process: "explorer.exe (4321)" },
  { nodeId: "backup-log", eventType: "File Deleted", risk: "Low", process: "Kairox.Demo" },
  { nodeId: "notes", eventType: "File Modified", risk: "Low", process: "WINWORD.EXE (6712)" },
  { nodeId: "research-db", eventType: "File Modified", risk: "Medium", process: "Kairox.Demo" },
  { nodeId: "simulator", eventType: "File Created", risk: "Low", process: "Kairox.Demo" },
];

function toActivityEvent(seed: EventSeed, id: number, nodes: FilesystemNode[], now: number): ActivityEvent {
  const node = nodes.find((candidate) => candidate.id === seed.nodeId);
  if (!node) throw new Error(`Unknown simulated filesystem node: ${seed.nodeId}`);
  return {
    id,
    time: new Date(now).toLocaleTimeString("en-GB", { hour12: false }),
    timestampMs: now,
    eventType: seed.eventType,
    path: node.path,
    process: seed.process,
    volume: getVolumePath(node.path),
    risk: seed.risk,
    nodeId: node.id,
    simulated: true,
    source: "simulation",
  };
}

export function createInitialEvents(now = Date.now(), nodes: FilesystemNode[]): ActivityEvent[] {
  const entries: EventSeed[] = [
    { nodeId: "canary-exe", eventType: "Canary Trigger", risk: "Critical", process: "unknown · simulated" },
    { nodeId: "report", eventType: "File Modified", risk: "Low", process: "explorer.exe (4321)" },
    { nodeId: "installer", eventType: "File Created", risk: "Low", process: "chrome.exe (6712)" },
    { nodeId: "documents", eventType: "Directory Traversal", risk: "Info", process: "explorer.exe (4321)" },
    { nodeId: "backup-log", eventType: "File Modified", risk: "Medium", process: "unknown · simulated" },
    { nodeId: "archive", eventType: "File Renamed", risk: "Medium", process: "Kairox.Demo" },
    { nodeId: "image", eventType: "File Opened", risk: "Info", process: "photos.exe (2098)" },
    { nodeId: "honey-c", eventType: "Canary Check", risk: "Low", process: "Kairox.Demo" },
  ];
  return entries.map((entry, index) => toActivityEvent(entry, index + 1, nodes, now - index * 36_000));
}

export function createSimulationEvents(sequence: number, firstId: number, nodes: FilesystemNode[], now = Date.now()): ActivityEvent[] {
  const eventNumber = sequence + 1;
  if (eventNumber % 11 === 0) {
    return [toActivityEvent(
      { nodeId: "honey-c", eventType: "Canary Access", risk: "Critical", process: "unknown · simulated" },
      firstId,
      nodes,
      now,
    )];
  }
  if (eventNumber % 8 === 0) {
    return [toActivityEvent(
      { nodeId: "mass-mod", eventType: "Suspicious Extension Change", risk: "High", process: "powershell.exe · simulated" },
      firstId,
      nodes,
      now,
    )];
  }
  const seed = routineEvents[sequence % routineEvents.length];
  return [toActivityEvent(seed, firstId, nodes, now)];
}

export function createTestScenarioEvents(
  scenario: "suspicious" | "canary",
  firstId: number,
  nodes: FilesystemNode[],
  now = Date.now(),
): ActivityEvent[] {
  const suspiciousSeeds: EventSeed[] = [
    { nodeId: "mass-mod", eventType: "Suspicious Mass Modification", risk: "High", process: "powershell.exe · simulated" },
    { nodeId: "report", eventType: "File Modified", risk: "High", process: "powershell.exe · simulated" },
    { nodeId: "notes", eventType: "File Renamed", risk: "High", process: "powershell.exe · simulated" },
    { nodeId: "archive", eventType: "Suspicious Extension Change", risk: "High", process: "powershell.exe · simulated" },
  ];
  const canarySeed: EventSeed = {
    nodeId: "canary-exe",
    eventType: "Canary Trigger",
    risk: "Critical",
    process: "unknown · simulated",
  };
  const seeds = scenario === "canary" ? [canarySeed] : suspiciousSeeds;
  return seeds.map((seed, index) => toActivityEvent(seed, firstId + index, nodes, now - index * 180));
}

export function createScanCompletedEvent(firstId: number, nodes: FilesystemNode[], now = Date.now()): ActivityEvent {
  return toActivityEvent(
    { nodeId: "scan-process", eventType: "Simulated Filesystem Scan Completed", risk: "Info", process: "Kairox.Demo Scan Worker" },
    firstId,
    nodes,
    now,
  );
}

export function applyActivityEvents(nodes: FilesystemNode[], events: ActivityEvent[]): FilesystemNode[] {
  const updates = new Map<string, ActivityEvent>();
  for (const event of events) updates.set(event.nodeId, event);
  return nodes.map((node) => {
    const event = updates.get(node.id);
    if (!event) return node;
    const status: FilesystemNode["status"] =
      event.risk === "Critical" ? "Triggered" :
        event.eventType === "File Created" ? "Created" :
          event.eventType === "File Deleted" ? "Deleted" :
            event.risk === "High" || event.risk === "Medium" || event.eventType === "File Modified" ? "Modified" : node.status;
    return {
      ...node,
      risk: event.risk,
      status,
      eventCount: node.eventCount + events.filter((entry) => entry.nodeId === node.id).length,
      modified: new Date(event.timestampMs).toLocaleString(),
    };
  });
}
