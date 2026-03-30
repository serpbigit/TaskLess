# DealWise Operation Manual

This is the living operational manual for DealWise.

Purpose:
- explain how DealWise behaves in practice
- document trust-critical operating rules
- accumulate implementation-backed operating insights as the product evolves
- serve later as the basis for boss-facing help text and submenu help

This file is not the main product-definition file.
Product scope lives in [DEALWISE_PRODUCT.md](/C:/dev/gas/TaskLess/DEALWISE_PRODUCT.md).

## 1. Core Operating Principle

DealWise should support the boss's normal work, not replace it.

The boss can continue working directly in:
- WhatsApp
- Gmail

DealWise must recognize real-world activity and adapt instead of forcing the boss through one rigid flow.

## 2. Main Menu Intent

The main operating lanes are:
1. `Messages That Need Your Reply`
2. `Update Contact Info`
3. `Next Steps To Close Deals`
4. `Help`

Operational rule:
- the boss's WhatsApp messages to the coexist line are assistant-interface traffic first, not normal contact traffic
- exact standalone boss commands must override the current flow immediately
- `menu` and boss option selections should be routed through the boss interface lane before any generic capture or orchestration logic touches them
- boss context should decay quickly: if the boss has been idle past the configured boss-context restart window, the next non-command message should default back to the main menu instead of trying to interpret stale context

Global command rules:
- `menu` always opens the main menu immediately
- `back` always steps back one menu level or one packet stage when relevant
- `end` ends the current boss chat, moves the session to standby, and the next non-empty boss message wakes back into the main menu
- `help` always opens contextual help
- command words should be matched as standalone messages only, not as substrings inside a normal sentence

## 3. Easy Replies

`Easy Replies` should surface only items that genuinely deserve a reply.

It should usually work on grouped interaction units:
- WhatsApp: grouped inbound burst from one contact over the configured quiet/max window, then expanded into a short mixed conversation window with both sides of the thread
- Email: thread-level interaction

Main reply rules:
- only suggest replies to inbound communication from someone else to the boss / business line
- do not surface the boss's own outbound messages as reply-needed items
- for WhatsApp, determine the unresolved inbound focus after the last business reply inside the current conversation window
- if the latest inbound clearly closes the loop, for example `never mind`, `found the solution`, `לא משנה`, or `הסתדרתי`, suppress the reply item
- if the business already replied and no unresolved inbound remains, suppress the stale reply item

It should not surface:
- FYI updates
- acknowledgments
- reactions
- low-value status pings
- noise that does not require attention, decision, or opportunity handling

Current boss UX target:
- show one real reply-needed item at a time
- when possible, offer `2-3` plausible reply options that move the thread forward
- allow the boss to choose one directly, or use `Edit`, `Later`, or `Archive`

Boss timeout rule:
- keep a short `fresh root-menu choice` window for numeric menu replies right after `Menu`
- keep a separate boss-context restart timeout for stale correspondence
- default value should be `15` minutes unless `SETTINGS.BOSS_CONTEXT_RESTART_MINUTES` overrides it
- standby after `end` is stronger than stale-context logic: while in standby, any next non-empty boss message should reopen the main menu

## 4. Manual Reply Suppression

If the boss replies manually outside DealWise, the system should detect that and suppress the stale pending reply item.

Examples:
- the boss replies in Gmail directly on the relevant thread
- the boss replies in WhatsApp directly to the same contact after the grouped inbound interaction

Expected behavior:
- do not surface the old reply item again
- mark it internally as resolved externally
- keep the history for context

This rule is critical for trust.

## 5. Priority / Next Steps

`Priority / Next Steps` should show only what deserves attention now.

Main rule:
- do not waste the boss's attention on low-value noise

The boss can always read raw email or WhatsApp directly if needed.
DealWise should surface only:
- questions
- blockers
- opportunities
- promised follow-ups
- next business actions

## 6. Drafting Context

When drafting a reply or proactive next-step message, DealWise should use:
- the contact's CRM snapshot from `CONTACTS`
- recent same-contact message history from `ACTIVITY`
- the boss's recent reply style patterns when useful

For WhatsApp grouped replies, the drafting context should prefer:
- the unresolved inbound focus after the last business reply
- the short mixed conversation window around that focus
- the external sender's actual identity and display name when available, not the coexist line itself

Style retrieval may help with:
- tone
- sentence length
- directness
- greeting/closing style

But it must not copy:
- unrelated facts
- invented commitments
- dates or promises not supported by the current context

Current product posture:
- use live conversation context and contact state now
- add stronger reply-personalization learning later, only after enough real examples exist per intent/relationship type

## 7. Business vs Personal

DealWise should classify interactions as:
- business
- personal
- mixed
- unknown

Reason:
- sometimes the boss may want to focus only on business
- sometimes the same contact may have both personal and business interactions

This classification should help filtering, but should not override real urgency.

## 8. Safety Rules

Current safety posture:
- never auto-approve outbound replies
- keep approval-triggered outbound sends blocked by default until the send path is explicitly reopened
- keep proactive boss digests and decision packets blocked by default unless explicitly enabled

## 9. Contact Update Rule

`Manual Contact Update` should update the contact snapshot directly.

The system may also append a supporting activity note/event, but the main durable business state should live on the contact row.

## 10. Sheet Roles

`CONTACTS`
- main business-state sheet
- snapshot CRM
- next steps, scores, waiting state, open loops

`ACTIVITY`
- append-only communication and drafting-context ledger
- grouped interactions, drafts, approvals, revisions, execution results, manual update events

## 11. Living Notes

Append new operating insights here when we discover trust-critical behavior rules during development, testing, or live use.

Current live WhatsApp test contact:
- `972559547390`
- label on device: `Mr T`

Testing note:
- when this contact sends inbound WhatsApp messages to the coexist business line `972506847373`, verify whether the runtime captures only the numeric wa_id / phone or also picks up the display label `Mr T`
- if the display label is available from webhook, `CONTACTS`, or later enrichment, use it as the sender label in boss reply cards until a better name is learned

Current reply-queue trust rule:
- if a reply card excerpt or sender label looks like it came from the coexist line instead of the real external counterparty, treat it as a bug and fix the thread-resolution logic before trusting the queue

## 12. Operator-Safe Setup And Diagnostic Helpers

Only a small set of helpers should be treated as normal operator tools.
Most `Helper_*` scripts are still development helpers and should stay out of the boss-facing manual for now.

Recommended setup helpers:
- `Onboarding_SetClientSheet`
  - sets the active DealWise spreadsheet by ID or URL
- `Onboarding_ConnectAndBootstrap`
  - connects the sheet, ensures schema, normalizes layout, and ensures core triggers/settings
- `Onboarding_RuntimeSummary`
  - shows current connected sheet and expected runtime state

Recommended sheet/schema helpers:
- `Helper_ExportSchemaJson`
  - exports current tabs, headers, and row counts for verification
- `Helper_NormalizeDealWiseLayoutAndExport`
  - normalizes top rows and headers, then exports current sheet state
- `Helper_ApplyStep2SchemaAndExport`
  - cleanly rebuilds operational tabs for Step 2, then exports the resulting schema

Recommended runtime verification helpers:
- `Helper_EmailPullAndExportSchema`
  - runs email pull, then exports resulting tab state
- `Helper_RunGateReadOnly`
  - read-only release/safety verification

Guideline:
- add a helper to this manual only if it is safe, repeatable, and useful during normal setup, diagnostics, or release verification
- keep experimental/dev-only helpers out of the manual until they stabilize
