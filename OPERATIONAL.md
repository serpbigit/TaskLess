# TaskLess Operational Model

TaskLess runs as an event-driven communication system. Communication is not stored as loose messages but as structured events recorded in an operational ledger.

## Event and Ledger Model
- Every interaction starts with a `root_id`, representing one logical conversation request or instruction chain. All related events share this `root_id`.
- Each ledger row is one event with its own `event_id` and optional `parent_event_id` to capture causal links.
- Event types include `incoming_message`, `ai_analysis`, `ai_proposal`, `boss_instruction`, `boss_approval`, `message_sent`, `message_status_update`, and `system_log`.
- A single Boss request can be decomposed into multiple operational proposals. All proposals keep the same `root_id`; each proposal has its own `event_id`.
- Every actionable proposal carries `approval_required` and `approval_status`. No execution events occur until `approval_status` is `approved`.

## WhatsApp Webhook Normalization
- TaskLess receives WhatsApp Cloud API webhooks and normalizes them into the ledger.
- Each real-world message maps to one canonical message record. Later webhook updates (delivered, read, status changes) enrich the same record, matched by `message_id`, not duplicate rows.
- Raw webhook payloads are preserved for debugging/audit via a stored `raw_payload_reference` alongside structured fields.
- The ledger must be idempotent: duplicate webhook deliveries must be detected to prevent duplicate logical events.

## Spreadsheet Interface Strategy
Before deeper backend automation, the sheet interface must be finalized. The spreadsheet is both dashboard and ledger, so its structure must be intentional first.

Initial tabs to finalize:
- `INBOX` (canonical communication ledger)
- `CONTACTS`
- `TASKS` or `ACTIONS`
- `LOG`

`INBOX` will likely include columns such as: `timestamp`, `root_id`, `event_id`, `message_id`, `direction` (incoming/outgoing), `sender`, `receiver`, `channel`, `event_type`, `approval_required`, `approval_status`, `ai_summary`, `ai_proposal`, `execution_status`, `raw_payload_reference`.

`CONTACTS` stores known contacts and metadata (phone numbers, names).

`LOG` captures internal system operations for debugging.

The sheet-first approach defines the operational interface. Once the sheet structure is stable, backend Apps Script code can reliably target that schema.

## Contract
OPERATIONAL.md is the behavioral contract of the system. If future code or patches conflict with this document, reconsider the code rather than casually modifying the operational model.
