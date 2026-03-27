# DealWise State

## Current Repo Position

This repo has pivoted in product direction from the earlier TaskLess concept to DealWise.

The codebase still contains large reusable infrastructure from the earlier runtime, especially:
- WhatsApp webhook handling
- Gmail ingestion and send flows
- Sheets bootstrap and settings
- contact sync and lookup
- contact CRM writeback
- approval packets
- orchestrator sweeps

## Current Active Documentation
- `README.md`
- `DEALWISE_PRODUCT.md`
- `DEALWISE_ARCHITECTURE.md`
- `DEALWISE_ROADMAP.md`
- `DEALWISE_STATE.md`
- `AGENT.md`

## Recommended Next Implementation Step

Run controlled live validation on the DealWise surface:

1. Boss menu flow: `Reply`, `Enrich CRM`, `Opportunities`
2. grouped inbound WhatsApp reply queue
3. CRM updates written directly into `CONTACTS`

## Naming Note

Runtime files still use `TL_*.gs`.

That is acceptable for now. The highest-value work is to change behavior and user-facing language first, then rename internals later if the DealWise MVP stabilizes.
