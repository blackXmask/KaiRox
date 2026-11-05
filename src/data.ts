import type { CanaryAsset, ThreatIncident, Risk } from "./types";

export const initialCanaries: CanaryAsset[] = [
  { id: "CAN-001", nodeId: "honey-c", name: "honey_pot.txt", path: "C:\\Users\\Abdullah\\Desktop\\honey_pot.txt", volume: "C:", type: "Text document", status: "Active", registered: "2026-10-08 09:21", lastTrigger: "Never", triggerCount: 0 },
  { id: "CAN-002", nodeId: "mass-mod", name: "batch_rename.py", path: "D:\\Projects\\batch_rename.py", volume: "D:", type: "Python script", status: "Active", registered: "2026-10-09 11:06", lastTrigger: "Never", triggerCount: 0 },
  { id: "CAN-003", nodeId: "canary-exe", name: "suspicious_file.exe", path: "D:\\Projects\\suspicious_file.exe", volume: "D:", type: "Executable", status: "Triggered", registered: "2026-10-10 14:32", lastTrigger: "14:32:17", triggerCount: 1 },
  { id: "CAN-004", nodeId: "dll-host", name: "security_service.dll", path: "C:\\Windows\\System32\\security_service.dll", volume: "C:", type: "Library", status: "Active", registered: "2026-10-11 08:53", lastTrigger: "Never", triggerCount: 0 },
  { id: "CAN-005", nodeId: "archive", name: "archive_2026.zip", path: "E:\\Archives\\archive_2026.zip", volume: "E:", type: "Archive", status: "Active", registered: "2026-10-12 16:40", lastTrigger: "Never", triggerCount: 0 },
];

export const initialIncidents: ThreatIncident[] = [
  { id: "INC-001", title: "Canary file modified", time: "2026-10-23 14:32:17", severity: "Critical", category: "Canary Trigger", attribution: "unknown · unsigned process", detectionRule: "canary_file_accessed_or_modified", classification: "Simulated Canary Trigger", canaryId: "CAN-003", path: "D:\\Projects\\suspicious_file.exe", nodeId: "canary-exe", status: "Open", summary: "A registered sample canary was accessed in the simulation. No real file activity was observed." },
  { id: "INC-002", title: "Suspicious activity burst", time: "2025-04-21 17:08:52", severity: "High", category: "Suspicious Activity", attribution: "explorer.exe (PID 4321)", detectionRule: "burst_write_rename_pattern", classification: "Suspicious behavior (Burst)", canaryId: "—", path: "C:\\Users\\Abdullah\\Documents\\Quarterly_Report.pdf", nodeId: "report", status: "Investigating", summary: "A simulated process modified multiple sample files in a short time. This is a demonstration record." },
  { id: "INC-003", title: "Unusual file behavior", time: "2026-10-21 14:22:03", severity: "Medium", category: "Behavioral Anomaly", attribution: "unknown · unsigned process", detectionRule: "entropy_rename_anomaly", classification: "Suspicious behavior (Rename)", canaryId: "—", path: "D:\\Projects\\batch_rename.py", nodeId: "mass-mod", status: "Resolved", summary: "A simulated file activity sequence is included to demonstrate incident filtering and timeline rendering." },
  { id: "INC-004", title: "File access pattern", time: "2026-10-19 09:13", severity: "Low", category: "File Access", attribution: "chrome.exe (PID 6712)", detectionRule: "wide_directory_access_scan", classification: "Routine access pattern", canaryId: "—", path: "C:\\Windows\\System32\\security_service.dll", nodeId: "dll-host", status: "Resolved", summary: "A low-risk sample access sequence demonstrates incident filtering. No actual file was accessed." },
];

export function riskClass(risk: Risk): string {
  return `risk-${risk.toLowerCase()}`;
}
