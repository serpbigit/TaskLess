# DealWise Handoff

This file is the session handoff for the next DealWise thread.
The next session should read this file first, then update it when a phase is completed or the direction changes.

## Current Product Direction

DealWise is a boss-facing AI secretary for business owners.

Core promise:
- automate CRM and communication to close deals faster
- reduce friction in daily communication handling
- maintain a smart CRM from conversations
- surface what deserves attention now

Current value-first menu direction:
1. Easy Replies
2. Priority / Next Steps
3. Manual Contact Update
4. Help

Important product rules:
- AI should suggest replies only when a response is actually expected.
- Do not create reply work for FYI, reactions, acknowledgments, or low-signal messages.
- AI should not invent unnecessary commitments like "I will send it today" unless the boss explicitly committed.
- Prefer neutral forward-moving wording like "as soon as possible" over invented deadlines.
- Never ask AI repeatedly for information that can be extracted once and stored in Google Sheets.
- Conversation -> CRM enrichment -> score/state revision -> assisted reply is the core loop.

## Current Sheet Blueprint

Target tabs:
1. `SETTINGS`
2. `CONTACTS`
3. `ACTIVITY`
4. `LOG`

Notes:
- `ACTIVITY` is the new conceptual replacement for `INBOX`.
- `ACTIVITY` should hold inbound communication, outbound communication, AI drafts, boss edits, approvals, and execution history.
- `CONTACTS` should hold the current CRM snapshot, not the full event history.

Lean `CONTACTS` direction:
- identity: `contact_id`, `display_name`, `phone`, `email`
- memory: `personal_history`, `business_history`
- current state: `deal_stage`, `deal_score`, `priority_score`, `next_step_summary`, `next_step_due`, `waiting_on`, `open_loop_status`
- activity: `last_signal_summary`, `last_signal_at`, `last_inbound_at`, `last_outbound_at`, `last_replied_at`, `unreplied_inbound_count`

Current design decision:
- Do not add a separate `NextSteps` tab yet.
- Default to storing current next step state on the contact row.
- Revisit a separate task tab only if one contact routinely needs multiple explicit open tasks with independent done/snooze lifecycle.

## Product Understanding

### Easy Replies

Purpose:
- clear only the messages that genuinely need a reply
- show one item at a time
- keep the boss in the WhatsApp flow

Target action model:
1. Approve and send
2. Edit
3. Discard
4. Next
9. Menu

Edit must stay lightweight:
- one short text instruction, or
- one voice note

### Priority / Next Steps

Purpose:
- show the owner what is important to move forward during the day
- include reply-related and non-reply-related business progress items

Examples:
- send quote for 20k
- finalize PowerPoint for big deal
- follow up on pricing request
- client waiting on contract revision

Current lean design:
- use `CONTACTS.next_step_summary`, `next_step_due`, `waiting_on`, `deal_score`, `priority_score`, and `last_signal_*`
- use `business_history` for timestamped activity log
- avoid a new task tab unless complexity forces it

## Scoring Direction

`deal_score` is dynamic from 1 to 100.

It should revise based on the latest meaningful business signal.

Example:
- contact was at 50
- new signal: "needs quote for 20k"
- score may jump to 90

Interpretation:
- the score represents how much attention this contact deserves now
- it is not static lead quality

History fields provide evidence.
Structured fields provide reusable state.

## Repo / Implementation Direction

Near-term build order:
1. Rewrite docs as source of truth
2. Align repo naming and active paths with DealWise
3. Keep outbound approval sends blocked
4. Standardize sheet model around `SETTINGS`, `CONTACTS`, `ACTIVITY`, `LOG`
5. Build CRM enrichment + score/state revision
6. Build `Easy Replies` end-to-end
7. Rebuild safe send path
8. Build `Priority / Next Steps`
9. Build `Manual Contact Update`
10. Run Android boss/coexist sanity pass

## Testing Direction

Testing must be bundled by topic, callable from the GAS Run dropdown, with granular sub-tests behind each bundle.

Recommended test bundles:
- `TL_TestDealWiseSchema.gs`
- `TL_TestDealWiseContacts.gs`
- `TL_TestDealWiseEasyReplies.gs`
- `TL_TestDealWiseSendSafety.gs`
- `TL_TestDealWisePriority.gs`
- `TL_TestDealWiseManualUpdate.gs`
- `TL_TestDealWise_RunAll.gs`

Testing rule:
- each phase gets a topic bundle
- if it fails, drill into smaller tests
- only move to next phase once the topic bundle passes

## Safety Status

Approval-triggered outbound send paths were patched to be blockable in:
- `TL_Emergency.gs`
- `TL_Email.gs`
- `TL_Menu_Handler.gs`
- `TL_Orchestrator.gs`

Current code behavior:
- `TL_Emergency_ApprovalOutboundEnabled_()` defaults to `false` when no setting is present
- approval-based outbound send should therefore be blocked by default unless explicitly enabled

Important caveat:
- live execution of `clasp run TL_Emergency_BlockApprovalOutbound` was not available from this workspace due permission limits
- so the next session should verify whether `TL_APPROVAL_OUTBOUND_ENABLED` is absent/false or was previously set true somewhere in script props / `SETTINGS`

## Current Repo Reality

The repo is still dirty and contains old TaskLess / older DealWise logic.

Do not assume the active codebase is already aligned with the new product.

Files that heavily reflect the old interaction model:
- `TL_Menu_Handler.gs`
- `TL_Orchestrator.gs`
- `TL_AI.gs`
- `TL_BossTurn.gs`
- `TL_ActiveItem.gs`
- `TL_Email.gs`
- `TL_Webhook.gs`

These files currently contain variants of:
- menu state machines
- packet approvals
- capture flows
- resume/continue logic
- legacy send coupling

They should be treated as migration targets, not product truth.

## Immediate Next Step

Start with docs, not code.

Specifically:
1. update `DEALWISE_PRODUCT.md`
2. update `DEALWISE_ARCHITECTURE.md`
3. update `DEALWISE_ROADMAP.md`
4. update `DEALWISE_STATE.md`

The docs should become the authoritative contract before further implementation work.

## Update Protocol For Next Session

When the next session finishes a phase, update this file:
- mark completed phases
- note any product-direction changes
- note any new safety or schema changes
- keep this file short and current
