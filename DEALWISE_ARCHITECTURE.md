# DealWise Architecture

## Reuse First

The current codebase already contains strong reusable infrastructure:
- WhatsApp webhook ingest and dedupe
- outbound WhatsApp send
- Gmail ingest and send
- Sheets schema/bootstrap
- contact sync and lookup
- append-only enrichment storage
- approval packet UX
- time-driven orchestrator workers
- logging and smoke-test runners

The DealWise architecture should reuse those foundations and replace the old product logic around them.

## Target System Layers

### 1. Communication Ingest
- WhatsApp webhook writes raw inbound/outbound records to `INBOX`
- Email poller writes normalized email-thread records to `INBOX`
- Status updates merge into existing message records

### 2. Identity Resolution
- resolve identifiers to a person CRM record when possible
- if unknown, create a new person candidate
- if ambiguous, do not auto-merge
- support manual link and manual merge

### 3. CRM Memory Layer

Primary active tables:
- `CONTACTS` as the person CRM table
- `CONTACT_IDENTITIES` as the multi-phone/multi-email mapping table
- `CONTACT_ENRICHMENTS` as append-only durable memory
- `INBOX` as the operational communication ledger
- `SETTINGS`
- `LOG`

### 4. Grouped Interaction Builder

For WhatsApp especially:
- collect raw message rows
- group by person and quiet window
- produce one grouped interaction summary
- update the CRM once for that grouped interaction
- create or refresh one pending reply item

### 5. Reply Queue

Reply mode should be:
- prioritized
- exhaustive
- one-by-one
- approval-first for sends

Each queue item should show:
- person
- grouped inbound summary
- relevant CRM memory
- recent history
- suggested reply

## Boss Interaction Boundary

The Boss menu/router is a separate operating surface layered on top of the same WhatsApp coexist number.

It must be gated by Boss identity recognition and should reuse the existing Boss settings logic.

Rules:
- only Boss-originated messages enter menu/navigation flows
- non-Boss messages must stay in the normal communication pipeline
- the Boss can always interrupt any current Boss flow with `menu`
- interrupted Boss work should be paused and resumable
- arbitrary Boss free text should not be treated as a new intent unless the current state expects free-text input

This separation is important so client conversations are not polluted by the Boss operating model.

### 6. CRM Writeback

CRM updates should happen after:
- grouped inbound processing
- approved outbound sends
- manual enrichment

Key fields to keep fresh:
- `personal_summary`
- `business_summary`
- `current_state`
- `next_action`
- `last_contact_at`
- `last_updated`

### 7. Opportunity Engine

Opportunity mode should rank CRM records by practical action value.

MVP output:
- the person
- why now
- suggested next step
- suggested outreach draft
- preferred send path

Do not overbuild forecasting/value models in MVP.

MVP delivery rule:
- opportunity reasoning is Boss-facing and should use the Boss settings language
- the suggested outreach draft should default to the client's language when possible
- proactive opportunity outreach should default to copy-paste/manual send from the user's business WhatsApp or email
- do not make WhatsApp opportunity auto-send the default, especially when the 24-hour window may require a template

## Runtime Naming

The code still uses `TL_*.gs` runtime files.

For now:
- keep runtime naming stable
- change product logic, sheets, prompts, and menus first
- rename internal file prefixes only after the DealWise MVP works end to end
