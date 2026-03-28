# DealWise Architecture

This file explains how the repo should implement the product defined in [DEALWISE_PRODUCT.md](/C:/dev/gas/TaskLess/DEALWISE_PRODUCT.md).

It does not redefine product scope.

Operational behavior details live in [DEALWISE_OPERATION_MANUAL.md](/C:/dev/gas/TaskLess/DEALWISE_OPERATION_MANUAL.md).

## 1. Current Repo Reality

The repo still contains older TaskLess and older DealWise infrastructure.

Important migration targets:
- [TL_Menu_Handler.gs](/C:/dev/gas/TaskLess/TL_Menu_Handler.gs)
- [TL_Orchestrator.gs](/C:/dev/gas/TaskLess/TL_Orchestrator.gs)
- [TL_AI.gs](/C:/dev/gas/TaskLess/TL_AI.gs)
- [TL_BossTurn.gs](/C:/dev/gas/TaskLess/TL_BossTurn.gs)
- [TL_ActiveItem.gs](/C:/dev/gas/TaskLess/TL_ActiveItem.gs)
- [TL_Email.gs](/C:/dev/gas/TaskLess/TL_Email.gs)
- [TL_Webhook.gs](/C:/dev/gas/TaskLess/TL_Webhook.gs)

Treat these as implementation substrate, not product truth.

## 2. Target Operating Model

The intended loop is:
1. inbound message arrives
2. communication is grouped into a meaningful interaction
3. CRM state is enriched or revised
4. reply need is decided
5. draft is prepared only if a response is actually needed
6. boss reviews in `Easy Replies`
7. approved execution writes back into CRM and activity history

Important behavior:
- grouped WhatsApp bursts and email threads are the main interaction units
- FYI and low-value status updates stay in history but should not surface by default in boss-facing flows
- if the boss replied manually outside DealWise, the system should suppress the stale pending reply item

## 3. Data Model Direction

Target tabs:
- `SETTINGS`
- `CONTACTS`
- `ACTIVITY`
- `LOG`
- `AI_Cost_Tracker`

Implementation constraint:
- preserve useful existing infrastructure on `INBOX` and `ARCHIVE` while migrating
- do not destructively redefine `SETTINGS`
- migrate toward `ACTIVITY` as the canonical ledger instead of forcing a destructive tab reset

Data ownership:
- `CONTACTS` holds the main snapshot business state
- `ACTIVITY` holds append-only communication, draft, approval, and execution history
- `LOG` holds diagnostics
- `AI_Cost_Tracker` holds AI usage

## 4. Menu Contract

The boss-facing main menu must converge on:
1. `Easy Replies`
2. `Priority / Next Steps`
3. `Manual Contact Update`
4. `Help`

Old menu branches may still exist in code, but they should be removed or bypassed over time instead of treated as active product.

## 5. AI Usage Rules

- AI is used for summarization, enrichment, score/state revision, and reply drafting.
- AI should not be asked for facts already stored in Sheets.
- AI should not produce unnecessary promises, deadlines, or commitments.
- AI should not generate reply drafts for items that do not need a response.

## 6. Safety Rules

Current required safety posture:
- approval-triggered outbound sends must stay blocked by default until the send path is explicitly rebuilt and re-enabled
- proactive boss digests and decision packets must stay blocked by default until explicitly enabled

That means "approve" may mark a draft approved in the system without immediately sending it out.

## 7. Build Sequence

The architecture should move in this order:
1. docs as contract
2. schema alignment around `CONTACTS` and `ACTIVITY`
3. CRM enrichment and score/state revision
4. `Easy Replies`
5. safe outbound send rebuild
6. `Priority / Next Steps`
7. `Manual Contact Update`

Use [DEALWISE_ROADMAP.md](/C:/dev/gas/TaskLess/DEALWISE_ROADMAP.md) as the concise step tracker.
