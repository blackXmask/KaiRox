# KAIROX Desktop App — Current Implementation Baseline

## Goal

This document records the current KAIROX prototype baseline. The application is an interactive Windows desktop dashboard using bundled simulated data only.

## Approved direction

- **Platform:** Windows 10 and Windows 11 desktop
- **UI framework:** React 18 + TypeScript + Vite
- **Desktop shell:** Tauri 2 with a Rust host and Windows WebView2
- **Architecture:** React UI in the Tauri WebView; Rust remains the native integration boundary
- **Data:** Shared in-memory sample data; no database or production backend is connected
- **Visual direction:** Dark graphite/navy surfaces, cyan/blue highlights, restrained red incident accents, compact security dashboard layout
- **Motion:** Restrained UI transitions and animated demo charts/status indicators; animations must not imply real protection activity
- **Map:** Use `public/assets/bg_map.png` as a fixed map texture behind a pan-and-zoom SVG filesystem graph
- **Visual matching:** Match the supplied KAIROX dashboard reference as closely as possible in layout, density, colors, hierarchy, and map treatment. Exact pixel identity is dependent on target resolution and source assets.

## First milestone screens

1. **Intelligence Map** — overview cards, illustrative endpoint/file activity map, recent events, activity chart, and health summary.
2. **Filesystem Explorer** — browsable mock folder tree, search, selected-item details, and demo event history.
3. **Live Telemetry** — filterable mock event table and activity visualization with a visible demo-mode indicator.
4. **Canary Registry** — mock canary inventory, status filters, details, and safe UI-only register/retire interactions.
5. **Threat Incidents** — incident list, severity filters, selected incident explanation, and forensic-style timeline.
6. **Detection Engine** — illustrative rule/model status and explainable mock risk evidence.
7. **System Health** — simulated service/sensor health and coverage indicators.
8. **Settings** — local UI preferences and simulated protection switches, clearly labeled as prototype-only.

## Interaction requirements

- Navigation switches between all screens without leaving the desktop app.
- Search, filters, sorting, selections, and detail panels operate against mock data.
- Buttons and toggles provide meaningful local UI feedback, but do not touch the real filesystem, processes, services, network, or system configuration.
- Use a persistent **DEMO MODE — SIMULATED DATA** indicator so screenshots and interactions cannot be mistaken for real endpoint protection.
- Include empty, loading, and selected states where appropriate.
- Use keyboard-accessible controls, visible focus states, and readable contrast.
- Keep animations brief and optional/reduced where practical; prioritize legibility and responsiveness over visual effects.

## Technical boundaries

- No real filesystem monitoring or process attribution.
- No canary file creation or modification.
- No process isolation, blocking, quarantine, deletion, or other containment.
- No claims that the prototype detects or prevents malware.
- No cloud services, authentication, database, or real endpoint agent in the current prototype.
- Keep demo data and interfaces isolated so future service integrations can replace them without rewriting the UI.

## Current project structure

```text
src/
  components/intelligence-map/
  simulation/
  App.tsx
  data.ts
  types.ts
  styles.css
public/assets/
src-tauri/
  capabilities/
  icons/
  src/
docs/
  assets/reference/
  product-vision/
```

The map UI and sample-data simulation are separated from the dashboard shell. New native monitoring, persistence, and detection integrations are future work and must not be represented as active in this prototype.

## Shared implementation conventions

- Keep shared event and filesystem models typed in `src/types.ts`.
- Keep sample filesystem topology and event generation in `src/simulation/`.
- Keep reusable visual components under `src/components/`.
- Represent time in UTC internally and format it for the user's local display.
- Use stable IDs for demo entities and events so selections and incident timelines remain consistent.
- Provide clear naming and shared enums for event type, severity, confidence, and health state.
- Do not add a package unless it solves a defined need; document any dependency added.

## Work sequence

1. Preserve the existing React/Tauri application and dashboard behavior.
2. Keep shared simulation state and the filesystem sample topology authoritative across screens.
3. Keep all demo-only functionality clearly labeled and isolated from real system actions.
4. Validate frontend type-check/build and native Tauri packaging after code changes.

## Completion criteria

- The Windows desktop app builds and opens successfully.
- The React frontend loads inside the Tauri desktop WebView; Vite is used only for development.
- All eight screens are reachable through navigation.
- Mock-data interactions work and remain within the app.
- Demo-only status is continuously clear.
- No security-sensitive system action or real monitoring is implemented.
- The UI follows the supplied KAIROX visual direction and remains usable at common desktop window sizes.

## Environment note

The application targets Windows and requires Node.js/npm, the Rust MSVC toolchain, Visual Studio C++ Build Tools, and WebView2. `cl.exe` and `link.exe` must be available to the terminal that launches Cargo.
