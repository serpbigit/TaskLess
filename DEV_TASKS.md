# TaskLess — DEV_TASKS

---

## 1. Canonical Value Proposition

TaskLess is a communications-driven CRM that keeps itself current by observing real business activity.

Traditional CRMs require the user to manually log calls, update records, track follow-ups, and maintain contact history. Over time this friction causes the CRM to drift away from the real state of the business.

TaskLess reverses this model.

Instead of the user feeding the CRM, the CRM feeds itself by observing the user’s real communication activity.

Signals such as:

- incoming and outgoing email
- WhatsApp conversations
- calendar events
- future business channels

are ingested automatically through integrations such as Google Apps Script and related backend systems.

An external AI layer acts as the user’s AI secretary.

The AI continuously reviews the latest context and proposes suggested actions or reply drafts.

The user does not need to manually operate the CRM. Instead:

- TaskLess gathers communication history
- AI reads the latest context
- AI proposes reply drafts or next actions
- the user chooses, edits, or approves
- TaskLess executes through the correct backend channel

The unique value proposition is not just reminders or automation. The unique value proposition is a living CRM that stays current by observing and processing the user’s real business communications.

The core product is:

**a CRM that works for the user, with an AI secretary that reads context and proposes the next action.**

---

## 2. System Operating Model

### 2.1 Ingestion
TaskLess ingests communication and activity signals from:
- WhatsApp
- Gmail
- Calendar
- future business channels

### 2.2 Context Layer
The system stores and organizes activity so that AI can understand:
- who the contact is
- what happened recently
- what the current thread or business context is
- what the likely next action should be

### 2.3 AI Secretary
The AI secretary:
- reads the latest context
- proposes a draft or action
- presents choices to the user
- does not execute automatically unless the flow is explicitly approved

### 2.4 Execution
Approved actions are executed deterministically through backend systems such as:
- WhatsApp messaging
- email sending
- calendar updates
- sheet updates
- CRM state changes

### 2.5 Safety Principle
Thinking is AI-driven.
Execution is deterministic and system-controlled.

---

## 3. Current Sprint Focus

Current focus is the WhatsApp Embedded Signup / onboarding POC.

Goal:
- successfully onboard a test WhatsApp number to the app
- capture and verify onboarding outputs
- confirm we can reliably obtain and store the identifiers needed for downstream messaging flows
- identify the exact activation blocker if onboarding reaches object creation but not operational send readiness

---

## 4. What Has Been Established

- TaskLess has its own dedicated repository separate from GLV.
- PowerShell profile/menu workflow was updated to support project-specific selection.
- Desktop and Termux are now treated as separate supported environments.
- TaskLess repository can now be pushed from desktop and pulled from Termux.
- We decided not to invest further right now in a general config helper abstraction.
- For the current POC we prefer explicit, local property access where needed.
- The app system token is valid and works against Graph.
- The business node query works and returns owned WhatsApp Business Accounts.
- The system token can read phone-number objects under visible WABAs.
- The current deployment webhook is attached to visible phone objects.
- The client WABA onboarding target is real, not a ghost UI artifact.
- The immediate objective is no longer basic discovery; it is now to document and resolve the exact activation blocker.

---

## 5. Current Decisions

- Do not optimize architecture before proving the onboarding POC.
- Do not block progress on a generalized config/property helper.
- Treat the user system token as the primary practical token for the POC.
- Attempting to obtain an onboarding-derived user token is useful, but not critical for first success.
- Capturing WhatsApp Business identifiers and phone identifiers is critical even if token exchange is incomplete.
- If possible, capture identifiers separately so failure in access-code/token exchange does not prevent retaining the core onboarding outputs.
- Use direct edge queries as the trusted diagnostic method; avoid brittle aggregate `?fields=` business queries in this Meta context.
- Distinguish carefully between multiple WhatsApp environments in the same business portfolio:
  - existing ON_PREMISE number
  - existing CLOUD_API test number
  - current onboarding / client-WABA target number

---

## 6. P0 — WhatsApp Embedded Signup POC

### Environment Verification

- [x] Confirm the current app system token exists and is available for testing
- [x] Verify the system token actually works against the expected Graph endpoint
- [ ] Confirm the app secret stored in script properties matches the secret currently shown in Meta app settings
- [x] Confirm the worker / deployed GAS webhook path is visible on WhatsApp phone objects
- [ ] Confirm the worker and GAS handoff path still match the exact current onboarding implementation

### Business / WABA / Phone Discovery

- [x] Confirm owned WABAs are visible from the business node
- [x] Confirm phone numbers are visible for owned WABAs
- [x] Confirm the suspected third WABA is real and not a ghost
- [x] Confirm the third WABA is a client WABA rather than an owned WABA
- [x] Capture WABA ID for the onboarding target
- [x] Capture phone number ID for the onboarding target

### Onboarding Target Captured

Confirmed onboarding target identifiers:

- Business ID: `1309151907679742`
- Client WABA ID: `3910373462597249`
- Client WABA Name: `נחמה וראובן כהן`
- Phone Number ID: `1039368419259439`
- Display Phone Number: `+972 8-376-1169`
- App ID: `1576900080223572`
- Last Onboarded Time: `2026-03-09T15:49:54+02:00`

### Current Phone-State Result

Confirmed current phone-state for onboarding target:

- `code_verification_status = VERIFIED`
- `status = PENDING`
- `platform_type = NOT_APPLICABLE`
- `quality_rating = UNKNOWN`
- `health_status.can_send_message = BLOCKED`

Primary blocking phone-level error:

- `141000` — The phone number is not linked to the WhatsApp account; Meta indicates OTP / final registration is not fully completed

Additional blockers observed:

- `141006` — payment method issue at WABA level
- `141010` — business verification not passed at business level

### Remaining P0 Checks

- [ ] Confirm whether access code is captured in current onboarding flow
- [ ] Confirm whether token exchange is attempted in current onboarding flow
- [ ] Confirm whether token exchange succeeds or fails in current onboarding flow
- [ ] Run one fresh onboarding attempt with worker logs open
- [ ] Run the same attempt with GAS execution log open
- [ ] Confirm whether a fresh run changes the client phone from `PENDING` to an active operational state
- [ ] Document the exact failing phase if onboarding does not complete end-to-end

### P0 Interpretation Note

Important:
it is possible that earlier successful test sends were performed from a different number / WABA combination already active in the environment, using the system token.

That does **not** prove that the current onboarding target:

- WABA `3910373462597249`
- phone number ID `1039368419259439`

is operational yet.

For this sprint, the onboarding target must be judged by its own phone-state result, not by sends from other numbers.

---

## 7. P1 — Identifier Capture and Persistence

Minimum useful identifier set for first useful POC now confirmed as:

- Business ID
- WABA ID
- phone number ID
- business/account linkage context
- app ID
- webhook binding visibility
- onboarding timestamp if available

Persistence options still to decide:

- worker log
- GAS log
- sheet
- script properties

Identifier capture should remain independent from optional token exchange wherever possible.

Logs should clearly distinguish:

- SDK event received
- onboarding completed
- WABA ID captured
- phone number ID captured
- access code captured
- token exchange attempted
- token exchange success/failure
- phone activation status
- final operational blocker code

Open task:

- [ ] Decide first persistence location for captured identifiers
- [ ] Ensure logs distinguish discovery from true operational readiness

---

## 8. P1 — Token Strategy

- [x] Verify the user system token path is available and usable for the POC
- [x] Confirm the system token can read business, WABA, and phone-number objects
- [ ] Treat onboarding access-code exchange as secondary, not blocking
- [ ] Confirm which actions truly require exchanged user token versus existing system/user system token
- [ ] Record a clear token strategy note inside the repo after verification

Working note:
the system token is already strong enough for diagnostic discovery and at least some messaging operations on existing active assets. The open question is not token validity in general, but whether the specific onboarding target phone has completed activation.

---

## 9. P2 — Cleanup After First Successful Trace

- [ ] Clean up or deprecate outdated TaskLess legacy files if they conflict with DEV_TASKS.md
- [ ] Decide whether BUSINESS_LOGIC.md and STATE.md remain historical only
- [ ] Align README with the canonical value proposition
- [ ] Add a concise onboarding trace summary to the repo after the first monitored run
- [ ] Add a short asset map note documenting:
  - ON_PREMISE number
  - test CLOUD_API number
  - current client-WABA onboarding target

---

## 10. Current Precise Blocker

The current onboarding target has passed object creation and code verification but has **not** completed final activation.

Precise blocker:

- WABA exists
- phone object exists
- code verification is `VERIFIED`
- last onboarded time exists
- webhook is attached
- but phone status remains `PENDING`
- `can_send_message = BLOCKED`
- primary error `141000` indicates the phone number is still not fully linked to the WhatsApp account / final OTP registration state

This is the current first real blocker and should be treated as the sprint’s exact failing phase unless the next monitored onboarding run changes the phone state.

---

## 11. Close Criteria For This Sprint

- [x] TaskLess DEV_TASKS.md reflects the real TaskLess product and sprint
- [x] App system token is confirmed working
- [ ] Script secret is confirmed against Meta settings
- [ ] One monitored onboarding run is completed after the current diagnostics baseline
- [x] We know the WABA ID for the onboarding target
- [x] We know the phone number ID for the onboarding target
- [ ] We know whether access code and token exchange succeeded in the current monitored flow
- [ ] If token exchange failed, the successful identifiers were still preserved
- [x] The first actual blocker is now documented as a precise phase, not a guess
