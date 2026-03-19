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
- the State Manager keeps `active target`, `parked items`, `local vs deployed vs tested`, and runtime state explicit.
- Reuven should mostly interact with Robin for implementation guidance and with the State Manager for alignment commands such as `checkpoint`, `park this`, and `switch target`.

## 3. Roles

Agent system nicknames are ephemeral, but when a subagent is active in a session, Robin should refer to that subagent in chat using:
- `<system nickname> - Developer`
- `<system nickname> - Tester`
- `<system nickname> - Explorer`
- `<system nickname> - State Manager`

Current example format for this session:
- `<system nickname> - State Manager`

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
- Makes code changes directly unless a helper is explicitly activated
- Returns only distilled summaries, decisions, blockers, and command blocks

### `<system nickname> - State Manager`
- Alignment and state-discipline role
- Does not own feature design or most code changes
- Keeps exactly one `active target` visible at a time
- Maintains:
  - current active target
  - parked items
  - blocked items
  - local vs deployed vs tested state
  - trigger state
  - important runtime settings
  - last verified test
- Produces short checkpoints on demand
- Prevents topic switching from causing state drift
- Helps Robin and Reuven resume cleanly after brainstorming, bugs, or interruptions

## 4. Source-of-Truth Hierarchy

Use the repo as the source of truth, not chat memory.

Primary document roles:
- `PRODUCT.md`: stable product truth
- `OPERATIONAL.md`: behavioral and ledger contract
- `DEV_TASKS.md`: active roadmap, current state, next work
- `AGENT.md`: coding-agent operating rules
- `WORKFLOW.md`: how Reuven, Robin, and the State Manager collaborate

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

The State Manager then records:
- active target
- parked items
- next step

Robin then updates or anchors the task in `DEV_TASKS.md`.

### Step 2: Robin prepares the implementation brief
Robin prepares a bounded brief containing:
- objective
- acceptance criteria
- relevant files
- known constraints
- whether deploy will be needed

### Step 3: Robin implements
Robin:
- inspects the relevant code paths
- edits the necessary files
- keeps changes scoped to the agreed task
- surfaces blockers or design concerns to Reuven only when needed

If brainstorming or a new idea appears mid-task, the State Manager should park it unless Reuven explicitly switches targets.

### Step 4: Verify
Robin and Reuven verify with one real test or deterministic GAS runner.

The State Manager records:
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
- `clasp deploy --deploymentId AKfycbx1p8fg0eFua_9qLJ7tTk0P-cd_zLKxAHnc8KRfyIhgaPtwXANfEZ_QjG3a6pvfVefa --description "<desc>"`

Reason: this repo has had prior deployment friction, so deployment is handed off explicitly instead of being silently executed by an agent.

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

The State Manager should support these short commands in the main thread:
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

Robin and the State Manager should keep handoffs short and structured.

For Reuven:
- current task
- status
- blocker or decision needed
- next action

For the State Manager:
- active target
- parked
- local vs deployed vs tested
- open risks
- next recommended step

## 10. Success Condition

This workflow is working if:
- Reuven mainly talks to Robin and the State Manager
- `DEV_TASKS.md` stays current
- the active target is always clear
- parked items do not get lost
- the main thread stays decision-focused
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
