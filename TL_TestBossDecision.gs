/**
 * TL_TestBossDecision
 *
 * Deterministic GAS runners for Boss decision-packet confirmation modes.
 */

function TL_TestBossDecision_RunAll() {
  return {
    approve_all: TL_TestBossDecision_ApproveAllRun(),
    one_by_one: TL_TestBossDecision_OneByOneRun(),
    smart_group: TL_TestBossDecision_SmartGroupRun()
  };
}

function TL_TestBossDecision_ApproveAllRun() {
  const bossWaId = TL_TestBossDecision_getBossWaId_();
  TL_Menu_ClearDecisionPacket_(bossWaId);

  const itemA = TL_TestBossDecision_seedDecisionItem_({
    root_id: "root_boss_confirm_all_" + Utilities.getUuid(),
    approval_status: "awaiting_approval",
    execution_status: "awaiting_approval"
  });
  const itemB = TL_TestBossDecision_seedDecisionItem_({
    root_id: "root_boss_confirm_all_" + Utilities.getUuid(),
    approval_status: "awaiting_approval",
    execution_status: "awaiting_approval"
  });

  TL_Menu_StoreDecisionPacket_(bossWaId, "decision", [itemA.item, itemB.item]);
  const reply = TL_Menu_HandleBossMessage_({ from: bossWaId, text: "1" }, null);
  const rowA = TL_TestBossDecision_getRowSnapshot_(itemA.rowNumber);
  const rowB = TL_TestBossDecision_getRowSnapshot_(itemB.rowNumber);

  const result = {
    ok: String(rowA.approval_status || "").toLowerCase() === "approved" && String(rowB.approval_status || "").toLowerCase() === "approved",
    reply: reply,
    row_a: rowA,
    row_b: rowB,
    packet_remaining: !!TL_Menu_GetDecisionPacket_(bossWaId)
  };
  Logger.log("TL_TestBossDecision_ApproveAllRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestBossDecision_OneByOneRun() {
  const bossWaId = TL_TestBossDecision_getBossWaId_();
  TL_Menu_ClearDecisionPacket_(bossWaId);

  const itemA = TL_TestBossDecision_seedDecisionItem_({
    root_id: "root_boss_one_by_one_" + Utilities.getUuid(),
    approval_status: "awaiting_approval",
    execution_status: "awaiting_approval"
  });
  const itemB = TL_TestBossDecision_seedDecisionItem_({
    root_id: "root_boss_one_by_one_" + Utilities.getUuid(),
    approval_status: "awaiting_approval",
    execution_status: "awaiting_approval"
  });

  TL_Menu_StoreDecisionPacket_(bossWaId, "decision", [itemA.item, itemB.item]);
  const firstReply = TL_Menu_HandleBossMessage_({ from: bossWaId, text: "3" }, null);
  const secondReply = TL_Menu_HandleBossMessage_({ from: bossWaId, text: "1" }, null);
  const packet = TL_Menu_GetDecisionPacket_(bossWaId);
  const rowA = TL_TestBossDecision_getRowSnapshot_(itemA.rowNumber);
  const rowB = TL_TestBossDecision_getRowSnapshot_(itemB.rowNumber);

  const result = {
    ok: String(rowA.approval_status || "").toLowerCase() === "approved" && String(rowB.approval_status || "").toLowerCase() !== "approved",
    first_reply: firstReply,
    second_reply: secondReply,
    packet_stage: packet ? packet.stage : "",
    packet_cursor: packet ? packet.cursor : "",
    row_a: rowA,
    row_b: rowB
  };
  Logger.log("TL_TestBossDecision_OneByOneRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestBossDecision_SmartGroupRun() {
  const bossWaId = TL_TestBossDecision_getBossWaId_();
  TL_Menu_ClearDecisionPacket_(bossWaId);

  const urgentItem = TL_TestBossDecision_seedDecisionItem_({
    root_id: "root_boss_smart_" + Utilities.getUuid(),
    approval_status: "awaiting_approval",
    execution_status: "awaiting_approval",
    priority_level: "high",
    importance_level: "high",
    urgency_flag: "true",
    suggested_action: "reply_now"
  });
  const normalItem = TL_TestBossDecision_seedDecisionItem_({
    root_id: "root_boss_smart_" + Utilities.getUuid(),
    approval_status: "awaiting_approval",
    execution_status: "awaiting_approval",
    priority_level: "low",
    importance_level: "low",
    urgency_flag: "false",
    suggested_action: "wait"
  });

  TL_Menu_StoreDecisionPacket_(bossWaId, "decision", [urgentItem.item, normalItem.item]);
  const smartReply = TL_Menu_HandleBossMessage_({ from: bossWaId, text: "4" }, null);
  const applyReply = TL_Menu_HandleBossMessage_({ from: bossWaId, text: "1" }, null);
  const urgentRow = TL_TestBossDecision_getRowSnapshot_(urgentItem.rowNumber);
  const normalRow = TL_TestBossDecision_getRowSnapshot_(normalItem.rowNumber);

  const result = {
    ok: String(urgentRow.approval_status || "").toLowerCase() === "approved" && String(normalRow.approval_status || "").toLowerCase() !== "approved",
    smart_reply: smartReply,
    apply_reply: applyReply,
    urgent_row: urgentRow,
    normal_row: normalRow,
    packet_remaining: !!TL_Menu_GetDecisionPacket_(bossWaId)
  };
  Logger.log("TL_TestBossDecision_SmartGroupRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestBossDecision_seedDecisionItem_(overrides) {
  const seeded = TL_TestSecretaryLoop_seedProposal_(Object.assign({
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    ai_summary: "seed boss decision summary",
    ai_proposal: "seed boss decision proposal",
    approval_required: "true",
    approval_status: "awaiting_approval",
    execution_status: "awaiting_approval",
    task_status: "awaiting_approval"
  }, overrides || {}));
  return {
    rowNumber: seeded.rowNumber,
    item: TL_TestBossDecision_buildItemFromRow_(seeded.rowNumber)
  };
}

function TL_TestBossDecision_buildItemFromRow_(rowNumber) {
  const row = TL_TestBossDecision_getRowValues_(rowNumber);
  return TL_BossPolicy_classifyItem_({
    rowNumber: rowNumber,
    values: row
  });
}

function TL_TestBossDecision_getRowValues_(rowNumber) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  return sh.getRange(rowNumber, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0];
}

function TL_TestBossDecision_getRowSnapshot_(rowNumber) {
  const values = TL_TestBossDecision_getRowValues_(rowNumber);
  return {
    row: rowNumber,
    record_version: Number(values[TLW_colIndex_("record_version") - 1] || 0),
    approval_status: String(values[TLW_colIndex_("approval_status") - 1] || ""),
    execution_status: String(values[TLW_colIndex_("execution_status") - 1] || ""),
    task_status: String(values[TLW_colIndex_("task_status") - 1] || "")
  };
}

function TL_TestBossDecision_getBossWaId_() {
  return String(TLW_getSetting_("BOSS_PHONE") || "972552360035").trim();
}
