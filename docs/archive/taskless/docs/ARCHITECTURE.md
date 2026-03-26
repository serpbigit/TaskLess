# Architecture (v0)

Components:
- WhatsApp Cloud API Webhook → Google Apps Script Web App
- Parser → Plan Builder → Approve/Cancel Commands
- Google Workspace Executors (Gmail/Calendar/Sheets)

Rules:
- Only messages containing deterministic markers trigger actions (future).
- Outbound assistant text must never contain trigger markers.
- Store idempotency keys (message_id) to prevent double-processing.
- Always log raw webhook payload for audit/debug.

Current scope:
- Receive webhook (GET verify + POST events)
- Append to WEBHOOK_LOG sheet (idempotent by message_id)
- Provide COEX_checkPhoneNumberState() helper to query Graph phone health/state

