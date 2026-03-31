# DealWise (formerly TaskLess)

DealWise is a person-centric communication and CRM system built on Google Apps Script (GAS), designed to help business owners close deals faster through AI-assisted communication and automated CRM management.

## Project Overview

- **Core Mission:** An AI secretary that handles inbound messages, groups interactions, enriches CRM data, and drafts replies for the "boss."
- **Main Technologies:** Google Apps Script, Google Sheets (as a database), OpenAI/Gemini (via `TL_AI.gs`), WhatsApp (via Meta Webhooks), and Gmail.
- **Product Truth:** [DEALWISE_PRODUCT.md](DEALWISE_PRODUCT.md) is the canonical definition of the system's behavior and goals.

## Architecture

The system follows a Research -> Strategy -> Execution cycle for processing communication:
1. **Inbound:** Messages arrive via WhatsApp or Gmail.
2. **Grouping:** Interactions are grouped into meaningful units (bursts/threads).
3. **Enrichment:** CRM state in the `CONTACTS` tab is updated based on communication signals.
4. **Decision:** The system decides if a reply is needed and drafts one if necessary.
5. **Review:** The "boss" reviews drafts in the "Easy Replies" flow.
6. **Execution:** Approved actions are written back to the CRM and communication channels.

### Data Model (Google Sheets)
- `SETTINGS`: Global configuration.
- `CONTACTS`: Snapshot of CRM state (identity, memory, deal stage).
- `ACTIVITY`: Append-only ledger of all communication and system actions.
- `LOG`: Diagnostic logs.
- `AI_Cost_Tracker`: Tracks AI token usage and costs.

## Development Workflow

This project uses `clasp` for managing the Google Apps Script project.

### Key Commands

- **Sync Code:** `.\scripts\clasp.ps1 push` (pushes local code to GAS).
- **Deploy:** `.\scripts\clasp.ps1 deploy --deploymentId <ID> --description "<message>"`
- **Run Tests:** `.\scripts\run-gas-test.ps1 <TestFunctionName>`

### Scripts
- `scripts/clasp.ps1`: Local wrapper for `clasp`.
- `scripts/run-gas-test.ps1`: Executes a specific Apps Script function (usually a test) via `clasp run`.
- `scripts/dump-files.ps1`: Generates a single text snapshot of the repository.

## Development Conventions

- **File Naming:** Files use the `TL_` prefix (legacy from TaskLess). Functions also follow this naming convention.
- **Testing:** New features should include a corresponding `TL_Test*.gs` file with a `RunAll` function (e.g., `TL_TestContacts_RunAll`).
- **AI Usage:** AI should be used for summarization, enrichment, and drafting, but should never be asked for facts already available in the Sheets database.
- **Safety:** Outbound sends are blocked by default unless explicitly re-enabled in the send path.

## Key Files

- [DEALWISE_PRODUCT.md](DEALWISE_PRODUCT.md): Canonical product contract.
- [DEALWISE_ARCHITECTURE.md](DEALWISE_ARCHITECTURE.md): Implementation guidelines and migration targets.
- [appsscript.json](appsscript.json): Manifest file with OAuth scopes and dependencies.
- [TL_Orchestrator.gs](TL_Orchestrator.gs): Core logic for message processing and state management.
- [TL_AI.gs](TL_AI.gs): Integration with AI models.
- [TL_Contacts.gs](TL_Contacts.gs): CRM management logic.
