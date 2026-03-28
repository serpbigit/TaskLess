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
1. `Easy Replies`
2. `Priority / Next Steps`
3. `Manual Contact Update`
4. `Help`

## 3. Easy Replies

`Easy Replies` should surface only items that genuinely deserve a reply.

It should usually work on grouped interaction units:
- WhatsApp: grouped inbound burst from one contact over the configured quiet/max window
- Email: thread-level interaction

It should not surface:
- FYI updates
- acknowledgments
- reactions
- low-value status pings
- noise that does not require attention, decision, or opportunity handling

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

Style retrieval may help with:
- tone
- sentence length
- directness
- greeting/closing style

But it must not copy:
- unrelated facts
- invented commitments
- dates or promises not supported by the current context

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
