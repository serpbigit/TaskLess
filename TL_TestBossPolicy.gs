/**
 * TL_TestBossPolicy
 *
 * Deterministic runners for Boss workload policy behavior.
 * These tests use in-memory rows and a captured send function.
 */

function TL_TestBossPolicy_RunAll() {
  return {
    digest: TL_TestBossPolicy_DigestRun(),
    decision: TL_TestBossPolicy_DecisionRequestRun(),
    urgent: TL_TestBossPolicy_UrgentPushRun(),
    manual_only: TL_TestBossPolicy_ManualOnlyRun(),
    high_and_urgent: TL_TestBossPolicy_HighAndUrgentRun(),
    dnd: TL_TestBossPolicy_DoNotDisturbRun(),
    duplicate: TL_TestBossPolicy_DuplicateSignatureRun(),
    interval: TL_TestBossPolicy_IntervalGateRun()
  };
}

function TL_TestBossPolicy_DigestRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildDigestRows_();
  const state = TL_TestBossPolicy_buildFreshState_();
  state.TL_BOSS_LAST_URGENT_SIG = "old-urgent";
  state.TL_BOSS_LAST_URGENT_AT = "2026-03-19T00:00:00.000Z";
  state.TL_BOSS_LAST_DECISION_SIG = "recent-decision";
  state.TL_BOSS_LAST_DECISION_AT = "2026-03-19T09:59:30.000Z";
  state.TL_BOSS_LAST_DIGEST_SIG = "old-digest";
  state.TL_BOSS_LAST_DIGEST_AT = "2026-03-19T00:00:00.000Z";

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: TL_TestBossPolicy_settings_({
      URGENT_PUSH_ENABLED: "false",
      BOSS_INTERRUPT_LEVEL: "all_action_items",
      BOSS_UPDATE_INTERVAL_MINUTES: "60",
      BOSS_DECISION_REQUEST_INTERVAL_MINUTES: "60",
      BOSS_DECISION_BATCH_SIZE: "2",
      BOSS_MAX_ITEMS_PER_DIGEST: "3",
      BOSS_URGENT_ITEMS_ALWAYS_FIRST: "true",
      BOSS_INCLUDE_FYI_IN_DIGEST: "true",
      DO_NOT_DISTURB_ENABLED: "false",
      BOSS_PHONE: "972500000999",
      BUSINESS_PHONE_ID: "896133996927016"
    }),
    state: state,
    persistState: false,
    now: new Date("2026-03-19T10:00:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "digest",
    sent_count: captured.length,
    kinds: captured.map(function(item) { return item.kind; }),
    first_text: captured.length ? captured[0].text : "",
    result: result
  };
  Logger.log("TL_TestBossPolicy_DigestRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_DecisionRequestRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildDecisionRows_();
  const state = TL_TestBossPolicy_buildFreshState_();
  state.TL_BOSS_LAST_URGENT_SIG = "old-urgent";
  state.TL_BOSS_LAST_URGENT_AT = "2026-03-19T00:00:00.000Z";
  state.TL_BOSS_LAST_DECISION_SIG = "old-decision";
  state.TL_BOSS_LAST_DECISION_AT = "2026-03-19T00:00:00.000Z";
  state.TL_BOSS_LAST_DIGEST_SIG = "recent-digest";
  state.TL_BOSS_LAST_DIGEST_AT = "2026-03-19T09:59:30.000Z";

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: TL_TestBossPolicy_settings_({
      URGENT_PUSH_ENABLED: "false",
      BOSS_INTERRUPT_LEVEL: "all_action_items",
      BOSS_UPDATE_INTERVAL_MINUTES: "60",
      BOSS_DECISION_REQUEST_INTERVAL_MINUTES: "60",
      BOSS_DECISION_BATCH_SIZE: "2",
      BOSS_MAX_ITEMS_PER_DIGEST: "4",
      BOSS_URGENT_ITEMS_ALWAYS_FIRST: "true",
      BOSS_INCLUDE_FYI_IN_DIGEST: "false",
      DO_NOT_DISTURB_ENABLED: "false",
      BOSS_PHONE: "972500000999",
      BUSINESS_PHONE_ID: "896133996927016"
    }),
    state: state,
    persistState: false,
    now: new Date("2026-03-19T11:00:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "decision",
    sent_count: captured.length,
    kinds: captured.map(function(item) { return item.kind; }),
    first_text: captured.length ? captured[0].text : "",
    result: result
  };
  Logger.log("TL_TestBossPolicy_DecisionRequestRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_UrgentPushRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildUrgentRows_();
  const state = TL_TestBossPolicy_buildFreshState_();
  state.TL_BOSS_LAST_URGENT_SIG = "old-urgent";
  state.TL_BOSS_LAST_URGENT_AT = "2026-03-18T10:00:00.000Z";
  state.TL_BOSS_LAST_DECISION_SIG = "recent-decision";
  state.TL_BOSS_LAST_DECISION_AT = "2026-03-19T10:59:30.000Z";
  state.TL_BOSS_LAST_DIGEST_SIG = "recent-digest";
  state.TL_BOSS_LAST_DIGEST_AT = "2026-03-19T10:59:30.000Z";

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: TL_TestBossPolicy_settings_({
      URGENT_PUSH_ENABLED: "true",
      BOSS_INTERRUPT_LEVEL: "urgent_only",
      BOSS_UPDATE_INTERVAL_MINUTES: "120",
      BOSS_DECISION_REQUEST_INTERVAL_MINUTES: "120",
      BOSS_DECISION_BATCH_SIZE: "1",
      BOSS_MAX_ITEMS_PER_DIGEST: "2",
      BOSS_URGENT_ITEMS_ALWAYS_FIRST: "true",
      BOSS_INCLUDE_FYI_IN_DIGEST: "false",
      DO_NOT_DISTURB_ENABLED: "false",
      BOSS_PHONE: "972500000999",
      BUSINESS_PHONE_ID: "896133996927016"
    }),
    state: state,
    persistState: false,
    now: new Date("2026-03-19T12:00:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "urgent",
    sent_count: captured.length,
    kinds: captured.map(function(item) { return item.kind; }),
    first_text: captured.length ? captured[0].text : "",
    result: result
  };
  Logger.log("TL_TestBossPolicy_UrgentPushRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_ManualOnlyRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildMixedPriorityRows_();
  const state = TL_TestBossPolicy_buildFreshState_();

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: TL_TestBossPolicy_settings_({
      URGENT_PUSH_ENABLED: "true",
      BOSS_INTERRUPT_LEVEL: "manual_only",
      DO_NOT_DISTURB_ENABLED: "false",
      BOSS_PHONE: "972500000999",
      BUSINESS_PHONE_ID: "896133996927016"
    }),
    state: state,
    persistState: false,
    now: new Date("2026-03-19T12:30:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "manual_only",
    sent_count: captured.length,
    counts: result.counts,
    urgent_reason: result.urgent ? result.urgent.reason : "",
    decision_reason: result.decision ? result.decision.reason : "",
    digest_reason: result.digest ? result.digest.reason : "",
    result: result
  };
  Logger.log("TL_TestBossPolicy_ManualOnlyRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_HighAndUrgentRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildMixedPriorityRows_();
  const state = TL_TestBossPolicy_buildFreshState_();
  state.TL_BOSS_LAST_URGENT_SIG = "older-urgent";
  state.TL_BOSS_LAST_URGENT_AT = "2026-03-18T12:30:00.000Z";
  state.TL_BOSS_LAST_DECISION_SIG = "older-decision";
  state.TL_BOSS_LAST_DECISION_AT = "2026-03-18T12:30:00.000Z";
  state.TL_BOSS_LAST_DIGEST_SIG = "older-digest";
  state.TL_BOSS_LAST_DIGEST_AT = "2026-03-18T12:30:00.000Z";

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: TL_TestBossPolicy_settings_({
      URGENT_PUSH_ENABLED: "true",
      BOSS_INTERRUPT_LEVEL: "high_and_urgent",
      BOSS_DECISION_BATCH_SIZE: "3",
      BOSS_MAX_ITEMS_PER_DIGEST: "5",
      DO_NOT_DISTURB_ENABLED: "false",
      BOSS_PHONE: "972500000999",
      BUSINESS_PHONE_ID: "896133996927016"
    }),
    state: state,
    persistState: false,
    now: new Date("2026-03-19T13:00:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "high_and_urgent",
    sent_count: captured.length,
    kinds: captured.map(function(item) { return item.kind; }),
    urgent_count: result.counts ? result.counts.urgent : 0,
    decision_count: result.counts ? result.counts.decision : 0,
    first_text: captured.length ? captured[0].text : "",
    result: result
  };
  Logger.log("TL_TestBossPolicy_HighAndUrgentRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_DoNotDisturbRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildMixedPriorityRows_();
  const state = TL_TestBossPolicy_buildFreshState_();

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: TL_TestBossPolicy_settings_({
      URGENT_PUSH_ENABLED: "true",
      BOSS_INTERRUPT_LEVEL: "all_action_items",
      DO_NOT_DISTURB_ENABLED: "true",
      BOSS_PHONE: "972500000999",
      BUSINESS_PHONE_ID: "896133996927016"
    }),
    state: state,
    persistState: false,
    now: new Date("2026-03-19T13:30:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "dnd",
    sent_count: captured.length,
    skipped: result.skipped,
    reason: result.reason,
    result: result
  };
  Logger.log("TL_TestBossPolicy_DoNotDisturbRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_DuplicateSignatureRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildDecisionRows_();
  const state = TL_TestBossPolicy_buildFreshState_();
  const settings = TL_TestBossPolicy_settings_({
    URGENT_PUSH_ENABLED: "false",
    BOSS_INTERRUPT_LEVEL: "all_action_items",
    BOSS_DECISION_REQUEST_INTERVAL_MINUTES: "0",
    DO_NOT_DISTURB_ENABLED: "false",
    BOSS_PHONE: "972500000999",
    BUSINESS_PHONE_ID: "896133996927016"
  });
  const cfg = TL_BossPolicy_getConfig_({
    settings: settings,
    now: new Date("2026-03-19T14:00:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });
  const signature = TL_BossPolicy_signature_(TL_BossPolicy_selectDecisionItems_(TL_BossPolicy_collectItems_(rows), cfg, {}));
  state.TL_BOSS_LAST_DECISION_SIG = signature;
  state.TL_BOSS_LAST_DECISION_AT = "2026-03-19T10:00:00.000Z";

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: settings,
    state: state,
    persistState: false,
    now: new Date("2026-03-19T14:00:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "duplicate_signature",
    sent_count: captured.length,
    decision_reason: result.decision ? result.decision.reason : "",
    decision_signature: result.decision ? result.decision.signature : "",
    result: result
  };
  Logger.log("TL_TestBossPolicy_DuplicateSignatureRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_IntervalGateRun() {
  const captured = [];
  const rows = TL_TestBossPolicy_buildDecisionRows_();
  const state = TL_TestBossPolicy_buildFreshState_();
  state.TL_BOSS_LAST_DECISION_SIG = "older-decision";
  state.TL_BOSS_LAST_DECISION_AT = "2026-03-19T13:45:30.000Z";

  const result = TL_BossPolicy_Run({
    rows: rows,
    settings: TL_TestBossPolicy_settings_({
      URGENT_PUSH_ENABLED: "false",
      BOSS_INTERRUPT_LEVEL: "all_action_items",
      BOSS_DECISION_REQUEST_INTERVAL_MINUTES: "60",
      DO_NOT_DISTURB_ENABLED: "false",
      BOSS_PHONE: "972500000999",
      BUSINESS_PHONE_ID: "896133996927016"
    }),
    state: state,
    persistState: false,
    now: new Date("2026-03-19T14:00:00.000Z"),
    sendFn: TL_TestBossPolicy_captureSend_(captured)
  });

  const output = {
    ok: true,
    case: "interval_gate",
    sent_count: captured.length,
    decision_reason: result.decision ? result.decision.reason : "",
    last_decision_at: state.TL_BOSS_LAST_DECISION_AT || "",
    result: result
  };
  Logger.log("TL_TestBossPolicy_IntervalGateRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossPolicy_buildDigestRows_() {
  const now = new Date("2026-03-19T08:00:00.000Z");
  return [
    TL_TestBossPolicy_makeRow_(2, {
      timestamp: now,
      root_id: "root_boss_digest_1",
      event_id: "evt_boss_digest_1",
      record_id: "rec_boss_digest_1",
      record_class: "proposal",
      direction: "outgoing",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972506847373",
      receiver: "972500000111",
      message_id: "msg_boss_digest_1",
      message_type: "text",
      text: "Draft reply for vendor",
      ai_summary: "Vendor asked for a quick confirmation.",
      ai_proposal: "Please confirm the order and ask for a delivery window.",
      approval_required: "true",
      approval_status: "draft",
      execution_status: "proposal_ready",
      priority_level: "high",
      importance_level: "high",
      urgency_flag: "true",
      needs_owner_now: "true",
      suggested_action: "reply_now",
      contact_id: "WA_896133996927016_972500000111"
    }),
    TL_TestBossPolicy_makeRow_(3, {
      timestamp: now,
      root_id: "root_boss_digest_2",
      event_id: "evt_boss_digest_2",
      record_id: "rec_boss_digest_2",
      record_class: "communication",
      direction: "incoming",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972500000222",
      receiver: "972506847373",
      message_id: "msg_boss_digest_2",
      message_type: "text",
      text: "FYI, the shipment was updated.",
      ai_summary: "FYI shipment status update.",
      ai_proposal: "",
      approval_required: "",
      approval_status: "",
      execution_status: "",
      priority_level: "low",
      importance_level: "low",
      urgency_flag: "false",
      needs_owner_now: "false",
      suggested_action: "ignore",
      contact_id: "WA_896133996927016_972500000222"
    })
  ];
}

function TL_TestBossPolicy_buildDecisionRows_() {
  const now = new Date("2026-03-19T08:30:00.000Z");
  return [
    TL_TestBossPolicy_makeRow_(2, {
      timestamp: now,
      root_id: "root_boss_decision_1",
      event_id: "evt_boss_decision_1",
      record_id: "rec_boss_decision_1",
      record_class: "proposal",
      direction: "outgoing",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972506847373",
      receiver: "972500000333",
      message_id: "msg_boss_decision_1",
      message_type: "text",
      text: "Proposal 1",
      ai_summary: "Need Boss approval for a client reply.",
      ai_proposal: "Please approve the reply to the client.",
      approval_required: "true",
      approval_status: "draft",
      execution_status: "proposal_ready",
      priority_level: "medium",
      importance_level: "high",
      urgency_flag: "false",
      needs_owner_now: "false",
      suggested_action: "review_manually",
      contact_id: "WA_896133996927016_972500000333"
    }),
    TL_TestBossPolicy_makeRow_(3, {
      timestamp: now,
      root_id: "root_boss_decision_2",
      event_id: "evt_boss_decision_2",
      record_id: "rec_boss_decision_2",
      record_class: "proposal",
      direction: "outgoing",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972506847373",
      receiver: "972500000444",
      message_id: "msg_boss_decision_2",
      message_type: "text",
      text: "Proposal 2",
      ai_summary: "Need Boss approval for a scheduling reply.",
      ai_proposal: "Please approve the proposed meeting time.",
      approval_required: "true",
      approval_status: "awaiting_approval",
      execution_status: "proposal_ready",
      priority_level: "low",
      importance_level: "medium",
      urgency_flag: "false",
      needs_owner_now: "false",
      suggested_action: "schedule",
      contact_id: "WA_896133996927016_972500000444"
    })
  ];
}

function TL_TestBossPolicy_buildUrgentRows_() {
  const now = new Date("2026-03-19T09:00:00.000Z");
  return [
    TL_TestBossPolicy_makeRow_(2, {
      timestamp: now,
      root_id: "root_boss_urgent_1",
      event_id: "evt_boss_urgent_1",
      record_id: "rec_boss_urgent_1",
      record_class: "communication",
      direction: "incoming",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972500000555",
      receiver: "972506847373",
      message_id: "msg_boss_urgent_1",
      message_type: "text",
      text: "Call me now, this is urgent.",
      ai_summary: "Immediate customer issue.",
      ai_proposal: "",
      approval_required: "",
      approval_status: "",
      execution_status: "",
      priority_level: "high",
      importance_level: "high",
      urgency_flag: "true",
      needs_owner_now: "true",
      suggested_action: "call",
      contact_id: "WA_896133996927016_972500000555"
    }),
    TL_TestBossPolicy_makeRow_(3, {
      timestamp: now,
      root_id: "root_boss_urgent_2",
      event_id: "evt_boss_urgent_2",
      record_id: "rec_boss_urgent_2",
      record_class: "communication",
      direction: "incoming",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972500000666",
      receiver: "972506847373",
      message_id: "msg_boss_urgent_2",
      message_type: "text",
      text: "Please respond quickly.",
      ai_summary: "Second urgent customer note.",
      ai_proposal: "",
      approval_required: "",
      approval_status: "",
      execution_status: "",
      priority_level: "medium",
      importance_level: "medium",
      urgency_flag: "false",
      needs_owner_now: "true",
      suggested_action: "reply_now",
      contact_id: "WA_896133996927016_972500000666"
    })
  ];
}

function TL_TestBossPolicy_buildMixedPriorityRows_() {
  const now = new Date("2026-03-19T09:15:00.000Z");
  return [
    TL_TestBossPolicy_makeRow_(2, {
      timestamp: now,
      root_id: "root_boss_mix_urgent",
      event_id: "evt_boss_mix_urgent",
      record_id: "rec_boss_mix_urgent",
      record_class: "communication",
      direction: "incoming",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972500000777",
      receiver: "972506847373",
      message_id: "msg_boss_mix_urgent",
      message_type: "text",
      text: "This needs attention now.",
      ai_summary: "Immediate customer escalation.",
      ai_proposal: "",
      approval_required: "",
      approval_status: "",
      execution_status: "",
      priority_level: "medium",
      importance_level: "medium",
      urgency_flag: "true",
      needs_owner_now: "true",
      suggested_action: "call",
      contact_id: "WA_896133996927016_972500000777"
    }),
    TL_TestBossPolicy_makeRow_(3, {
      timestamp: now,
      root_id: "root_boss_mix_high",
      event_id: "evt_boss_mix_high",
      record_id: "rec_boss_mix_high",
      record_class: "proposal",
      direction: "outgoing",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972506847373",
      receiver: "972500000888",
      message_id: "msg_boss_mix_high",
      message_type: "text",
      text: "High-value proposal",
      ai_summary: "High-value client proposal waiting for approval.",
      ai_proposal: "Approve the pricing response for the high-value client.",
      approval_required: "true",
      approval_status: "draft",
      execution_status: "proposal_ready",
      priority_level: "high",
      importance_level: "high",
      urgency_flag: "false",
      needs_owner_now: "false",
      suggested_action: "review_manually",
      contact_id: "WA_896133996927016_972500000888"
    }),
    TL_TestBossPolicy_makeRow_(4, {
      timestamp: now,
      root_id: "root_boss_mix_low",
      event_id: "evt_boss_mix_low",
      record_id: "rec_boss_mix_low",
      record_class: "proposal",
      direction: "outgoing",
      phone_number_id: "896133996927016",
      display_phone_number: "972506847373",
      sender: "972506847373",
      receiver: "972500000999",
      message_id: "msg_boss_mix_low",
      message_type: "text",
      text: "Low-value proposal",
      ai_summary: "Routine low-priority proposal.",
      ai_proposal: "Approve a routine low-priority response.",
      approval_required: "true",
      approval_status: "draft",
      execution_status: "proposal_ready",
      priority_level: "low",
      importance_level: "low",
      urgency_flag: "false",
      needs_owner_now: "false",
      suggested_action: "review_manually",
      contact_id: "WA_896133996927016_972500000999"
    })
  ];
}

function TL_TestBossPolicy_makeRow_(rowNumber, fields) {
  const row = [];
  for (let i = 0; i < TL_WEBHOOK.INBOX_HEADERS.length; i++) {
    row[i] = "";
  }

  row[TLW_colIndex_("timestamp") - 1] = fields.timestamp instanceof Date ? fields.timestamp : new Date(fields.timestamp || Date.now());
  row[TLW_colIndex_("root_id") - 1] = String(fields.root_id || "");
  row[TLW_colIndex_("event_id") - 1] = String(fields.event_id || "");
  row[TLW_colIndex_("parent_event_id") - 1] = String(fields.parent_event_id || "");
  row[TLW_colIndex_("record_id") - 1] = String(fields.record_id || "");
  row[TLW_colIndex_("record_version") - 1] = Number(fields.record_version || 1);
  row[TLW_colIndex_("record_class") - 1] = String(fields.record_class || "");
  row[TLW_colIndex_("channel") - 1] = String(fields.channel || "whatsapp");
  row[TLW_colIndex_("direction") - 1] = String(fields.direction || "");
  row[TLW_colIndex_("phone_number_id") - 1] = String(fields.phone_number_id || "");
  row[TLW_colIndex_("display_phone_number") - 1] = String(fields.display_phone_number || "");
  row[TLW_colIndex_("sender") - 1] = String(fields.sender || "");
  row[TLW_colIndex_("receiver") - 1] = String(fields.receiver || "");
  row[TLW_colIndex_("message_id") - 1] = String(fields.message_id || "");
  row[TLW_colIndex_("message_type") - 1] = String(fields.message_type || "text");
  row[TLW_colIndex_("text") - 1] = String(fields.text || "");
  row[TLW_colIndex_("ai_summary") - 1] = String(fields.ai_summary || "");
  row[TLW_colIndex_("ai_proposal") - 1] = String(fields.ai_proposal || "");
  row[TLW_colIndex_("approval_required") - 1] = String(fields.approval_required || "");
  row[TLW_colIndex_("approval_status") - 1] = String(fields.approval_status || "");
  row[TLW_colIndex_("execution_status") - 1] = String(fields.execution_status || "");
  row[TLW_colIndex_("status_latest") - 1] = String(fields.status_latest || "");
  row[TLW_colIndex_("status_timestamp") - 1] = String(fields.status_timestamp || "");
  row[TLW_colIndex_("statuses_count") - 1] = Number(fields.statuses_count || 0);
  row[TLW_colIndex_("contact_id") - 1] = String(fields.contact_id || "");
  row[TLW_colIndex_("raw_payload_ref") - 1] = String(fields.raw_payload_ref || "");
  row[TLW_colIndex_("notes") - 1] = String(fields.notes || "");
  row[TLW_colIndex_("task_due") - 1] = String(fields.task_due || "");
  row[TLW_colIndex_("task_status") - 1] = String(fields.task_status || "");
  row[TLW_colIndex_("task_priority") - 1] = String(fields.task_priority || "");
  row[TLW_colIndex_("topic_id") - 1] = String(fields.topic_id || "");
  row[TLW_colIndex_("topic_tagged_at") - 1] = String(fields.topic_tagged_at || "");
  row[TLW_colIndex_("biz_stage") - 1] = String(fields.biz_stage || "");
  row[TLW_colIndex_("biz_stage_ts") - 1] = String(fields.biz_stage_ts || "");
  row[TLW_colIndex_("payment_status") - 1] = String(fields.payment_status || "");
  row[TLW_colIndex_("delivery_due") - 1] = String(fields.delivery_due || "");
  row[TLW_colIndex_("media_id") - 1] = String(fields.media_id || "");
  row[TLW_colIndex_("media_mime_type") - 1] = String(fields.media_mime_type || "");
  row[TLW_colIndex_("media_sha256") - 1] = String(fields.media_sha256 || "");
  row[TLW_colIndex_("media_caption") - 1] = String(fields.media_caption || "");
  row[TLW_colIndex_("media_filename") - 1] = String(fields.media_filename || "");
  row[TLW_colIndex_("media_is_voice") - 1] = String(fields.media_is_voice || "false");
  row[TLW_colIndex_("priority_level") - 1] = String(fields.priority_level || "");
  row[TLW_colIndex_("importance_level") - 1] = String(fields.importance_level || "");
  row[TLW_colIndex_("urgency_flag") - 1] = String(fields.urgency_flag || "");
  row[TLW_colIndex_("needs_owner_now") - 1] = String(fields.needs_owner_now || "");
  row[TLW_colIndex_("suggested_action") - 1] = String(fields.suggested_action || "");

  return {
    rowNumber: rowNumber,
    values: row
  };
}

function TL_TestBossPolicy_captureSend_(captured) {
  return function(phoneId, toWaId, text, meta) {
    captured.push({
      phone_number_id: String(phoneId || ""),
      to_wa_id: String(toWaId || ""),
      text: String(text || ""),
      kind: meta && meta.kind ? String(meta.kind) : "",
      item_count: meta && meta.items ? meta.items.length : 0
    });
    return {
      ok: true,
      status: 200,
      body: JSON.stringify({
        messages: [{ id: "msg_capture_" + captured.length }],
        contacts: [{ wa_id: String(toWaId || "") }]
      })
    };
  };
}

function TL_TestBossPolicy_settings_(overrides) {
  return Object.assign({
    BOSS_PHONE: "972500000999",
    BUSINESS_PHONE_ID: "896133996927016",
    URGENT_PUSH_ENABLED: "true",
    BOSS_INTERRUPT_LEVEL: "all_action_items",
    BOSS_UPDATE_INTERVAL_MINUTES: "60",
    BOSS_DECISION_REQUEST_INTERVAL_MINUTES: "60",
    BOSS_DECISION_BATCH_SIZE: "2",
    BOSS_MAX_ITEMS_PER_DIGEST: "3",
    BOSS_URGENT_ITEMS_ALWAYS_FIRST: "true",
    BOSS_INCLUDE_FYI_IN_DIGEST: "true",
    DO_NOT_DISTURB_ENABLED: "false"
  }, overrides || {});
}

function TL_TestBossPolicy_buildFreshState_() {
  return {};
}
