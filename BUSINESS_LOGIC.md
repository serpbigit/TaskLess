# TaskLess — Business Logic (Canonical Spec)

## 1) Purpose
TaskLess turns WhatsApp messages into **structured tasks**, asks for missing info, gets confirmation, and then **executes deterministically** (email, message, reminders, calendar, etc.) with auditability.

---

## 2) Core Objects

### 2.1 User
- Identified by `userE164`
- Has settings (timezone, defaults, allowed channels)

### 2.2 Task
A unit of work created from one or more user messages.
- Has a lifecycle recorded in the canonical ledger (`INBOX` / `ARCHIVE`) with explicit approval and execution state
- Has an execution plan (proposal/action/result JSON fields)

### 2.3 Execution
A deterministic action run by GAS (send email, send WhatsApp, etc.), optionally scheduled.

---

## 3) Message → Task Flow (Secretary Mode)

### 3.1 Intake
- Inbound message arrives (WhatsApp webhook or manual test insert)
- System dedupes by message id / hash
- System logs raw event to the canonical `LOG` tab

### 3.2 Parse
- Extract intent + entities into a draft object (title, kind, channel, targets)
- Append/update the canonical `INBOX` ledger record (by stable ids and record versions)

### 3.3 Ask / Clarify
- If required fields missing, system asks targeted questions
- Missing fields stored in `missingFieldsJson`
- Each ask/answer updates task state + timestamps

### 3.4 Proposal
- Once enough info, system generates a proposal summary for user approval
- Proposal stored in `proposalJson`
- User can approve / revise / cancel

### 3.5 Confirm → Execute
- If approved, create an `actionJson` snapshot
- Execution is deterministic (no AI at execution-time)
- Result stored in `resultJson`, errors in `lastError`

---

## 4) Scheduling (Planned)

### 4.1 Scheduled Execution
- When user approves an action, allow optional schedule datetime
- If scheduled, task is queued for later execution; GAS sweeper runs periodically

### 4.2 Sweep Strategy (Planned)
- Time-based trigger runs every N minutes (start with 5)
- Finds due items where scheduledAt <= now AND status is “approved/pending_exec”
- Executes idempotently (guard by executionId)

---

## 5) Reminders to Clients (Planned)

### 5.1 REMINDERS sheet concept
- Rows contain: contact reference + template name + AI-prepared JSON payload + schedule rules
- GAS sweeper expands reminders into tasks/executions

---

## 6) Audit & Safety
- Every state change logs to `LOG` with timestamp, component, message, and metadata
- STOP / opt-out should immediately prevent further sends to that user/target

---

## 7) Versioning Rules
- BUSINESS_LOGIC.md is canonical (spec)
- SCHEMA.json is derived from the running sheet export + spec
- Code must not drift: changes are patch → git → push → clasp push

---

## 8) Open Questions
- Exact “task kind” taxonomy (email, WhatsApp, calendar, reminder)
- Where scheduled items live (TASKS vs EXECUTIONS tab)

---

# 9) Secretary Identity & Operating Philosophy (Canonical)

TaskLess operates in **Secretary Mode**.

It is not an autonomous agent.
It does not act independently.
It prepares, suggests, and waits.

### 9.1 Role Definition
TaskLess behaves as a **digital secretary**:

- Reads inbound communication
- Structures it into decision-ready units
- Suggests summaries and replies
- Waits for explicit confirmation
- Executes only when instructed

It does not replace the human decision-maker.
It assists the human decision-maker.

---

## 9.2 Core Execution Invariant
The system must always follow this sequence:

Prepared → Reviewed → Confirmed → Executed → Receipted

Rules:

- Intent does not equal execution.
- Proposal does not equal execution.
- Only explicit confirmation creates an executable snapshot.
- Execution must be deterministic and idempotent.
- Every execution produces a receipt.

No exceptions.

---

## 9.3 Language & UX Terminology
To reinforce the human-controlled model, the system uses secretary-oriented terminology.

Use:
- “Secretary Brief”
- “Suggested Reply”
- “Suggested Action”
- “Awaiting Your Confirmation”
- “Execution Receipt”

Avoid:
- “Auto-sent”
- “AI handled”
- “Autonomous action”
- “Agent executed”

The product tone must reinforce assistance, not autonomy.

---

## 9.4 Decision-Ready Triage Model
TaskLess does not aim to turn every message into an action.

Instead, it turns every inbound thread into a **decision-ready brief** classified as:

- ACTION — requires user response
- WAITING — awaiting someone else
- FYI — informational only
- NOT_MINE — addressed to another person
- SCHEDULE — contains scheduling intent

Only ACTION and SCHEDULE items are eligible for approval and execution.

All others reduce cognitive load by clarifying that no action is required.

---

## 9.5 Cognitive Load Reduction Principle
The system’s primary value is not automation.

It is reduction of:
- Re-reading time
- Context switching
- Decision fatigue
- Missed follow-ups

If the digest increases cognitive friction, it fails.
If the digest reduces mental overhead in under 2 minutes, it succeeds.

---

## 10) A0 Email-First Proof of Concept
Phase A0 validates Secretary Mode using Gmail ingestion only.

### 10.1 Scope
- Pull important emails (initially: `is:important`)
- Normalize threads into structured records
- Generate Secretary Brief (summary + triage class + suggested reply if needed)
- Present digest for human review
- No execution until explicit approval

### 10.2 Objective
Prove that:
- The system correctly distinguishes ACTION vs FYI/NOT_MINE
- The user saves time by not re-reading full threads
- The digest feels like a disciplined human secretary

WhatsApp ingestion and scheduling are out of scope for A0.
