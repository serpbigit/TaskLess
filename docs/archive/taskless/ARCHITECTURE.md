# TaskLess System Architecture

TaskLess is a layered event processing system that connects WhatsApp Cloud API messaging with automation built on Google Sheets and Google Apps Script.

## System Layers
1. **Communication layer:** WhatsApp Business runs in Coexistence mode on the user’s business phone number. Messages stay in sync between the mobile device and the WhatsApp Cloud API, which emits webhooks for new messages and status changes.
2. **Webhook ingestion and routing layer:** Webhook events from the Cloud API are received and routed to the correct client environment. Early on, a single Apps Script endpoint handles routing; later, an edge service (e.g., Cloudflare Workers or similar) may forward events to the right client endpoint.
3. **Client automation environment:** Each client has a Google Sheet (operational ledger and dashboard) and a bound Google Apps Script deployment (execution engine). Incoming webhooks are normalized and recorded; the engine prepares lightweight metadata continuously and generates deeper proposals or structured action plans during user-triggered sessions.
4. **Deterministic orchestration layer:** Inside the client Apps Script project, a thin orchestrator module should coordinate eligible work instead of embedding all flow decisions inline inside webhook handlers. This module is the planned `TL_Orchestrator.gs` layer.

## Planned Orchestrator
The next structural step is an explicit Apps Script orchestrator, currently planned as `TL_Orchestrator.gs`.

Its job is not to replace worker logic or AI reasoning. Its job is to act as a deterministic manager that:
- inspects ledger state
- decides which work is eligible next
- dispatches specialized workers
- records transitions and prevents duplicate processing

Expected orchestration responsibilities:
- pending late-status repair
- pending lightweight AI preparation or transcription follow-up
- session assembly for cleanup/planning/review requests
- quiet-window thread synthesis where it improves later session quality
- Boss approval wait state
- approved outbound send
- retry/defer handling for recoverable failures

This keeps webhook ingestion narrow and makes the rest of the system easier to reason about, test, and extend.

## Execution Model (v1)
TaskLess v1 should use three execution shapes:
- direct webhook execution for immediate ingest and normalization
- orchestrator sweep execution for bounded background preparation and session assembly
- separate worker entrypoints for specialist processing that may run manually, from tests, or from the orchestrator

### Direct webhook execution
These functions should stay in the immediate webhook path because they are part of capture, verification, and durable write:
- `doGet(e)` in `TL_Webhook.gs` for webhook verification
- `doPost(e)` in `TL_Webhook.gs` for raw event receipt
- payload parsing and canonical normalization
- idempotent write/update of communication rows
- lightweight status merge when the target row is already available
- logging of unmatched/deferred work so it can be picked up later

The webhook path should not grow into the full workflow engine.

### Orchestrator batch execution
`TL_Orchestrator.gs` should run from a time-driven trigger and decide which bounded work is eligible next.

The orchestrator should:
- scan for pending late-status repair
- scan for rows eligible for lightweight AI follow-up after ingest
- scan for threads/items that should be prepared for later cleanup/planning sessions
- scan for rows waiting on approval or newly approved for outbound execution
- dispatch only small bounded batches per sweep
- log decisions and avoid duplicate processing

The orchestrator should be deterministic and procedural, not AI-driven.

### Separate worker entrypoints
Specialist work should live in dedicated worker functions that can be called by the orchestrator, by manual testing, or by focused maintenance runs.

Initial worker entrypoints should include:
- `TL_Repair_Run()` for late-status repair and related ledger cleanup
- `TL_AI_RunPending()` for lightweight preparation/transcription follow-up on eligible rows
- `TL_Synthesis_Run()` for thread/session synthesis work
- `TL_Approval_Run()` for approval-state transitions and approval-card preparation
- `TL_Send_RunApproved()` for Boss-approved outbound sends and receipts

Existing specialized functions such as `TL_AI_TriageInboxRow_()` and `TL_AI_TranscribeInboxRow_()` remain worker internals and are invoked by higher-level entrypoints rather than directly from the roadmap layer.

## Trigger Strategy (v1)
- Webhook trigger: immediate via WhatsApp `doPost(e)`
- Orchestrator trigger: recurring time-driven sweep, starting at every 5 minutes
- Manual debug/test entrypoints: explicit functions callable from Apps Script or harness code

This model is preferred over creating one installable trigger per task. The orchestrator should wake up periodically, inspect ledger state, and dispatch bounded preparation work instead of relying on large numbers of task-specific triggers or proactive attention logic.

## Outbound Messaging
When the Boss approves a proposal, the automation engine sends messages via the WhatsApp Cloud API using the client’s `phone_number_id`. A routing database will map each `phone_number_id` to the correct client endpoint as the system scales to multiple clients.

## Role of Google Sheets
Google Sheets is both ledger and human-readable control interface. Tabs such as `INBOX`, `CONTACTS`, and `LOG` hold the structured operational data that the system reads and writes.

## Operational Ledger
TaskLess uses a unified operational ledger stored in Google Sheets.

Primary tabs:
- INBOX — active operational records
- ARCHIVE — historical records (same schema as INBOX)
- CONTACTS — normalized contact entities
- CONTACT_ENRICHMENTS — append-only person-level updates (biz/personal)
- TOPICS — topic index for drafting/context
- SETTINGS — runtime configuration for timers/processing
- LOG — technical/runtime logs

All operational events share the canonical schema defined in OPERATIONAL.md and are differentiated by record_class.

## Change Discipline
ARCHITECTURE.md documents the structural design of the platform and should be updated only when infrastructure components change significantly.
