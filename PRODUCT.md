# TaskLess Product Vision

TaskLess is a WhatsApp-first AI chief of staff for solopreneurs. It continuously prepares work in the background, then helps the user act on it during cleanup, planning, and execution sessions.

Core principle:

**The system thinks all the time, but speaks only when spoken to.**

This defines the product more accurately than a notification engine or urgency manager. The human remains the authority. The AI prepares, explains, proposes, and executes only after approval.

## Canonical Value Proposition
- One conversational control surface instead of scattered operational work across multiple apps.
- Silent background preparation that reduces mental load before the user opens a work session.
- Session-based help for inbox cleanup, prioritization, follow-up handling, reply drafting, and plan execution.
- Natural requests become structured plans, proposals, reminders, tasks, and follow-ups without forcing the user to think in backend tools.

## Product Definition
TaskLess is not primarily a no-code builder, workflow builder, notification engine, or autonomous attention manager.

TaskLess is:
- a background preparation engine
- a cleanup / planning / execution assistant
- a session-based AI chief of staff
- an intent-to-plan system with approval-first execution

The wedge is daily operational leverage for solopreneurs, not one-time setup.

## Operating Model
TaskLess should run in two distinct modes:

### 1. Continuous lightweight preparation
The system continuously:
- ingests WhatsApp messages and later other channels such as email and calendar
- normalizes and stores raw operational items
- generates lightweight summaries and metadata
- tags simple signals such as follow-up, unanswered, deadline mentioned, or commitment linkage
- builds reusable context for later decision sessions

This layer should stay lightweight, cheap, and quiet. It should not do full global prioritization on every incoming item.

### 2. User-triggered batch reasoning
When the user asks things like:
- "clean up"
- "what matters?"
- "plan my day"
- "what should I do next?"
- or enters a structured menu flow

Then TaskLess should:
- gather relevant prepared items
- reason across them in one batch
- group related items
- prioritize contextually
- generate explanation-rich recommendations
- draft replies, tasks, reminders, and multi-step execution plans

Core rule:

**Prepare locally. Decide globally.**

## Trust Model
Users trust:
- prepare
- propose
- explain
- approve
- execute

Users do not reliably trust:
- autonomous claims of urgency
- aggressive interruption
- unsupervised external write actions

TaskLess should not present "urgent" as a hard fact by default. It should use soft explanation language such as:
- may need attention
- likely follow-up
- deadline signal detected
- no reply for 2 days
- linked to your stated commitment

Explanation builds trust more effectively than raw confidence scores.

## Execution Model
TaskLess uses this default execution contract:

**Prepare -> Present -> Approve -> Execute**

Reversible read-only or interface actions may happen immediately:
- opening menus
- showing summaries
- displaying cleanup or planning views
- navigating to prepared work

Irreversible or state-changing external actions require approval:
- sending messages or emails
- scheduling events
- creating or changing reminders and tasks
- executing multi-step plans

No autonomous external send actions should be the default product behavior.

## Boss-AI Relationship
- The Boss asks, reviews, edits, and approves.
- The AI continuously prepares context and proposals in the background.
- The AI surfaces work when requested, not by aggressively chasing attention.
- The Boss remains the decision-maker; the AI is an accountable chief of staff.

## Multi-Step Intent Handling
One of the main product "wow" moments is converting high-level intent into a structured plan.

Examples:
- "reply to David, schedule a meeting, and remind me next week"
- "prepare me for this meeting"
- "handle my morning"
- "follow up with these clients"

TaskLess should:
1. convert the request into a structured multi-step plan
2. present the plan as a batch by default
3. allow optional expansion into per-step review or editing
4. wait for approval
5. execute approved actions
6. log the full flow cleanly

Plan objects and approval packets should therefore remain first-class product concepts.

## Interaction Model
- Free-form voice and text remain the preferred natural interface.
- Menus and buttons remain important as structured entry points for cleanup, planning, review, and execution sessions.
- Surfacing should be user-triggered, not interruption-driven.
- Session prompts such as "what matters now" or "clean up" should become central product entry points.

## Daily-Use Product Shape
TaskLess should feel more like:
- help me run my day
- help me clean up my inbox
- help me decide what matters now
- help me follow up and execute

It should feel less like:
- help me build a custom workflow system
- help me tune notification timing
- help me optimize interruptions

Future workflow-building layers may exist, but they are secondary and should not drive the MVP.

## Dual WhatsApp Model
**Old world (before TaskLess):** one business phone with one WhatsApp Business account talking directly to everyone.

**New world (after TaskLess setup):**
- The original business SIM/phone remains. Its WhatsApp Business number becomes the AI Secretary channel and is connected to the WhatsApp Cloud API in Coexistence mode. The user keeps the phone, can answer calls, and can still read or occasionally reply in the app.
- The user adds a second low-cost SIM whose WhatsApp account becomes the Boss instruction channel. Through this Boss account, the user triggers cleanup/planning/execution sessions, requests actions, and approves proposals.

Why two identities are needed:
- this is mainly a technical consequence of current WhatsApp Coexistence constraints
- a coexist account cannot reliably message itself for approval loops
- a separate Boss channel keeps approval and control flows deterministic

## Long-Term Direction
- **Epoch 1 — Personal POC:** prove the Boss + AI Secretary pair for the founder's own daily operating flow
- **Epoch 2 — Client Platform:** give each client their own Google Sheet, bound Apps Script deployment, and onboarding/routing setup

The product expands by deepening daily-use operational leverage first, then widening channels and platform support.

## Product Boundaries
- TaskLess is not a general chatbot.
- TaskLess is not an urgency pusher.
- TaskLess is not primarily an interruption manager.
- TaskLess is not primarily a workflow builder.
- Out-of-scope requests should be redirected into supported operational workflows rather than answered as generic chat.

## Scope of Truth
PRODUCT.md is the stable high-level product truth. It should guide OPERATIONAL.md, ARCHITECTURE.md, DEV_TASKS.md, and future feature specs.
