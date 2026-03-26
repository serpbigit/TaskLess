# DealWise Product Truth

## Brand
- Name: DealWise
- Domain: `dealwise.online`
- Slogan: Automated CRM and communication that close deals faster.

## Product Definition

DealWise is not a general productivity system.

DealWise is:
- a communication-first CRM memory layer
- a reply assistance system
- a contact enrichment system
- an opportunity surfacing system

DealWise is not, for MVP:
- calendar-first
- reminder-first
- workflow-builder-first
- generic task management

## Core Loop

The core loop is:

1. Inbound communication arrives.
2. DealWise identifies the person if possible.
3. DealWise gathers the person context.
4. DealWise updates the CRM.
5. DealWise generates a suggested reply.
6. The approved outbound reply updates the CRM again.
7. Over time, the CRM improves future replies and opportunity suggestions.

The CRM is the memory layer. The product is the loop between communication and CRM.

## Primary Modes
- `Reply`
- `Enrich CRM`
- `Opportunities`
- `Help`

### Reply
Show pending inbound communication one by one, in priority order, until everything pending is cleared.

Rules:
- prioritize intelligently
- be exhaustive over pending inbound items
- never let a pending reply disappear

### Enrich CRM
Let the user manually add or update person context.

Examples:
- family facts
- relationship facts
- business context
- sensitivity notes
- pricing sensitivity

### Opportunities
Look across the CRM and surface the best people to act on next, with short reasoning and a suggested outreach draft.

This mode is selective and proactive, unlike Reply mode.

MVP send rule:
- show the opportunity reasoning in the Boss UI language from settings
- show the suggested outreach draft in the client's language when possible
- default to copy-paste/manual send for proactive outreach
- do not assume auto-send for opportunity outreach, especially when WhatsApp template rules may apply outside the 24-hour window

### Help
Explain the current screen, valid actions, and the global command words.

## Reply Philosophy

Reply generation should use:

1. that person's CRM record
2. recent WhatsApp history with that person
3. recent email history with that person
4. previous approved replies to that same person

Topics may exist as metadata, but they should not drive wording.

When context is weak:
- start generic
- stay safe

When context becomes stronger:
- adapt to the specific relationship
- reuse the user's proven style with that same person

## Person-Centric CRM

The CRM is person-centric, not channel-centric.

One person may have:
- multiple phone numbers
- multiple email addresses
- multiple ways the user refers to them

MVP merge policy:
- create a new contact when an identifier is unknown
- do not merge aggressively
- allow manual link
- allow manual merge

## Minimal CRM Record
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

## WhatsApp Ingestion Principle

Do not treat every line break or short WhatsApp burst as a separate meaningful event.

MVP approach:
- ingest raw messages immediately for durability
- group them by person over a quiet window
- update CRM once per grouped interaction
- generate one reply suggestion for the grouped interaction

## Boss Menu Contract

The menu system is for the Boss only.

It is not the default behavior for clients or leads who message the AI coexist number.

Boss recognition should continue using the existing Boss identity settings, especially:
- `BOSS_PHONE`
- Boss display/name settings where relevant for UX only

If an inbound message is not from the Boss:
- do not open the Boss menu
- do not return menu/help/navigation text
- continue normal communication ingest and CRM/reply processing

If an inbound message is from the Boss:
- on cold start, return the main menu
- `menu` always returns to the main menu
- `help` explains the current options
- `back` moves up one level when relevant
- `resume` returns to the paused flow when relevant
- `cancel` clears the current flow

When the Boss is inside a flow:
- free text should be treated as content only if the system explicitly asked for content
- otherwise, the system should keep the Boss inside the current flow and remind the Boss of valid options
- using `menu` should pause the current work, not lose it

## Language Contract

Boss operating language should come from settings.

That settings language controls:
- menu language
- help/system text
- CRM canonical summaries and working-memory fields
- opportunity reasoning text

Client-facing reply language should be separate:
- reply drafts should default to the client's recent message language
- if the Boss edits a draft in another language, that edited language wins for that outgoing message

This means the CRM can stay internally consistent while outgoing communication still matches the client naturally.

## Product Principle

Every interaction should improve future communication quality.

Communication enriches the CRM.
The CRM enriches communication.

That loop is the MVP.
