# DealWise State

This file is the current repo snapshot.

It is not product truth.
Product truth lives in [DEALWISE_PRODUCT.md](/C:/dev/gas/TaskLess/DEALWISE_PRODUCT.md).

## 1. Repo Status

Current branch state is dirty.
There are many existing changes outside this doc pass.

Do not assume the codebase already matches the current DealWise product.

## 2. Current Product Alignment

What is already aligned:
- the boss-facing root menu in code is moving toward `Reply`, `Enrich CRM`, `Opportunities`, `Help`
- approval-based outbound sends are blocked by default in local code
- proactive boss digests and decision packets are now blocked by default in local code
- the boss command fast lane for `menu`, `help`, `back`, and `end` is implemented and instrumented with timing benchmarks
- the menu-speed tracer now separates backend pre-send time, Meta roundtrip time, time to Meta accept, and post-send tail

What is not yet aligned:
- the repo still uses `INBOX` and `ARCHIVE` as the active operational ledger
- `ACTIVITY` is the target product contract, not the current implemented tab
- `CONTACTS` still carries older schema baggage and needs a cleaner snapshot-oriented model
- older TaskLess branches and secretary-loop behavior still exist in the codebase
- the reply lane digest-first flow and queue-order choice are documented, but not yet implemented in code
- the future `SETTINGS` override for default reply-queue ordering is documented, but not yet implemented

## 3. Sheet Reality

Current schema code still creates:
- `INBOX`
- `ARCHIVE`
- `CONTACTS`
- `SETTINGS`
- `LOG`
- `AI_Cost_Tracker`

Target product blueprint is:
- `SETTINGS`
- `CONTACTS`
- `ACTIVITY`
- `LOG`
- `AI_Cost_Tracker`

Migration rule:
- preserve existing useful infrastructure
- do not destructively rewrite `SETTINGS`
- do not treat current tab names as permanent product truth

## 4. Safety Reality

### Approval-triggered outbound sends

Local code status:
- blocked by default through [TL_Emergency.gs](/C:/dev/gas/TaskLess/TL_Emergency.gs)
- approval in the menu currently approves drafts without sending them automatically

### Proactive boss updates

Local code status:
- screenshot text like `DealWise תקציר` and `מצב=urgent_only; פריטים=...` comes from boss-policy digest/decision packet code in [TL_Orchestrator.gs](/C:/dev/gas/TaskLess/TL_Orchestrator.gs)
- this path is now blocked by default in code unless explicitly enabled

Live caveat:
- this workspace could not verify the deployed Apps Script runtime state directly because live function execution permission was unavailable
- treat local code as corrected, but treat live deployment as still needing an explicit check after push/deploy

## 5. File Roles

- [DEALWISE_PRODUCT.md](/C:/dev/gas/TaskLess/DEALWISE_PRODUCT.md): official product truth
- [DEALWISE_ARCHITECTURE.md](/C:/dev/gas/TaskLess/DEALWISE_ARCHITECTURE.md): implementation constraints
- [DEALWISE_ROADMAP.md](/C:/dev/gas/TaskLess/DEALWISE_ROADMAP.md): concise shared step tracker
- [DEALWISE_OPERATION_MANUAL.md](/C:/dev/gas/TaskLess/DEALWISE_OPERATION_MANUAL.md): living operating manual and trust-critical behavior notes
- [DEALWISE_STATE.md](/C:/dev/gas/TaskLess/DEALWISE_STATE.md): current repo reality
- [HANDOFF.md](/C:/dev/gas/TaskLess/HANDOFF.md): session handoff only, update only when handing off
