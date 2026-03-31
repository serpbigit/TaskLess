# DealWise Roadmap

This is the single concise tracker we should keep updating as we move forward.

Product truth stays in [DEALWISE_PRODUCT.md](/C:/dev/gas/TaskLess/DEALWISE_PRODUCT.md).
Repo snapshot stays in [DEALWISE_STATE.md](/C:/dev/gas/TaskLess/DEALWISE_STATE.md).
Operational behavior notes stay in [DEALWISE_OPERATION_MANUAL.md](/C:/dev/gas/TaskLess/DEALWISE_OPERATION_MANUAL.md).

## Active Steps

### Step 0 — Safety Gates

Status: `done in code`, live deploy still needs explicit re-check.

Scope:
- keep approval-based outbound sends blocked by default
- keep proactive boss digests and decision packets blocked by default
- stop unrequested WhatsApp updates while product behavior is still being stabilized

### Step 1 — Docs As Contract

Status: `done`

Scope:
- lock product direction
- lock architecture constraints
- keep roadmap concise
- record current repo reality separately from product truth

### Step 2 — Sheet Model Alignment

Status: `next`

Scope:
- standardize the target model around `SETTINGS`, `CONTACTS`, `ACTIVITY`, `LOG`, `AI_Cost_Tracker`
- treat `CONTACTS` as the main business-state sheet
- treat `ACTIVITY` as the append-only communication and drafting-context ledger
- preserve useful legacy support tabs while removing dependence on `INBOX`
- keep `SETTINGS`, `LOG`, and `AI_Cost_Tracker` stable during this phase
- make grouped WhatsApp bursts and email threads the main interaction units
- keep WhatsApp conversation-window thresholds configurable in code for now, and expose them in `SETTINGS` later once behavior is stable
- keep FYI and low-value status pings in history, but do not surface them in boss-facing flows
- detect manual external replies and suppress stale pending reply items automatically

### Step 3 — CRM Enrichment And State Revision

Status: `pending`

Scope:
- extract reusable facts from communication once
- write structured CRM state back into Sheets
- update `deal_score`, `priority_score`, `waiting_on`, and next-step fields from meaningful business signals

### Step 4 — Easy Replies

Status: `pending`

Scope:
- rename the lane in product and boss UX to `Messages That Need Your Reply`
- start with a short digest before opening one-by-one cards
- show one real reply-needed item at a time
- default the queue to `Chronological` so the boss gets the first card immediately after the digest
- reuse contact state and recent activity
- show card identity clearly: contact name, alternate display name when different, phone, email, channel
- show a one-line `Waiting for` summary and a short excerpt
- offer `1-3` concrete reply choices when possible
- allow `Edit`, `Archive`, and `Later`
- never draft replies for FYI or low-signal items
- keep `Messages That Need Your Reply` conservative and trust-oriented: chronology-first mode must always be available
- add a later `SETTINGS` override for default reply-queue ordering: always `Chronological`, always `Most Important First`, or ask each time
- add passive reply-personalization learning later via a `Personal Style Directory` built from sent-message prompt/response pairs, intent and recipient labeling, weighted phrase retrieval, and a minimum-sample confidence threshold before style-based drafting is allowed

### Step 5 — Safe Send Path Rebuild

Status: `pending`

Scope:
- rebuild outbound execution only after reply quality and safety are stable
- separate approval from sending
- add explicit enable gates and verification before re-opening real sends

### Step 6 — Priority / Next Steps

Status: `pending`

Scope:
- surface the best business-progress items, not only inbox replies
- keep this lane aggressively ranked by impact, urgency, and leverage
- combine CRM state, open loops, and recent signals into a useful owner view

### Step 7 — Manual Contact Update

Status: `pending`

Scope:
- let the boss update contact memory directly
- keep manual updates lightweight and immediately reusable by the rest of the system

## Future Moat Direction

Parked for later, not for the current implementation pass:
- passive context refresh: keep re-evaluating unresolved inbound items when later inbound messages from the same sender add new context, change urgency, cancel the ask, or close the loop
- passive manual-reply learning: learn from real boss/business replies even when they were not sent through DealWise
- phrase-pattern mining: detect repeated boss wording across different contacts, then classify reusable language patterns such as excitement, agreement, reassurance, delay, scheduling, and objection-handling

Sheet-design implication to keep in mind now:
- when changing `ACTIVITY` or related sheets, preserve enough structure for future learning instead of storing only final AI interpretations
- important future-safe fields include: thread/group id, contact id, sender role, receiver role, direction, raw text, normalized text, channel, timestamp, message id, reply linkage when available, grouped interaction id, manual-reply flags, DealWise-reply flags, external-resolution flags, and open-loop/reply-needed state markers

Working rule:
- do not pivot to implementing this moat now
- but do avoid sheet/header decisions that would make this future learning layer harder to build later

## Working Rule

If a proposed change does not clearly advance one of the active steps above, it is drift until explicitly approved.
