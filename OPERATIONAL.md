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
- `CONTACTS` (stable identities only)
- `CONTACT_ENRICHMENTS` (append-only person-level updates: biz/personal)
- `TOPICS` (topic index to speed drafting/context)
- `SETTINGS`
- `LOG`

`INBOX` now includes the canonical ledger plus the current email-specific fields needed for unified review:
- `thread_id`
- `thread_subject`
- `latest_message_at`
- `external_url`
- `participants_json`

`CONTACTS` stores known contacts and metadata (phone numbers, names).

`SETTINGS` holds configurable runtime settings (e.g., polling interval, batch sizes, AI approval defaults, feature toggles, and session-shaping controls).

`LOG` captures internal system operations for debugging.

The sheet-first approach defines the operational interface. Once the sheet structure is stable, backend Apps Script code can reliably target that schema.

## Canonical Ledger Schema (INBOX / ARCHIVE)

Recommended canonical header (INBOX and ARCHIVE share the same schema):

timestamp | root_id | event_id | parent_event_id | record_id | record_version | record_class | channel | direction | phone_number_id | display_phone_number | sender | receiver | message_id | message_type | text | ai_summary | ai_proposal | approval_required | approval_status | execution_status | status_latest | status_timestamp | statuses_count | contact_id | raw_payload_ref | notes | task_due | task_status | task_priority | topic_id | topic_tagged_at | biz_stage | biz_stage_ts | payment_status | delivery_due | media_id | media_mime_type | media_sha256 | media_caption | media_filename | media_is_voice | priority_level | importance_level | urgency_flag | needs_owner_now | suggested_action | thread_id | thread_subject | latest_message_at | external_url | participants_json

### Field categories
Universal fields: timestamp, root_id, event_id, parent_event_id, record_id, record_version, record_class, channel, direction, sender, receiver, message_id, message_type, text, raw_payload_ref, notes

Class-specific fields:
- ai_summary, ai_proposal → AI analysis / proposal records
- approval_required, approval_status → instruction / proposal / approval lifecycle
- execution_status → execution lifecycle
- status_latest, status_timestamp, statuses_count → WhatsApp message status enrichment
- contact_id → resolved contact entity once known
- task_due, task_status, task_priority → instruction/task/reminder lifecycle
- topic_id, topic_tagged_at → conversation/topic clustering
- biz_stage, biz_stage_ts → pipeline stage tracking (initial_contact, meeting_scheduled, quote_sent, follow_up, closed_won, closed_lost, delivery_due, invoiced, paid)
- payment_status, delivery_due → commerce lifecycle
- media_* → media-specific metadata for WhatsApp records
- priority_level, importance_level, urgency_flag, needs_owner_now, suggested_action → lightweight first-pass preparation written onto every eligible incoming record
- thread_id, thread_subject, latest_message_at, external_url, participants_json → unified email-thread handling inside `INBOX`

### Status enrichment
- On status webhook: locate existing row by message_id.
- If found: update status_latest, status_timestamp, increment statuses_count.
- If not found: append a record_class=status row as a temporary orphan. When the related message row later appears, the system may merge the orphan status row.

### Record evolution (versions)
- `record_id` is the stable identifier for a logical record (e.g., a conversation item or instruction).
- `record_version` increments when the system appends a new row to reflect updated context (e.g., Boss decision, AI enrichment, new status). Older versions remain immutable for audit.
- Rows sharing the same `record_id` represent successive snapshots; the highest `record_version` is the current state.

### Proposals vs instructions vs tasks
- `record_class=proposal` captures drafts/questions for the Boss (e.g., “Can I archive this?” or reply drafts).
- `record_class=instruction` captures Boss-issued directives; when they imply follow-up, populate task_due/task_status/task_priority.
- Tasks/reminders live in the same ledger using task_* fields; they stay in INBOX while active and move to ARCHIVE when resolved.

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
- Holds runtime configuration such as `poll_interval_minutes`, `max_batch_events`, `ai_summary_enabled`, `auto_group_by_contact`, `default_approval_required`, `AI_DEFAULT_LANGUAGE`, `WORK_HOURS_START/END`.
- Config is read by Apps Script to control timers/triggers and processing behavior.
- Settings changes should be logged in `LOG` for auditability.
- `AI_DEFAULT_LANGUAGE` should be interpreted as Boss-facing UI language, not necessarily reply language.
- `REPLY_LANGUAGE_POLICY` should control recipient-facing draft language:
  - `match_incoming`
  - `boss_language`
- Secretary-control settings should also live here, including `URGENT_PUSH_ENABLED`, `BOSS_INTERRUPT_LEVEL`, `BOSS_UPDATE_INTERVAL_MINUTES`, `BOSS_DECISION_REQUEST_INTERVAL_MINUTES`, `BOSS_DECISION_BATCH_SIZE`, `BOSS_MAX_ITEMS_PER_DIGEST`, `BOSS_URGENT_ITEMS_ALWAYS_FIRST`, `BOSS_INCLUDE_FYI_IN_DIGEST`, and `DO_NOT_DISTURB_ENABLED`.
- These settings should primarily shape review sessions, summaries, and decision workload. Legacy interruption-related settings may remain for compatibility, but proactive interruption is not the core operating model.

## Two-layer preparation model
- Every incoming record should first receive a lightweight local preparation pass:
  - summary
  - urgency/importance/action hints
  - record-level metadata
  - later: lightweight topic tagging
- Deeper context assembly should happen only when the system is preparing a real draft, recommendation, or Boss review item.
- Deeper context sources currently include:
  - last 5 `CONTACT_ENRICHMENTS`
  - last 5 local emails
  - last 5 local WhatsApps
  - Gmail history fallback when local email history is thin

This split exists to keep ingestion cheap and always-on while reserving heavier “forest view” reasoning for intentional review/execution moments.

## CONTACTS
- One row per person/entity with stable identifiers (contact_id, name, alias, org, website, phones, email, role, tags, last_enriched_at, optional last_note cache).
- Keep CONTACTS lean; do not store long-form history here.

## CONTACT_ENRICHMENTS
- Append-only person-level updates (biz and personal). Suggested columns: timestamp, contact_id, contact_name, note_type (biz|personal), note_text, source, linked_record_id, topic_id (optional).
- Use this to capture facts like “went overseas” or “received quote” without overwriting CONTACTS.

## TOPICS
- Topic index to speed drafting/context. Suggested columns: topic_id, contact_id, contact_name, topic_summary, last_used_at, usage_count, recent_examples_json, notes.
- ledger rows carry topic_id; TOPICS is a convenience index, not the source of truth.
- Planned direction:
  - lightweight topic match or candidate at ingestion
  - heavier topic-based similar-case retrieval only in draft/review/session context

## Contract
OPERATIONAL.md is the behavioral contract of the system. If future code or patches conflict with this document, reconsider the code rather than casually modifying the operational model.

## Boss Menu Contract
- The Boss menu is a first-class operating surface, not a toy helper.
- Menu-trigger phrases such as `תפריט`, `menu`, `עזרה`, and `help` should open the navigable menu/help experience.
- Creation flows from the menu (reminder, task, log, schedule, vertical workflows) should not silently execute.
- They should route through the same secretary contract as free-form captures:
  - capture Boss input
  - AI extracts structured intent and proposal JSON
  - Boss confirms through approval card / packet
  - only then execute or finalize
- Retrieval flows (for example `מה על הצלחת שלי עכשיו`, `מה צריך תשומת לב`, `ממתין לאישורים`) may respond directly from the ledger without an approval card.
- For approval/draft flows in WhatsApp, the preferred UX is:
  - short digest first
  - then one-by-one review cards
  - exact proposed action/draft shown before approval
  - action labels that reflect the real operation (`שלח`, `סגור`, `שמור`, etc.) instead of a vague generic confirmation label
