# DealWise MVP Roadmap

## Goal

Build a communication-first, person-centric CRM system that:
- improves replies
- keeps CRM memory current
- surfaces opportunities
- reduces missed follow-ups

## Phase 1. Documentation and Product Surface
- keep only DealWise docs active in the repo
- define the Boss-only menu contract and global command words
- replace TaskLess language in repo-facing product docs
- simplify the menu to `Reply`, `Enrich CRM`, `Opportunities`, `Help`

Done when:
- the active docs no longer describe TaskLess as the product
- the menu contract clearly states that it applies only to the Boss
- the user-facing direction is clearly DealWise

## Phase 2. Contact Model Upgrade
- redesign `CONTACTS` into the DealWise person schema
- keep phones, emails, and identity terms directly on the `CONTACTS` row
- keep manual and automatic enrichment directly on the `CONTACTS` row
- support safe lookup and manual resolution without adding extra CRM tabs

Done when:
- one person can own multiple phones and emails
- unknown identifiers create a new person safely
- ambiguous identifiers do not auto-merge

## Phase 3. WhatsApp Grouped Interaction Flow
- keep raw webhook ingest unchanged for durability
- stop treating every message fragment as a standalone decision item
- add orchestrator logic that groups inbound WhatsApp bursts by person and quiet window
- create one grouped interaction summary and one reply candidate per grouped burst
- initial timing defaults: 5-minute sweep, 8-minute quiet window, 20-minute max burst
- email should keep thread-based polling on a similar cadence, offset slightly from WhatsApp runs

Done when:
- multi-line bursts become one actionable pending reply item
- CRM updates happen once per grouped interaction

## Phase 4. CRM Update Engine
- update CRM from grouped inbound interactions
- update CRM after approved outbound replies
- update CRM from manual enrichment
- maintain `current_state` and `next_action` as compact working memory

Done when:
- every meaningful interaction leaves the person record better than before

## Phase 5. Reply Context Rework
- make same-person history the first retrieval source
- use CRM summaries, recent WhatsApps, recent emails, and same-person approved replies
- remove topics from the active MVP schema path
- keep generic safe drafts when context is weak

Done when:
- suggestions feel relationship-aware for known contacts
- suggestions stay safe for low-context contacts

## Phase 6. Reply Queue UX
- reuse the one-by-one approval packet mechanics
- make reply mode exhaustive over pending inbound grouped items
- keep smart ordering but guarantee eventual completion
- include `Approve & Send`, `Edit`, `Later`, and identity-resolution actions

Done when:
- pressing next repeatedly can clear the whole pending reply queue

## Phase 7. Manual Enrichment UX
- keep manual enrichment as a first-class flow
- improve lookup to support names, nicknames, relationship labels, phone fragments, and email
- preview the CRM writeback before saving

Done when:
- the user can reliably add real-world memory to the correct person record

## Phase 8. Opportunities Mode
- rank contacts by practical action value
- show short reasoning
- suggest outreach copy
- default proactive outreach to copy/send manually, not auto-send
- keep the mode selective, not exhaustive

Done when:
- the user can ask what to focus on and receive a short useful shortlist
- each opportunity includes copy-ready text and a clear manual-send path for the user's business channel

## Test Strategy
- keep deterministic Apps Script test runners for each major flow
- add tests for identity resolution, grouped interaction assembly, CRM writeback, reply queue ordering, and opportunity ranking
- prefer narrow smoke tests over broad manual-only validation

## Current Build Order
1. Doc cleanup and product reset
2. Menu simplification
3. CRM schema redesign
4. Grouped WhatsApp interaction worker
5. CRM writeback engine
6. Reply queue
7. Manual enrichment hardening
8. Opportunities mode
