# TaskLess — Project State (Source of Truth)

## 1) Rule: Source of Truth
This file is the single source of truth for project state (replaces chat footers).
If chat and this file conflict, this file wins.

## 2) Current Goal (One-liner)
Lock infra so schema + codebase + business logic stay in sync, then implement snapshot-based execution safely.

## 3) Working Mode
- Engineering Mode: GAS + Sheets + Git/Clasp + deterministic tests
- Product Mode: business logic + flows + schema + safety model
Rule: Only one mode per sprint.

## 4) Workflow (Mandatory Order)
1. Edit locally (preferred via patch files)
2. git add -A
3. git commit -m "<message>"
4. git push
5. clasp push
Rule: avoid editing in GAS UI. If you do, immediately clasp pull + commit.

## 5) Sheet Schema (Canonical)
- Canonical schema artifact: SCHEMA.json
- Export from GAS: TL_Sheets_ExportSchemaJson()
- Apply/Verify schema from GAS: TL_Sheets_ApplySchema(...)

## 6) Current Tabs (authoritative)
See SCHEMA.json.

## 7) Sprint Log (append-only)
- 2026-03-01: Added schema export + rebuild utilities; established patch-based infra.

