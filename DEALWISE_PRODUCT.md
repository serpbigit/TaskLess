# DealWise Product Truth

This is the canonical product document for DealWise.

If implementation, testing, or planning contradict this file, this file wins.

## 1. What DealWise Is

DealWise is an automated CRM and messaging system that helps a business get clients closer to a finalized deal.

It does that by combining:
- inbound communication understanding
- CRM enrichment
- AI-prepared reply drafting
- opportunity surfacing

DealWise is not a general productivity assistant.

## 2. Value Proposition

People send the business WhatsApp messages and emails.

DealWise turns that communication into:
- better CRM memory
- faster high-quality replies
- clearer next steps
- proactive opportunities to move deals forward

The main promise is:

The boss should not need to reconstruct context from scratch before replying or deciding what to do next.

## 3. Core System Objects

### 3.1 Contact CRM

`CONTACTS` is the CRM.

It stores the durable person/business memory, including:
- identity terms
- phones
- emails
- personal context
- business context
- current state
- next action
- last contact timing

This CRM can be enriched:
- automatically from inbound communication
- manually by the boss

### 3.2 Communication Sessions

Inbound communication should be treated as meaningful business sessions, not raw fragments.

For MVP:
- email is treated as a thread/session
- WhatsApp is treated as a grouped burst/session over a quiet window

Each session should get:
- a business-relevant summary
- a suggested next reply or action
- CRM enrichment where appropriate

## 3.3 How DealWise Works

The operational loop is:

1. inbound email or WhatsApp communication arrives
2. the communication is grouped into a meaningful session
3. the system identifies the contact if possible, or creates one safely
4. the session is summarized in business terms
5. the contact CRM is enriched from that session
6. a reply draft is prepared for the boss when a reply is needed
7. approved outbound communication improves the CRM again
8. the CRM is later used to surface proactive opportunities

This means the CRM and communication continuously improve each other.

## 4. The 3 Core Product Pillars

### 4.1 Reply

The boss can open Reply mode and go through pending inbound communication one by one.

For each inbound session, DealWise should:
- identify or create the contact
- use the contact CRM
- use recent same-person communication context
- suggest the best reply draft

The boss should be able to:
- approve
- edit
- archive
- postpone

Primary value:
- clear large inbound queues quickly with good reply quality

### 4.2 Enrich CRM

DealWise should enrich the CRM from inbound sessions automatically.

Separately, the boss should be able to manually enrich a contact from the menu by:
- finding the contact naturally
- adding the new detail
- saving it back into the CRM

Primary value:
- CRM becomes smarter over time without depending only on manual updates

### 4.3 Opportunities

DealWise should scan the CRM and surface the best contacts to act on next.

It should:
- score and prioritize contacts
- explain why now
- suggest the next outreach
- prepare draft copy for proactive communication

Primary value:
- helps the business initiate the next move instead of only reacting to inbound messages

## 5. Boss Menu Contract

The Boss is identified by the configured boss phone number.

The main boss operating surface is intentionally small:
- `Reply`
- `Enrich CRM`
- `Opportunities`
- `Help`

### 5.1 Reply

Reply mode is for pending inbound communication sessions.

It should:
- present one pending session at a time
- use the contact CRM plus recent same-person context
- suggest the best reply draft
- let the boss approve, edit, archive, or postpone

This is the fastest path for clearing inbound communication.

### 5.2 Enrich CRM

Enrich CRM is for manual CRM updates initiated by the boss.

It should:
- find the intended contact naturally
- let the boss add the relevant memory or business update
- save it directly into the CRM

This is not the same as reply handling. It is explicit CRM maintenance by the boss.

### 5.3 Opportunities

Opportunities is for proactive next-step work.

It should:
- scan the CRM
- score who is worth acting on now
- explain why
- suggest outreach copy

This is not an inbox-clearing mode. It is a proactive deal-advancement mode.

### 5.4 Help

Help explains the current surface and valid actions.

It is support for the three pillars, not a separate product lane.

## 6. Canonical Sheet Schema

The active DealWise MVP sheet model is:
- `INBOX`
- `ARCHIVE`
- `CONTACTS`
- `SETTINGS`
- `LOG`
- `AI_Cost_Tracker`

No other product schema should be treated as core DealWise truth unless this file is updated first.

### 6.1 `CONTACTS` = CRM

`CONTACTS` is the CRM and should stay the center of person/business memory.

Current schema includes:
- `contact_id`
- `name`
- `alias`
- `org`
- `website`
- `phone1`
- `phone2`
- `email`
- `role`
- `tags`
- `last_note`
- `last_enriched_at`
- `source_system`
- `source_id`
- `phone1_normalized`
- `phone2_normalized`
- `email_normalized`
- `labels`
- `sync_status`
- `last_synced_at`
- `notes_internal`
- `crm_id`
- `display_name`
- `identity_terms`
- `phones`
- `emails`
- `personal_summary`
- `business_summary`
- `current_state`
- `next_action`
- `last_contact_at`
- `last_updated`

The DealWise-critical CRM fields are:
- `display_name`
- `identity_terms`
- `phones`
- `emails`
- `personal_summary`
- `business_summary`
- `current_state`
- `next_action`
- `last_contact_at`
- `last_updated`

### 6.2 `INBOX` = communication ledger

`INBOX` is the operational ledger for inbound and outbound communication.

Current schema includes fields such as:
- identity and versioning:
  - `timestamp`
  - `root_id`
  - `event_id`
  - `parent_event_id`
  - `record_id`
  - `record_version`
- communication shape:
  - `record_class`
  - `channel`
  - `direction`
  - `sender`
  - `receiver`
  - `message_id`
  - `message_type`
  - `text`
- AI preparation:
  - `ai_summary`
  - `ai_proposal`
  - `suggested_action`
  - `priority_level`
  - `importance_level`
  - `urgency_flag`
  - `needs_owner_now`
- approval/execution:
  - `approval_required`
  - `approval_status`
  - `execution_status`
  - `task_status`
- CRM linkage:
  - `contact_id`
- session/context helpers:
  - `wa_group_id`
  - `notes`
  - `thread_id`
  - `thread_subject`
  - `latest_message_at`
- media/external refs:
  - `raw_payload_ref`
  - `external_url`
  - media fields

For DealWise MVP, `INBOX` exists to support:
- inbound grouping
- reply preparation
- outbound approval/send state
- CRM enrichment from communication

### 6.3 `ARCHIVE`

`ARCHIVE` mirrors the `INBOX` schema for archived records.

### 6.4 `SETTINGS`

`SETTINGS` stores runtime configuration, including boss identity and communication settings.

### 6.5 `LOG`

`LOG` stores runtime logging and diagnostics.

### 6.6 `AI_Cost_Tracker`

`AI_Cost_Tracker` stores AI usage/cost tracking.

## 7. In Scope Now

In scope if it directly strengthens one of these:
- Reply
- Enrich CRM
- Opportunities

Examples of in-scope work:
- better inbound grouping
- better contact resolution
- better CRM writeback
- better reply drafting from CRM + same-person history
- better opportunity scoring and opportunity draft preparation
- better boss menu flows for those 3 pillars

## 8. Out of Scope Unless Explicitly Approved

These are not core DealWise MVP work unless explicitly justified:
- generic task manager behavior
- generic reminder system behavior
- calendar-first product flows
- broad personal productivity tooling
- generic “assistant capabilities” that do not strengthen Reply, Enrich CRM, or Opportunities
- workflow mechanics added only because they are technically possible

Supporting mechanics are acceptable only if they directly help the 3 pillars.

## 9. Product Fit Check

Before any meaningful implementation, answer these 4 questions:

1. Which pillar does this support:
   - Reply
   - Enrich CRM
   - Opportunities
2. What user value does it unlock?
3. Why is it needed now?
4. What is the smallest version that serves DealWise without expanding into a generic assistant?

If these answers are weak, the work should not proceed.

## 10. Current Build Priority

Current priority order:

1. Reply flow quality and reliability
2. CRM enrichment quality and durability
3. Opportunities mode quality and usefulness
4. Supporting infrastructure only when it directly serves the three pillars

## 11. Change-Control Rule

To prevent drift:

1. Product definition lives here, not across multiple docs.
2. If behavior changes, this file must be updated first or together with the code.
3. Supporting docs must not redefine the product.
4. If a proposed task cannot be justified from this file, it should not be built.
5. If implementation starts to feel “generically useful” but not clearly DealWise, stop and re-check this file.

## 12. Acceptance Standard

We are aligned only if the implemented system helps the boss do these 3 things well:

1. reply quickly to inbound communication with strong drafts
2. keep the CRM getting better automatically and manually
3. find the best proactive opportunities to move deals forward

If work is not clearly improving one of those, it is probably drift.
