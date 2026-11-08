#!/usr/bin/env node
/**
 * KAIROX contract validation.
 *
 * Run with:  npm run validate:schemas
 *
 * Three things are checked:
 *
 *   1. Every schema in schemas/ compiles under JSON Schema Draft 2020-12 with
 *      ajv-formats enabled. A schema that does not compile is a broken
 *      contract, and a broken contract is worse than no contract.
 *
 *   2. Every fixture in tests/contract/fixtures/ behaves as its filename
 *      promises: `*.valid.json` must pass, `*.invalid.json` must fail. The
 *      negative fixtures are what stop a schema from being silently
 *      weakened later - if someone loosens a constraint, the test breaks.
 *
 *   3. The demo records in src/fixtures/demo-records.json validate against
 *      the canary and incident schemas. This is what keeps the demo path
 *      honest: demo data obeys the same contract as live data, so it cannot
 *      drift into a shape the backend would reject.
 *
 * Exit code is non-zero on any failure, so this is CI-ready.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats");

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const schemasDir = join(repoRoot, "schemas");
const fixturesDir = join(here, "fixtures");
const demoRecordsPath = join(repoRoot, "src", "fixtures", "demo-records.json");

const SCHEMA_FILES = [
  "event.schema.json",
  "detection.schema.json",
  "incident.schema.json",
  "canary.schema.json",
  "scan.schema.json",
  "error.schema.json",
];

const errors = [];
const passed = [];

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    errors.push(`cannot read ${path}: ${err.message}`);
    return null;
  }
}

function recordFailure(message) {
  errors.push(message);
}

function recordPass(message) {
  passed.push(message);
}

// ---------------------------------------------------------------------------
// 1. Schemas compile
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

for (const file of SCHEMA_FILES) {
  const schema = loadJson(join(schemasDir, file));
  if (!schema) continue;

  try {
    ajv.addSchema(schema);
    const compiled = ajv.getSchema(schema.$id);
    if (!compiled) throw new Error("addSchema did not produce a validator");
    recordPass(`schema compiles: ${file}`);
  } catch (err) {
    recordFailure(`schema does not compile: ${file} -> ${err.message}`);
  }
}

function validatorFor(schemaName) {
  return ajv.getSchema(`https://kairox.local/schemas/${schemaName}.schema.json`);
}

function describeErrors(validator) {
  return ajv.errorsText(validator.errors, { separator: "; " });
}

// ---------------------------------------------------------------------------
// 2. Fixtures behave as their filenames promise
// ---------------------------------------------------------------------------

if (!readdirSync(fixturesDir, { withFileTypes: true }).some((e) => e.isDirectory())) {
  recordFailure("no fixture directories found under tests/contract/fixtures");
}

const fixtureDirs = readdirSync(fixturesDir, { withFileTypes: true }).filter((e) =>
  e.isDirectory(),
);

for (const entry of fixtureDirs) {
  const schemaName = entry.name;
  const validator = validatorFor(schemaName);
  if (!validator) {
    recordFailure(`fixtures/${schemaName}: no matching schema in schemas/`);
    continue;
  }

  const files = readdirSync(join(fixturesDir, schemaName)).filter((f) =>
    f.endsWith(".json"),
  );

  if (files.length === 0) {
    recordFailure(`fixtures/${schemaName}: directory is empty`);
    continue;
  }

  for (const file of files) {
    const data = loadJson(join(fixturesDir, schemaName, file));
    if (!data) continue;

    // `batch.*` targets the EventBatch definition rather than the event itself.
    const target =
      file.startsWith("batch.")
        ? ajv.getSchema(`${validator.schema.$id}#/$defs/EventBatch`)
        : validator;

    if (!target) {
      recordFailure(`fixtures/${schemaName}/${file}: target subschema not found`);
      continue;
    }

    const shouldPass = file.includes(".valid.");
    const shouldFail = file.includes(".invalid.");
    if (!shouldPass && !shouldFail) {
      recordFailure(
        `fixtures/${schemaName}/${file}: filename must contain ".valid." or ".invalid."`,
      );
      continue;
    }

    const ok = target(data);
    const label = `${schemaName}/${file}`;

    if (shouldPass && ok) {
      recordPass(`fixture accepted: ${label}`);
    } else if (shouldPass && !ok) {
      recordFailure(`fixture should have PASSED but was rejected: ${label} -> ${describeErrors(target)}`);
    } else if (shouldFail && !ok) {
      recordPass(`fixture correctly rejected: ${label}`);
    } else {
      recordFailure(
        `fixture should have FAILED but was ACCEPTED: ${label} -> this schema constraint is no longer enforced`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Demo records obey the contract
// ---------------------------------------------------------------------------

const demo = loadJson(demoRecordsPath);

if (demo) {
  const canaryValidator = validatorFor("canary");
  const incidentValidator = validatorFor("incident");

  const seenCanaryIds = new Set();
  const seenCanaryLabels = new Set();
  const canaryLabelById = new Map();

  for (const [index, canary] of (demo.canaries ?? []).entries()) {
    const label = `demo canaries[${index}]${canary.display_id ? ` (${canary.display_id})` : ""}`;

    if (canaryValidator && !canaryValidator(canary)) {
      recordFailure(`${label} rejected by canary.schema.json -> ${describeErrors(canaryValidator)}`);
    } else {
      recordPass(`${label} accepted`);
    }

    // Honesty rule: demo records must declare themselves as demo.
    if (canary.origin !== "demo") {
      recordFailure(`${label} has origin "${canary.origin}" but is demo data - a simulated canary must never be labelled real`);
    }

    if (seenCanaryIds.has(canary.canary_id)) {
      recordFailure(`${label} duplicates canary_id ${canary.canary_id}`);
    }
    seenCanaryIds.add(canary.canary_id);

    if (canary.display_id) {
      if (seenCanaryLabels.has(canary.display_id)) {
        recordFailure(`${label} duplicates display_id ${canary.display_id}`);
      }
      seenCanaryLabels.add(canary.display_id);
      canaryLabelById.set(canary.canary_id, canary.display_id);
    }
  }

  const seenIncidentIds = new Set();
  const seenIncidentLabels = new Set();

  for (const [index, incident] of (demo.incidents ?? []).entries()) {
    const label = `demo incidents[${index}]${incident.display_id ? ` (${incident.display_id})` : ""}`;

    if (incidentValidator && !incidentValidator(incident)) {
      recordFailure(`${label} rejected by incident.schema.json -> ${describeErrors(incidentValidator)}`);
    } else {
      recordPass(`${label} accepted`);
    }

    if (incident.origin !== "demo") {
      recordFailure(`${label} has origin "${incident.origin}" but is demo data - a simulated incident must never be labelled real`);
    }

    if (seenIncidentIds.has(incident.incident_id)) {
      recordFailure(`${label} duplicates incident_id ${incident.incident_id}`);
    }
    seenIncidentIds.add(incident.incident_id);

    if (incident.display_id) {
      if (seenIncidentLabels.has(incident.display_id)) {
        recordFailure(`${label} duplicates display_id ${incident.display_id}`);
      }
      seenIncidentLabels.add(incident.display_id);
    }

    // A linked canary must actually exist, otherwise the UI shows a raw uuid.
    if (incident.canary_id && !canaryLabelById.has(incident.canary_id)) {
      recordFailure(
        `${label} links canary_id ${incident.canary_id}, which is not a canary in the demo records`,
      );
    }

    // last_seen must not precede first_seen (also a CHECK in the database).
    if (Date.parse(incident.last_seen) < Date.parse(incident.first_seen)) {
      recordFailure(`${label} has last_seen before first_seen`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nKAIROX contract validation`);
console.log(`${"-".repeat(60)}`);

for (const message of passed) {
  console.log(`  ok   ${message}`);
}
for (const message of errors) {
  console.error(`  FAIL ${message}`);
}

console.log(`${"-".repeat(60)}`);
console.log(`${passed.length} passed, ${errors.length} failed\n`);

process.exit(errors.length === 0 ? 0 : 1);
