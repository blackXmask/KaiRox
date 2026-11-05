import type { FilesystemNode } from "../types";

type NodeSeed = Pick<FilesystemNode, "id" | "name" | "type" | "x" | "y" | "risk" | "parentId"> & {
  path: string;
  fileType?: string;
  size?: string;
  status?: FilesystemNode["status"];
};

const seeds: NodeSeed[] = [
  { id: "agent", name: "KAIROX Agent", type: "agent", x: 500, y: 275, risk: "Low", parentId: null, path: "KAIROX://endpoint", status: "Monitoring" },
  { id: "volume-c", name: "C:\\", type: "volume", x: 220, y: 133, risk: "Low", parentId: "agent", path: "C:\\" },
  { id: "volume-d", name: "D:\\", type: "volume", x: 770, y: 133, risk: "Low", parentId: "agent", path: "D:\\" },
  { id: "volume-e", name: "E:\\", type: "volume", x: 220, y: 425, risk: "Low", parentId: "agent", path: "E:\\" },

  { id: "windows", name: "Windows", type: "directory", x: 94, y: 76, risk: "Low", parentId: "volume-c", path: "C:\\Windows" },
  { id: "program-files", name: "Program Files", type: "directory", x: 95, y: 200, risk: "Low", parentId: "volume-c", path: "C:\\Program Files" },
  { id: "users", name: "Users", type: "directory", x: 330, y: 104, risk: "Low", parentId: "volume-c", path: "C:\\Users" },
  { id: "system32", name: "System32", type: "directory", x: 92, y: 34, risk: "Low", parentId: "windows", path: "C:\\Windows\\System32" },
  { id: "dll-host", name: "security_service.dll", type: "file", x: 42, y: 24, risk: "Low", parentId: "system32", path: "C:\\Windows\\System32\\security_service.dll", fileType: "DLL · system library", size: "1.8 MB" },
  { id: "updater", name: "KairoxUpdater.exe", type: "file", x: 54, y: 232, risk: "Low", parentId: "program-files", path: "C:\\Program Files\\KAIROX\\KairoxUpdater.exe", fileType: "EXE · application", size: "4.2 MB" },
  { id: "abdullah", name: "Abdullah", type: "directory", x: 403, y: 95, risk: "Low", parentId: "users", path: "C:\\Users\\Abdullah" },
  { id: "documents", name: "Documents", type: "directory", x: 327, y: 175, risk: "Low", parentId: "abdullah", path: "C:\\Users\\Abdullah\\Documents" },
  { id: "downloads", name: "Downloads", type: "directory", x: 419, y: 177, risk: "Low", parentId: "abdullah", path: "C:\\Users\\Abdullah\\Downloads" },
  { id: "desktop", name: "Desktop", type: "directory", x: 478, y: 145, risk: "Low", parentId: "abdullah", path: "C:\\Users\\Abdullah\\Desktop" },
  { id: "report", name: "Quarterly_Report.pdf", type: "file", x: 301, y: 225, risk: "Low", parentId: "documents", path: "C:\\Users\\Abdullah\\Documents\\Quarterly_Report.pdf", fileType: "PDF · document", size: "2.4 MB" },
  { id: "notes", name: "project_notes.docx", type: "file", x: 356, y: 244, risk: "Low", parentId: "documents", path: "C:\\Users\\Abdullah\\Documents\\project_notes.docx", fileType: "DOCX · document", size: "840 KB" },
  { id: "installer", name: "release_bundle.zip", type: "file", x: 439, y: 235, risk: "Low", parentId: "downloads", path: "C:\\Users\\Abdullah\\Downloads\\release_bundle.zip", fileType: "ZIP · archive", size: "48.1 MB" },
  { id: "honey-c", name: "honey_pot.txt", type: "canary", x: 478, y: 213, risk: "Low", parentId: "desktop", path: "C:\\Users\\Abdullah\\Desktop\\honey_pot.txt", fileType: "TXT · canary file", size: "4 KB" },

  { id: "kairox", name: "KAIROX", type: "directory", x: 682, y: 77, risk: "Low", parentId: "volume-d", path: "D:\\KAIROX" },
  { id: "projects", name: "Projects", type: "directory", x: 880, y: 98, risk: "Low", parentId: "volume-d", path: "D:\\Projects" },
  { id: "research", name: "Research", type: "directory", x: 866, y: 187, risk: "Low", parentId: "volume-d", path: "D:\\Research" },
  { id: "src", name: "src", type: "directory", x: 627, y: 116, risk: "Low", parentId: "kairox", path: "D:\\KAIROX\\src" },
  { id: "simulator", name: "simulationEngine.ts", type: "file", x: 585, y: 157, risk: "Low", parentId: "src", path: "D:\\KAIROX\\src\\simulationEngine.ts", fileType: "TS · source file", size: "18 KB" },
  { id: "mass-mod", name: "batch_rename.py", type: "suspicious", x: 933, y: 133, risk: "High", parentId: "projects", path: "D:\\Projects\\batch_rename.py", fileType: "PY · flagged sample", size: "12 KB" },
  { id: "canary-exe", name: "suspicious_file.exe", type: "threat", x: 950, y: 285, risk: "Critical", parentId: "projects", path: "D:\\Projects\\suspicious_file.exe", fileType: "EXE · canary / threat", size: "2.4 MB", status: "Triggered" },
  { id: "research-db", name: "research_index.db", type: "file", x: 876, y: 231, risk: "Low", parentId: "research", path: "D:\\Research\\research_index.db", fileType: "DB · local sample", size: "15.8 MB" },
  { id: "monitor", name: "Kairox.Demo", type: "process", x: 563, y: 220, risk: "Low", parentId: "agent", path: "process://Kairox.Demo", fileType: "Simulated process", size: "—" },

  { id: "backups", name: "Backups", type: "directory", x: 122, y: 461, risk: "Low", parentId: "volume-e", path: "E:\\Backups" },
  { id: "archives", name: "Archives", type: "directory", x: 320, y: 470, risk: "Low", parentId: "volume-e", path: "E:\\Archives" },
  { id: "backup-log", name: "backup_2026.log", type: "file", x: 91, y: 507, risk: "Low", parentId: "backups", path: "E:\\Backups\\backup_2026.log", fileType: "LOG · activity log", size: "96 KB" },
  { id: "archive", name: "archive_2026.zip", type: "file", x: 367, y: 515, risk: "Low", parentId: "archives", path: "E:\\Archives\\archive_2026.zip", fileType: "ZIP · archive", size: "640 MB" },
  { id: "image", name: "site_reference.jpg", type: "file", x: 450, y: 438, risk: "Low", parentId: "research", path: "D:\\Research\\site_reference.jpg", fileType: "JPG · image", size: "3.1 MB" },
  { id: "scan-process", name: "Scan worker", type: "process", x: 510, y: 369, risk: "Low", parentId: "agent", path: "process://filesystem-scan", fileType: "Simulated scan task", size: "—" },
];

export function createFilesystemNodes(): FilesystemNode[] {
  return seeds.map((node) => ({
    ...node,
    fileType: node.fileType ?? (node.type === "volume" ? "NTFS · volume" : node.type === "directory" ? "Directory" : node.type === "agent" ? "Monitoring agent" : node.type === "process" ? "Simulated process" : "File"),
    size: node.size ?? (node.type === "volume" ? "931.5 GB" : node.type === "directory" ? "—" : "1.0 MB"),
    status: node.status ?? (node.type === "agent" || node.type === "process" ? "Monitoring" : "Active"),
    modified: "2026-10-23 14:32:17",
    eventCount: 0,
  }));
}

export const initialFilesystemNodes = createFilesystemNodes();
export const directoryCount = seeds.filter((node) => node.type === "directory").length;
export const fileCount = seeds.filter((node) => ["file", "canary", "suspicious", "threat"].includes(node.type)).length;

export function getVolumePath(path: string): string {
  const match = /^[A-Z]:/i.exec(path);
  return match?.[0].toUpperCase() ?? "—";
}

export function getParentPath(node: FilesystemNode, nodes: FilesystemNode[]): string {
  const parent = nodes.find((candidate) => candidate.id === node.parentId);
  return parent?.path ?? "—";
}
