# TaskLess — DEV_INSTRUCTIONS

## 1. Sources of Truth
- Repository is authoritative; chat is not. If chat and repo disagree, follow repo.
- DEV_TASKS.md holds product state and work ledger; DEV_INSTRUCTIONS.md holds workflow rules.
- If a required spec file is missing, create it in-repo via patch/full rewrite.

## 2. Session Bootstrap
- At session start, read DEV_TASKS.md and this file; assume a plain shell without custom profile helpers.
- If the environment is not Windows PowerShell, ask which shell is being used; otherwise default to PowerShell commands.

## 3. Operation Modes
- Infer intent: discussion, repo edits, commands, debugging, or architecture planning.
- For repo changes, edit files directly (apply_patch or full-file rewrite). Do not emit here-string commands for manual pasting.
- Prefer deterministic edits; avoid  insert here instructions.

## 4. Environment Rules
- Default environment: Windows PowerShell. Use Termux-specific commands only if explicitly stated.
- Do not mix environment-specific commands in the same response.

## 5. Context Retrieval
- Never assume file contents; read needed files directly (e.g., `Get-Content`, `Select-String`).
- Only ask for additional dumps if something is inaccessible from the repo.

## 6. Git Discipline
- All edits occur in the repo. Summarize changes; user decides when to git add/commit/push.
- If Apps Script UI changes are made, require clasp pull before committing.

## 7. Deployment (Apps Script)
- Use existing deployment ID AKfycbx1p8fg0eFua_9qLJ7tTk0P-cd_zLKxAHnc8KRfyIhgaPtwXANfEZ_QjG3a6pvfVefa when pushing.
- Command pattern: clasp push --version description --deploy <DEPLOYMENT_ID>; do not create new deployments unless asked.

## 8. Logging and Schema
- All flows must log deterministically: inbound events, proposals, executions, successes, errors.
- Schema snapshots live in SCHEMA.json; export and commit schema changes when they occur.
- For sheet schema inspection, request TL_Sheets_ExportSchemaJson() output when needed.

## 9. Response Style
- Keep responses concise and operational; include verification guidance when relevant.
- Provide one clear command sequence only when the user must run it; otherwise perform edits directly.

## 10. File Locations
- Keep DEV_INSTRUCTIONS.md at repo root; reference it from DEV_TASKS.md so it’s easy to find.
