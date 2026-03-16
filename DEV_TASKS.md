# TaskLess — DEV_TASKS

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

# 5. Development Ledger

## Completed Work

Core architecture defined.

Boss / Assistant system model established.

AI Safety Guard concept defined.

WhatsApp Business Coexist successfully configured.

Cloud API connection confirmed.

WABA ID discovered:

1359984478739186

Phone Number ID discovered:

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

Meta webhook test events successfully delivered.

---

# 6. Current Investigation

Goal:

Receive inbound WhatsApp messages both:

• in the mobile WhatsApp Business app  
• in the Cloud API webhook

Observed behavior:

Webhook endpoint receives Meta test events correctly.

Example event:

field: messages  
type: text  
text: "Webhook test message"

However mobile-originated messages sometimes do not appear as "messages" webhook events.

Instead they appear as:

field: message_echoes

or

field: smb_message_echoes

Example payload observed:

field: smb_message_echoes  
type: text  
text: "this is a text message"

The current parser logs these as:

event_type: webhook_no_events

because only messages and statuses were originally supported.

---

# 7. Required Webhook Subscriptions

For coexist support the system must subscribe to:

messages  
smb_message_echoes

Observed:

messages subscription works  
smb_message_echoes subscription works  
message_echoes subscription inconsistent

Echo payloads confirm Meta webhook delivery is functioning.

---

# 8. Current Troubleshooting Task

Objective:

Ensure that real inbound WhatsApp messages trigger usable webhook records.

Questions being investigated:

• why some inbound messages appear only as echo events  
• when "messages" events are generated vs "smb_message_echoes"  
• whether coexist routing depends on message origin

Test observations:

Meta webhook test → success  
Manual webhook POST → success  
Echo webhook events → received  

But some mobile messages still do not appear as standard messages events.

---

# 9. Immediate Next Tasks

Update webhook parser to support:

messages  
smb_message_echoes  
message_echoes

Verify inbound messages from an external phone number.

Confirm real client messages generate usable records.

Normalize webhook events into unified message format.

---

# 10. Future Architecture

Current prototype:

Single Google Apps Script Web App.

Future system will include a Router Layer.

Router responsibilities:

• detect phone_number_id  
• map to correct user environment  
• forward message to correct TaskLess instance.

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

