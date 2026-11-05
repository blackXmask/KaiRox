# KAIROX

## Product Vision

KAIROX is a Windows-first endpoint defense platform built to detect ransomware-like activity at the earliest observable stage. It combines deception-based canaries, filesystem telemetry, behavioral analytics, and AI-assisted correlation into one local-first protection system.

The product does not rely on a single detection signal. Instead, it combines multiple independent evidence streams so that a canary trigger, suspicious file burst, unusual rename pattern, and process behavior can be correlated before a user-facing incident is declared.

This allows KAIROX to detect attacks at the decisive moment, explain what happened, and trigger a controlled response before encryption spreads.

Tagline: Detect at the decisive moment.

## Core Product Value

KAIROX is designed to solve a real security problem: ransomware often moves quickly, modifies large numbers of files, and causes irreversible damage before traditional endpoint tools can respond meaningfully.

KAIROX helps by:

- placing on-disk deception files that behave like valuable targets
- observing suspicious filesystem behavior in real time
- correlating file activity with canary triggers and process evidence
- ranking the risk using rule-based logic and ML-assisted scoring
- surfacing explainable evidence for investigation and containment

The strongest market position is not simply “AI detecting ransomware.” The real differentiator is:

> KAIROX is a deception-guided endpoint defense platform that correlates high-confidence canary events with behavioral evidence to detect, explain, and contain ransomware-like attacks at the earliest observable stage.

## Product Principle

The core principle behind the platform is:

> Detect through multiple signals, decide through correlated evidence, and respond according to confidence and risk.

This means every layer must contribute evidence rather than acting independently in a way that creates false certainty.

KAIROX should never rely on a single detector. A canary may be missed, a legitimate app may create bursts of file activity, and a model may make a wrong call. The system must combine signals and use a policy engine that respects uncertainty.

## Target Users

KAIROX is best suited for:

- small and medium businesses with limited security teams
- managed service providers managing multiple endpoints
- security-conscious users who want early ransomware detection
- environments where local-first protection and explainability matter more than cloud-only heuristics

## Architecture Overview

KAIROX is structured as a layered system so every engineering team works on a clear responsibility boundary and the integration remains predictable.

The architecture consists of these layers:

1. Endpoint control and UI
2. Local service and protection orchestration
3. Canary and decoy management
4. File system telemetry collection
5. Behavioral feature extraction
6. Detection engine and evidence correlation
7. Response policy and containment
8. Forensic timeline and reporting

Each layer must use the same event model, status vocabulary, and confidence semantics. If every layer follows the same contract, integration becomes much easier and the product becomes far more maintainable.

## Layer-by-Layer Team Responsibilities

### Layer 1: Endpoint Control and UI

Technology: C# + WPF

Primary responsibility:
- provide the desktop application experience
- install and manage the KAIROX agent
- show live health, stories, alerts, evidence, and event summaries
- allow the user to enable or disable protection

This layer must not directly decide security outcomes. It should present approved decisions from the detection engine and show evidence clearly to the user.

Team responsibilities:
- UI/UX team: main dashboard, risk cards, incident panel, settings, incident history
- desktop app team: tray integration, login state, service registration, health checks
- configuration team: policy config, model versioning, endpoint settings

Required outputs:
- user-visible protection state
- local settings schema
- event subscriptions to live alerts
- status summary for service health

### Layer 2: Local Service and Protection Orchestration

Technology: Windows service / privileged background process

Primary responsibility:
- start and monitor the monitoring pipeline
- coordinate system-level security actions
- ensure all pipelines are alive and healthy
- enforce local policy decisions from the detection engine

This layer acts as the coordinator. It watches over the telemetry, canary manager, detection engine, and response policy engine. It manages health and ensures each subsystem starts correctly.

Team responsibilities:
- service engineering team: service lifecycle, watchdog, process control, daemon orchestration
- platform integration team: privilege and Windows compatibility, startup rules, service registration

Required outputs:
- service health states
- config snapshots
- pipeline readiness reports
- action requests to containment modules

### Layer 3: Canary and Decoy Management

Primary responsibility:
- create safe synthetic decoy files in authorized directories
- register them with metadata and expected integrity fingerprints
- track their status across active, triggered, missing, and retired states
- support evidence creation when a canary is modified or deleted

This is KAIROX’s signature layer. It is a high-value deception mechanism that allows the system to detect suspicious behavior even before a full ransomware pattern is established.

Team responsibilities:
- canary management team: create decoy generation rules, lifecycle rules, file placement policies
- integrity validation team: hash tracking, validation checks, file mismatch detection

Required outputs:
- canary metadata records
- canary lifecycle events
- canary trigger event objects
- integrity verification reports

### Layer 4: Filesystem Telemetry Collection

Primary responsibility:
- capture low-level file operations in normalized event format
- observe folder and file-level activity in real time
- record event source, timestamp, path, process, and quality metadata
- ensure watcher health and event completeness

This layer is the “security camera” of the product. It does not decide risk by itself; it only records reliable observations in a standard format.

Team responsibilities:
- telemetry engineering team: watcher configuration, Windows event sources, deduplication logic, file event normalization
- sensor reliability team: watcher health checks, event overflow detection, data completeness validation

Required outputs:
- raw structured file events
- event quality metadata
- deduplicated stream of filesystem observations
- watcher health state

### Layer 5: Behavioral Feature Extraction

Primary responsibility:
- convert file event streams into behavior windows
- calculate statistical and contextual patterns for a time interval
- summarize attack-like behavior such as bursts, renames, deletions, high extension diversity, and canary activity

This is the bridge between low-level telemetry and risk assessment. It takes time-windowed event data and turns it into an explainable feature vector.

Team responsibilities:
- behavior analytics team: feature engineering, windowing algorithms, burst detection, activity summaries
- data quality team: missing value handling, baseline calibration, feature versioning

Required outputs:
- feature vectors per suspicious window
- behavioral summaries
- event-to-window correlation metadata

### Layer 6: Detection Engine and Evidence Correlation

Primary responsibility:
- evaluate deterministic rules
- run supervised and unsupervised detection models
- correlate signals from telemetry, canaries, behavior, and process evidence
- generate explainable risk scores and evidence bundles

This is the decision layer. It uses multiple signals and combines the results into a coherent incident assessment.

Team responsibilities:
- rule engine team: rule definitions, thresholds, confidence mapping
- ML team: feature alignment, model training, scoring pipeline, validation
- risk correlation team: evidence merging, confidence weighting, risk synthesis

Required outputs:
- rule evidence records
- model inference results
- aggregated risk assessment objects
- incident evidence bundles

### Layer 7: Response Policy and Containment

Primary responsibility:
- determine what action to take based on highest-confidence evidence
- trigger user-visible alerts or actions
- coordinate local response actions such as process isolation or file access restrictions

The policy engine should not act on single weak signals. It should respond according to strength, confidence, and historical pattern context.

Team responsibilities:
- response policy team: security policies, thresholds, action mapping
- containment engineering team: process isolation, access blocking, alert escalation

Required outputs:
- response decisions
- auto-block recommendations
- user risk actions
- containment status records

### Layer 8: Forensic Timeline and Reporting

Primary responsibility:
- maintain a timeline of relevant events
- show the sequence of evidence that produced the final risk decision
- preserve forensic detail for investigation or future review

This layer turns raw technical evidence into readable security context.

Team responsibilities:
- forensic review team: timeline construction, evidence packaging, story generation
- UI reporting team: incident presentation, summaries, timeline view, risk explanation cards

Required outputs:
- forensic timeline entries
- evidence summaries
- explanation narratives
- incident reports

## Standardized Data Contract for All Layers

To keep the system integrated and easy to maintain, every layer must follow the same core conventions.

### Shared Naming Standards

Every event, signal, and decision should use consistent semantics:

- device_id: unique endpoint identity
- incident_id: shared grouping ID for related suspicious behavior
- correlation_id: links related events across layers
- canary_id: identifies the decoy file involved
- process_id / process_name: process identity, when available
- event_type: normalized action kind such as file_modified, file_deleted, file_renamed, canary_triggered
- timestamp_utc: time recorded in UTC
- ingested_at_utc: time the event entered the system
- confidence: low, medium, high
- risk_score: continuous or normalized risk output
- source_layer: the layer that produced the record

### Event Quality Rules

Every layer must mark its output with quality metadata:

- observed: seen directly by the sensor
- inferred: calculated from surrounding activity
- estimated: probability-based or derived from weaker signals
- unavailable: not measurable or not attributable

No event should be treated as fully trustworthy without an explicit quality tag.

### Required Integration Contract

When a layer produces its output, it must provide:

- entity or event identifier
- timestamp and source info
- confidence or risk metadata
- reason or explanation
- relation to predecessor events
- quality status

This allows the next layer to decide whether to trust, reject, or aggregate the signal.

## Common Process for ALL Teams

Every team working on the project must follow the same development and integration process.

### 1. Input Definition

Each module must define:
- what it receives
- what it validates
- what schema it expects
- how it handles missing or incomplete data

### 2. Output Contract

Each module must produce a clearly structured output:
- event or signal object
- timestamp
- confidence level
- quality label
- relation id
- optional explanation text

### 3. Event Correlation Rules

The system should group events into a time window and correlate them with:
- canary movement
- file writes or renames
- deletion bursts
- process identity
- timeline context

### 4. Confidence Handling

Confidence must be preserved at every stage. A weak signal should not become a strong signal simply because it is aggregated.

### 5. Explainability Requirement

Every alert must be explainable in human terms. A user should be able to understand:
- what happened
- what triggered suspicion
- which canaries or files were involved
- what the system believes is happening
- what action is recommended

## End-to-End Detection Flow

The overall system should follow this exact process:

1. The KAIROX agent starts and initializes the service and all protection modules.
2. The canary manager creates approved decoy files in protected folders.
3. The telemetry layer monitors file and folder operations.
4. File events are normalized into a standard event format.
5. The behavioral engine groups events into time windows and extracts suspicious features.
6. The detection engine evaluates rules and ML models.
7. The correlation engine merges canary, process, telemetry, and behavior evidence.
8. The policy engine decides whether the activity is suspicious, low risk, or critical.
9. The UI presents the explanation, timeline, and recommended response to the user.
10. The forensic layer stores the evidence and timeline for review.

This exact flow should remain consistent across all development work, regardless of which team owns the component.

## Example of a Normalized Risk Event

```json
{
  "incident_id": "inc_20261021_00013",
  "device_id": "desktop-abdullah",
  "correlation_id": "corr_77821",
  "timestamp_utc": "2026-10-21T14:32:17Z",
  "risk_level": "critical",
  "confidence": "high",
  "source_layer": "detection_engine",
  "canary_id": "CAN-0042",
  "file_path": "D:/Projects/suspicious_file.exe",
  "process_name": "unknown",
  "event_types": ["file_modified", "canary_triggered", "rename_detected"],
  "reason": "Canary file was modified repeatedly in a short interval with rapid rename and deletion activity.",
  "response_action": "investigate_and_isolate",
  "evidence_quality": "observed"
}
```

This object is the shared language between all modules. Every layer should produce outputs that can feed into this structure or be converted into it without losing context.

## End-to-End Example Flow

Below is a simple example showing how all layers work together in one realistic ransomware-like sequence.

### Example Scenario

A user has a protected folder called `Projects` with several canary files. A suspicious process begins modifying many files in rapid succession.

### 1. Canary Layer Output

```json
{
  "event_id": "evt_canary_1001",
  "event_type": "canary_triggered",
  "device_id": "desktop-abdullah",
  "timestamp_utc": "2026-10-21T14:31:58Z",
  "canary_id": "CAN-0042",
  "path": "D:/Projects/financial_report.xlsx",
  "status": "modified",
  "source_layer": "canary_manager",
  "confidence": "high",
  "quality": "observed"
}
```

### 2. Telemetry Layer Output

```json
{
  "event_id": "evt_fs_8842",
  "event_type": "file_modified",
  "device_id": "desktop-abdullah",
  "timestamp_utc": "2026-10-21T14:31:59Z",
  "path": "D:/Projects/financial_report.xlsx",
  "process_name": "unknown",
  "process_id": 4121,
  "sensor": "filesystem_monitor",
  "source_layer": "filesystem_telemetry",
  "confidence": "medium",
  "quality": "observed"
}
```

### 3. Behavioral Feature Output

```json
{
  "window_id": "win_20261021_1431",
  "device_id": "desktop-abdullah",
  "window_start_utc": "2026-10-21T14:31:45Z",
  "window_end_utc": "2026-10-21T14:32:05Z",
  "distinct_files_modified": 78,
  "rename_count": 12,
  "deletion_count": 9,
  "canary_trigger_count": 1,
  "extension_diversity": 14,
  "write_burst_count": 4,
  "telemetry_completeness": 0.94,
  "source_layer": "behavior_engine",
  "confidence": "high",
  "quality": "inferred"
}
```

### 4. Detection Engine Output

```json
{
  "rule_id": "R1",
  "rule_name": "canary_interaction",
  "severity": "high",
  "confidence": "high",
  "reason": "Registered canary modified unexpectedly and observed in a burst window.",
  "source_layer": "rule_engine",
  "quality": "observed"
}
```

```json
{
  "model_name": "kairox_lightgbm",
  "model_version": "0.1.0",
  "risk_score": 0.87,
  "confidence": "medium",
  "inference_status": "success",
  "source_layer": "ml_detector",
  "quality": "estimated"
}
```

### 5. Correlation Output

```json
{
  "incident_id": "inc_20261021_00013",
  "device_id": "desktop-abdullah",
  "correlation_id": "corr_77821",
  "risk_level": "critical",
  "confidence": "high",
  "evidence": [
    "canary_triggered",
    "multiple_file_modifications",
    "rename_activity",
    "deletion_burst",
    "rule_engine_high_severity"
  ],
  "reason": "Canary and file burst behavior aligned with ransomware-like file encryption patterns.",
  "source_layer": "risk_correlation",
  "quality": "inferred"
}
```

### 6. Response Policy Output

```json
{
  "incident_id": "inc_20261021_00013",
  "decision": "investigate_and_isolate",
  "action": "contain_process",
  "priority": "critical",
  "user_message": "Suspicious file encryption behavior detected. The system has identified a high-confidence ransomware-like pattern.",
  "source_layer": "response_policy",
  "confidence": "high",
  "quality": "inferred"
}
```

### 7. Final UI / Forensic Output

```json
{
  "incident_id": "inc_20261021_00013",
  "status": "open",
  "summary": "Suspicious file activity detected across multiple protected directories with a canary trigger.",
  "timeline": [
    "14:31:58 - canary modified",
    "14:31:59 - file write burst observed",
    "14:32:00 - file rename event observed",
    "14:32:03 - deletion burst observed",
    "14:32:17 - determined critical ransomware-like behavior"
  ],
  "recommendation": "Isolate process and preserve forensic evidence",
  "source_layer": "forensic_timeline",
  "quality": "observed"
}
```

This sequence demonstrates exactly how the system should move from low-level signal to actionable decision. Each layer adds evidence and passes a structured object to the next stage.

## Integration Rules for Easy Collaboration

To keep the project coherent across team members, all modules should follow the same design rules:

- one shared event contract
- one shared risk vocabulary
- one shared incident correlation ID
- one shared notion of confidence and status
- one shared forensic timeline structure
- no hidden data fields that cannot be explained
- every alert must include reason and evidence source
- every module is responsible for data quality, not just data generation

## Recommended Technical Stack

For a desktop-first Windows security product, the best stack is:

- UI: C# + WPF (.NET 8)
- service layer: Windows background service / privileged process
- storage: SQLite for local event and evidence tracking
- monitoring: .NET file system APIs and Windows event sources
- ML scoring: Python + LightGBM / scikit-learn / ONNX Runtime
- data visualization: LiveCharts2 or Syncfusion WPF charts
- deployment: MSIX or WiX installer

This stack provides the best mix of:

- native Windows support
- strong desktop UI quality
- local-first architecture
- service-level privilege control
- explainable security operations
- future ML integration without breaking the desktop product

## Final Positioning Statement

KAIROX is a local-first, Windows-focused endpoint defense platform that detects ransomware-like behavior using canaries, file telemetry, and AI-assisted correlation. It combines deception and behavioral evidence to identify suspicious activity early, explain the cause clearly, and trigger a controlled response before irreversible damage occurs.

## Team Structure (3 Members)

We are 3 members working together on KAIROX, and each member owns a specific layer while still following the same event contracts, quality rules, and integration flow so the system remains seamless.

### Member 1: Desktop App + Local Service + Telemetry Layer

Responsibilities:
- design the C# + WPF desktop app interface
- implement the local Windows service / privileged monitoring process
- build the file system telemetry pipeline
- ensure health checks and startup orchestration work correctly
- integrate the monitoring service with the detection pipeline

Focus:
- app experience
- Windows service lifecycle
- real-time file event monitoring
- event normalization and watcher reliability

### Member 2: Canary Engine + Detection Intelligence + Correlation Layer

Responsibilities:
- develop the canary generation, registration, and lifecycle system
- design the behavioral feature extraction logic
- implement rule-based detection and ML risk scoring
- correlate telemetry, canary events, process evidence, and behavior windows
- create risk assessment objects and confidence logic

Focus:
- decoy management
- behavior analysis
- AI-assisted detection
- evidence correlation and risk scoring

### Member 3: UX + Incident Dashboard + Response and Forensics

Responsibilities:
- build the cyber-dashboard UI for live incidents and health states
- create forensic timeline views and explainability panels
- implement response policy actions, user messaging, and incident summaries
- present clean evidence to the user in an understandable format
- manage final reporting and decision communication

Focus:
- dashboard design
- incident explanation
- containment guidance
- forensic reporting and user experience

## Final Team Working Rule

Even though the team is split across different layers, every member must follow the same engineering process:

- use the common event contract
- use the same confidence and risk vocabulary
- keep the correlation ID and incident ID consistent
- produce explainable outputs with reason and evidence source
- maintain data quality and event traceability
- make sure each layer integrates into the end-to-end detection flow without breaking the overall system

This keeps integration simple and ensures the platform behaves as one connected product instead of three isolated modules.

## Final Tagline

Detect at the decisive moment.

