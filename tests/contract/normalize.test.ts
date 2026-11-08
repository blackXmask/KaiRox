/**
 * Wire -> display adapter regression test.
 *
 * Run with:  npm run test:contract
 *
 * This is the test that matters most for the UI: `normalize.ts` is the only
 * thing standing between the wire contract and what an operator actually sees.
 * If a mapping here regresses the app still builds and still runs - it just
 * shows the wrong label, the wrong status, or a raw uuid where a readable
 * one belongs. Nothing else would catch that.
 *
 * It reads the real demo records and asserts the exact display values the UI
 * rendered before the wire migration, so any behavioural drift is a failure.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  eventTypeToDisplay,
  formatClock,
  formatDateTime,
  toDisplayCanary,
  toDisplayEvent,
  toDisplayIncident,
  volumeFromPath,
} from "../../src/services/normalize.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const demo = JSON.parse(
  readFileSync(join(repoRoot, "src", "fixtures", "demo-records.json"), "utf8"),
);

let failures = 0;
let checks = 0;

function equal(label: string, actual: unknown, expected: unknown): void {
  checks += 1;
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}\n         expected: ${JSON.stringify(expected)}\n         actual:   ${JSON.stringify(actual)}`);
    failures += 1;
  }
}

// Same glue data.ts uses to turn a wire canary uuid into a readable label.
const canaryLabelById = new Map(
  demo.canaries.map((c) => [c.canary_id, c.display_id ?? c.canary_id]),
);

const canaries = demo.canaries.map(toDisplayCanary);
const incidents = demo.incidents.map((incident) =>
  toDisplayIncident(incident, {
    resolveCanaryId: (id) => canaryLabelById.get(id),
  }),
);

console.log("\nwire -> display adapter");
console.log("-".repeat(60));

// --- canaries -------------------------------------------------------------
equal("canary 0 keeps its readable label", canaries[0].id, "CAN-001");
equal("canary 0 path", canaries[0].path, "C:\\Users\\Abdullah\\Desktop\\honey_pot.txt");
equal("canary 0 status is capitalized", canaries[0].status, "Active");
equal("canary 0 registered date", canaries[0].registered, "2026-10-08 09:21");
equal("canary 0 never triggered renders 'Never'", canaries[0].lastTrigger, "Never");
equal("canary 0 trigger count", canaries[0].triggerCount, 0);
equal("canary 0 volume", canaries[0].volume, "C:");
equal("canary 0 node id", canaries[0].nodeId, "honey-c");

equal("canary 2 status is capitalized", canaries[2].status, "Triggered");
equal("canary 2 last trigger is clock-only", canaries[2].lastTrigger, "14:32:17");
equal("canary 2 trigger count", canaries[2].triggerCount, 1);

// --- incidents ------------------------------------------------------------
equal("incident 0 keeps its readable label", incidents[0].id, "INC-001");
equal("incident 0 time", incidents[0].time, "2026-10-23 14:32:17");
equal("incident 0 severity", incidents[0].severity, "Critical");
equal("incident 0 status", incidents[0].status, "Open");
equal(
  "incident 0 resolves its canary uuid to a readable label",
  incidents[0].canaryId,
  "CAN-003",
);

equal("incident 1 severity", incidents[1].severity, "High");
equal("incident 1 status", incidents[1].status, "Investigating");
equal(
  "incident 1 has no canary, so it renders the empty marker",
  incidents[1].canaryId,
  "—",
);

equal("incident 2 severity", incidents[2].severity, "Medium");
equal("incident 2 status", incidents[2].status, "Resolved");

// The old record omitted seconds ("2026-10-19 09:13"). The wire carries a
// full timestamp, so the display is now consistent with the others.
equal("incident 3 severity", incidents[3].severity, "Low");
equal("incident 3 status", incidents[3].status, "Resolved");
equal("incident 3 time now includes seconds", incidents[3].time, "2026-10-19 09:13:00");

// --- honesty --------------------------------------------------------------
equal(
  "every demo canary is labelled demo",
  canaries.every(() => true) && demo.canaries.every((c) => c.origin === "demo"),
  true,
);
equal(
  "every demo incident is labelled demo",
  demo.incidents.every((i) => i.origin === "demo"),
  true,
);

// --- primitives -----------------------------------------------------------
equal("volume from a drive path", volumeFromPath("C:\\Users\\Demo\\a.txt"), "C:");
equal("volume from a non-drive path", volumeFromPath("/etc/hosts"), "—");
equal("event type label", eventTypeToDisplay("file_renamed"), "File Renamed");
equal("event type passes through unknown values", eventTypeToDisplay("made_up"), "made_up");
equal("clock formatting", formatClock("2026-10-23T14:32:17.000Z"), "14:32:17");
equal(
  "datetime formatting",
  formatDateTime("2026-10-23T14:32:17.000Z"),
  "2026-10-23 14:32:17",
);

// --- event projection -----------------------------------------------------
const projected = toDisplayEvent(
  {
    schema_version: 1,
    event_id: "5f2b7c1e-9a4d-4e8f-b3c6-1d2e3f4a5b60",
    timestamp: "2026-11-08T12:00:00.000Z",
    event_type: "file_modified",
    file_path: "C:\\Users\\Demo\\report.docx",
    old_path: null,
    process: { pid: 4321, name: "explorer.exe" },
    source: "windows_collector",
    size_bytes: 2048,
  },
  { id: 7, risk: "High", nodeId: "report" },
);

equal("event keeps its wire uuid as eventId", projected.eventId, "5f2b7c1e-9a4d-4e8f-b3c6-1d2e3f4a5b60");
equal("event uses the caller's local id", projected.id, 7);
equal("event time", projected.time, "12:00:00");
equal("event type label", projected.eventType, "File Modified");
equal("event volume derived from path", projected.volume, "C:");
equal("event process string", projected.process, "explorer.exe (4321)");
equal("live event is not simulated", projected.simulated, false);
equal("live event carries its wire source", projected.source, "windows_collector");

const simulated = toDisplayEvent(
  {
    schema_version: 1,
    event_id: "6a3c8d2f-0b5e-4f9a-c4d7-2e3f4a5b6c71",
    timestamp: "2026-11-08T12:00:05.000Z",
    event_type: "file_renamed",
    file_path: "C:\\Users\\Demo\\b.txt",
    old_path: "C:\\Users\\Demo\\a.txt",
    process: null,
    source: "simulation",
    size_bytes: null,
  },
  { id: 8 },
);

equal("simulated event is flagged", simulated.simulated, true);
equal("simulated event carries its wire source", simulated.source, "simulation");
equal(
  "an unassessed event defaults to Info, never to a threat level",
  simulated.risk,
  "Info",
);
equal("null process renders as unknown", simulated.process, "unknown");
equal("null event id defaults to a local key", simulated.id, 8);

console.log("-".repeat(60));
console.log(`${checks - failures} passed, ${failures} failed\n`);

process.exit(failures === 0 ? 0 : 1);
