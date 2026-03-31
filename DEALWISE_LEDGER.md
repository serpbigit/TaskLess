# DEALWISE MVP ROADMAP

---

## STEP 1 — MESSAGE SELECTION (INBOX CORRECTNESS)

Goal: Show only messages that truly require the boss’s decision.

### Requirements:
1. Only include messages where:
   - `response_expected` = true
   - No manual reply already sent (detect external replies)
2. Exclude:
   - FYI messages
   - Reactions (❤️, 👍, etc.)
   - Already handled conversations
3. Output:
   - A clean list of valid “needs reply” messages

---

## STEP 2 — MESSAGE QUEUE (SINGLE CARD FLOW)

Goal: Present messages one at a time in a clean, sequential decision flow.

### Requirements:
1. Entry point: Single line: "You have X messages that require your response"
2. Immediately show progress: "1/X"
3. No additional stats or digests
4. Each message card contains exactly:
   - Who
   - Channel
   - Waiting for (short summary)
   - Message (trimmed if needed)
5. Sequential Flow: After each action → Confirm completion ("1/X completed") → "Next: 2/X" → Show next card.

---

## STEP 3 — ACTION INTERFACE (STABLE CONTROLS)

Goal: Ensure consistent and predictable interaction.

### Requirements:
1. Dynamic Suggested Replies:
   - Numeric (1, 2, 3...)
2. Fixed System Actions:
   - **A** → Archive
   - **E** → Edit
   - **L** → Later
3. Shortcuts: System actions must remain stable letters to avoid confusion with dynamic replies.

---

## STEP 4 — CONTACT STATE ENGINE

Goal: `CONTACTS` becomes a reliable, derived snapshot of all interactions.

### Requirements:
1. Implement canonical function: `TL_Contacts_UpsertFromActivity(activityRow)`
2. Maintain fields:
   - `last_inbound_at`
   - `last_outbound_at`
   - `unreplied_inbound_count`
   - `last_signal_summary`
3. Single Source: `CONTACTS` is fully derived from `ACTIVITY`. Any manual update must be written to `ACTIVITY` first.

---

## STEP 5 — CONVERSATION CONTEXT BUILDER

Goal: Reconstruct conversation history per contact for drafting.

### Requirements:
1. Fetching: Ability to fetch last X inbound/outbound messages.
2. Grouping: Group messages by contact (`root_id`).
3. Chronology: Preserve strict chronological order.

---

## STEP 6 — AI REPLY ENGINE

Goal: Generate high-quality, safe draft replies.

### Requirements:
1. Input: Current message + Recent conversation history + `CONTACTS` snapshot.
2. Output: 2–3 numbered suggested replies.
3. Strict Rules:
   - No hallucinations or invented commitments.
   - Respect tone and prior context.
   - Neutral forward motion.

---

## STEP 7 — NEXT STEP ENGINE

Goal: Identify opportunities to move conversations forward.

### Requirements:
1. Input: `CONTACTS` data + `ACTIVITY` history.
2. Logic: Detect stalled conversations and follow-up opportunities.
3. Output: Actionable suggestions for the boss.

---

## SYSTEM STRUCTURE & RULES

- **ACTIVITY** = Primary source of truth (append-only ledger).
- **CONTACTS** = Derived snapshot (computed state).
- **Naming:** All logic follows `TL_*` naming convention.
- **Safety:** All outbound communication remains **draft-only** (blocked by default).
- **Status:** Any change that does not advance these steps is considered drift.
