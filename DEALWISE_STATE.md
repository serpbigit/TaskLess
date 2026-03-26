# DealWise State

## Current Repo Position

This repo has pivoted in product direction from TaskLess to DealWise.

The codebase still contains large reusable infrastructure from TaskLess, especially:
- WhatsApp webhook handling
- Gmail ingestion and send flows
- Sheets bootstrap and settings
- contact sync and lookup
- append-only contact enrichment
- approval packets
- orchestrator sweeps

## Current Active Documentation
- `README.md`
- `DEALWISE_PRODUCT.md`
- `DEALWISE_ARCHITECTURE.md`
- `DEALWISE_ROADMAP.md`
- `DEALWISE_STATE.md`
- `AGENT.md`

## Archived Documentation

Old TaskLess-facing docs were moved to:

- `docs/archive/taskless/`

## Recommended Next Implementation Step

Start with product-surface simplification:

1. reduce the menu to `Reply`, `Enrich CRM`, and `Opportunities`
2. disable reminder/task/calendar-first flows
3. redesign the CRM schema around person-centric records and identity linking

## Naming Note

Runtime files still use `TL_*.gs`.

That is acceptable for now. The highest-value work is to change behavior and user-facing language first, then rename internals later if the DealWise MVP stabilizes.
