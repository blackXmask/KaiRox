# KAIROX
<img width="1917" height="1065" alt="Screenshot 2026-11-05 214228" src="https://github.com/user-attachments/assets/bef3c529-f3ce-4bf5-b738-656c7206c88d" />
<img width="1917" height="867" alt="image" src="https://github.com/user-attachments/assets/4356cf7c-f7b3-461e-adee-6eeff33af4d1" />

KAIROX is a Windows-first endpoint-defense project. The current milestone is a polished, interactive desktop UI prototype. Its filesystem, events, incidents, scan, and detection results are **simulated sample data**. The app does not currently watch the real filesystem, create canaries, run ML inference, persist telemetry, quarantine files, or contain processes.

This README describes the implemented frontend and a proposed structure for the next backend milestone. Items marked **planned** are not implemented yet.

## Current stack

| Layer | Technology | Current responsibility |
|---|---|---|
| UI | React 18 + TypeScript | Dashboard screens, map, Explorer, tables, panels, and interactions |
| Styling | CSS | Dark KAIROX visual system and responsive layout |
| Build/dev server | Vite | Frontend development at `http://127.0.0.1:1420` and production assets |
| Desktop shell | Tauri 2 | Windows desktop window, WebView2 host, installer |
| Native host | Rust | Tauri command boundary; currently exposes only desktop runtime information |
| Simulation | TypeScript | Shared in-memory sample filesystem and activity simulation |
| Runtime assets | `public/assets/` | Map background and KAIROX brand banner |

The browser version and desktop version reuse the **same React UI**. Browser mode is for quick UI iteration; Tauri mode is the packaged Windows application. The Rust host and future native backend commands are available only in the desktop runtime.

## Project structure

```text
src/
  components/
    intelligence-map/       Interactive SVG filesystem map and controls
  simulation/                Sample filesystem topology and event generator
  App.tsx                    Dashboard screens, navigation, shared UI state
  data.ts                    Initial simulated canaries and incidents
  types.ts                   Shared frontend TypeScript models
  styles.css                 Application styles and design tokens
  main.tsx                   React entry point
public/assets/                Runtime map background and logo banner
src-tauri/
  capabilities/               Tauri window permissions
  icons/                      Windows app icon
  src/
    lib.rs                    Tauri builder and registered commands
    main.rs                   Native executable entry point
  tauri.conf.json             Dev server, window, CSP, and NSIS bundling config
docs/
  product-vision/              Product briefs
  assets/reference/            Preserved design and concept artwork
.azure/                        Project scaffolding metadata
```

### Proposed backend folders (create these during backend implementation)

Keep the frontend, desktop bridge, OS-specific collector, detection engine, and persistence responsibilities separate. A practical starting layout is:

```text
src/
  services/
    backend.ts                 Frontend backend interface
    demoBackend.ts             Existing simulation adapter for browser/demo mode
    tauriBackend.ts            Typed Tauri command/event adapter
  hooks/
    useDashboardData.ts        UI-facing data subscription and command hooks

src-tauri/src/
  commands/                    Validate IPC input and call application services
  services/                    Monitoring lifecycle and event orchestration
  platform/windows/            Windows-only filesystem/process adapters
  storage/                     SQLite connection, repositories, migrations
  models/                      Rust domain types and serialized DTOs
  lib.rs                       Register Tauri commands and initialize services

backend/python/
  kairox_detection/             Feature extraction and model/rule inference
  tests/                        Python unit and integration tests
  pyproject.toml                 Python tooling and dependency declarations
```

These are recommendations, not existing folders. Keep platform-independent business logic out of `platform/windows/`; that folder should contain Windows-specific implementations behind small Rust traits/interfaces.

## Requirements

- Windows 10/11 and Microsoft Edge WebView2 Runtime
- Node.js and npm
- Rust stable for `x86_64-pc-windows-msvc`
- Visual Studio C++ Build Tools (MSVC)

The terminal running Tauri/Cargo must be able to find `cl.exe` and `link.exe`. If `where.exe cl` or `where.exe link` returns no path, launch a Visual Studio Developer PowerShell (or configure the VS Code terminal to load the VS C++ build environment) and retry.

## Install

From the project root (`D:\KaiRox`):

```powershell
npm ci
```

`npm ci` installs the versions recorded in `package-lock.json`. Rust dependencies are restored by Cargo the first time a Tauri command is built.

## Run the frontend in a browser

For fast UI development with Vite and simulated data:

```powershell
npm run dev
```

Open `http://127.0.0.1:1420`. Stop the server with `Ctrl+C`.

To serve a production frontend build locally:

```powershell
npm run build
npm run preview
```

Preview is still a browser, not the native desktop application. It is useful for checking the production Vite output.

## Run the Windows desktop application

Start the Tauri development app:

```powershell
npm run tauri dev
```

Tauri starts Vite, builds/runs the Rust host, and opens a standalone KAIROX window containing the same React UI. Do not separately start `npm run dev` on port `1420` at the same time; the Tauri `beforeDevCommand` owns that port.

Create a production build and Windows NSIS installer:

```powershell
npm run build
npm run tauri build
```

The installer is generated under:

```text
src-tauri\target\release\bundle\nsis\
```

Build output and dependencies (`dist/`, `node_modules/`, `src-tauri/target/`) are generated locally and should not be committed.

## Validation commands

Run the TypeScript check and Vite production build:

```powershell
npm run build
```

Check and test the Rust host:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Python tests should be added under `backend/python/tests/` when the detection service is created. There is not yet a configured JavaScript unit-test script.

## Backend integration plan

### Target architecture

The backend replaces simulated data with real, read-only Windows telemetry. This is the agreed logical flow; exact transport and persistence sequencing is fixed by the Phase 1 contracts.

```text
Windows
  ├─ ReadDirectoryChangesW (Phase 2) ─┐
  └─ ETW kernel providers  (Phase 4) ─┤
                                       v
                 Member 1 — Rust collector: normalize to schema v1
                                       │
                          bounded queue, counted drops
                                       ├──────────────► SQLite (Member 3, rusqlite + WAL)
                                       v
                          5-second windowed batch
                                       v
                 Member 2 — behavioral rules (first, explainable)
                          + LightGBM inference (ONNX in Rust)
                                       v
                          Tauri events → React
                          (Member 3: demoBackend | tauriBackend)
```

Python remains in the project for dataset work, training, evaluation, benchmarking, and offline reports. Whether inference runs in Python or in Rust is a Phase 1 decision below.

### Phase 1 decisions (settle before writing production code)

| # | Decision | Recommended default | Owner |
|---|---|---|---|
| 1 | Python sidecar vs ONNX inference in Rust | ONNX in Rust (`ort` crate); keep Python for training and evaluation | All three |
| 2 | `notify` crate vs raw `ReadDirectoryChangesW` | `notify` for Phase 2; raw RWDW only if overflow semantics require it | Member 1 |
| 3 | Are `process` fields optional in schema v1? | Yes — `ReadDirectoryChangesW` provides no PID at all | All three |
| 4 | Path handling: full, redacted, or hashed | Full path plus a redaction setting; hashing breaks aggregation | Member 3 |
| 5 | Ownership of `src-tauri/src/lib.rs` and `src/types.ts` | Generate types from JSON Schema; `lib.rs` only concatenates command groups | All three |
| 6 | Drop policy for the bounded queue | Counted and reported; never silent | Member 1 |
| 7 | Performance budgets | 5k events/sec sustained, <3% CPU, <150MB RSS, p95 detection latency <2s | All three |
| 8 | Elevation requirement | User-profile directories need no admin; `C:\` and ETW kernel providers do | Member 1 |

### Known gaps in the original plan

Identified during review of the current codebase. Each needs an owner and a decision in Phase 1.

| Gap | Impact if ignored | Owner | Resolution |
|---|---|---|---|
| Public datasets are Sysmon-based; the collector produces only filename + action | **Fatal** — model features do not exist at inference time | Member 2 | Feature availability matrix (`available` / `degraded` / `unavailable`); train only on available features |
| `ReadDirectoryChangesW` has no PID | Process attribution silently absent | Member 1 | Mark `process` optional in schema v1; plan ETW for Phase 4 |
| Shipping Python inside a Tauri app | 40–80MB, antivirus false positives, slow cold start, hard runtime dependency | All three | Decide sidecar vs ONNX in Phase 1 |
| Four serialization hops with no backpressure plan | Memory growth and unmeasurable missed events | Member 1 | Bounded queue with counted, reported drops; batch per window |
| `src-tauri/src/lib.rs` edited by all three members | Three-way merge conflicts on every PR | All three | Each module exports its own command group; `lib.rs` concatenates |
| `src-tauri/Cargo.toml` contains only `serde` and `tauri` | Nothing the plan requires is installed | Member 1 | Own the dependency baseline: `tokio`, `serde_json`, `uuid`, `chrono`, `tracing`, watcher, `rusqlite` |
| No performance budgets | Phase 5 has nothing to test against | All three | Adopt the budgets in the table above |
| No elevation model documented | Monitoring fails unpredictably on protected paths | Member 1 | Document which paths require admin |
| Path privacy left as a placeholder | Redesign forced after real data collection starts | Member 3 | Decide in Phase 1 |
| 5-second window not a contract parameter | Member 2 cannot re-window historical events | Member 2 | Window start/end carried on the batch, not only on events |
| Behavioral rules listed as deliverable #6 | Lowest-risk capability delivered last | Member 2 | Promote rules to deliverable #1 |
| No service layer exists in the frontend | The integration seam is never built | Member 3 | Create `src/services/` and `src/hooks/useDashboardData.ts` |
| Map nodes have hand-placed coordinates and fake paths | Real telemetry has nowhere to render | Member 3 | Decide projection, dynamic nodes, or a separate live view |
| `ThreatIncident`, `CanaryAsset`, `ScanState` have no contract | Three frontend models drift from Rust/Python | Member 3 | Add incident, canary, and scan schema files |
| Phase 2 has no end-to-end check | Phase 3 becomes the failure point | All three | Walking skeleton required before Phase 2 closes |

### Shared data contracts

Member 3 owns the contracts and publishes them as JSON Schema files — the single source of truth. Types are generated rather than hand-written so Rust, Python, and TypeScript cannot drift.

```text
schemas/
  event.schema.json
  detection.schema.json
  incident.schema.json
  canary.schema.json
  scan.schema.json
  error.schema.json
```

Generate Rust types with `schemars` and TypeScript types with `json-schema-to-typescript`. Members 1 and 2 do not hand-edit `src/types.ts`.

**Known type mismatches that must be reconciled in Phase 1:**

| Frontend (`src/types.ts`) | Proposed schema | Conflict |
|---|---|---|
| `simulated: true` (literal type) | `source: "windows_collector" \| "simulation"` | A literal `true` cannot represent live events |
| `id: number` | `event_id: "evt-001"` | number vs string |
| `timestampMs: number` | `timestamp` ISO-8601 | number vs string |
| `risk: "High"` | `risk_level: "high"` | casing differs; `riskClass` in `data.ts` must follow |
| `nodeId`, `volume` | not in schema | the map needs them; give them an explicit home or declare them frontend-derived |
| `ThreatIncident`, `CanaryAsset`, `ScanState` | no contract exists | three frontend models with zero schema |

Example event:

```json
{
  "schema_version": 1,
  "event_id": "evt-001",
  "timestamp": "2026-11-06T12:00:00Z",
  "event_type": "file_modified",
  "file_path": "C:\\Users\\Demo\\report.docx",
  "process": { "pid": 1234, "name": "example.exe" },
  "source": "windows_collector"
}
```

Example detection result:

```json
{
  "schema_version": 1,
  "detection_id": "det-001",
  "related_event_ids": ["evt-001"],
  "risk_level": "high",
  "score": 85,
  "reason": "Unusual file modification activity",
  "engine": "lightgbm",
  "model_version": "1.0"
}
```

These are initial examples, not finalized schemas. All three members must agree on field definitions, optional values, timestamps, and score semantics before implementation. Note that `process` is optional: `ReadDirectoryChangesW` provides no process identifier, so `process` may be absent on events collected in Phase 2.

### 1. Keep the frontend independent of the backend transport

Add a TypeScript `Backend` interface under `src/services/` for the data the UI needs (for example: list/get status, start/stop monitoring, request a demo/real scan, subscribe to events, and query incidents). Provide:

- `demoBackend.ts`: wraps the existing simulation and remains the browser/demo implementation.
- `tauriBackend.ts`: invokes typed Tauri commands and listens for Tauri events in the desktop app.

Have the UI consume the interface through hooks or a shared store. Avoid calling `invoke()` throughout screen components. Preserve a clear demo/real mode in the UI and surface backend errors; do not silently fall back to simulated success if a native command fails.

### 2. Make Rust the owner of native endpoint access

Implement command handlers in `src-tauri/src/commands/`, orchestration in `services/`, and actual Windows APIs behind adapters in `platform/windows/`. Rust should own monitoring lifecycle, input validation, permissions, event timestamps/IDs, and access to SQLite. Do not add real filesystem or process access to React code.

Start with read-only collection and explicit user consent. Design and test safe stop/cleanup, bounded event queues, path handling, and error reporting before enabling any response action. Keep quarantine, process termination, deletion, or other disruptive actions out of the initial backend milestone.

### 3. Add SQLite persistence behind Rust repositories

Put migrations and repository code under `src-tauri/src/storage/`. Store versioned events, incidents, and canary metadata through repositories rather than exposing SQL to UI components or Python. Decide retention limits, database location, schema migration behavior, and whether sensitive paths/process details need minimization before collecting real endpoint data.

### 4. Integrate Python detection as a separate, constrained engine

Keep Python under `backend/python/`; it should receive normalized event batches/features and return typed detection assessments. It should not independently crawl the filesystem or perform response actions.

For a local desktop app, prefer a Rust-managed child process with a versioned JSON Lines protocol over opening a localhost port. Define request/response schemas, maximum message sizes, timeouts, restart behavior, and structured error messages before implementation. Rust remains responsible for authorization, persistence, and deciding what reaches the UI. Package and sign the Python runtime/engine as a separate deployment task; do not assume the development interpreter will exist on end-user machines.

### 5. Define contracts before parallel implementation

Agree on versioned DTOs before each member builds against different assumptions. A real event should have a stable ID, UTC timestamp, event kind, normalized path or privacy-preserving path reference, process identity when legitimately available, source, and schema version. Detection output should include its own ID, related event IDs, rule/model version, risk/confidence, explanation, and whether it is a demonstration result. Keep frontend display types in `src/types.ts` and Rust/Python wire schemas aligned with fixtures and contract tests.

## Three-member backend work split

Each member owns one technical domain, develops it independently, and integrates through the agreed contracts. Work in your own feature branch and open pull requests into `main`:

```text
feature/windows-monitoring
feature/ransomware-detection
feature/database-integration
```

Avoid editing another member's core files without coordination. Agree on interfaces first — the event schema, detection schema, JSON Lines protocol, error format, database ownership, and communication responsibilities must be finalized before full implementation begins.

### Member 1 — Windows Endpoint Monitoring & Rust Engineer

**Owns:** `src-tauri/src/platform/windows/`, `src-tauri/src/services/`, `src-tauri/src/commands/`, and Tauri command registration in `src-tauri/src/lib.rs`.

**Main responsibility:** build the system that monitors actual Windows filesystem activity and collects endpoint events.

**Technologies:** Rust, Tauri 2, Windows API (`ReadDirectoryChangesW`), Tokio, Serde, Tauri events.

**Development structure:**

```text
src-tauri/src/
├── commands/
│   ├── monitoring.rs
│   └── system.rs
├── services/
│   ├── monitor.rs
│   └── event_processor.rs
├── platform/
│   └── windows/
│       ├── filesystem.rs
│       └── process.rs
├── models/
│   └── event.rs
└── lib.rs
```

**Phase A — Foundation:**

- Own the dependency baseline in `src-tauri/Cargo.toml`: `tokio`, `serde_json`, `uuid`, `chrono`, `tracing`, and the watcher crate. Document every addition.
- Decide `notify` versus raw `ReadDirectoryChangesW` and record the decision.
- Create the module skeleton above.
- Agree the `lib.rs` command-registration convention so registration never conflicts across branches.

**Phase B — The watcher:**

- Recursive directory watching over a configurable watch list. Start with user profile directories, not `C:\`.
- Watch newly created subdirectories — `ReadDirectoryChangesW` does not do this automatically.
- Handle buffer overflow (`ERROR_NOTIFY_OVERFLOW`) by emitting an explicit gap event. Missed events must be counted, never silently dropped.
- Run the watcher on a dedicated thread, not the tokio runtime; hand results off to async code.
- Handle UTF-16 paths and long paths over 260 characters (`\\?\` prefix). Document that network/SMB paths are unsupported.
- Decide process attribution in writing: no PID in Phase 2 with `process` optional in the schema, ETW (`Microsoft-Windows-Kernel-File` + `Kernel-Process`) in Phase 4, or lossy process-snapshot correlation.

**Phase C — Commands and lifecycle:**

- `start_monitoring(paths)`, `stop_monitoring()`, `get_monitoring_status()` — all async, all owning an explicit handle. Starting twice must not leak a second watcher.
- Emit normalized events to the frontend through Tauri events, using the agreed event name and payload.
- Read-only guarantee: never write, delete, or modify user files. No quarantine, no containment.
- Explicit user control: monitoring never auto-starts on launch.
- Clean up all threads and handles on window close.

**Phase D — Normalization:**

- Implement `models/event.rs` producing exactly schema v1: `schema_version`, string `event_id`, ISO-8601 UTC `timestamp`, `event_type`, `file_path`, optional `process`, `source`.
- Cover `file_created`, `file_modified`, `file_deleted`, `file_renamed`, `directory_changed`.
- Return the agreed error response format, not ad-hoc strings.

**Phase E — Proof:**

- A test harness script that creates, modifies, renames, and deletes files in a temporary directory, then verifies the resulting events.
- Rate and backpressure testing: a burst of thousands of writes must not balloon memory.

**Deliverables:**

1. A working Windows filesystem monitoring prototype.
2. Real filesystem events generated from actual test activity.
3. Normalized JSON event output matching schema v1.
4. Rust/Tauri commands for monitoring start and stop.
5. Reliable error handling, cleanup, and counted gap reporting.
6. Integration with Member 2's detection engine.

**Definition of done:** starting monitoring, creating a file in Explorer, and seeing a correctly normalized event with `source: "windows_collector"` appear in under a second.

**Important considerations:** start read-only; no kernel drivers initially; do not delete, quarantine, or modify user files; handle buffer overflow and missed events; make monitoring explicitly user-controlled; never present simulated events as real endpoint telemetry.

**Main risks:** buffer overflow silently losing events, missed new-subdirectory watches, network paths failing, and process attribution assumed to be easy when it is not.

### Member 2 — Ransomware Detection & Machine Learning Engineer

**Owns:** `backend/python/`.

**Main responsibility:** develop the intelligence that identifies ransomware-like behavior and returns an explainable risk assessment.

**Technologies:** Python, Pandas/Polars, NumPy, Scikit-learn, LightGBM, XGBoost, Joblib.

**Datasets:** [CSU-Ransomware-Data](https://github.com/CSCRC-SCREED/CSU-Ransomware-Data) (primary, ~413,556 Sysmon events), [RADAR](https://doi.org/10.5281/zenodo.14542546) (validation, 400,000+ events, seven ransomware families), [MLRan](https://github.com/faithfulco/mlran) (additional research).

**Development structure:**

```text
backend/python/
├── kairox_detection/
│   ├── preprocessing.py
│   ├── feature_extraction.py
│   ├── rules.py
│   ├── lightgbm_detector.py
│   ├── anomaly_detector.py
│   ├── decision_engine.py
│   └── inference.py
├── models/
│   └── lightgbm_model.txt
├── training/
│   ├── train.py
│   ├── evaluate.py
│   └── compare_models.py
├── tests/
├── requirements.txt
└── main.py
```

**Phase A — The feature contract (deliverable #0, before anything else):**

- Build the feature availability matrix. For every feature in the three datasets, mark it `available` (the collector produces it), `degraded` (producible at lower fidelity, e.g. no process name), or `unavailable` (Sysmon-only: `Hashes`, `ProcessGuid`, `Image`, `User`). **Train only on the available set.** This matrix is the artifact that prevents a model nobody can run.
- Agree the windowed-batch contract with Member 1: 5-second windows, with **window start/end timestamps carried on the batch itself**, not only on individual events, so historical data can be re-windowed later.
- Define label granularity. The datasets label by campaign or machine, not by 5-second window. An explicit rule for assigning window labels from event labels is required; getting it wrong makes every evaluation meaningless.

**Phase B — Data pipeline:**

- Ingest three different formats through three adapters into one internal format. They are not the same schema.
- Clean and preprocess: missing values, deduplication, timestamp normalization, class balance inspection.
- Prevent data leakage. Do **not** randomly split event-level rows — events from the same campaign appearing in both train and test inflate metrics. Split by campaign, machine, or time, and state the strategy in the report.

**Phase C — Behavioral features over 5-second windows:**

- Files modified in window, rename frequency, delete frequency, write frequency.
- Distinct directories affected.
- Extension-change ratio (the strongest single ransomware signal).
- File size change magnitude.
- Entropy change — only where measurable; mark unavailable otherwise rather than fabricating it.
- Repeated modification patterns on the same path.
- Rolling multi-window aggregates (5s → 30s → 5min).

**Phase D — Detection layers (rules first):**

1. **Explainable behavioral rules — deliverable #1, not #6.** Burst rate thresholds, extension-change ratio, entropy spike, canary file hit. Rules alone catch most ransomware, need zero training data, and are testable immediately. This is the lowest-risk win.
2. **LightGBM** — primary supervised classifier trained on the available feature subset.
3. **Evaluation report** — precision, recall, F1, **PR-AUC** (not accuracy; these datasets are heavily imbalanced), false-positive rate, and detection latency, reported per window and per family.
4. **XGBoost benchmark** — optional. Cut it if Phase 2 slips.
5. **Isolation Forest** — deferrable. Keep it only if it measurably improves on rules plus LightGBM; do not assume the ensemble is better.

**Phase E — Inference and packaging:**

- Settle sidecar-Python vs ONNX-in-Rust in Phase 1 — this changes the interface deliverable.
  - **ONNX path (recommended):** export LightGBM/XGBoost/IsolationForest with `onnxmltools`/`skl2onnx` and run in Rust with `ort`. Training, evaluation, and benchmark deliverables stay identical; only inference packaging changes.
  - **Sidecar path:** JSON Lines protocol plus process supervision, cold start, and a packaging burden on Member 1.
- **Decision engine:** combine rules and model into one risk score with a human-readable `reason`. Never return a bare number.
- Structured output matching schema v1: `detection_id`, `related_event_ids`, `risk_level`, `score`, `reason`, `engine`, `model_version`.
- **Reproducibility:** fixed random seeds, pinned dependency versions, and a single `train.py` that regenerates the model from scratch.

**Deliverables:**

1. Dataset analysis and preprocessing pipeline with the feature availability matrix.
2. Reproducible model training scripts.
3. Trained LightGBM model.
4. XGBoost benchmark results (optional).
5. Isolation Forest anomaly detector (deferrable).
6. Explainable behavioral detection rules — first, not last.
7. Evaluation report with precision, recall, F1, PR-AUC, false-positive rate, and detection latency.
8. Inference engine — Python sidecar or ONNX, per the Phase 1 decision.
9. JSON Lines communication interface with Member 1's Rust backend (sidecar path only).

**Definition of done:** `train.py` produces a model; feeding it a real window of events returns a detection with a score, a reason, and a model version — and a deliberately generated ransomware-like burst scores high while normal activity does not.

**Important considerations:** the datasets use different collection formats, so map features carefully to KAIROX's actual telemetry instead of assuming all features are available. Do not assume LightGBM + Isolation Forest + Rules is automatically better than individual models — benchmark each component.

**Main risks:** the feature-availability mismatch (fatal if discovered late), label granularity, data leakage inflating metrics, and class imbalance making accuracy look good while recall is terrible.

### Member 3 — Data Engineering, SQLite & Frontend Integration Engineer

**Owns:** `src-tauri/src/storage/`, shared contract fixtures and docs, `schemas/`, and `src/services/` plus `src/hooks/`.

**Main responsibility:** build the data infrastructure connecting endpoint monitoring, detection, persistence, and the existing dashboard.

**Technologies:** SQLite, Rust (`rusqlite`, bundled), TypeScript, React, Tauri 2, Serde, SQL migrations.

**Development structure:**

```text
src/
├── services/
│   ├── backend.ts
│   ├── demoBackend.ts
│   └── tauriBackend.ts
├── hooks/
│   └── useDashboardData.ts
├── types.ts
└── App.tsx

src-tauri/src/
├── storage/
│   ├── database.rs
│   ├── migrations/
│   └── repositories/
└── models/
    └── detection.rs
```

**Phase A — Contracts (everyone blocks on this):**

- Write the six JSON Schema files listed under *Shared data contracts*. The original plan specified only event and detection; the frontend also has `ThreatIncident`, `CanaryAsset`, and `ScanState` with no contract at all, so incident, canary, and scan schemas are required too.
- Resolve every row of the type mismatch table above. You own this reconciliation — specifically `simulated: true` → `source`, `id` → `event_id`, `timestampMs` → ISO-8601, `risk` → `risk_level` casing (and `riskClass` in `data.ts` to match), and an explicit home for `nodeId`/`volume`.
- Generate rather than hand-write the types, so Members 1 and 2 never hand-edit `src/types.ts`.

**Phase B — The service seam:**

- Create `src/services/backend.ts` — the interface every screen consumes.
- Create `src/services/demoBackend.ts` — wraps the existing `createSimulationEvents`, `initialFilesystemNodes`, and `data.ts` unchanged. Demo mode must behave exactly as it does today.
- Create `src/services/tauriBackend.ts` — real `invoke` plus Tauri `listen`.
- Create `src/hooks/useDashboardData.ts` — extract `nodes`, `events`, `canaries`, `incidents`, and `scan` out of `App.tsx`. This is the single largest and riskiest refactor in the project: `App.tsx` is roughly 72KB, holds all state inline, and every member touches it. Do it early, in one focused PR, before Members 1 and 2 land backend features.
- Preserve the demo/live indicator. It already exists — keep it persistent and make it reflect real backend state rather than a hardcoded string.

**Phase C — The path-to-node problem:**

- Define how real telemetry appears on the map. `filesystemSimulator.ts` seeds have hand-placed `x`/`y` coordinates and fake paths (`C:\Users\Abdullah\...`); a real event has neither. Choose and document one approach:
  - **Projection** — map real paths onto existing seeded nodes.
  - **Dynamic nodes** — create and lay out nodes at runtime for observed paths.
  - **Separate view** — keep the spatial map demo-only and add a distinct live telemetry view.
- This must be decided in Phase 1 because it determines whether `applyActivityEvents` survives.
- Update `applyActivityEvents` to consume schema-v1 events instead of demo-shaped ones.

**Phase D — Persistence:**

- SQLite via `rusqlite` with the `bundled` feature — simpler and synchronous, with no system SQLite dependency. Do not use SQLx for a local desktop database.
- Enable **WAL mode**: the monitor writes while the dashboard reads.
- Versioned SQL migration files, never hand-run scripts. Four tables: `events`, `detections`, `incidents`, `canaries`.
- Repositories: `event_repo.rs`, `detection_repo.rs`, `incident_repo.rs`, `canary_repo.rs` under `storage/repositories/`.
- Canary honesty rule: rows must be labeled demo vs real. The baseline requires demo canaries never be presented as real monitored files.

**Phase E — Real-time integration:**

- Tauri event listeners feeding the hook. Verify `core:default` in `capabilities/default.json` covers `listen()`/`emit()`; add explicit `core:event:*` permissions if it does not.
- UI backpressure: at real event rates, re-rendering thousands of events per second freezes the dashboard. Buffer, batch, and cap what is rendered — keep full history in SQLite and show a windowed slice.
- Error honesty: extend the existing `runtimeError` state so a failed live backend never silently falls back to simulated data showing success. This is a hard project requirement.
- Persistent event and incident history with pagination — do not load everything into React state.

**Deliverables:**

1. Finalized shared JSON schemas — six files, generated types for Rust and TypeScript.
2. SQLite database and versioned migrations.
3. Event, detection, incident, and canary repositories with tests against temporary databases.
4. TypeScript backend interface.
5. Demo and real backend adapters.
6. Real-time dashboard integration with bounded rendering.
7. Persistent event and incident history.
8. Integration and database tests.

**Definition of done:** the dashboard runs in DEMO mode exactly as today, flips to LIVE mode on a toggle, shows real filesystem events streaming in, persists them, and displays a real detection with its explanation — while an induced backend failure shows a visible error instead of quietly showing fake success.

**Main risks:** the `App.tsx` refactor breaking all eight screens, render performance at real event rates, and the path-to-node mapping being left until Phase 3.

### Shared development rules

1. **Agree on interfaces first.** Before full implementation, finalize the event schema, detection schema, JSON Lines protocol, error format, database ownership, and communication responsibilities.
2. **Independent development.** Each member works in their own feature branch and merges to `main` through pull requests. Do not edit another member's core files without coordination.
3. **Integration workflow.** The pipeline runs Windows filesystem → Rust collector → normalization → detection → Rust backend → SQLite → Tauri events → React dashboard. Exact transport and persistence sequencing is fixed by the Phase 1 contracts.

### Cross-cutting tasks

These have no natural single owner. Assign them explicitly or they will be skipped.

| Task | Owner | Why it matters |
|---|---|---|
| Sidecar Python vs ONNX-in-Rust decision | All three | Changes Member 2's interface and Member 1's process management |
| `notify` vs raw `ReadDirectoryChangesW` | Member 1 + Member 3 | Affects schema fidelity |
| `lib.rs` command-registration convention | All three | Merge conflict otherwise |
| Dependency baseline in `Cargo.toml` | Member 1 | Everyone needs `tokio` and `serde_json` |
| Feature availability matrix | Member 2, shared | Members 1 and 3 need to know what is collectible |
| Walking skeleton end-to-end in Phase 2 | All three | One event → one detection → one row → one dashboard row |

### Development milestones

**Phase 1 — Architecture.** All three members agree on the schemas and interfaces, and the eight Phase 1 decisions above are recorded.

**Phase 2 — Independent prototypes.** Member 1 generates actual Windows filesystem events. Member 2 trains a model and processes sample event windows. Member 3 creates SQLite storage and connects the dashboard using fixtures. Phase 2 does not close until the walking skeleton is green: one real file created, one detection returned, one row stored, one row visible in the dashboard.

**Phase 3 — Integration.** Connect the three components.

**Phase 4 — Real endpoint testing.** Replace simulated collection with actual read-only Windows monitoring, adding ETW for process attribution if the decision requires it.

**Phase 5 — Validation.** Evaluate detection accuracy, false positives, latency, resource consumption, missed events, and reliability against the agreed performance budgets.

### First-week order

1. Member 3 writes the six JSON Schema files and reconciles the type mismatches. Everyone else is blocked on this.
2. Member 3 extracts `useDashboardData` and the three service files from `src/App.tsx`, before anyone else lands backend code.
3. Member 1 establishes the dependency baseline and module skeleton, records the `notify` decision, then produces one real event type.
4. Member 2 builds the feature availability matrix, then behavioral rules — not models — so there is something demonstrable without waiting on datasets.
5. End of week 2: the walking skeleton runs end to end.

### Integration order and handoff

1. All members agree on event, detection, incident, canary, scan, and error DTOs plus sample contract fixtures.
2. Member 3 creates the interface, demo adapter boundary, migration skeleton, and contract tests.
3. Member 1 emits fake-source events through the agreed Rust command/event contract; Member 2 consumes the same fixture format.
4. Member 2 returns deterministic assessments; Member 1 validates, persists, and publishes them.
5. Member 3 connects UI screens to the Tauri adapter, leaving browser mode on the demo adapter.
6. Only after end-to-end tests, privacy review, and explicit user-consent UX should a real read-only collector be enabled.

Keep pull requests scoped to the owned folders, include tests and a short manual verification checklist, and avoid simultaneous edits to `src/App.tsx` or shared contracts without coordination.

### Member selection

Three technical roles are available:

1. Windows Endpoint Monitoring & Rust Engineer
2. Ransomware Detection & Machine Learning Engineer
3. Data Engineering, SQLite & Frontend Integration Engineer

Everyone reviews the responsibilities above and replies with their preferred role, chosen on technical interest and willingness to learn the assigned technologies. Assignments are finalized after everyone responds.

**KAIROX — Detect at the decisive moment.**

## Backend acceptance checklist

- Demo/browser mode still works without Rust or Python installed.
- Desktop mode clearly reports unavailable/failed native services instead of presenting sample values as live.
- No collector starts automatically or without explicit user consent.
- Collector can stop promptly and releases handles/resources on app shutdown.
- Events are validated, bounded, timestamped, and persisted through Rust-owned repositories.
- Python receives only the agreed normalized input and cannot access host files or execute response actions.
- Detection output is explainable and traceable to event IDs; demo scores are not presented as calibrated probabilities.
- Migrations, repository tests, protocol tests, and end-to-end desktop tests pass.
- No quarantine, process termination, file deletion, or other response action is enabled in the initial integration.

## Design and product references

- [Product vision](docs/product-vision/final-idea.md)
- [Full concept and implementation brief](docs/product-vision/full-idea.md)
- Preserved mockups and brand/concept images: `docs/assets/reference/`
- Runtime assets used by the app: `public/assets/`
