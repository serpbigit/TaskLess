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
- `INBOX` (canonical operational ledger)
- `ARCHIVE` (same schema as INBOX for historical records)
- `CONTACTS`
- `SETTINGS`
- `LOG`

`INBOX` will likely include columns such as: `timestamp`, `root_id`, `event_id`, `message_id`, `direction` (incoming/outgoing), `sender`, `receiver`, `channel`, `event_type`, `approval_required`, `approval_status`, `ai_summary`, `ai_proposal`, `execution_status`, `raw_payload_reference`.

`CONTACTS` stores known contacts and metadata (phone numbers, names).

`SETTINGS` holds configurable runtime settings (e.g., polling interval, batch sizes, AI approval defaults, feature toggles).

`LOG` captures internal system operations for debugging.

The sheet-first approach defines the operational interface. Once the sheet structure is stable, backend Apps Script code can reliably target that schema.

## Canonical Ledger Schema (INBOX / ARCHIVE)

Recommended canonical header (INBOX and ARCHIVE share the same schema):

timestamp | root_id | event_id | parent_event_id | record_id | record_version | record_class | channel | direction | phone_number_id | display_phone_number | sender | receiver | message_id | message_type | text | ai_summary | ai_proposal | approval_required | approval_status | execution_status | status_latest | status_timestamp | statuses_count | contact_id | raw_payload_ref | notes

### Field categories
Universal fields: timestamp, root_id, event_id, parent_event_id, record_id, record_version, record_class, channel, direction, sender, receiver, message_id, message_type, text, raw_payload_ref, notes

Class-specific fields:
- ai_summary, ai_proposal → AI analysis / proposal records
- approval_required, approval_status → instruction / proposal / approval lifecycle
- execution_status → execution lifecycle
- status_latest, status_timestamp, statuses_count → WhatsApp message status enrichment
- contact_id → resolved contact entity once known

### Status enrichment
- On status webhook: locate existing row by message_id.
- If found: update status_latest, status_timestamp, increment statuses_count.
- If not found: append a record_class=status row as a temporary orphan. When the related message row later appears, the system may merge the orphan status row.

### Record evolution (versions)
- `record_id` is the stable identifier for a logical record (e.g., a conversation item or instruction).
- `record_version` increments when the system appends a new row to reflect updated context (e.g., Boss decision, AI enrichment, new status). Older versions remain immutable for audit.
- Rows sharing the same `record_id` represent successive snapshots; the highest `record_version` is the current state.

### INBOX → ARCHIVE flow
- All new records insert into INBOX.
- When no longer operationally active, move to ARCHIVE.
- INBOX and ARCHIVE always share the exact same schema.
- Archiving should not transform fields.

### Rationale for a single ledger
- One schema simplifies Google Sheets querying.
- Filtering by record_class provides logical views.
- Structure maps cleanly to a future SQL table.
- Preserves a full operational timeline.

### Settings tab (config surface)
- Holds runtime configuration such as `poll_interval_minutes`, `max_batch_events`, `ai_summary_enabled`, `auto_group_by_contact`, `default_approval_required`.
- Config is read by Apps Script to control timers/triggers and processing behavior.
- Settings changes should be logged in `LOG` for auditability.

## Contract
OPERATIONAL.md is the behavioral contract of the system. If future code or patches conflict with this document, reconsider the code rather than casually modifying the operational model.
