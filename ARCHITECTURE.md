# TaskLess System Architecture

TaskLess is a layered event processing system that connects WhatsApp Cloud API messaging with automation built on Google Sheets and Google Apps Script.

## System Layers
1. **Communication layer:** WhatsApp Business runs in Coexistence mode on the user’s business phone number. Messages stay in sync between the mobile device and the WhatsApp Cloud API, which emits webhooks for new messages and status changes.
2. **Webhook ingestion and routing layer:** Webhook events from the Cloud API are received and routed to the correct client environment. Early on, a single Apps Script endpoint handles routing; later, an edge service (e.g., Cloudflare Workers or similar) may forward events to the right client endpoint.
3. **Client automation environment:** Each client has a Google Sheet (operational ledger and dashboard) and a bound Google Apps Script deployment (execution engine). Incoming webhooks are normalized and recorded; the engine may invoke AI to analyze content and generate proposals or structured actions for Boss approval.

## Outbound Messaging
When the Boss approves a proposal, the automation engine sends messages via the WhatsApp Cloud API using the client’s `phone_number_id`. A routing database will map each `phone_number_id` to the correct client endpoint as the system scales to multiple clients.

## Role of Google Sheets
Google Sheets is both ledger and human-readable control interface. Tabs such as `INBOX`, `CONTACTS`, and `LOG` hold the structured operational data that the system reads and writes.

## Change Discipline
ARCHITECTURE.md documents the structural design of the platform and should be updated only when infrastructure components change significantly.
