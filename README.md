# KAIROX

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

The three workstreams below have clear ownership boundaries. Agree on the DTO/protocol first, then work on separate folders/branches and integrate through reviewed interfaces.

### Member 1 — Windows collection and Rust/Tauri lifecycle

**Owns:** `src-tauri/src/platform/windows/`, `src-tauri/src/services/`, `src-tauri/src/commands/`, and Tauri command registration in `src-tauri/src/lib.rs`.

**Tasks:**

- Design a read-only, explicitly started/stopped Windows filesystem event collector.
- Define collector interfaces independent of Windows-specific implementation.
- Normalize events and publish them to the application service; do not access UI state directly.
- Add typed Tauri commands and Tauri event streaming with input validation and explicit errors.
- Handle startup, stop, shutdown, permissions, resource limits, and cleanup.
- Add Rust unit tests with fake collectors; test desktop behavior without requiring destructive system actions.

**Deliverable:** Rust can start/stop the chosen read-only collector and emit versioned events, with collection disabled until the user explicitly enables it.

### Member 2 — Detection and Python engine

**Owns:** `backend/python/`.

**Tasks:**

- Define Python request/response models that match the agreed wire-contract fixtures.
- Implement deterministic rule-based detection first; keep ML inference behind a replaceable interface.
- Extract features from normalized event batches only; document input assumptions and limitations.
- Return explainable assessments linked to source event IDs, not unsupported claims that a host is infected.
- Add Python unit tests, malformed-input tests, timeout/large-input tests, and reproducible sample fixtures.
- Document interpreter/runtime packaging needs and dependency versions.

**Deliverable:** A standalone, testable detection process that reads bounded versioned JSONL messages and returns structured assessments without collecting files or taking response actions.

### Member 3 — SQLite, contracts, and frontend bridge

**Owns:** `src-tauri/src/storage/`, shared contract fixtures/docs, and `src/services/` plus `src/hooks/`.

**Tasks:**

- Design SQLite schema and migrations for events, incidents, and canary metadata; establish retention and privacy rules.
- Implement Rust repositories and tests with temporary databases.
- Define versioned event/detection DTO fixtures used by Rust, Python, and TypeScript contract tests.
- Add the TypeScript backend interface, demo adapter, and Tauri adapter.
- Connect screens to backend subscriptions incrementally while preserving the browser simulation adapter.
- Add explicit connection/mode/error states so the UI distinguishes simulated from live data.

**Deliverable:** A tested persistence/data contract and frontend bridge that can switch between the current demo adapter and the desktop backend without rewriting screen components.

### Integration order and handoff

1. All members agree on event, detection, incident, and error DTOs plus sample contract fixtures.
2. Member 3 creates the interface, demo adapter boundary, migration skeleton, and contract tests.
3. Member 1 emits fake-source events through the agreed Rust command/event contract; Member 2 consumes the same fixture format.
4. Member 2 returns deterministic assessments; Member 1/Rust validates, persists, and publishes them.
5. Member 3 connects UI screens to the Tauri adapter, leaving browser mode on the demo adapter.
6. Only after end-to-end tests, privacy review, and explicit user-consent UX should a real read-only collector be enabled.

Keep pull requests scoped to the owned folders, include tests and a short manual verification checklist, and avoid simultaneous edits to `src/App.tsx` or shared contracts without coordination.

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
