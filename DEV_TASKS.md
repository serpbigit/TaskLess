# TaskLess — DEV_TASKS

---

# 1. Canonical Value Proposition

TaskLess is a command layer for business communication.

Instead of business owners manually managing conversations inside messaging apps,
TaskLess sits above those apps and acts as a control system that:

• receives inbound messages  
• analyzes intent using AI  
• proposes responses  
• requires Boss approval  
• executes communication safely  

TaskLess introduces an **AI Safety Guard** that prevents risky or damaging
messages from being sent impulsively.

The system is designed to work **on top of WhatsApp Business Coexistence**,
allowing business owners to keep their familiar WhatsApp UI while TaskLess
provides intelligence, safety, and automation.

The objective is to:

• reduce manual messaging workload  
• prevent embarrassing or risky messages  
• improve response speed  
• create a structured communication system  

Expected impact:

10–15 hours per month saved for typical SMB users.

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
• extracting tasks and intents  
• organizing communication context  

The Assistant prepares actions but does not execute without Boss approval.

---

### AI Safety Guard

A protective layer inside the Assistant.

It detects risky communications before sending.

Examples:

• hostile language  
• emotional messages  
• reputational risks  
• confidential data leaks  
• abnormal commitments  

If detected:

Assistant pauses execution and requests confirmation from the Boss.

Boss may still override.

---

# 3. Communication Flow

Inbound Flow

Client  
↓  
WhatsApp (Coexist)  
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

This data is stored in Google Sheets.

Over time the Assistant learns:

• tone preferences  
• phrasing  
• communication style

---

# 5. Development Ledger

## ✓ Completed Work

✓ Core TaskLess concept defined  
✓ Boss / Assistant architecture defined  
✓ AI Safety Guard concept defined  
✓ WhatsApp Coexistence limitations analyzed  
✓ Deployment Web App created  
✓ Google Apps Script deployment pipeline established  

Deployment endpoint:

https://script.google.com/macros/s/AKfycbx1p8fg0eFua_9qLJ7tTk0P-cd_zLKxAHnc8KRfyIhgaPtwXANfEZ_QjG3a6pvfVefa/exec

---

## ▶ Current Work

Inbound WhatsApp message capture prototype.

Goal:

Receive WABA webhook events and log them to a Google Sheet.

Data to capture:

• phone_number_id  
• sender phone  
• message text  
• timestamp  

This stage validates:

• webhook reliability  
• message structure  
• data capture

---

## ○ Next Tasks

Task 1 — AI Draft Generation

Assistant generates reply drafts for inbound messages.

Drafts stored alongside inbound messages.

---

Task 2 — Boss Approval Interface

Boss can:

• approve draft  
• edit draft  
• reject draft  

---

Task 3 — AI Learning Storage

Store Boss revisions in Google Sheets.

Create learning dataset for future draft improvements.

---

Task 4 — Safety Guard Logic

Detect risky messages before sending.

Trigger confirmation workflow.

---

# 6. Future Architecture

Current prototype uses a single Web App.

Future system will include a **Router Layer**.

Router responsibilities:

• detect phone_number_id  
• map to correct user environment  
• forward message to correct TaskLess instance.

---

# 7. Onboarding Registry

User onboarding data will eventually move to a structured registry.

Candidate systems:

Google Sheets table  
Firebase collection

Registry fields:

• user_id  
• phone_number_id  
• webhook endpoint  
• configuration settings  

Purpose:

Enable multi-tenant TaskLess architecture.

---

# 8. Logging Requirements

All flows must log deterministically.

Logs must capture:

• inbound events  
• AI proposals  
• Boss approvals  
• execution attempts  
• success  
• errors

Silent execution paths are not allowed.

---

# 9. Strategic Direction

TaskLess converts messaging apps into a command-driven communication system.

Key principles:

• Boss remains in control  
• AI prepares work  
• Safety Guard prevents mistakes  
• communication flows through a command layer  

TaskLess sits above communication tools rather than replacing them.

This allows business owners to keep their familiar interfaces
while gaining AI-powered workflow automation.

---

# 10. Lessons Learned

• WhatsApp Coexistence removes reliable message deletion  
• Prevention is better than correction  
• AI draft + Boss approval is the safest workflow  
• Safety Guard significantly reduces reputational risk  
• Logging and learning loops are critical for improvement

