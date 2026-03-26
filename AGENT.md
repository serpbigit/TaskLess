# AGENT.md

This file contains operational instructions for AI coding agents working in the DealWise repository.

These instructions are for coding agents, not end users.

# DealWise — Agent Instructions

## 1. Sources of Truth
- Repository files are authoritative; chat is not.
- `DEALWISE_PRODUCT.md` is product truth.
- `DEALWISE_ROADMAP.md` is the active implementation roadmap.
- `DEALWISE_STATE.md` is the current repo state snapshot.
- `AGENT.md` defines agent workflow rules.

## 2. Session Bootstrap
- At session start, read `DEALWISE_ROADMAP.md`, `DEALWISE_STATE.md`, and this file.
- Assume Windows PowerShell unless the user says otherwise.

## 3. Repo Direction
- This repo is now for DealWise.
- Old TaskLess docs are archived under `docs/archive/taskless/`.
- Runtime file prefixes may remain `TL_*` temporarily while the DealWise MVP is being built.
- Do not spend early cycles renaming runtime files unless the task explicitly requires it.

## 4. Editing Rules
- Prefer direct deterministic repo edits.
- Keep changes scoped to the active roadmap step.
- Avoid broad cleanup outside the current target unless it directly reduces confusion or dead paths.

## 4.1 Git Execution Rule
- In this repo, treat git write operations as outside-sandbox by default.
- Run `git add`, `git commit`, and `git push` with escalation instead of retrying them in the sandbox first.
- Reason: sandboxed git writes have repeatedly failed on `.git` object/index updates in this workspace.

## 5. Product Priority
- Communication-first CRM memory
- Reply assistance
- Manual CRM enrichment
- Opportunity surfacing

Deprioritized for MVP:
- reminders
- general task management
- calendar-first flows
- workflow-builder behavior

## 6. Apps Script Deployment Rules

DealWise currently reuses the existing Apps Script runtime and fixed deployment.

Never create a new deployment unless the user explicitly changes that policy.

Current Script ID:
`1FlH23KHoQkKhLuKC-4k9bViZQcslXFe6LRnDcUQ_faIZpQdmAXjc1AXm`

Current Deployment ID:
`AKfycbzIq0DUr6h8zXelBVn_mXHR7k0DIg97AL5jvLfyIZrFhEotITNkDpbviGXW8xpr9wo`

Preferred commands from repo root:
- `.\scripts\clasp.ps1 push`
- `.\scripts\clasp.ps1 deploy --deploymentId AKfycbzIq0DUr6h8zXelBVn_mXHR7k0DIg97AL5jvLfyIZrFhEotITNkDpbviGXW8xpr9wo --description "<short description>"`

## 7. Testing Rule
- Every new worker or meaningful flow should include at least one deterministic test runner or smoke function.
- Prefer small targeted tests for identity resolution, CRM writeback, reply queue logic, and grouped communication handling.

## 8. Response Style
- Keep summaries concise and operational.
- State what changed, what was tested, and what remains unproven.
- If deployment steps matter, provide the exact commands used or required.

## 9. Naming Lanes
- `TL_*.gs` = current runtime modules, kept temporarily during the transition
- `Onboarding_*.gs` = environment/client setup helpers
- `Helper_*.gs` = diagnostics and tooling

Future renaming can happen after the DealWise MVP is stable.
