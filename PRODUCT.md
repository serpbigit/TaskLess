# TaskLess Product Vision

TaskLess reduces the manual operational burden on a business owner. The alternative expression “BossAI — You Boss, AI does the rest” carries the same relationship: the human remains the authority and decision maker, while the AI handles operational work.

The philosophy: add one more WhatsApp account and gain a smart AI secretary plus dedicated background workers. These workers archive, watch due dates, track commitments, organize communication, prepare replies, and coordinate follow-ups. The AI behaves like digital office staff, not a simple chatbot.

## Value Proposition
- One conversation instead of five apps.
- The Boss stays in flow while the secretary handles system switching.
- Natural requests become structured operations: reminders, tasks, logs, scheduling, approvals, and follow-ups.
- The Boss should not need to decide which app or backend a request belongs to.

## Wow Moments
- I can keep giving instructions without losing focus to app switching.
- One voice message can become multiple structured actions.
- I stay in one conversational thread while the system handles reminders, tasks, logs, scheduling, and communication in the background.
- The secretary understands the work intent first, then routes it to the right operational system.

## Boss–AI Relationship
- The Boss gives instructions, reviews proposals, and confirms actions.
- The AI observes communication, organizes context, proposes actions, and executes approved operations.
- The Boss stays the boss; AI is an accountable assistant.

## Dual WhatsApp Model
**Old world (before TaskLess):** one business phone with one WhatsApp Business account talking directly to everyone.

**New world (after TaskLess setup):**
- The original business SIM/phone remains. Its WhatsApp Business number becomes the AI Secretary channel and is connected to the WhatsApp Cloud API in Coexistence mode. The user keeps the phone, can answer calls, and can still read or occasionally reply in the app. This number is the AI Secretary-facing business identity.
- The user adds a second low-cost SIM whose WhatsApp account is the Boss instruction channel. Through this Boss account, the user instructs the AI, asks it to write to clients, manages communication, and reviews or confirms actions. In Israel this can start with inexpensive local SIMs; other regions can use local providers.

**Why two identities are needed:** this is mainly a technical requirement of the current WhatsApp Coexistence setup, not a product philosophy by itself. In practice, the business number remains the coexistence business account and AI Secretary identity, while a separate low-cost WhatsApp number acts as the Boss instruction channel. A coexist account cannot reliably message itself for approval loops, and trying to collapse both roles into one identity risks recursive or ambiguous automation behavior. A separate Boss channel keeps human-in-the-loop flows practical and deterministic.

The Boss may still use the business WhatsApp manually for personal or family threads, but the strategic model is to delegate more communication to the AI Secretary for organization and safety. Over time this setup can also help personal and family coordination.

## Human-in-the-Loop
The AI drafts, organizes, suggests, and decomposes work, but the Boss remains final approver for important actions. This trust model is core to TaskLess.

Reversible interface actions can happen immediately:
- opening menus
- showing summaries
- helping the Boss navigate the system

Irreversible or state-changing actions require confirmation:
- sending messages or emails
- scheduling events
- creating reminders, tasks, or persistent logs

This boundary is core to trust and safety.

## Natural Boss Flow
- The preferred experience is conversational, not app-driven.
- The Boss should be able to use text or voice naturally, without first deciding whether something is a reminder, task, log, schedule item, or follow-up.
- Menu flows exist for discoverability, onboarding, and explicit navigation, but the long-term product shape is natural operational conversation.
- Voice is a first-class control surface, not just an accessibility layer or transcription convenience.

## Long-Term Direction
- **Epoch 1 — Personal POC:** One Boss WhatsApp account plus one AI Secretary business WhatsApp account validate the loop, approvals, and operational flow for the founder’s own pair.
- **Epoch 2 — Client Platform:** Each client gets their own Google Sheet, bound Apps Script deployment, and shared-library automations. A setup flow in the client sheet deploys their Apps Script and registers routing details in an external database so the platform can forward incoming events for that phone number.

## Broader Goal
The goal is not just message capture; it is to turn communication into an operational control system. Over time the same Boss–AI model should cover WhatsApp, Gmail, scheduling, reminders, and structured tasks.

## Product Boundaries
- TaskLess is not meant to be a general chatbot.
- It is a scoped executive and operational secretary.
- Out-of-scope requests should be redirected back into supported workflows rather than answered as general AI chat.

## Scope of Truth
PRODUCT.md is the stable high-level product truth. It should change slowly and guide OPERATIONAL.md, FEATURES.md, ARCHITECTURE.md, and DEV_TASKS.md.
