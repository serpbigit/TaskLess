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
- show one real reply-needed item at a time
- reuse contact state and recent activity
- allow approve, edit, discard, next
- never draft replies for FYI or low-signal items

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
- combine CRM state, open loops, and recent signals into a useful owner view

### Step 7 — Manual Contact Update

Status: `pending`

Scope:
- let the boss update contact memory directly
- keep manual updates lightweight and immediately reusable by the rest of the system

## Working Rule

If a proposed change does not clearly advance one of the active steps above, it is drift until explicitly approved.
