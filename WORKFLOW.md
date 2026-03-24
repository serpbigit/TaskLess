# TaskLess Joint Workflow

This document defines how Reuven and the AI agents collaborate on TaskLess work without creating context rot.

If this document conflicts with generic process notes elsewhere, use `WORKFLOW.md` for active human-agent collaboration sessions.

## 1. Purpose

The goal of this workflow is to keep the main thread focused on:
- roadmap decisions
- current feature scope
- blockers that need Reuven's judgment
- final command handoffs

Implementation noise, test chatter, raw logs, and exploratory work should stay off the main thread whenever possible.

## 2. Core Principle: Prevent Context Rot

The main thread should contain decisions and summaries, not raw intermediate work.

Rules:
- `DEV_TASKS.md` is the active roadmap and sprint focus file.
- Robin summarizes; Robin does not dump raw subagent output into the main thread.
- Robin keeps `active target`, parked items, and `local vs deployed vs tested` explicit in the main thread and `DEV_TASKS.md`.
- The Developer should surface blockers, design ambiguity, or schema risk early instead of burning long stretches of time silently when a short architectural correction would help.
- Reuven should mostly interact with Robin in the main thread; the Developer works through Robin unless a direct handoff is explicitly needed.

## 3. Roles

Agent system nicknames are ephemeral, but when a subagent is active in a session, Robin should refer to that subagent in chat using:
- `<system nickname> - Developer`
- `<system nickname> - Explorer`

Current example format for this session:
- `<system nickname> - Developer`

This keeps the visible chat label simple while still exposing the current temporary system nickname and the job being performed.

### Reuven
- Product owner and final decision-maker
- Chooses priorities and approves direction changes
- Runs manual PowerShell deploy commands when Robin says a change is ready

### Robin
- Main coordinator
- Owns implementation guidance and technical direction with Reuven
- Uses `DEV_TASKS.md` to keep current work focused
- Breaks work into bounded tasks
- Makes code changes directly unless a Developer helper is explicitly activated
- Returns only distilled summaries, decisions, blockers, and command blocks
- Reviews Developer output before treating work as complete

### `<system nickname> - Developer`
- Bounded implementation role activated by Robin
- Owns a clearly scoped slice of work and should not widen scope on its own
- Must surface blockers, design ambiguity, missing schema decisions, or conflicting interpretations quickly
- Should prefer asking for clarification through Robin over silently making architectural guesses when the design impact is meaningful
- Must finish implementation with at least one quick deterministic test or smoke check before handing work back
- Must report:
  - files changed
  - what was implemented
  - what was tested
  - what remains risky or unproven

## 4. Source-of-Truth Hierarchy

Use the repo as the source of truth, not chat memory.

Primary document roles:
- `PRODUCT.md`: stable product truth
- `OPERATIONAL.md`: behavioral and ledger contract
- `DEV_TASKS.md`: active roadmap, current state, next work
- `AGENT.md`: coding-agent operating rules
- `WORKFLOW.md`: how Reuven, Robin, and the State Manager collaborate

## 4.1. File Naming Discipline

This repo can temporarily contain both TaskLess core work and Automatziot.com business-facing/demo work while the same coexist phone is being used for POC and potential-client exposure.

Naming rule:
- `TL_*.gs` = TaskLess core
- `Onboarding_*.gs` = onboarding/setup-critical modules
- `Helper_*.gs` = diagnostics and troubleshooting helpers
- `Auto_*.gs` = Automatziot.com-facing business/demo modules

When files are moved between these lanes, Robin should keep the prefixes aligned so the repo does not drift into ambiguous mixed-purpose naming.

## 5. Standard Delivery Flow

This flow is single-lane by default.

That means:
- one active implementation target at a time
- brainstorming may happen, but non-active ideas should be parked
- deployment and verification happen before widening scope

The flow becomes broader only when:
- Robin explicitly activates another helper for bounded work
- a real blocker requires separate investigation
- deployment or final signoff is needed
### Step 1: Decide the next feature
Reuven and Robin discuss:
- what feature or fix is next
- why it matters now
- what is explicitly out of scope
- what counts as done

Robin then records:
- active target
- parked items
- next step

Robin updates or anchors the task in `DEV_TASKS.md`.

### Step 2: Robin prepares the implementation brief
Robin prepares a bounded brief containing:
- objective
- acceptance criteria
- relevant files
- known constraints
- whether deploy will be needed

### Step 3: Robin or the Developer implements
- Robin may implement directly or activate a bounded Developer helper.
- The implementer must keep changes scoped to the agreed task.
- If a blocker or architecture ambiguity appears, it should be surfaced quickly rather than hidden inside a long silent implementation attempt.
- If brainstorming or a new idea appears mid-task, Robin should park it unless Reuven explicitly switches targets.

### Step 4: Verify
The implementer runs at least one quick deterministic test, smoke check, or other narrow verification before calling the task complete.
Robin and Reuven then verify with one real test or deterministic GAS runner when needed.

Robin records:
- what is deployed
- what exact test ran
- what is now proven
- what is still unproven

### Step 5: Robin decides the next move
Robin integrates implementation and test results, then chooses one of:
- send back for fixes
- ask Reuven a specific decision question
- mark ready for deployment

### Step 6: Manual deploy handoff
When ready, Robin gives Reuven the exact PowerShell block for:
- `clasp push`
- `clasp deploy --deploymentId AKfycbzIq0DUr6h8zXelBVn_mXHR7k0DIg97AL5jvLfyIZrFhEotITNkDpbviGXW8xpr9wo --description "<desc>"`

Reason: this repo has had prior deployment friction, so deployment is handed off explicitly instead of being silently executed by an agent.

Current personal runtime IDs:
- Script ID: `1FlH23KHoQkKhLuKC-4k9bViZQcslXFe6LRnDcUQ_faIZpQdmAXjc1AXm`
- Deployment ID: `AKfycbzIq0DUr6h8zXelBVn_mXHR7k0DIg97AL5jvLfyIZrFhEotITNkDpbviGXW8xpr9wo`

### Step 7: Post-deploy verification
After Reuven confirms the deploy and the live change behaves correctly, Robin gives the final git command block for:
- `git add -A`
- `git commit -m "<descriptive message>"`
- `git push`

## 6. Command Handoff Rules

Robin is the only agent that should present final command blocks to Reuven.

Rules:
- Command blocks should be copy-paste ready.
- Deploy blocks must always use the fixed deployment ID.
- Git commit messages should mention the feature/fix and, when useful, the successful validation that concluded the task.
- Prefer giving one chained command when practical so Reuven can paste once.

## 7. DEV_TASKS Discipline

`DEV_TASKS.md` should stay focused on durable project state, not chatter.

Use it for:
- current phase
- current next feature
- accepted architectural direction
- known gaps
- verified milestones

Do not use it for:
- raw terminal output
- long debugging transcripts
- repeated back-and-forth notes

## 8. State Commands

Robin should support these short commands in the main thread:
- `checkpoint`
- `park this`
- `switch target to ...`
- `what is local vs deployed vs tested`
- `session handoff`

Expected behavior:
- `checkpoint`
  - returns active target, current state, tested, not yet proven, parked, next step
- `park this`
  - records the current idea outside the active lane without switching scope
- `switch target to ...`
  - creates a checkpoint first, then changes the active target
- `what is local vs deployed vs tested`
  - answers exactly that, without roadmap filler
- `session handoff`
  - records the clean stopping state for the next session

## 9. Handoff Format

Robin and the Developer should keep handoffs short and structured.

For Reuven:
- current task
- status
- blocker or decision needed
- next action

For Robin:
- active target
- parked
- local vs deployed vs tested
- open risks
- next recommended step

For the Developer:
- files changed
- what was implemented
- quick test or smoke check that was run
- blocker, open risk, or ambiguity that should be surfaced now

## 10. Success Condition

This workflow is working if:
- Reuven mainly talks to Robin in the main thread
- Robin uses Developers as bounded helpers when useful
- `DEV_TASKS.md` stays current
- the active target is always clear
- parked items do not get lost
- the main thread stays decision-focused
- blockers are surfaced early instead of buried in long silent implementation attempts
- each bounded implementation closes with a quick verification step
- deployment and git handoffs are explicit and reproducible

## 11. Testing Standard For New Workers And Channels

Every new channel, worker, or orchestration step must include a deterministic Google Apps Script test runner so Tommy can validate it with minimal manual effort.

Rules:
- Do not treat ad hoc manual clicking as the primary test strategy for new work.
- New worker/channel development should include at least one explicit GAS-callable test function or smoke runner.
- Test runners should be narrow, repeatable, and safe to execute more than once when possible.
- Test runners should prefer writing structured evidence into the ledger, log, or clearly inspectable rows rather than relying on vague console output.
- Tommy should be able to validate behavior from test-run outputs, ledger changes, and explicit pass/fail conditions even when direct external account access is limited.

Examples:
- `TL_TestWebhook_LateStatusRepairSuite()`
- `TL_TestWebhook_OutgoingMissingRecipientWriteSuite()`
- future email-sidecar runners such as `TL_Email_TestPullImportant()` or `TL_Email_TestBuildReplyProposal()`

Definition of done for new channels/workers includes:
- implementation
- deterministic GAS test runner
- clear tester handoff describing expected evidence and failure conditions
