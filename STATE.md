# TaskLess — Project State (Source of Truth)

## 1) Rule: Source of Truth
This file is the persisted handoff for the next session.
If chat and this file conflict, this file wins.

## 2) Active Target
TaskLess is now in the **WhatsApp-native review and cross-channel context hardening phase**.

Current focus:
- tighten Boss-facing review UX so approvals/drafts feel clear and trustworthy in WhatsApp
- keep `INBOX` as the canonical operational ledger across WhatsApp and email
- preserve lightweight always-on preparation while reserving deeper context assembly for draft/review sessions
- prepare the system for the next architectural step: `TOPICS`

## 3) Current Working Mode
- Single-lane implementation
- WhatsApp-first Boss operating model
- Use `checkpoint`, `park this`, `switch target to ...`, `what is local vs deployed vs tested`, and `session handoff`

## 4) Current Product/Runtime Model

### Canonical tabs
- `INBOX`
- `ARCHIVE`
- `CONTACTS`
- `CONTACT_ENRICHMENTS`
- `TOPICS`
- `SETTINGS`
- `LOG`
- `AI_Cost_Tracker`

### Canonical rule
TaskLess thinks all the time, but speaks only when spoken to.

### Current preparation model
1. **Initial ingestion / lightweight prep**
   - all incoming WhatsApp and email records get normalized into `INBOX`
   - each record gets a lightweight first-pass scan:
     - `ai_summary`
     - `ai_proposal`
     - `priority_level`
     - `importance_level`
     - `urgency_flag`
     - `needs_owner_now`
     - `suggested_action`
   - this pass should stay cheap and mostly local to the record itself

2. **Draft/review context assembly**
   - only when preparing a real draft/recommendation does the system hydrate deeper context
   - current context sources:
     - last 5 `CONTACT_ENRICHMENTS`
     - last 5 TaskLess emails
     - last 5 TaskLess WhatsApps
     - Gmail sender-history fallback for email where useful

### Language model
- `AI_DEFAULT_LANGUAGE` now means **Boss-facing UI language**:
  - menus
  - summaries
  - approvals
  - explanations
- `REPLY_LANGUAGE_POLICY` controls recipient-facing draft language:
  - default: `match_incoming`
  - alternate: `boss_language`
- current intended behavior:
  - Boss sees UI in Boss language
  - draft replies should follow the incoming message language by default

## 5) Local vs Deployed vs Tested

### Local
- No known uncommitted product code at handoff.
- Docs need to remain aligned with runtime behavior after this state refresh.

### Deployed / Live
Latest deployed version:
- `@128` — `reply-language-and-digest-tightening`

Recent important deployed versions:
- `@121` approval summary cleanup + email ledger improvements
- `@122` open first approval item
- `@123` packet intent bypass
- `@124` approval preview metadata
- `@125` approval digest + exact actions
- `@126` hardened AI JSON contracts
- `@127` tightened Boss menu router (`menu_target`)
- `@128` reply language split + cleaner digest copy

### Verified in runtime
- WhatsApp webhook ingest is live
- Boss menu / free-form Boss intent routing is live
- Boss packet interception bug is fixed
- contact sync from Google Contacts works with `both_only` import strategy
- `CONTACT_ENRICHMENTS` manual flow exists and appends approved memory rows
- email poller works against `Important` mail in the correct Gmail account
- email rows are being written into `INBOX`
- email triage uses contact + enrichment + recent-history context
- Boss free-form request `יש משהו שמחכה לאישור שלי` surfaces approval items
- one-by-one review flow for approvals is live

### Verified but still imperfect
- approval card UX is much better, but still needs visual/content polish
- email lifecycle is in `INBOX`, but review card clarity can still improve
- Boss digest works, but still needs refinement before it feels final

## 6) What Shipped In This Phase

### Contacts / CRM memory
- `CONTACTS` schema extended with normalized/source sync fields
- Google Contacts manual sync implemented
- default contact sync mode is `both_only`
- normalized phone/email matching improved
- contact resolution now supports better cross-channel linking

### Contact enrichments
- `CONTACT_ENRICHMENTS` exists as append-only CRM memory
- manual Boss flow `העשר איש קשר` implemented
- approved enrichment appends a structured row
- enrichments are now fed into draft context

### Session/context layer
- first session surfaces exist:
  - `מה על הצלחת שלי עכשיו`
  - `מה צריך תשומת לב`
  - `ממתין לאישורים`
  - `הצע לי צעדים הבאים`
- session grouping now uses prepared records and contact-aware evidence

### Email
- important-email poller implemented
- email ingestion moved into `INBOX`
- email triage now writes approval data into `INBOX`
- email sender history lookup from Gmail exists
- approval/send path for email exists

### Approval UX
- one-by-one review works in WhatsApp
- sender/channel/subject/snippet are shown
- exact proposed action/draft is shown instead of only a paraphrase
- action labels are more explicit than generic `אשר`
- stale decision packets no longer hijack fresh Boss requests

### Prompt contracts
- incoming triage prompts hardened with explicit schema semantics and examples
- Boss intent router hardened with explicit schema semantics and examples
- menu routing now uses `menu_target`

## 7) Open Risks / Gaps
- approval card wording still needs one more polish pass so the hierarchy feels obvious:
  - metadata
  - raw snippet
  - AI interpretation
  - exact draft/action
  - options
- one-by-one action numbering/labels are better, but still not fully “muscle-memory perfect”
- draft context quality will improve naturally as `INBOX` history accumulates
- topic system is not yet redesigned or wired into the prep/draft loop
- WhatsApp old-history fallback is still limited compared with Gmail history lookup

## 8) Parked
- full topic catalog redesign and similar-case retrieval
- calendar hardening
- deeper sender classification / noise suppression tuning
- richer WhatsApp historical fallback beyond TaskLess-owned ledger history
- final visual/content polish of review cards

## 9) Next Recommended Step
Before `TOPICS`, the next best product step is:

1. **Context hydration for top surfaced items**
   - for the few items actually shown in a Boss session, hydrate richer context:
     - last 5 enrichments
     - last 5 local emails
     - last 5 local WhatsApps
     - Gmail fallback if local history is thin

2. Then move to **TOPICS**:
   - redesign `TOPICS` as a reusable cross-client topic catalog
   - keep topic assignment lightweight at ingestion
   - use topics heavily only during draft/review context assembly

## 10) Canonical Schema Note
- canonical schema artifact: `SCHEMA.json`
- schema setup entrypoint: `TL_EnsureSchema()`

## 11) Session Resume Hint
Best opening prompt next time:
- `checkpoint`
or:
- `what is local vs deployed vs tested`
