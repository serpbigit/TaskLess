# TL Markers

Allowed markers (machine-only):
- [TL:TRIGGER:VOICE]
- [TL:TRIGGER:TEXT]
- [TL:CMD:APPROVE:<REF>]
- [TL:CMD:CANCEL:<REF>]
- [TL:CMD:EDIT:<REF>]

Rules:
1) Only inbound messages containing [TL:TRIGGER:*] or [TL:CMD:*] are actionable.
2) The system must never output [TL:TRIGGER:*] or [TL:CMD:*] in normal user-facing responses.
3) Always log: ref_id, message_id, from, type, parsed_text, action_taken, result.

