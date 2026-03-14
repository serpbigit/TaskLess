# TaskLess — DEV_TASKS

---

# 1. TaskLess Value Proposition (Canonical Business Logic)

TaskLess is a living CRM that works for the user instead of the user working for the CRM.

Traditional CRMs require the user to manually log activities, follow up with clients, and maintain records.

TaskLess reverses this model.

Instead of the user feeding the CRM, the CRM feeds itself by observing the user's communication channels.

## Core Concept

All incoming communication channels are automatically ingested into the backend using Google Apps Script and integrations.

Examples include:

- WhatsApp messages
- Emails
- Calendar events
- Future channels (SMS, Slack, etc.)

These events are continuously captured and stored in structured form.

## AI Secretary

TaskLess includes an AI layer that acts as the user's AI secretary.

The AI continuously monitors the user's activity streams and gathers context.

Using this context the AI can:

- summarize conversations
- track ongoing interactions
- suggest follow-ups
- draft responses

The AI produces draft actions, not automatic actions.

Example flow:

User receives a client message.

AI reads conversation context and proposes:

Option 1 — Reply confirming the meeting tomorrow.

Option 2 — Ask the client if they prefer Monday instead.

Option 3 — Send invoice reminder.

The user simply selects an option.

The backend then executes the action through the relevant channel.

## Execution Model

TaskLess separates:

Thinking → AI  
Execution → deterministic backend systems.

When the user approves an AI suggestion:

- TaskLess executes the action through integrations
- WhatsApp messages
- Emails
- Calendar updates
- CRM updates

The user does not manually operate the CRM.

The CRM evolves automatically from real activity.

## Living CRM

Because all interactions are ingested automatically, the CRM becomes a living representation of the user's business relationships.

Contacts, conversations, and actions evolve organically without manual logging.

This creates:

- automatic client history
- automatic reminders
- automatic relationship tracking
- automatic follow-up suggestions

## Extensibility

TaskLess can also run additional automation logic such as:

- custom reminders from Google Sheets
- subscription renewals
- scheduled notifications
- task pipelines
- external system triggers

However the core differentiator remains the AI-driven living CRM.

---

# 2. Task Ledger

Below is the ongoing development task ledger.

---

## P0 — Extend existing Hyp success flow to complete CMS renewal (Saturday target)

- [ ] Confirm and preserve the existing success callback route
  - Existing live route is GET /exec?action=hyp.success
  - Keep current behavior:
    - accept Hyp redirect payload
    - perform server-side APISign VERIFY
    - append callback log row
    - return the Hebrew success HTML page

- [ ] Extend the existing hyp.success handler with CMS renewal write-back
  - After successful VERIFY, continue the flow by updating CMS for the paid renewal
  - Do not replace the endpoint; enhance the current handler in src/http/hyp.success.ts
  - Keep user-facing success page behavior intact even if CMS write-back fails
  - Log CMS result clearly for follow-up

- [ ] Implement CMS payEnd update action using the proven Postman request shape
  - Add service method: cms.updateVehiclePayEnd(vehIdno, payEnd, status=3)
  - Match the working payload/keys from the successful Postman POC
  - Include required auth/session key exactly as used in the successful request
  - Send:
    - ehIdno
    - status=3
    - payEnd=YYYY-MM-DD HH:mm:ss
  - Log request payload shape and response code/body without exposing secrets

- [ ] Add a dedicated test endpoint for the CMS write path
  - Add HTTP action: /exec?action=cms.updatePayEndTest&vehIdno=...&payEnd=YYYY-MM-DD%20HH:mm:ss
  - Use it to confirm the repo can reproduce the successful Postman update from GAS
  - Return JSON with request summary + CMS response summary

- [ ] Resolve payment callback -> exact renewal rows
  - Confirm whether current Order value is sufficient to map the callback deterministically
  - Current fast option:
    - parse phone from Order
    - update eligible LINK_SENT rows for that phone
  - Preferred clean option:
    - store orderId on the rows when generating the payment link
    - update only rows tied to that exact orderId
  - Decide and implement the safest mapping path

- [ ] Resolve row/plate -> CMS ehIdno
  - Prefer a sheet column if already available or easy to add
  - Otherwise build a lookup from CMS vehicles data
  - Log per-plate mapping success/failure

- [ ] Compute the correct new subscription end date
  - Extend back-to-back from current subscription end
  - 
ewPayEnd = oldExpDate + 1 year
  - Preserve end-of-day time 23:59:59 where applicable
  - Use the exact datetime format CMS expects

- [ ] Add idempotency guard to prevent double-renewal
  - Store processed payment/order IDs in a durable place
  - If the same verified callback arrives again, no-op the renewal write
  - Still return success HTML to the payer

## P1 — Ops hardening

- [ ] Payments log tab (ts, orderId, phone, plates, vehIdnos, verify result, CMS results)
- [ ] Retry/backoff for CMS update (bounded, per vehicle)
- [ ] Owner notification on CMS renewal failure
- [ ] Optional: persist orderId on rows at payment-link generation time

## Done / close criteria

- [ ] Existing hyp.success endpoint remains the active callback route
- [ ] GAS test endpoint successfully reproduces the CMS Postman payEnd update
- [ ] Verified payment success callback updates the correct CMS vehicle subscription(s)
- [ ] Repeated callback for the same order does not extend twice
- [ ] Success page still returns to the payer regardless of CMS write outcome
