import type { CanaryAsset, ThreatIncident, Risk } from "./types";
import type { WireCanary, WireIncident } from "./services/wire";
import { toDisplayCanary, toDisplayIncident } from "./services/normalize";
import demoRecords from "./fixtures/demo-records.json";

/**
 * Demo data.
 *
 * The source of truth is `fixtures/demo-records.json`, written in WIRE format
 * so it can be validated against `schemas/canary.schema.json` and
 * `schemas/incident.schema.json` by `npm run validate:schemas`. That is the
 * point of the migration: demo records now obey the same contract as live
 * records, so the demo path cannot quietly diverge from the real one.
 *
 * The UI consumes the display projections below, which are derived by
 * `services/normalize.ts`. Editing a display value directly would break the
 * contract - edit the JSON instead.
 *
 * The `as` casts are safe because the validator proves the JSON matches the
 * schemas these wire types describe. If you change the JSON, run
 * `npm run validate:schemas`.
 */

export const demoWireCanaries = demoRecords.canaries as WireCanary[];
export const demoWireIncidents = demoRecords.incidents as WireIncident[];

/** Wire canary uuid -> the readable label the UI shows (`CAN-003`). */
const canaryLabelById = new Map(
  demoWireCanaries.map((canary) => [canary.canary_id, canary.display_id ?? canary.canary_id]),
);

export const initialCanaries: CanaryAsset[] = demoWireCanaries.map(toDisplayCanary);

export const initialIncidents: ThreatIncident[] = demoWireIncidents.map((incident) =>
  toDisplayIncident(incident, {
    resolveCanaryId: (canaryId) => canaryLabelById.get(canaryId),
  }),
);

export function riskClass(risk: Risk): string {
  return `risk-${risk.toLowerCase()}`;
}
