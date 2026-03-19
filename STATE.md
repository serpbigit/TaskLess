# TaskLess — Project State (Source of Truth)

## 1) Rule: Source of Truth
This file is the persisted handoff for the next session.
If chat and this file conflict, this file wins.

## 2) Active Target
Reminder flow hardening.

Current focus:
- remove duplicate AI intent calls for Boss voice reminders
- show a resolved due preview in the approval card
- confirm reminder scheduling and reminder firing end to end

## 3) Current Working Mode
- Single-lane implementation
- Reuven + Robin + State Manager operating model
- Use `checkpoint`, `park this`, `switch target to ...`, `what is local vs deployed vs tested`, and `session handoff`

## 4) Local vs Deployed vs Tested

### Local Changes Present
- [TL_Webhook.gs](C:/dev/gas/TaskLess/TL_Webhook.gs)
- [TL_Orchestrator.gs](C:/dev/gas/TaskLess/TL_Orchestrator.gs)
- [TL_Menu_Handler.gs](C:/dev/gas/TaskLess/TL_Menu_Handler.gs)
- [TL_AI.gs](C:/dev/gas/TaskLess/TL_AI.gs)
- [TL_SchemaSetup.gs](C:/dev/gas/TaskLess/TL_SchemaSetup.gs)
- [TL_Util.gs](C:/dev/gas/TaskLess/TL_Util.gs)
- [WORKFLOW.md](C:/dev/gas/TaskLess/WORKFLOW.md)

### What Those Local Changes Include
- shared inbox helper:
  - `TL_INBOX`
  - `TL_colIndex_()`
- menu/webhook fix so menu code no longer depends on `TLW_colIndex_()` being globally reachable from the webhook file
- Gemini 2.5 Flash cost tracking to:
  - `AI_Cost_Tracker`
- `עלות` month-to-date AI spend reply
- natural AI-cost intent routing
- voice intent dedupe in the Boss voice path
- reminder approval card due preview:
  - `יעד: dd/MM HH:mm (...)`
- reminder due freeze based on the original capture timestamp
- workflow update to formalize the State Manager role

### Deployed / Previously Live
- kill switch / safe restore controls
- emergency stop entrypoint
- earlier reminder / menu / capture flow improvements

### Not Yet Confirmed Deployed In This Session
- shared inbox helper fix
- AI cost tracker tab + `עלות` reply
- voice intent dedupe patch
- reminder due preview patch
- latest workflow/state-discipline docs

## 5) Last Verified Runtime Facts
- Boss voice reminder reaches transcription and approval flow
- single-item approval flow works
- `AI_Cost_Tracker` is receiving rows
- duplicated token rows strongly suggested duplicated voice intent recognition before the latest dedupe patch

## 6) Not Yet Proven
- latest voice-intent dedupe patch after deploy
- latest reminder due-preview patch after deploy
- month-to-date `עלות` reply after deploy
- fired reminder WhatsApp send after the newest reminder patch

## 7) Open Risks
- reminder fire stage still needs one clean live proof after the latest patch set
- due preview and actual fired reminder time still need confirmation as matching
- deployed GAS state may lag local code if the current batch is not pushed before the next session

## 8) Parked
- calendar end-to-end hardening
- email hardening
- WhatsApp emergency kill phrase
- broader circuit-breaker / anti-loop layer
- additional product/vision refinements outside current execution work

## 9) Next Recommended Step
First step next session:
1. deploy the current local batch
2. run `TL_EnsureSchema()`
3. test one fresh 5–6 minute reminder
4. verify:
   - approval card shows `יעד:` with actual time
   - only one intent-classification AI cost row appears
   - reminder fires as a WhatsApp message at due time
   - `עלות` returns month-to-date spend

## 10) Canonical Schema Note
- canonical schema artifact: `SCHEMA.json`
- schema setup entrypoint: `TL_EnsureSchema()`

## 11) Session Resume Hint
Best opening prompt next time:
- `checkpoint`
or:
- `what is local vs deployed vs tested`

