# TaskLess - DEV_TASKS

Working instructions: see AGENT.md
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

TaskLess (BossAI) is a command layer for business communication.

Brand concept:

BossAI.online — You are the Boss. AI does the rest.

TaskLess allows business owners to continue using their familiar messaging tools (especially WhatsApp Business) while AI organizes communication and tasks behind the scenes.

The system runs on top of the user's personal Google Workspace (Gmail + Google Sheets) and functions as a lightweight CRM and communication control system.

TaskLess:

• receives inbound messages  
• analyzes intent using AI  
• proposes response drafts  
• extracts tasks and commitments  
• requires Boss approval before sending  
• logs all communication events  

Goal:

Transform chaotic messaging into a structured communication workflow without replacing WhatsApp.

Expected impact:

10–15 hours saved per month for SMB users.

Core concept:

You remain the Boss. AI prepares the work.

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

• analyzing inbound messages  
• generating reply drafts  
• extracting tasks  
• organizing communication context  

The Assistant prepares work but does not execute without Boss approval.

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

# 3. Communication Flow

Inbound Flow

Client  
↓  
WhatsApp Business (Coexist)  
↓  
WABA Webhook  
↓  
TaskLess Assistant

Assistant analyzes:

• sender  
• message content  
• conversation context

Assistant produces:

• intent classification  
• suggested reply  
• possible tasks

---

Boss Interaction

Boss receives a control card:

Suggested reply  
Approve  
Edit  
Revise with AI  
Ignore

---

Outbound Flow

Assistant  
↓  
AI Safety Guard  
↓  
Boss Approval  
↓  
WhatsApp Cloud API  
↓  
Client

---

# 4. Learning Loop

TaskLess learns from Boss revisions.

When Boss edits an AI draft the system records:

• client message  
• AI draft  
• Boss revision  
• final message

Stored in Google Sheets.

Over time the Assistant learns:

• tone preferences  
• phrasing style  
• communication patterns

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

With communication capture operational, development will focus on backend operations.

---

## Communication Sources

TaskLess will ingest:

• WhatsApp messages (completed)  
• Gmail messages  
• Google Calendar events  
• user-created tasks

---

## Core Backend Modules

Communication Processing

• normalize message events  
• build unified conversation records  
• contact resolution

Task Extraction

• detect tasks from messages  
• create task records automatically

Scheduling

• detect appointment intent  
• create calendar events

Assistant Layer

• summarize conversations  
• propose responses  
• suggest follow-up actions

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

TaskLess converts messaging into a command-driven communication system.

Principles:

• Boss remains in control  
• AI prepares work  
• Safety Guard prevents mistakes  
• communication becomes structured

TaskLess sits above communication tools rather than replacing them.

---

# 14. Lessons Learned

WhatsApp Coexist introduces additional webhook streams.

Inbound messages may appear as echo events.

Webhook logging is essential for debugging.

AI draft + Boss approval prevents messaging mistakes.

Safety Guard significantly reduces reputational risk.

Logging and learning loops are critical for improvement.

---

# POC to Production Notes

- After POC, split into a shared library (core router + ledger + topic/contact helpers) and per-client bound Apps Script files delivered during onboarding.
- Library will handle schema creation (INBOX/ARCHIVE/CONTACTS/CONTACT_ENRICHMENTS/TOPICS/SETTINGS/LOG), root/topic resolution, and webhook normalization.
- Client project will contain minimal config and UI triggers; onboarding flow should clone the client-bound script and register routing (phone_number_id → endpoint).

## Current telemetry / open issues (2026-03-17)
- INBOX/ARCHIVE schema deployed; CONTACTS, CONTACT_ENRICHMENTS, TOPICS, SETTINGS, LOG tabs created.
- TL_Webhook now writes communication rows and merges statuses by (phone_number_id, message_id); status rows are skipped if no match and logged as status_no_match.
- Direction normalization: incoming sender=contact, receiver=business; outgoing sender=business, receiver=contact when recipient_id is present.
- Known gap: some status messages arrive before the corresponding message row, leading to status_no_match (logged) and no merge. Need a future cache/merge pass for late statuses.
- Known gap: OUTGOING echo rows have empty receiver when recipient_id missing in payload; need fallback logic (e.g., last contact in root/topic window).
- Known gap: record_version not incremented for communication evolutions (only statuses). Need consistent versioning across updates.

## Next steps (AI routine, WhatsApp-first)
- Configure AI endpoint/token in SETTINGS (`API END POINT`, `API TOKEN`, `AI_DEFAULT_LANGUAGE`). Use existing WhatsApp messages as the first channel before adding email/scheduling/tasks.
- AI flow (initial POC):
  - On new incoming communication row (record_class=communication, direction=incoming), build a prompt with recent context (same root/topic) and ask AI to propose reply + short summary.
  - Write results into `ai_summary` and `ai_proposal` on the same row (or new record_version).
  - Prepare a Boss approval card: Boss edits/approves; on approval, send via WhatsApp and log outbound communication row.
- Deferrals for later: email ingestion, calendar/scheduling, and task auto-creation; focus first on WhatsApp AI drafts and Boss approval loop.

