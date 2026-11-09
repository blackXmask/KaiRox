# Open contract decisions

Every schema in this directory is marked `DRAFT`. This file lists exactly what
is still undecided, who owns each call, and what is currently assumed in the
meantime. Nothing here is a defect — these are the questions that must be
answered before the contracts can freeze and `src/services/wire.ts` can be
generated from the schemas instead of being maintained by hand.

**Resolving a decision means editing the schema and the types together.**
`npm run test:contract` runs a drift guard that fails if either side changes
without the other, so a decision cannot be half-applied.

---

## Blocking contract freeze

| # | Decision | Owner | Currently assumed |
|---|----------|-------|-------------------|
| 1 | `detection.engine` enum may need `xgboost` / `ensemble` | M2 | Only `rules`, `lightgbm`, `isolation_forest` |
| 2 | Should `window_end > window_start` be enforced? | M2 | Not enforced; both are plain `date-time` |
| 3 | Should `detection.window_start` / `window_end` be required? | M2 | Required — but a canary hit is instantaneous and has no window |
| 4 | Should `event` carry `volume`? | M1 | Absent from the wire; the UI derives it from the path (`volumeFromPath`) |
| 5 | Should `event` carry `node_id`? | M1 | Absent from the wire; `ActivityEvent.nodeId` defaults to `""` |
| 6 | Keep `additionalProperties: false` on all six schemas? | Team | Enforced everywhere — unknown fields fail validation |
| 7 | Is `format` (`uuid`, `date-time`) meant to be enforced? | Team | Annotation-only in Draft 2020-12; enforced only because `validate.mjs` registers `ajv-formats` |
| 8 | Confirm the `display_id` addition on canary + incident | M1 + M2 | Committed, optional, additive — see below |

### Details

**1 — engine enum.** If M2 ships an XGBoost or ensemble model, the enum must
widen. Because `additionalProperties: false` does not constrain `enum`, an
unlisted engine fails validation rather than being ignored — a real detection
would be rejected at the boundary.

**2 — window ordering.** Nothing stops `window_end` preceding `window_start`.
The Rust side can check this (the `incidents` table already has a
`last_seen >= first_seen` CHECK), but the schema cannot express it, so a
payload that is wrong in this way validates as correct.

**3 — detection windows.** This is the sharpest of the three. A canary
trigger is a single instant: `window_start == window_end` at best, and at
worst there is no window at all. Making the fields required means either
fabricating a window for instantaneous detections or making them optional.
Making them optional means every consumer must handle absence.

**4 — event volume.** The UI already displays a volume per event, derived from
the path with a drive-letter regex. That derivation lives in `normalize.ts`
and is covered by tests, but it is an inference: the collector knows the real
size (`size_bytes`) and not the containing volume. Putting `volume` on the
wire would make it authoritative rather than inferred.

**5 — event node id.** This is the path-to-node question (Phase C) wearing a
different hat. An event carries `file_path`; the map shows nodes. Deciding
whether the wire carries `node_id` decides whether the frontend resolves paths
to nodes or the backend does — and therefore whether `applyActivityEvents`
survives. **Do not implement Phase C until this and the Phase C model are
agreed.**

**6 — additionalProperties.** `false` is the safer default: it catches typos
and silently-dropped fields. The cost is that any additive change requires a
schema edit, and an older consumer validating a newer payload will reject it.
If forward compatibility matters, `true` on the top level with `false` on
nested objects is the usual compromise.

**7 — format.** `format: "uuid"` and `format: "date-time"` do nothing under
Draft 2020-12 unless a format vocabulary is registered. Today `validate.mjs`
registers `ajv-formats`, so fixtures are checked — but any other consumer that
compiles these schemas with plain `ajv` will silently skip them. Either accept
that (document it) or add a `pattern` so the constraint is self-enforcing.

**8 — display_id.** Added to `canary.schema.json` and `incident.schema.json`
so demo records can carry readable `CAN-001` / `INC-001` labels while
`canary_id` / `incident_id` stay uuids. It is **optional** (absent from
`required`) because a live record may not have a label yet. This is additive
and non-breaking, but it changes the contract, so it needs explicit sign-off.

---

## IPC command names (provisional)

`src/services/tauriBackend.ts` calls the commands below. They are placeholders
behind the backend interface, so renaming them touches no component — but M1
owns `src-tauri/src/commands/` and must confirm or replace them.

| Command / event | Purpose | Status |
|-----------------|---------|--------|
| `get_runtime_info` | Top-bar runtime identity | **Agreed** — already implemented |
| `load_dashboard` | Full dashboard payload | Needs M1 |
| `save_canary_status` | Persist a canary status change | Needs M1 |
| `save_incident_status` | Persist an incident status change | Needs M1 |
| `save_canary` | Register a canary | Needs M1 |
| `save_events` | Batch event insert | Needs M1 |
| `kairox://events` | Batched live event channel | Needs M1 |

Until these exist, `invoke` rejects and live mode shows the backend error gate
rather than falling back to demo data. That is the intended behaviour.

---

## Decisions taken without waiting (reversible)

These were made to keep the project's honesty rule intact while the above
remain open. Each is a small, isolated change that a later decision can undo.

- **The demo simulation is gated on `backend.simulatedFeed`.** On a live
  backend the feed, the demo scan and the sample-scenario buttons all refuse
  to run, because injecting simulated events into live telemetry would present
  them as real. When M1 defines a real scan command, `startScan` should call
  it instead of refusing.
- **`display_id` is optional in the types, matching the schema.** The types
  previously required it; the drift guard caught the mismatch.
- **Live `loadDashboard` returns `nodes: []`.** How real paths become map
  nodes is decision 5 / Phase C, so nothing was invented here.

---

## When the contracts freeze

1. Resolve decisions 1–8 and remove the `DRAFT` `$comment` from each schema.
2. Generate `src/services/wire.ts` from `schemas/` and delete
   `tests/contract/drift.test.ts` — generation makes drift impossible, the
   guard only detects it.
3. Switch `tauriBackend.ts` to the confirmed command names.
4. Start generating Rust types from the same schemas so the two sides cannot
   diverge either.
