/**
 * Boss session inspection and cleanup helpers.
 */

function Helper_BossSessionStatus() {
  const bossWaId = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossWaId) {
    return { ok: false, reason: "missing_boss_phone" };
  }
  const packet = typeof TL_Menu_GetDecisionPacket_ === "function" ? TL_Menu_GetDecisionPacket_(bossWaId) : null;
  const state = typeof TL_Menu_GetState_ === "function" ? TL_Menu_GetState_(bossWaId) : "";
  const active = typeof TL_ActiveItem_Get_ === "function" ? TL_ActiveItem_Get_(bossWaId) : null;
  return {
    ok: true,
    boss_wa_id: bossWaId,
    onboarded: typeof TL_Menu_IsFirstUse_ === "function" ? !TL_Menu_IsFirstUse_(bossWaId) : "",
    menu_state: state,
    has_decision_packet: !!packet,
    packet_kind: packet ? String(packet.kind || "") : "",
    packet_stage: packet ? String(packet.stage || "") : "",
    packet_created_at: packet ? String(packet.created_at || "") : "",
    packet_items: packet && Array.isArray(packet.items) ? packet.items.length : 0,
    has_active_item: !!(active && active.item_id),
    active_item_id: active ? String(active.item_id || "") : "",
    active_kind: active ? String(active.kind || "") : "",
    active_opened_at: active ? String(active.opened_at || "") : "",
    active_updated_at: active ? String(active.updated_at || "") : "",
    ttl_minutes: typeof TL_Menu_ActiveFlowTtlMinutes_ === "function" ? TL_Menu_ActiveFlowTtlMinutes_() : 0
  };
}

function Helper_BossSessionReset() {
  const bossWaId = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossWaId) {
    return { ok: false, reason: "missing_boss_phone" };
  }
  if (typeof TL_Menu_ResetSession_ === "function") {
    TL_Menu_ResetSession_(bossWaId);
  }
  if (typeof TL_Menu_ClearPreparedReplyPacket_ === "function") {
    TL_Menu_ClearPreparedReplyPacket_();
  }
  return Object.assign({
    action: "boss_session_reset"
  }, Helper_BossSessionStatus());
}

function Helper_PrepareReplyQueueNow() {
  if (typeof TL_Menu_PrepareReplyPacketCache_ !== "function") {
    return { ok: false, reason: "reply_prep_unavailable" };
  }
  const prepared = TL_Menu_PrepareReplyPacketCache_();
  const cached = typeof TL_Menu_GetPreparedReplyPacket_ === "function"
    ? TL_Menu_GetPreparedReplyPacket_()
    : null;
  return {
    ok: !!(prepared && prepared.ok),
    action: "prepare_reply_queue",
    prepared: prepared,
    cached_item_count: cached && Array.isArray(cached.items) ? cached.items.length : 0,
    cached_prepared_at: cached ? String(cached.prepared_at || "") : ""
  };
}

function Helper_DebugReplyQueueState() {
  const prepared = typeof TL_Menu_GetPreparedReplyPacket_ === "function"
    ? TL_Menu_GetPreparedReplyPacket_()
    : null;
  const collected = typeof TL_Menu_CollectApprovalPacketItems_ === "function"
    ? TL_Menu_CollectApprovalPacketItems_("reply")
    : [];
  const rows = typeof TL_Orchestrator_readRecentRows_ === "function"
    ? TL_Orchestrator_readRecentRows_(80)
    : [];
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const bossRows = (rows || []).filter(function(item) {
    const values = item && item.values ? item.values : [];
    return TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender") || "") === bossPhone;
  }).slice(-12).map(function(item) {
    const values = item.values || [];
    return {
      rowNumber: item.rowNumber,
      timestamp: String(TL_Orchestrator_value_(values, "timestamp") || values[0] || ""),
      record_class: String(TL_Orchestrator_value_(values, "record_class") || ""),
      direction: String(TL_Orchestrator_value_(values, "direction") || ""),
      activity_kind: String(TL_Orchestrator_value_(values, "activity_kind") || ""),
      text: String(TL_Orchestrator_value_(values, "text") || ""),
      summary: String(TL_Orchestrator_value_(values, "summary") || ""),
      draft_reply: String(TL_Orchestrator_value_(values, "draft_reply") || ""),
      approval_status: String(TL_Orchestrator_value_(values, "approval_status") || ""),
      execution_status: String(TL_Orchestrator_value_(values, "execution_status") || ""),
      task_status: String(TL_Orchestrator_value_(values, "task_status") || ""),
      notes: String(TL_Orchestrator_value_(values, "notes") || "")
    };
  });
  const out = {
    ok: true,
    boss_phone: bossPhone,
    prepared_exists: !!prepared,
    prepared_at: prepared ? String(prepared.prepared_at || "") : "",
    prepared_count: prepared && Array.isArray(prepared.items) ? prepared.items.length : 0,
    prepared_first_item: prepared && Array.isArray(prepared.items) && prepared.items.length ? {
      rowNumber: prepared.items[0].rowNumber,
      sender: prepared.items[0].sender,
      senderLabel: prepared.items[0].senderLabel,
      channel: prepared.items[0].channel,
      recordClass: prepared.items[0].recordClass,
      summary: prepared.items[0].summary,
      proposal: prepared.items[0].proposal,
      captureKind: prepared.items[0].captureKind
    } : null,
    collected_count: Array.isArray(collected) ? collected.length : 0,
    collected_first_item: Array.isArray(collected) && collected.length ? {
      rowNumber: collected[0].rowNumber,
      sender: collected[0].sender,
      senderLabel: collected[0].senderLabel,
      channel: collected[0].channel,
      recordClass: collected[0].recordClass,
      summary: collected[0].summary,
      proposal: collected[0].proposal,
      captureKind: collected[0].captureKind
    } : null,
    recent_boss_rows: bossRows
  };
  try { Logger.log("Helper_DebugReplyQueueState %s", JSON.stringify(out, null, 2)); } catch (e) {}
  try { console.log("Helper_DebugReplyQueueState", JSON.stringify(out)); } catch (e) {}
  return out;
}

function Helper_BossFlowDiagnosticsHelper() {
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const rows = typeof TL_Orchestrator_readRecentRows_ === "function"
    ? TL_Orchestrator_readRecentRows_(160)
    : [];
  const bossRows = [];
  const contaminatedRows = [];
  const linkedArtifacts = [];

  function compactNotes_(value) {
    const text = String(value || "");
    const hits = [];
    [
      "menu_interface_handled=true",
      "boss_capture_state=processed",
      "boss_capture_state=ignored_interface",
      "boss_capture_state=ignored_unarmed",
      "menu_route=",
      "boss_capture_kind=",
      "boss_capture_source_row=",
      "boss_capture_finalized="
    ].forEach(function(marker) {
      if (text.indexOf(marker) !== -1) hits.push(marker);
    });
    return hits;
  }

  (rows || []).forEach(function(item) {
    const values = item && item.values ? item.values : [];
    const sender = TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender") || "");
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    const base = {
      rowNumber: item.rowNumber,
      timestamp: String(TL_Orchestrator_value_(values, "timestamp") || values[0] || ""),
      record_class: String(TL_Orchestrator_value_(values, "record_class") || ""),
      direction: String(TL_Orchestrator_value_(values, "direction") || ""),
      text: String(TL_Orchestrator_value_(values, "text") || ""),
      summary: String(TL_Orchestrator_value_(values, "summary") || ""),
      approval_status: String(TL_Orchestrator_value_(values, "approval_status") || ""),
      execution_status: String(TL_Orchestrator_value_(values, "execution_status") || ""),
      task_status: String(TL_Orchestrator_value_(values, "task_status") || ""),
      note_markers: compactNotes_(notes)
    };

    if (sender === bossPhone) {
      bossRows.push(base);
      if (notes.indexOf("boss_capture_state=processed") !== -1 &&
          notes.indexOf("boss_capture_state=ignored_unarmed") !== -1) {
        contaminatedRows.push(base);
      }
    }

    if (notes.indexOf("boss_capture_source_row=") !== -1) {
      linkedArtifacts.push(Object.assign({}, base, {
        notes: compactNotes_(notes),
        source_row: String((notes.match(/boss_capture_source_row=([0-9]+)/i) || [])[1] || "")
      }));
    }
  });

  const out = {
    ok: true,
    boss_phone: bossPhone,
    recent_boss_rows: bossRows.slice(-8),
    contaminated_boss_rows: contaminatedRows.slice(-8),
    linked_capture_artifacts: linkedArtifacts.slice(-12)
  };
  try { Logger.log("Helper_BossFlowDiagnosticsHelper %s", JSON.stringify(out, null, 2)); } catch (e) {}
  try { console.log("Helper_BossFlowDiagnosticsHelper", JSON.stringify(out)); } catch (e) {}
  return out;
}

function Helper_BossMenuTransportDiagnosticsHelper() {
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const rows = typeof TL_Orchestrator_readRecentRows_ === "function"
    ? TL_Orchestrator_readRecentRows_(180)
    : [];
  const transportRows = [];

  (rows || []).forEach(function(item) {
    const values = item && item.values ? item.values : [];
    const sender = TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender") || "");
    const receiver = TLW_normalizePhone_(TL_Orchestrator_value_(values, "receiver") || "");
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    if (sender !== bossPhone && receiver !== bossPhone) return;
    transportRows.push({
      rowNumber: item.rowNumber,
      timestamp: String(TL_Orchestrator_value_(values, "timestamp") || values[0] || ""),
      direction: String(TL_Orchestrator_value_(values, "direction") || ""),
      record_class: String(TL_Orchestrator_value_(values, "record_class") || ""),
      activity_kind: String(TL_Orchestrator_value_(values, "activity_kind") || ""),
      sender: String(TL_Orchestrator_value_(values, "sender") || ""),
      receiver: String(TL_Orchestrator_value_(values, "receiver") || ""),
      text: String(TL_Orchestrator_value_(values, "text") || ""),
      summary: String(TL_Orchestrator_value_(values, "summary") || ""),
      execution_status: String(TL_Orchestrator_value_(values, "execution_status") || ""),
      task_status: String(TL_Orchestrator_value_(values, "task_status") || ""),
      note_markers: [
        "menu_interface_handled=true",
        "menu_interface_kind=",
        "boss_capture_state=ignored_interface",
        "boss_capture_state=ignored_unarmed",
        "boss_capture_state=processed"
      ].filter(function(marker) { return notes.indexOf(marker) !== -1; })
    });
  });

  const logEntries = [];
  try {
    const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = ss.getSheetByName("LOG");
    if (sh && sh.getLastRow() >= 2) {
      const lastRow = sh.getLastRow();
      const startRow = Math.max(2, lastRow - 79);
      const vals = sh.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
      vals.forEach(function(row) {
        const message = String(row[3] || "").trim();
        const metaRaw = String(row[4] || "").trim();
        if (!/^menu_/.test(message)) return;
        const meta = metaRaw ? (function() {
          try { return JSON.parse(metaRaw); } catch (e) { return { raw: metaRaw }; }
        })() : {};
        logEntries.push({
          timestamp: String(row[0] || ""),
          level: String(row[1] || ""),
          component: String(row[2] || ""),
          message: message,
          meta: meta
        });
      });
    }
  } catch (e) {}

  const out = {
    ok: true,
    boss_phone: bossPhone,
    recent_transport_rows: transportRows.slice(-12),
    recent_menu_logs: logEntries.slice(-20)
  };
  try { Logger.log("Helper_BossMenuTransportDiagnosticsHelper %s", JSON.stringify(out, null, 2)); } catch (e) {}
  try { console.log("Helper_BossMenuTransportDiagnosticsHelper", JSON.stringify(out)); } catch (e) {}
  return out;
}

function Helper_CleanupContaminatedBossCaptureArtifacts() {
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  if (!bossPhone) return { ok: false, reason: "missing_boss_phone" };
  if (typeof TL_Orchestrator_readRecentRows_ !== "function" || typeof TL_Orchestrator_updateRowFields_ !== "function") {
    return { ok: false, reason: "missing_row_helpers" };
  }
  const rows = TL_Orchestrator_readRecentRows_(240);
  const contaminatedSourceRows = [];

  (rows || []).forEach(function(item) {
    const values = item && item.values ? item.values : [];
    const sender = TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender") || "");
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    if (sender !== bossPhone) return;
    if (notes.indexOf("boss_capture_state=processed") === -1) return;
    if (notes.indexOf("boss_capture_state=ignored_unarmed") === -1) return;
    contaminatedSourceRows.push(Number(item.rowNumber || 0));
  });

  const contaminatedMap = {};
  contaminatedSourceRows.forEach(function(rowNumber) { contaminatedMap[String(rowNumber)] = true; });
  let sourceRowsFixed = 0;
  let childRowsFixed = 0;

  (rows || []).forEach(function(item) {
    const rowNumber = Number(item && item.rowNumber || 0);
    const values = item && item.values ? item.values : [];
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    const noteUpdate = typeof TL_Capture_appendNote_ === "function"
      ? TL_Capture_appendNote_(values, "boss_capture_invalidated=true")
      : notes;

    if (contaminatedMap[String(rowNumber)]) {
      TL_Orchestrator_updateRowFields_(rowNumber, {
        approval_required: "false",
        approval_status: "not_needed",
        execution_status: "interface_handled",
        task_status: "closed",
        reply_status: "not_needed",
        notes: noteUpdate
      }, "boss_capture_cleanup_source");
      sourceRowsFixed++;
      return;
    }

    const sourceRow = String((notes.match(/boss_capture_source_row=([0-9]+)/i) || [])[1] || "");
    if (!sourceRow || !contaminatedMap[sourceRow]) return;
    TL_Orchestrator_updateRowFields_(rowNumber, {
      approval_required: "false",
      approval_status: "not_needed",
      execution_status: "not_needed",
      task_status: "closed",
      reply_status: "not_needed",
      notes: noteUpdate
    }, "boss_capture_cleanup_child");
    childRowsFixed++;
  });

  const out = {
    ok: true,
    contaminated_source_rows: contaminatedSourceRows,
    source_rows_fixed: sourceRowsFixed,
    child_rows_fixed: childRowsFixed
  };
  try { Logger.log("Helper_CleanupContaminatedBossCaptureArtifacts %s", JSON.stringify(out, null, 2)); } catch (e) {}
  try { console.log("Helper_CleanupContaminatedBossCaptureArtifacts", JSON.stringify(out)); } catch (e) {}
  return out;
}
