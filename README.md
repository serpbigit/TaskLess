# TaskLess

TaskLess (a.k.a. BossAI) is a WhatsApp-first, human-in-the-loop automation system that turns everyday communication into an operational control layer. Voice or text flows through AI for analysis, planning, Boss confirmation, and execution.

## Key Documents
- PRODUCT.md — product vision and long-term direction
- ARCHITECTURE.md — system structure and routing model
- OPERATIONAL.md — operational contract and canonical ledger schema
- FEATURES.md — feature definitions (when present)
- RECONSTRUCTION.md — disaster recovery and rebuild steps
- DEV_TASKS.md — current work/state ledger
- AGENT.md — operating rules for AI coding agents

**AI agents must read AGENT.md before modifying the repository.**

## Unified Ledger (Sheets)
- INBOX: active operational records
- ARCHIVE: historical records (same schema as INBOX)
- CONTACTS: normalized contact entities
- SETTINGS: runtime configuration (polling interval, batch sizes, feature flags)
- LOG: technical/runtime logs

