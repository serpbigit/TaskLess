# DEALWISE LEDGER

**Last Updated: 2026-04-01 10:00 (Initiated Safe Outbound Send Rebuild)**

This is the single source of truth for our progress, past and future.
Product definitions: [DEALWISE_PRODUCT.md](DEALWISE_PRODUCT.md).
Engineering standards: [GEMINI.md](GEMINI.md).

### Canonical Deployment (Business-Owned)

This deployment is the canonical business-owned deployment and should be used for:
- Meta callback / coexist onboarding endpoint
- curl webhook tests
- future clasp deploy updates

- **Deployment ID:** AKfycbwGCWtG_3bsLz0bRiQoBr_29tf4I9E3EvaKHuHAdgHx8hjeKpJ7im_Ta_9lJ39MbzBh
- **Web app URL:** https://script.google.com/macros/s/AKfycbwGCWtG_3bsLz0bRiQoBr_29tf4I9E3EvaKHuHAdgHx8hjeKpJ7im_Ta_9lJ39MbzBh/exec
- **Current stable version:** 4

Note: `clasp deployments` may not show the web app URL, so the repository should treat the above URL as canonical unless explicitly replaced.

---

## [DONE] STEP 6 — SAFE OUTBOUND SEND REBUILD
- **Completed At:** 2026-04-02 10:30
- **Goal:** Re-enable outbound message sending for approved drafts in a safe, controlled manner.
- **Task:** Implemented new "safe send" function that verifies approval status and logs the send action before executing it.

---

## FUTURE INFRASTRUCTURE NOTES
Meta's current app-use-case Callback URL is pointing directly to the GAS web app endpoint.
Future target architecture: replace the direct GAS callback with a Cloudflare routing endpoint that receives the Meta webhook once, identifies the target tenant by phone_number_id / phone id, and forwards the request to the correct user-specific GAS endpoint.

---

## [DONE] RECENT HISTORY
- **2026-04-01:** [STEP 5] Refined the AI prompt in `TL_AI.gs` to better evaluate conversation momentum based on interaction history.
- **2026-03-31:** Initialized `GEMINI.md` for AI repository context.
- **2026-03-31:** Aligned Roadmap with "Sequential Build" strategy (Inbox -> Context -> AI).
- **2026-03-31:** Renamed Roadmap to `DEALWISE_LEDGER.md` for persistent task tracking.
- **2026-03-31:** [STEP 1] Upgraded `TL_DraftContext.gs` with "4-Hour / 3-Interaction" burst grouping.
- **2026-03-31:** [STEP 2] Implemented Retroactive Manual Reply Suppression in `TL_Orchestrator.gs`.
- **2026-03-31:** [STEP 3] Major UI Refactor: Sequential "1/X" Queue and **C/E/L** Shortcuts in `TL_Menu_Handler.gs`.