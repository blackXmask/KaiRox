#!/usr/bin/env node
/**
 * Schema <-> wire type drift guard.
 *
 * Run with:  npm run test:contract
 *
 * `src/services/wire.ts` is hand-written and is meant to stay that way until
 * the contracts freeze - at which point it should be generated from
 * `schemas/` instead. Until then nothing stops the two from disagreeing: edit
 * a schema, forget the type, and the app still builds, still runs, and still
 * type-checks. It just no longer describes what the backend actually sends.
 *
 * This test closes that gap. It parses `wire.ts` with the TypeScript compiler
 * API and compares each interface against its schema on four axes:
 *
 *   1. property names    - a field added or removed on one side only
 *   2. required-ness     - schema `required` vs a `?` on the type
 *   3. enum members      - resolved through type aliases, so
 *                          `risk_level: WireRiskLevel` is checked against
 *                          the schema's enum rather than against the alias
 *   4. nullability       - `["string", "null"]` must be `string | null`
 *
 * Type aliases are followed so that shared unions (`WireOrigin`,
 * `WireEventType`, ...) are verified at the point of use.
 *
 * When the contracts freeze, delete this file and generate `wire.ts` from the
 * schemas - generation makes drift impossible, this only detects it.
 *
 * Exit code is non-zero on any failure, so this is CI-ready.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const schemasDir = join(repoRoot, "schemas");
const wirePath = join(repoRoot, "src", "services", "wire.ts");

/** Which interface each schema (or `$defs` entry) corresponds to. */
const TARGETS = [
  { schema: "event.schema.json", def: null, wire: "WireEvent" },
  { schema: "event.schema.json", def: "EventBatch", wire: "WireEventBatch" },
  { schema: "detection.schema.json", def: null, wire: "WireDetection" },
  { schema: "incident.schema.json", def: null, wire: "WireIncident" },
  { schema: "canary.schema.json", def: null, wire: "WireCanary" },
  { schema: "scan.schema.json", def: null, wire: "WireScan" },
  { schema: "error.schema.json", def: null, wire: "WireError" },
];

const passed = [];
const errors = [];

function recordPass(message) {
  passed.push(message);
}

function recordFailure(message) {
  errors.push(message);
}

// ---------------------------------------------------------------------------
// Parse wire.ts
// ---------------------------------------------------------------------------

const source = ts.createSourceFile(
  wirePath,
  readFileSync(wirePath, "utf8"),
  ts.ScriptTarget.ES2020,
  true,
  ts.ScriptKind.TS,
);

/** alias name -> set of string literals it resolves to */
const aliases = new Map();

/** interface name -> prop name -> { optional, type } */
const interfaces = new Map();

/** Collect every string literal in a type node, following unions. */
function collectLiterals(node) {
  const out = new Set();
  if (!node) return out;
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    out.add(node.literal.text);
  } else if (ts.isUnionTypeNode(node)) {
    for (const member of node.types) {
      for (const literal of collectLiterals(member)) out.add(literal);
    }
  }
  return out;
}

/** Resolve a property's type to its string-literal set, following aliases. */
function resolveLiterals(node, depth = 0) {
  if (!node || depth > 8) return new Set();
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const target = aliases.get(node.typeName.text);
    if (target) return target;
    return new Set();
  }
  return collectLiterals(node);
}

/** Whether the type node admits `null`. */
function typeAllowsNull(node, depth = 0) {
  if (!node || depth > 8) return false;
  if (ts.isUnionTypeNode(node)) {
    return node.types.some((member) => typeAllowsNull(member, depth + 1));
  }
  if (ts.isLiteralTypeNode(node)) {
    return node.literal.kind === ts.SyntaxKind.NullKeyword;
  }
  return node.kind === ts.SyntaxKind.NullKeyword;
}

for (const statement of source.statements) {
  if (ts.isTypeAliasDeclaration(statement)) {
    aliases.set(statement.name.text, collectLiterals(statement.type));
    continue;
  }

  if (!ts.isInterfaceDeclaration(statement)) continue;

  const props = new Map();
  for (const member of statement.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!member.name || !ts.isIdentifier(member.name)) continue;
    props.set(member.name.text, {
      optional: Boolean(member.questionToken),
      type: member.type,
    });
  }
  interfaces.set(statement.name.text, props);
}

// ---------------------------------------------------------------------------
// Read the schemas
// ---------------------------------------------------------------------------

const schemaCache = new Map();

function loadSchema(file) {
  if (!schemaCache.has(file)) {
    schemaCache.set(
      file,
      JSON.parse(readFileSync(join(schemasDir, file), "utf8")),
    );
  }
  return schemaCache.get(file);
}

/** The subschema a target describes: the root, or one `$defs` entry. */
function subschemaFor(target) {
  const schema = loadSchema(target.schema);
  return target.def ? schema.$defs?.[target.def] : schema;
}

/** The enum a property declares, if any (handles `oneOf: [{enum}, {null}]). */
function schemaEnum(prop) {
  if (Array.isArray(prop.enum)) return prop.enum;
  const branches = [...(prop.oneOf ?? []), ...(prop.anyOf ?? [])];
  for (const branch of branches) {
    if (Array.isArray(branch.enum)) return branch.enum;
  }
  return null;
}

/** Whether the schema permits `null` for this property. */
function schemaAllowsNull(prop) {
  if (prop.type === "null") return true;
  if (Array.isArray(prop.type) && prop.type.includes("null")) return true;
  const branches = [...(prop.oneOf ?? []), ...(prop.anyOf ?? [])];
  return branches.some((branch) => branch.type === "null");
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function formatSet(set) {
  return `{ ${[...set].sort().join(", ")} }`;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

for (const target of TARGETS) {
  const subschema = subschemaFor(target);
  const label = target.def
    ? `${target.schema}#/$defs/${target.def} -> ${target.wire}`
    : `${target.schema} -> ${target.wire}`;

  if (!subschema) {
    recordFailure(`${label}: subschema not found`);
    continue;
  }

  const iface = interfaces.get(target.wire);
  if (!iface) {
    recordFailure(`${label}: interface not found in wire.ts`);
    continue;
  }

  const schemaProps = subschema.properties ?? {};
  const schemaRequired = new Set(subschema.required ?? []);
  const propNames = Object.keys(schemaProps);

  // 1. Property names, both directions.
  let namesOk = true;
  for (const name of propNames) {
    if (!iface.has(name)) {
      recordFailure(`${label}: schema has property "${name}" but the type does not`);
      namesOk = false;
    }
  }
  for (const name of iface.keys()) {
    if (!(name in schemaProps)) {
      recordFailure(`${label}: type has property "${name}" but the schema does not`);
      namesOk = false;
    }
  }
  if (namesOk) recordPass(`${label}: property names match`);

  // 2. Required-ness, 3. enums, 4. nullability - only for props on both sides.
  for (const name of propNames) {
    const prop = schemaProps[name];
    const field = iface.get(name);
    if (!field) continue;

    const schemaOptional = !schemaRequired.has(name);
    if (schemaOptional !== field.optional) {
      recordFailure(
        `${label}: "${name}" is ${schemaOptional ? "optional" : "required"} in the schema but ${field.optional ? "optional (marked `?`)" : "required"} in the type`,
      );
    } else {
      recordPass(`${label}: "${name}" required-ness matches`);
    }

    const expectedEnum = schemaEnum(prop);
    if (expectedEnum) {
      const actual = resolveLiterals(field.type);
      if (!sameSet(actual, new Set(expectedEnum))) {
        recordFailure(
          `${label}: "${name}" enum drift - schema has ${formatSet(new Set(expectedEnum))} but the type has ${formatSet(actual)}`,
        );
      } else {
        recordPass(`${label}: "${name}" enum matches`);
      }
    }

    if (schemaAllowsNull(prop) !== typeAllowsNull(field.type)) {
      recordFailure(
        `${label}: "${name}" nullability drift - schema ${schemaAllowsNull(prop) ? "permits" : "does not permit"} null but the type ${typeAllowsNull(field.type) ? "does" : "does not"}`,
      );
    } else {
      recordPass(`${label}: "${name}" nullability matches`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nKAIROX schema <-> wire type drift`);
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
