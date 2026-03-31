# DealWise Product Truth

This file is the official product contract for DealWise.

If code, tests, or planning disagree with this file, this file wins.

Operational behavior notes live in [DEALWISE_OPERATION_MANUAL.md](/C:/dev/gas/TaskLess/DEALWISE_OPERATION_MANUAL.md).

## 1. Product Direction

DealWise is a boss-facing AI secretary for business owners.

Its job is to turn communication into:
- fast replies when a reply is genuinely needed
- better CRM memory
- clearer next steps
- better prioritization on active deals

DealWise is not a generic assistant and not a general task manager.

## 2. Main Menu

The main DealWise menu is:
1. `Messages That Need Your Reply`
2. `Update Contact Info`
3. `Next Steps To Close Deals`
4. `Help`

Anything outside these four lanes is secondary or out of scope for the current product.

## 3. Core Product Rules

- AI should suggest replies only when a response is actually expected.
- AI should not create reply work for FYI, reactions, acknowledgments, or low-signal messages.
- FYI, status pings, and low-value updates may be stored for context, but should not be surfaced in boss-facing workflows by default.
- AI should not invent commitments or deadlines the boss did not make.
- Prefer neutral forward motion over invented promises like "I will send it today".
- Reusable structured data should be stored in Google Sheets and reused, not repeatedly sent back to AI.
- If the boss already replied manually in Gmail or WhatsApp, the system should detect that and suppress the stale pending reply item.
- Conversation -> CRM enrichment -> score/state revision -> assisted reply is the core operating loop.

## 4. Main Menu Behavior

### 4.1 `Messages That Need Your Reply`

Purpose:
- clear only the messages that really need a reply
- show one item at a time
- keep the boss in a lightweight WhatsApp flow
- start with a short digest before opening one-by-one cards
- keep the default path as fast as possible after entering the lane

Default review flow:
1. show digest: total items, urgent-today count, channel split, oldest waiting
2. start the queue immediately in `Chronological` order
3. show one card at a time

Card structure:
- always show: best-known contact name, alternate display name if different, phone and/or email when available, channel, waiting-for summary, short excerpt
- prefer a short excerpt by default, not the full raw message
- for Gmail, add an original-thread link later if it is reliable and clean

Boss actions:
1. choose reply option `1-3`
2. `Edit`
3. `Archive`
4. `Later`
5. `menu/help/back/end` as needed

Edit must stay lightweight:
- one short text instruction, or
- one voice note

Ordering rule:
- default initial behavior should be conservative, transparent, and fast
- `Chronological` should be the default ordering mode
- `Most Important First` may use AI scoring by urgency, explicit dependency, relationship importance, and opportunity value, with chronology as a tie-break
- expose a future `SETTINGS` override so the boss can choose one of three default behaviors:
  - always `Chronological`
  - always `Most Important First`
  - ask each time how to review the queue

### 4.2 `Next Steps To Close Deals`

Purpose:
- show what deserves attention now
- primarily from the contact CRM snapshot
- include reply-related and non-reply-related progress items only when they truly deserve attention
- rank primarily by business impact, urgency, and leverage, not by inbox chronology

Examples:
- send quote for 20k
- follow up on pricing request
- finalize contract revision
- customer waiting on promised material

### 4.3 `Update Contact Info`

Purpose:
- let the boss update CRM memory directly
- add business or personal context without going through a reply flow

### 4.4 `Help`

Purpose:
- explain the current DealWise surface
- keep the boss inside the defined operating lanes

## 5. Sheet Blueprint

Target tabs to maintain:
1. `SETTINGS`
2. `CONTACTS`
3. `ACTIVITY`
4. `LOG`
5. `AI_Cost_Tracker`

Rules:
- do not redefine or erase `SETTINGS` destructively
- preserve useful existing tabs and operational infrastructure while migrating
- the target model is `ACTIVITY`, even though current repo infrastructure still centers on `INBOX` and `ARCHIVE`

## 6. `CONTACTS` Contract

`CONTACTS` holds snapshot CRM state, not full history.

It is the main business-state sheet for the product.

Lean direction:
- identity: `contact_id`, `display_name`, `phone`, `email`
- memory: `personal_history`, `business_history`
- current state: `deal_stage`, `deal_score`, `priority_score`, `next_step_summary`, `next_step_due`, `waiting_on`, `open_loop_status`
- activity summary: `last_signal_summary`, `last_signal_at`, `last_inbound_at`, `last_outbound_at`, `last_replied_at`, `unreplied_inbound_count`

Current design decision:
- do not add a separate `NextSteps` tab yet
- keep current next-step state on the contact row unless real task complexity forces a separate model later

## 7. `ACTIVITY` Contract

`ACTIVITY` is the append-only communication and execution ledger.

It should hold:
- inbound communication
- grouped inbound interactions
- outbound communication
- AI drafts
- approvals
- revisions
- execution history

`ACTIVITY` replaces the old conceptual role of `INBOX` as product truth.

Main role:
- support `Easy Replies`
- provide drafting context
- preserve communication and execution history

`Priority / Next Steps` and `Manual Contact Update` should depend primarily on `CONTACTS`, with `ACTIVITY` used as supporting evidence when needed.

## 8. Scoring Direction

`deal_score` is dynamic from `1` to `100`.

It reflects how much attention a contact deserves now, based on the latest meaningful business signal.

It is not static lead quality.

## 9. In Scope Now

In scope:
- CRM enrichment from conversations
- score/state revision from meaningful signals
- `Easy Replies`
- `Messages That Need Your Reply`
- `Next Steps To Close Deals`
- `Update Contact Info`
- safety and schema work directly required for these lanes

Out of scope unless explicitly approved:
- generic assistant capabilities
- generic task-manager expansion
- calendar-first product work
- product lanes that do not strengthen reply, CRM, or deal progress
