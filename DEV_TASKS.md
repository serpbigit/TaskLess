# TaskLess - DEV_TASKS

Working instructions: see AGENT.md
Joint collaboration workflow: see WORKFLOW.md
Operational model: see OPERATIONAL.md
Reconstruction guide: see RECONSTRUCTION.md

---

# 0. System Context

TaskLess is currently in the **infrastructure validation phase**.

The objective of this phase was to prove that business communication can be captured reliably from WhatsApp and stored in a structured backend without disrupting the user's normal workflow.

The key architectural decision behind TaskLess is:

TaskLess **does not replace communication tools**.

Instead it **sits above them** and converts everyday communication into structured operational data.

Current infrastructure stack:

• WhatsApp Business (Coexist mode)  
• Meta Cloud API Webhooks  
• Google Apps Script Web App  
• Google Sheets CRM backend  

Verified pipeline:

Client  
↓  
WhatsApp Business  
↓  
Meta Cloud API Webhook  
↓  
Apps Script Webhook  
↓  
TaskLess Logging Layer  
↓  
Google Sheets CRM

This pipeline is now **fully operational**.

---

# 1. Canonical Value Proposition

TaskLess (BossAI) is a WhatsApp-first AI chief of staff for solopreneurs.

Brand concept:

BossAI.online — You are the Boss. AI does the rest.

TaskLess allows business owners to continue using familiar communication tools while AI continuously prepares operational work in the background and helps them act on it during cleanup, planning, and execution sessions.

Canonical operating principle:

TaskLess **thinks all the time, but speaks only when spoken to**.

The system runs on top of the user's personal Google Workspace (Gmail + Google Sheets) and functions as an operational preparation and execution layer.

TaskLess:

• receives inbound messages  
• stores and normalizes operational items  
• prepares lightweight summaries and metadata in the background  
• reasons globally in user-triggered batch sessions  
• proposes replies, tasks, reminders, and multi-step plans  
• requires Boss approval before external execution  
• logs all communication events  

Goal:

Transform chaotic daily communication into prepared operational work without replacing WhatsApp.

Expected impact:

10–15 hours saved per month for SMB users.

Core concept:

You remain the Boss. AI prepares the work, explains why it matters, and waits for approval before acting.

---

# 2. System Operating Model

## Roles

### TaskLess Boss

The human user.

Responsibilities:

• approves outgoing messages  
• edits AI drafts  
• controls final execution  

The Boss always has final authority.

---

### TaskLess Assistant

The AI system responsible for:

• continuously preparing lightweight summaries and metadata  
• organizing communication context across items  
• generating session-based recommendations and plans  
• drafting replies, tasks, reminders, and follow-ups during user-triggered review sessions  

The Assistant prepares work continuously, but deep reasoning and external execution happen only after the user intentionally triggers a session and approves the result.

---

### AI Safety Guard

A protective layer inside the Assistant.

Detects risky communications before sending.

Examples:

• hostile language  
• emotional messages  
• reputational risks  
• confidential data leaks  
• abnormal commitments  

If detected:

Assistant pauses execution and asks Boss for confirmation.

Boss can still override.

---

# 3. Processing Model

TaskLess should run in two layers:

### Continuous lightweight preparation

The system should continuously:

• ingest WhatsApp and later email/calendar inputs  
• normalize/store raw items  
• produce lightweight summaries and metadata  
• tag simple signals such as unanswered, follow-up likely, deadline mentioned, or commitment-linked  
• stay cheap, quiet, and always-on  

This layer should not perform full prioritization on every message.

### User-triggered batch reasoning

When the user says things like:

• clean up  
• what matters?  
• plan my day  
• what should I do next?  
• or enters a menu-driven review flow  

Then the system should:

• gather prepared items  
• reason across them in one batch  
• cluster related work  
• prioritize contextually  
• generate explanation-rich recommendations  
• build structured plans and approval packets  

Core rule:

Prepare locally. Decide globally.

# 4. Trust And Execution Model

Execution contract:

Prepare → Present → Approve → Execute

Trusted behaviors:

• prepare  
• propose  
• explain  
• approve  
• execute  

De-emphasized / not core:

• proactive interruption logic  
• urgency-driven push behavior  
• per-message deep reasoning as the default  
• notification timing complexity  

TaskLess should not claim urgency as fact by default. It should explain why something is surfaced using soft language such as:

• no reply for 2 days  
• deadline signal detected  
• likely follow-up  
• linked to your commitment  

---

# 5. Infrastructure Milestone Achieved

The WhatsApp communication ingestion layer is now operational.

Verified capabilities:

Inbound messages captured via webhook.

Outbound phone-app replies captured via coexist echo events.

Message lifecycle events received.

All events stored inside Google Sheets.

---

## Verified Infrastructure Components

WhatsApp Business Coexist successfully configured.

Cloud API connection confirmed.

WABA ID:

1359984478739186

Phone Number ID:

896133996927016

Permanent system token configured.

Google Apps Script webhook deployed.

Webhook endpoint:

https://script.google.com/macros/s/AKfycbx1p8fg0eFua_9qLJ7tTk0P-cd_zLKxAHnc8KRfyIhgaPtwXANfEZ_QjG3a6pvfVefa/exec

Google Sheet logging infrastructure created.

WEBHOOK_LOG table captures:

• timestamp  
• event_type  
• display_phone_number  
• phone_number_id  
• sender  
• message_id  
• message_type  
• text  
• statuses_count  
• raw_json

Cloud API outbound message sending verified.

Manual webhook POST tests successful.

Meta webhook events successfully delivered.

Real inbound WhatsApp messages confirmed working.

Outbound phone-app replies confirmed working.

---

# 6. Important Onboarding Discovery

Embedded Signup SDK is **not required**.

The onboarding URL provided by Meta can be used directly.

Meaning clients can be onboarded via a simple link.

Embedded signup may still be used later to:

• capture onboarding metadata  
• automate ID collection  
• reduce manual configuration

But manual onboarding is sufficient for production.

---

# 7. WABA App Subscription Requirement

Webhook delivery requires the application to be subscribed to the client's WABA.

This is performed via:

POST /{WABA_ID}/subscribed_apps

Important behavior:

• Required once per WABA  
• Not required again after subscription  
• Fully automatable

This step enabled real message delivery during infrastructure validation.

---

# 8. Observed Webhook Event Types

WhatsApp Coexist produces multiple webhook streams.

Observed event types:

messages  
smb_message_echoes  
message_echoes  
statuses

Meaning:

messages → inbound customer message

smb_message_echoes → outbound message from phone app

message_echoes → outbound message echoes from API flows

statuses → delivery state updates

Future parsing will normalize these events into a unified message model.

---

# 9. Next Development Phase

With communication capture operational, development should focus on the daily-use preparation-and-session loop rather than proactive attention management.

---

## Communication Sources

TaskLess will ingest:

• WhatsApp messages (completed)  
• WhatsApp images, video, and documents  
• WhatsApp voice notes / audio  
• Gmail messages  
• Google Calendar events  
• user-created tasks

---

## Core Backend Modules

Communication Processing

• normalize message events  
• build unified conversation/item records  
• contact resolution  
• preserve prepared metadata for later sessions

Background Preparation

• generate lightweight per-item summaries  
• attach metadata and soft attention signals  
• avoid expensive per-message global reasoning
• treat message-level prep as evidence-building, not final priority judgment

Orchestration

• add `TL_Orchestrator.gs` as the thin deterministic manager inside Apps Script  
• inspect ledger state and decide eligible background prep or user-triggered session work  
• dispatch bounded workers instead of growing webhook inline logic indefinitely  
• coordinate repair, preparation, session planning, approval wait, and approved-send transitions

Session Reasoning

• gather prepared items when the Boss asks for cleanup/planning/review  
• reason across multiple items in one batch  
• group related threads and commitments  
• merge cross-record context for the same person across WhatsApp and email when possible  
• build explanation-rich plans and recommendation packets

Plan Generation

• convert high-level Boss requests into structured multi-step plans  
• present plans as a batch by default  
• allow optional per-step review/edit before execution

Scheduling

• detect appointment intent inside session/planning flows  
• create calendar events only after approval

Assistant Layer

• prepare lightweight summaries continuously  
• propose responses and follow-up actions during sessions  
• explain why items are shown instead of asserting urgency

---

# 10. Future Architecture

Current prototype:

Single Google Apps Script Web App.

Future architecture will introduce a Router Layer.

Router responsibilities:

• detect phone_number_id  
• map to correct user environment  
• forward messages to the correct TaskLess instance

---

# 11. Onboarding Registry

Future multi-tenant registry fields:

• user_id  
• phone_number_id  
• webhook endpoint  
• configuration settings

Candidate storage:

Google Sheets  
Firebase

---

# 12. Logging Requirements

All flows must log deterministically.

Logs must capture:

• inbound events  
• AI drafts  
• Boss approvals  
• execution attempts  
• success  
• errors

No silent execution paths.

---

# 13. Strategic Direction

TaskLess converts daily communication into a prepared operational workbench for solopreneurs.

Principles:

• Boss remains in control  
• AI prepares work continuously in the background  
• the system surfaces work on user trigger, not by default interruption  
• deep reasoning happens in cleanup/planning/review sessions  
• approval remains mandatory before external execution  
• communication becomes structured operational context

TaskLess sits above communication tools rather than replacing them.

---

# 14. Lessons Learned

WhatsApp Coexist introduces additional webhook streams.

Inbound messages may appear as echo events.

Webhook logging is essential for debugging.

Wrong urgency calls damage trust faster than missed automation opportunities.

Silent background preparation is more valuable than background interruption.

Batch reasoning during intentional work sessions is a better default than deep per-message reasoning.

Explanation-rich approval flows are more trustworthy than raw confidence claims.

---

# POC to Production Notes

- After POC, split into a shared library (core router + ledger + topic/contact helpers) and per-client bound Apps Script files delivered during onboarding.
- Library will handle schema creation (INBOX/ARCHIVE/CONTACTS/CONTACT_ENRICHMENTS/TOPICS/SETTINGS/LOG), root/topic resolution, and webhook normalization.
- Client project will contain minimal config and UI triggers; onboarding flow should clone the client-bound script and register routing (phone_number_id → endpoint).

## Current telemetry / open issues (2026-03-19)
- INBOX/ARCHIVE schema deployed; CONTACTS, CONTACT_ENRICHMENTS, TOPICS, SETTINGS, LOG tabs created.
- TL_Webhook now writes communication rows and merges statuses by (phone_number_id, message_id); status rows are skipped if no match and logged as status_no_match.
- Direction normalization: incoming sender=contact, receiver=business; outgoing sender=business, receiver=contact when recipient_id is present.
- Boss menu flow now has a full navigable tree scaffold in Hebrew: main menu, submenus, decision-packet approvals, and capture routing markers for reminder/task/log/schedule flows. Creation flows should route into AI proposal + Boss approval rather than silently execute.
- Menu-handled inbound follow-up text is now appended before the menu handler runs, so free-text captures such as option `1` notes can be persisted and then upgraded to `record_class=instruction` / `task_status=logged`.
- Known gap: some status messages arrive before the corresponding message row, leading to status_no_match (logged) and no merge. Need a future cache/merge pass for late statuses.
- Known gap: OUTGOING echo rows have empty receiver when recipient_id missing in payload; need fallback logic (e.g., last contact in root/topic window).
- Known gap: record_version not incremented for communication evolutions (only statuses). Need consistent versioning across updates.
- Webhook normalization now captures text plus media metadata for image, document, audio, voice, and video messages in INBOX.
- Internal media test harness added in `TL_TestWebhook.gs` for parser previews and fake webhook writes without needing a real WhatsApp message for every iteration.
- Deployed web app media ingestion verified by simulated POSTs to the live `doPost()` endpoint: image, document, voice, and video each returned `{"ok":true,"appended":1,"skipped":0,"updated":0}`.
- Voice transcription path is now wired end-to-end: incoming WhatsApp voice note -> media fetch from Meta -> Gemini transcription -> transcript written back to `text` and summary written to `ai_summary`.
- Webhook auto-transcription is now enabled for incoming voice notes when `ai_voice_transcription=TRUE`; failures are logged but do not break the webhook.
- Amanda lightweight preparation is now wired for incoming WhatsApp rows: after normalization (and after voice transcription when applicable), the system writes `priority_level`, `importance_level`, `urgency_flag`, `needs_owner_now`, `suggested_action`, `ai_summary`, and `ai_proposal`. These fields should increasingly be treated as soft preparation metadata, not hard interruption claims.
- Live tests currently use the Boss phone configured in `SETTINGS` (`BOSS_PHONE`) as the sender while the system is under active development. Later test phases should introduce additional actors (clients, family, vendors, internal staff) so contact behavior and explanation quality are exercised against more realistic mixed traffic.
- Remaining media gap: image/video analysis and richer downstream processing are still pending.

## Next steps (AI routine, WhatsApp-first)
- Add `TL_Orchestrator.gs` as the first explicit orchestration layer inside Apps Script.
  - start with deterministic routing of pending repairs, lightweight preparation, and user-triggered session work rather than more inline branching inside `TL_Webhook.gs`
  - initial orchestration targets: late-status repair, post-ingest lightweight prep, cleanup/planning session assembly, approval wait state, and approved-send dispatch
  - keep this layer procedural and auditable; AI remains inside specialist worker steps, not in the manager itself
  - execution model for v1:
    - direct webhook work: `doGet(e)`, `doPost(e)`, payload normalization, idempotent ledger write/update, immediate status merge when possible, deferred-work logging when not possible
    - orchestrator batch work: scan eligible rows/threads and dispatch bounded batches for repair, lightweight prep, session assembly, approval-state handling, and approved-send routing
    - separate worker entrypoints: `TL_Repair_Run()`, `TL_AI_RunPending()`, `TL_Synthesis_Run()`, `TL_Approval_Run()`, `TL_Send_RunApproved()`
  - trigger model for v1:
    - WhatsApp webhook remains immediate
    - `TL_Orchestrator.gs` should wake on a time-driven trigger, starting at every 5 minutes
    - do not create one installable trigger per task; use the orchestrator as the recurring dispatcher
- Configure AI endpoint/token in SETTINGS (`API END POINT`, `API TOKEN`, `AI_DEFAULT_LANGUAGE`). Use existing WhatsApp messages as the first channel before adding email/scheduling/tasks.
- Contact strategy (current direction):
  - Google Contacts sync should default to `both_only` (contacts that have both phone and email).
  - Do not bulk-import the full contact universe by default just to populate `CONTACTS`.
  - Use Google Contacts as the trusted seed set, then expand context through approval-based linking.
- Contact resolution flow for incoming WhatsApp:
  - first resolve by normalized phone
  - if that contact has an email, immediately expand context on the email side too
  - if phone resolution does not produce a usable cross-channel contact, fall back to candidate search by normalized name
  - if name candidates are found, ask the Boss before linking/updating contacts
  - after approval, run a fresh limited cross-channel history scan and rebuild the brief
- Identity-linking interaction model:
  - allow temporary joint-context usage for the current brief without forcing a permanent merge
  - separately ask whether to update/link the contact record permanently
  - prefer "link/update contact" language over destructive "merge" language in the first shipped flow
- Extend `SETTINGS` for session shaping and review workload:
  - preserve existing digest / decision cadence controls where useful for compatibility
  - prioritize settings that shape cleanup/planning sessions, approval batch size, summary language, and operating cadence
  - treat proactive push / interruption settings as legacy or de-emphasized rather than core product controls
- AI flow (initial POC):
  - Amanda now handles first-pass lightweight preparation for incoming WhatsApp rows.
  - Next Amanda layer: user-triggered batch reasoning so multiple related items produce one coherent summary, explanation, plan, and decision recommendation.
  - Prepare a Boss approval card / packet: Boss edits/approves; on approval, send via WhatsApp and log outbound communication row.
- Extend inbound WhatsApp parsing beyond text:
  - image/document/video messages: store media type, caption, media id/url metadata, and preserve linkage to the contact/root/topic.

## Boss Menu Spec (current target)
- Main menu:
  - `1. תזכיר לי`
  - `2. משימה חדשה`
  - `3. רשום לי`
  - `4. קבע לי`
  - `5. נהל את העבודה`
  - `6. הגדרות`
  - `7. עזרה / מה אפשר להגיד`
  - `8. כלים ייעודיים`
- Every submenu should end with numbered `חזרה לתפריט קודם` and `חזרה לתפריט ראשי`.
- Menu/help triggers should include `תפריט`, `menu`, `עזרה`, `help`, and equivalent voice phrasings.
- Creation-style menu actions should follow the same contract:
  - user chooses menu route
  - user sends free-form details (text or voice)
  - AI returns structured understanding + proposal JSON
  - Boss receives approval card / packet
  - only after approval does the system execute or finalize
- Retrieval-style menu actions may answer directly:
  - `מה על הצלחת שלי עכשיו`
  - `מה צריך תשומת לב`
  - `ממתין לאישורים`
  - `טיוטות לתגובה`
  - `משימות פתוחות`
  - voice/audio notes: transcription is now wired; next step is to feed transcript + prepared metadata into downstream task extraction, planning, and reply drafting automatically.
- First shipped session surfaces in code terms:
  - `מה על הצלחת שלי עכשיו`
  - `מה צריך תשומת לב`
  - `ממתין לאישורים`
  - `הצע לי צעדים הבאים`
- Session rule:
  - lightweight prep may emit soft evidence and tags per item
  - final priority/context judgment should happen in the session layer with the broader "forest" view
- Add email pipeline:
  - scan important incoming emails where the user is in `To` or `Cc` (not `Bcc`), import them into `INBOX`, and batch-analyze them as JSON.
  - support outbound email drafting/sending as another Boss-approved execution channel.
- Add calendar pipeline:
  - scan upcoming or changed calendar events and write actionable/open items into `INBOX` so commitments and scheduling work appear in the same operational queue.
- Add cross-channel contact intelligence:
  - extract and normalize contact information from WhatsApp messages and emails.
  - match messages/emails to shared contacts so Amanda can reason over broader context (previous emails, previous WhatsApp exchanges, prior commitments, and topic history).
  - when direct matching fails, surface candidate contacts and ask the Boss whether to use temporary joint context or permanently link the identity.
- Future voice-output task:
  - add support for AI-generated voice responses: generate approved reply text -> synthesize speech -> send outbound audio/voice note via the appropriate channel.
- Deferrals for later: email ingestion, calendar/scheduling, and task auto-creation; focus first on WhatsApp AI drafts and Boss approval loop.

## Strategic multipliers (roadmap themes)
- Multi-intent Boss capture:
  - one free-form voice/text message can decompose into multiple proposed child records (reminders, tasks, logs, scheduling, reply proposals) under one parent capture and one approval batch.
- Cross-channel unified context:
  - WhatsApp, email, calendar, reminders, and tasks should converge into one operational memory rather than acting like separate mini-tools.
- Batch approval with exception handling:
  - support approve-all, approve-safe-only, one-by-one review, grouped review, and exception-only review while preserving Boss confirmation as an invariant.
- Boss workload shaping:
  - use `SETTINGS` to control session cadence, decision cadence, batch size, review depth, summary language, and workload shaping without making proactive interruption the core product loop.
- Reusable secretary action templates:
  - common flows such as follow-up, archive-safe items, create task + reminder, send meeting confirmation, and similar repeatable office work.
- Contact/relationship memory:
  - retain stable context such as tone preference, business stage, prior commitments, reputational sensitivity, and recurring contact patterns.
- Executive brief / “what’s on my plate now” mode:
  - provide a concise, high-value control surface showing why items are surfaced, what is waiting on approval, and recommended next actions.
- Editable approval cards:
  - every meaningful proposal should come back as a structured Boss card with approve, revise, edit, regroup, or defer paths rather than only binary approval.
- Dependency-aware tasks:
  - tasks should support blocked-by, waiting-on, after-X, and other sequencing logic so the secretary surfaces work at the right time.
  - tasks should remain native to TaskLess as rich ledger objects; Google Tasks may later be optional interoperability or sync, but not the source of truth.
- Specialized vertical packs:
  - support profession-specific modules such as therapist/patient flows, recurring session summaries, periodic reports, and other industry workflows.
- Personalized operating style:
  - the secretary should adapt to the Boss’s preference for summary length, approval style, language, and operating cadence.
- “What should I do now?” decision mode:
  - a focused mode that returns the best next actions with the least cognitive load, prioritized for practical execution rather than information dump.

## Safety and operational controls
- Global automation on/off switch:
  - one clear kill switch for outbound automation and background automation
  - should be controllable from `SETTINGS`, Apps Script admin functions, and later from an emergency Boss/admin WhatsApp command
  - when OFF:
    - background automation must stop
    - outbound automated sends must be blocked
    - Boss should automatically receive a short status message such as:
      - "Sorry for the inconvenience. The automation layer is temporarily down. We are working to restore it as soon as possible. Your phone and WhatsApp can continue working normally until automation is restored."
- Safe degraded mode:
  - when automation is disabled, the human WhatsApp/business phone should continue to work as a normal communication device
  - TaskLess should fail closed on automation, not break the user’s base communication channel
- Circuit breakers and anti-loop rails:
  - max automated Boss packets per time window
  - duplicate packet cooldown
  - per-root / per-event loop breaker
  - one-click emergency stop for all background processing

