# TaskLess Product Vision

TaskLess reduces the manual operational burden on a business owner. The alternative expression “BossAI — You Boss, AI does the rest” carries the same relationship: the human remains the authority and decision maker, while the AI handles operational work.

The philosophy: add one more WhatsApp account and gain a smart AI secretary plus dedicated background workers. These workers archive, watch due dates, track commitments, organize communication, prepare replies, and coordinate follow-ups. The AI behaves like digital office staff, not a simple chatbot.

## Boss–AI Relationship
- The Boss gives instructions, reviews proposals, and confirms actions.
- The AI observes communication, organizes context, proposes actions, and executes approved operations.
- The Boss stays the boss; AI is an accountable assistant.

## Dual WhatsApp Model
**Old world (before TaskLess):** one business phone with one WhatsApp Business account talking directly to everyone.

**New world (after TaskLess setup):**
- The original business SIM/phone remains. Its WhatsApp Business number becomes the AI Secretary channel and is connected to the WhatsApp Cloud API in Coexistence mode. The user keeps the phone, can answer calls, and can still read or occasionally reply in the app. This number is the AI Secretary-facing business identity.
- The user adds a second low-cost SIM whose WhatsApp account is the Boss instruction channel. Through this Boss account, the user instructs the AI, asks it to write to clients, manages communication, and reviews or confirms actions. In Israel this can start with inexpensive local SIMs; other regions can use local providers.

**Why two identities are needed:** Coexistence makes message lifecycle deterministic and restricts in-app edits/deletes on the business device; the API cannot edit messages; a coexist account cannot reliably message itself. A separate Boss channel keeps human-in-the-loop flows practical and deterministic.

The Boss may still use the business WhatsApp manually for personal or family threads, but the strategic model is to delegate more communication to the AI Secretary for organization and safety. Over time this setup can also help personal and family coordination.

## Human-in-the-Loop
The AI drafts, organizes, suggests, and decomposes work, but the Boss remains final approver for important actions. This trust model is core to TaskLess.

## Long-Term Direction
- **Epoch 1 — Personal POC:** One Boss WhatsApp account plus one AI Secretary business WhatsApp account validate the loop, approvals, and operational flow for the founder’s own pair.
- **Epoch 2 — Client Platform:** Each client gets their own Google Sheet, bound Apps Script deployment, and shared-library automations. A setup flow in the client sheet deploys their Apps Script and registers routing details in an external database so the platform can forward incoming events for that phone number.

## Broader Goal
The goal is not just message capture; it is to turn communication into an operational control system. Over time the same Boss–AI model should cover WhatsApp, Gmail, scheduling, reminders, and structured tasks.

## Scope of Truth
PRODUCT.md is the stable high-level product truth. It should change slowly and guide OPERATIONAL.md, FEATURES.md, ARCHITECTURE.md, and DEV_TASKS.md.
