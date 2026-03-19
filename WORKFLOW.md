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
- David reports implementation status to Robin, not as a running stream to Reuven.
- Tommy reports test outcomes to Robin in pass/fail form with concrete issues only.
- Reuven should mostly interact with Robin for prioritization, approval, and final execution handoff.

## 3. Roles

Agent system nicknames are ephemeral, but when a subagent is active in a session, Robin should refer to that subagent in chat using:
- `<system nickname> - Developer`
- `<system nickname> - Tester`
- `<system nickname> - Explorer`

Current example format for this session:
- `Boole - Developer`
- `Lovelace - Tester`

This keeps the visible chat label simple while still exposing the current temporary system nickname and the job being performed.

### Reuven
- Product owner and final decision-maker
- Chooses priorities and approves direction changes
- Runs manual PowerShell deploy commands when Robin says a change is ready

### Robin
- Main coordinator
- Owns roadmap discussion with Reuven
- Uses `DEV_TASKS.md` to keep current work focused
- Breaks work into bounded tasks
- Delegates to David and Tommy
- Returns only distilled summaries, decisions, blockers, and command blocks

### David
- Implementation agent
- Reads relevant code and spec before editing
- Makes the code changes
- Reports blockers, assumptions, and technical risks to Robin
- Tells Tommy when a change is ready for validation and what to verify
- Prepares deploy and git command blocks for Robin to present to Reuven

### Tommy
- Testing agent
- Validates the change after David says it is ready
- Checks behavior, regressions, and acceptance criteria
- Reports only test results, failures, evidence, and gaps to Robin
- Does not become the roadmap owner
- May clarify test scope with David, but final reporting still goes to Robin

## 4. Source-of-Truth Hierarchy

Use the repo as the source of truth, not chat memory.

Primary document roles:
- `PRODUCT.md`: stable product truth
- `OPERATIONAL.md`: behavioral and ledger contract
- `DEV_TASKS.md`: active roadmap, current state, next work
- `AGENT.md`: coding-agent operating rules
- `WORKFLOW.md`: how Reuven, Robin, David, and Tommy collaborate

## 5. Standard Delivery Flow

This flow is parallel by default, not fully synchronous.

That means:
- Reuven and Robin may continue roadmap discussion while David is implementing a bounded task.
- Tommy may begin validation as soon as David declares a testable build or change set.
- Robin only interrupts the roadmap thread when a real blocker, product decision, or ready-for-deploy result needs attention.

The flow becomes synchronous only when:
- David needs a product or architecture decision
- Tommy finds a result that requires Reuven's judgment
- deployment or final signoff is needed
### Step 1: Decide the next feature
Reuven and Robin discuss:
- what feature or fix is next
- why it matters now
- what is explicitly out of scope
- what counts as done

Robin then updates or anchors the task in `DEV_TASKS.md`.

### Step 2: Robin prepares the implementation brief
Robin sends David a bounded brief containing:
- objective
- acceptance criteria
- relevant files
- known constraints
- whether deploy will be needed

### Step 3: David implements
David:
- inspects the relevant code paths
- edits the necessary files
- keeps changes scoped to the agreed task
- reports blockers or design concerns back to Robin

If David discovers a roadmap-level issue, Robin brings that back to Reuven as a decision, not as raw noise.

### Step 4: Tommy validates
When David says the change is ready, Tommy validates:
- intended behavior
- regression risk
- manual harnesses or smoke checks
- any unresolved gaps

Tommy returns a short result to Robin:
- passed
- failed
- uncertain
- needs Reuven decision

David may initiate the testing handoff directly by telling Tommy what changed and what is ready for validation, but Tommy's results still roll up to Robin.

### Step 5: Robin decides the next move
Robin integrates David's implementation summary and Tommy's test result, then chooses one of:
- send back to David for fixes
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
- David may prepare command blocks, but Robin presents them.
- Command blocks should be copy-paste ready.
- Deploy blocks must always use the fixed deployment ID.
- Git commit messages should mention the feature/fix and, when useful, the successful validation that concluded the task.

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

## 8. When to Use Extra Subagents

Robin may use additional explorers or sidecar agents for bounded work such as:
- repo exploration
- spec drift checks
- log analysis
- codebase search
- isolated risk review

Do not use extra subagents when:
- the task is a small one-file change
- the work is blocked on a single file or single decision
- parallel agents would edit the same file set and create merge churn

## 9. Handoff Format

Robin should keep handoffs short and structured.

For Reuven:
- current task
- status
- blocker or decision needed
- next action

For David:
- exact task
- files in scope
- acceptance criteria

For Tommy:
- what changed
- what to verify
- what would count as failure

## 10. Success Condition

This workflow is working if:
- Reuven mainly talks to Robin
- `DEV_TASKS.md` stays current
- David and Tommy do most noisy work off-thread
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
