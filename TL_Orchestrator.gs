/**
 * TL_Orchestrator
 *
 * Deterministic dispatcher for TaskLess v1.
 * The webhook path stays narrow; this layer sweeps bounded work on a timer.
 */

const TL_ORCHESTRATOR = {
  VERSION: "v1",
  DEFAULT_BATCH_SIZE: 5,
  DEFAULT_SCAN_ROWS: 400,
  DEFAULT_QUIET_WINDOW_MINUTES: 120,
  DEFAULT_POST_INGEST_MINUTES: 1,
  DEFAULT_REMINDER_POLL_MINUTES: 5,
  TRIGGER_HANDLER: "TL_Orchestrator_Run"
};

function TL_Orchestrator_Run() {
  if (!TL_Automation_IsEnabled_()) {
    const result = {
      ok: true,
      version: TL_ORCHESTRATOR.VERSION,
      skipped: true,
      reason: "automation_disabled"
    };
    TLW_logInfo_("orchestrator_run_skipped", result);
    return result;
  }
  return TL_Orchestrator_withLock_("orchestrator", function() {
    const result = {
      ok: true,
      version: TL_ORCHESTRATOR.VERSION,
      repair: TL_Repair_RunUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      capture: TL_Capture_RunUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      ai: TL_AI_RunPendingUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      synthesis: TL_Synthesis_RunUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      approval: TL_Approval_RunUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      reminders: TL_Reminder_RunDueUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      send: TL_Send_RunApprovedUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      boss: TL_BossPolicy_RunUnlocked_()
    };

    TLW_logInfo_("orchestrator_run", result);
    return result;
  });
}

function TL_Orchestrator_InstallTrigger_5m() {
  TL_Orchestrator_RemoveTriggers();

  ScriptApp.newTrigger(TL_ORCHESTRATOR.TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();

  return {
    ok: true,
    handler: TL_ORCHESTRATOR.TRIGGER_HANDLER,
    cadence: "every 5 minutes"
  };
}

function TL_Orchestrator_EnsureTrigger_5m() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === TL_ORCHESTRATOR.TRIGGER_HANDLER;
  });
  if (triggers.length === 1) {
    return { ok: true, handler: TL_ORCHESTRATOR.TRIGGER_HANDLER, cadence: "every 5 minutes", existing: true };
  }
  if (triggers.length > 1) {
    TL_Orchestrator_RemoveTriggers();
  }
  return TL_Orchestrator_InstallTrigger_5m();
}

function TL_Orchestrator_RemoveTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === TL_ORCHESTRATOR.TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  return { ok: true, removed: removed };
}

function TL_Orchestrator_Status() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === TL_ORCHESTRATOR.TRIGGER_HANDLER;
  });
  return {
    ok: true,
    handler: TL_ORCHESTRATOR.TRIGGER_HANDLER,
    trigger_count: triggers.length,
    automation_enabled: TLW_getSetting_("AUTOMATION_ENABLED"),
    boss_interrupt_level: TLW_getSetting_("BOSS_INTERRUPT_LEVEL"),
    do_not_disturb_enabled: TLW_getSetting_("DO_NOT_DISTURB_ENABLED"),
    urgent_push_enabled: TLW_getSetting_("URGENT_PUSH_ENABLED")
  };
}

function TL_Orchestrator_RestoreBackgroundSafely() {
  const updates = {};
  updates.AUTOMATION_ENABLED = TL_Orchestrator_setSettingValue_("AUTOMATION_ENABLED", "TRUE");
  updates.BOSS_INTERRUPT_LEVEL = TL_Orchestrator_setSettingValue_("BOSS_INTERRUPT_LEVEL", "manual_only");
  updates.DO_NOT_DISTURB_ENABLED = TL_Orchestrator_setSettingValue_("DO_NOT_DISTURB_ENABLED", "TRUE");
  const trigger = TL_Orchestrator_EnsureTrigger_5m();
  return {
    ok: true,
    settings: updates,
    trigger: trigger,
    note: "Background workers restored with boss proactive pushes muted."
  };
}

function TL_Automation_Status() {
  return TL_Orchestrator_Status();
}

function TL_Automation_DisableAll() {
  const updates = {};
  updates.AUTOMATION_ENABLED = TL_Orchestrator_setSettingValue_("AUTOMATION_ENABLED", "FALSE");
  updates.BOSS_INTERRUPT_LEVEL = TL_Orchestrator_setSettingValue_("BOSS_INTERRUPT_LEVEL", "manual_only");
  updates.DO_NOT_DISTURB_ENABLED = TL_Orchestrator_setSettingValue_("DO_NOT_DISTURB_ENABLED", "TRUE");
  updates.URGENT_PUSH_ENABLED = TL_Orchestrator_setSettingValue_("URGENT_PUSH_ENABLED", "FALSE");
  const removed = TL_Orchestrator_RemoveTriggers();
  return {
    ok: true,
    settings: updates,
    removed: removed,
    note: "All outbound automation disabled and orchestrator triggers removed."
  };
}

function TL_Automation_EnableAll() {
  const updated = TL_Orchestrator_setSettingValue_("AUTOMATION_ENABLED", "TRUE");
  return {
    ok: true,
    setting: updated,
    note: "Automation enabled. Restore triggers separately if desired."
  };
}

function TL_Orchestrator_RunNow() {
  return TL_Orchestrator_Run();
}

function TL_Orchestrator_setSettingValue_(key, value) {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) return { ok: false, reason: "missing_sheet_id", key: key };
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName("SETTINGS");
  if (!sh) return { ok: false, reason: "missing_settings_sheet", key: key };
  const lastRow = sh.getLastRow();
  const normalizedKey = TLW_normalizeSettingKey_(key);
  if (lastRow >= 2) {
    const vals = sh.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (TLW_normalizeSettingKey_(vals[i][0]) === normalizedKey) {
        sh.getRange(i + 2, 2).setValue(String(value || ""));
        return { ok: true, key: key, value: String(value || ""), row: i + 2, existing: true };
      }
    }
  }
  sh.appendRow([String(key || ""), String(value || ""), "set by TL_Orchestrator_RestoreBackgroundSafely"]);
  return { ok: true, key: key, value: String(value || ""), row: sh.getLastRow(), existing: false };
}

function TL_Automation_IsEnabled_() {
  const raw = String(TLW_getSetting_("AUTOMATION_ENABLED") || "").trim().toLowerCase();
  if (!raw) return true;
  return !(raw === "false" || raw === "0" || raw === "no");
}

function TL_Repair_Run(batchSize) {
  return TL_Orchestrator_withLock_("repair", function() {
    return TL_Repair_RunUnlocked_(batchSize);
  });
}

function TL_AI_RunPending(batchSize) {
  return TL_Orchestrator_withLock_("ai", function() {
    return TL_AI_RunPendingUnlocked_(batchSize);
  });
}

function TL_Capture_Run(batchSize, options) {
  return TL_Orchestrator_withLock_("capture", function() {
    return TL_Capture_RunUnlocked_(batchSize, options);
  });
}

function TL_Synthesis_Run(batchSize, options) {
  return TL_Orchestrator_withLock_("synthesis", function() {
    return TL_Synthesis_RunUnlocked_(batchSize, options);
  });
}

function TL_Approval_Run(batchSize) {
  return TL_Orchestrator_withLock_("approval", function() {
    return TL_Approval_RunUnlocked_(batchSize);
  });
}

function TL_Send_RunApproved(batchSize, options) {
  return TL_Orchestrator_withLock_("send", function() {
    return TL_Send_RunApprovedUnlocked_(batchSize, options);
  });
}

function TL_Reminder_RunDue(batchSize, options) {
  return TL_Orchestrator_withLock_("reminder", function() {
    return TL_Reminder_RunDueUnlocked_(batchSize, options);
  });
}

function TL_BossPolicy_Run(options) {
  return TL_Orchestrator_withLock_("boss_policy", function() {
    return TL_BossPolicy_RunUnlocked_(options);
  });
}

function TL_Repair_RunUnlocked_(batchSize) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const keys = Array.from(TLW_getLateStatusCacheMap_().keys()).sort();
  const result = {
    ok: true,
    scanned: 0,
    repaired: 0,
    pending: 0,
    keys: keys.length
  };

  for (let i = 0; i < keys.length && result.scanned < limit; i++) {
    const key = keys[i];
    const parsed = TL_Orchestrator_parseLateStatusKey_(key);
    if (!parsed) continue;
    result.scanned++;

    const loc = TLW_findRowByMessageId_(parsed.phoneId, parsed.messageId);
    if (!loc) {
      result.pending++;
      continue;
    }

    const applied = TLW_tryApplyCachedStatuses_(parsed.phoneId, parsed.messageId, loc.row);
    if (applied) result.repaired += applied;
  }

  TLW_logInfo_("repair_run", result);
  return result;
}

function TL_AI_RunPendingUnlocked_(batchSize) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  const cutoff = new Date(Date.now() - TL_ORCHESTRATOR.DEFAULT_POST_INGEST_MINUTES * 60000);
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  const result = {
    ok: true,
    scanned: 0,
    transcribed: 0,
    triaged: 0,
    skipped: 0
  };

  for (let i = rows.length - 1; i >= 0 && result.scanned < limit; i--) {
    const item = rows[i];
    const values = item.values;
    const direction = TL_Orchestrator_value_(values, "direction");
    const recordClass = TL_Orchestrator_value_(values, "record_class");
    const sender = TL_Orchestrator_value_(values, "sender");
    const rowTs = values[0];
    if (direction !== "incoming" || recordClass !== "communication") {
      continue;
    }
    if (rowTs instanceof Date && rowTs > cutoff) {
      result.skipped++;
      continue;
    }

    result.scanned++;
    try {
      if (bossPhone && sender === bossPhone) {
        result.skipped++;
        continue;
      }
      const messageType = TL_Orchestrator_value_(values, "message_type").toLowerCase();
      const mediaId = TL_Orchestrator_value_(values, "media_id");
      const notes = TL_Orchestrator_value_(values, "notes");
      const needsVoice = mediaId && (messageType === "voice" || messageType === "audio" || TL_Orchestrator_value_(values, "media_is_voice") === "true");
      const needsTriage = !TL_Orchestrator_value_(values, "ai_summary") || !TL_Orchestrator_value_(values, "ai_proposal");

      if (needsVoice && notes.indexOf("voice_transcription_status=ok") === -1 && typeof TL_AI_TranscribeInboxRow_ === "function") {
        TL_AI_TranscribeInboxRow_(item.rowNumber);
        result.transcribed++;
      }

      if (needsTriage && typeof TL_AI_TriageInboxRow_ === "function") {
        TL_AI_TriageInboxRow_(item.rowNumber);
        result.triaged++;
      }
    } catch (err) {
      TLW_logInfo_("ai_run_pending_error", {
        row: item.rowNumber,
        err: String(err && err.stack ? err.stack : err)
      });
    }
  }

  TLW_logInfo_("ai_run_pending", result);
  return result;
}

function TL_Capture_RunUnlocked_(batchSize, options) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const rows = TL_Capture_getRows_(options);
  const cfg = TL_BossPolicy_getConfig_(options);
  const promptFn = options && typeof options.promptFn === "function" ? options.promptFn : null;
  const storePacketFn = options && typeof options.storePacketFn === "function" ? options.storePacketFn : null;
  const sendFn = cfg.sendFn;
  const useAi = !(options && options.useAi === false);
  const now = TL_BossPolicy_now_(options);
  const result = {
    ok: true,
    scanned: 0,
    captured: 0,
    skipped: 0,
    sent: 0,
    packets: 0,
    items: []
  };

  if (!cfg.bossPhone) {
    result.skipped = rows.length;
    TLW_logInfo_("boss_capture_run", result);
    return result;
  }

  for (let i = rows.length - 1; i >= 0 && result.scanned < limit; i--) {
    const item = rows[i];
    const values = item.values;
    const direction = TL_Orchestrator_value_(values, "direction").toLowerCase();
    const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
    const sender = TL_Orchestrator_value_(values, "sender");
    const notes = TL_Orchestrator_value_(values, "notes").toLowerCase();
    if (direction !== "incoming" || recordClass !== "communication") {
      continue;
    }
    if (cfg.bossPhone && sender !== cfg.bossPhone) {
      continue;
    }
    if (notes.indexOf("boss_capture_state=processed") !== -1) {
      result.skipped++;
      continue;
    }

    let captureText = TL_Capture_getInputText_(values);
    if (!captureText) {
      const messageType = TL_Orchestrator_value_(values, "message_type").toLowerCase();
      const mediaId = TL_Orchestrator_value_(values, "media_id");
      const isVoice = mediaId && (messageType === "voice" || messageType === "audio" || TL_Orchestrator_value_(values, "media_is_voice") === "true");
      if (isVoice && typeof TL_AI_TranscribeInboxRow_ === "function") {
        try {
          TL_AI_TranscribeInboxRow_(item.rowNumber);
          const refreshed = TL_AI_getInboxRow_(item.rowNumber);
          captureText = refreshed ? TL_Capture_getInputText_(refreshed.values) : captureText;
        } catch (err) {
          TLW_logInfo_("boss_capture_transcribe_error", {
            row: item.rowNumber,
            err: String(err && err.stack ? err.stack : err)
          });
        }
      }
    }
    if (!captureText) {
      result.skipped++;
      continue;
    }

    if (TL_Orchestrator_isInterfaceRequestRow_(values, captureText)) {
      TL_Orchestrator_updateRowFields_(item.rowNumber, {
        notes: TL_Capture_appendNote_(values, "boss_capture_state=ignored_interface"),
        execution_status: "interface_handled"
      }, "boss_capture_ignore_interface");
      result.skipped++;
      continue;
    }

    result.scanned++;
    let extraction = null;
    try {
      extraction = promptFn ? promptFn(captureText, item, cfg) : (useAi && typeof TL_AI_ExtractBossCapture_ === "function" ? TL_AI_ExtractBossCapture_(captureText) : null);
    } catch (err) {
      TLW_logInfo_("boss_capture_extract_error", {
        row: item.rowNumber,
        err: String(err && err.stack ? err.stack : err)
      });
    }

    const normalized = TL_Capture_normalizeExtraction_(extraction, captureText);
    if (!normalized.items.length) {
      normalized.items.push(TL_Capture_makeFallbackItem_(captureText));
    }

    const packetItems = [];
    const childResults = [];
    for (let index = 0; index < normalized.items.length; index++) {
      const child = normalized.items[index];
      const childRow = TL_Capture_buildChildRow_(values, item.rowNumber, child, index, cfg, now);
      const childResult = TL_Capture_upsertChildRow_(childRow);
      packetItems.push(TL_Capture_buildPacketItem_(childRow, childResult.rowNumber || childResult.row));
      childResults.push(childResult);
      result.items.push(childResult);
    }

    const bossWaId = cfg.bossPhone || sender;
    const phoneNumberId = TL_Orchestrator_value_(values, "phone_number_id") || TL_BossPolicy_resolveOutboundPhoneId_(packetItems, cfg);
    const packetText = TL_Capture_buildPacketText_(normalized.summary || captureText, packetItems, cfg, now);
    let packetStored = false;
    if (storePacketFn) {
      try {
        packetStored = !!storePacketFn(bossWaId, "capture", packetItems);
      } catch (err) {
        TLW_logInfo_("boss_capture_packet_store_error", {
          row: item.rowNumber,
          err: String(err && err.stack ? err.stack : err)
        });
      }
    } else if (typeof TL_Menu_StoreDecisionPacket_ === "function") {
      packetStored = !!TL_Menu_StoreDecisionPacket_(bossWaId, "capture", packetItems);
    }

    let sendResult = { ok: true, skipped: true, reason: "no_send_fn" };
    if (typeof sendFn === "function") {
      try {
        sendResult = sendFn(phoneNumberId, bossWaId, packetText, {
          kind: "capture",
          items: packetItems,
          rowNumber: item.rowNumber,
          rootId: TL_Orchestrator_value_(values, "root_id")
        }) || sendResult;
      } catch (err) {
        sendResult = {
          ok: false,
          status: 0,
          body: String(err && err.stack ? err.stack : err)
        };
      }
    }

    if (sendResult && sendResult.ok) {
      TL_Orchestrator_updateRowFields_(item.rowNumber, {
        ai_summary: normalized.summary || TL_Orchestrator_value_(values, "ai_summary"),
        notes: TL_Capture_appendNote_(values, [
          "boss_capture_state=processed",
          "boss_capture_items=" + String(packetItems.length),
          "boss_capture_sent=ok"
        ].join(";")),
        task_status: "captured",
        execution_status: "capture_processed"
      }, "boss_capture");
      result.sent++;
    } else {
      TL_Orchestrator_updateRowFields_(item.rowNumber, {
        ai_summary: normalized.summary || TL_Orchestrator_value_(values, "ai_summary"),
        notes: TL_Capture_appendNote_(values, [
          "boss_capture_state=queued",
          "boss_capture_items=" + String(packetItems.length),
          "boss_capture_sent=failed"
        ].join(";")),
        task_status: "captured",
        execution_status: "capture_queued"
      }, "boss_capture");
    }

    result.captured++;
    result.packets += packetStored ? 1 : 0;
  }

  TLW_logInfo_("boss_capture_run", result);
  return result;
}

function TL_Synthesis_RunUnlocked_(batchSize, options) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  const cutoff = new Date(Date.now() - TL_ORCHESTRATOR.DEFAULT_QUIET_WINDOW_MINUTES * 60000);
  const promptFn = options && typeof options.promptFn === "function" ? options.promptFn : null;
  const useAi = !(options && options.useAi === false);
  const threads = TL_Orchestrator_indexThreads_(rows);
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const result = {
    ok: true,
    scanned: Object.keys(threads).length,
    synthesized: 0,
    skipped: 0
  };

  const roots = Object.keys(threads).sort(function(a, b) {
    const at = threads[a].latestTimestamp ? threads[a].latestTimestamp.getTime() : 0;
    const bt = threads[b].latestTimestamp ? threads[b].latestTimestamp.getTime() : 0;
    return at - bt;
  });

  for (let i = 0; i < roots.length && result.synthesized < limit; i++) {
    const rootId = roots[i];
    const thread = threads[rootId];
    if (!thread.latestIncomingRow) {
      result.skipped++;
      continue;
    }
    const latestSender = TLW_normalizePhone_(TL_Orchestrator_value_(thread.latestIncomingRow.values, "sender"));
    if (bossPhone && latestSender === bossPhone) {
      result.skipped++;
      continue;
    }
    if (thread.latestIncomingRow.values[0] instanceof Date && thread.latestIncomingRow.values[0] > cutoff) {
      result.skipped++;
      continue;
    }
    if (thread.latestTimestamp && thread.latestTimestamp > cutoff) {
      result.skipped++;
      continue;
    }
    if (thread.latestProposalRow && thread.latestIncomingRow && thread.latestProposalRow.rowNumber > thread.latestIncomingRow.rowNumber) {
      result.skipped++;
      continue;
    }

    const synthesis = TL_Orchestrator_buildThreadSynthesis_(thread, options);
    if (!synthesis) {
      result.skipped++;
      continue;
    }

    TLW_appendInboxRow_(synthesis.row, synthesis.rawJson);
    result.synthesized++;
  }

  TLW_logInfo_("synthesis_run", result);
  return result;
}

function TL_Approval_RunUnlocked_(batchSize) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  const result = {
    ok: true,
    scanned: 0,
    queued: 0,
    skipped: 0
  };

  for (let i = rows.length - 1; i >= 0 && result.scanned < limit; i--) {
    const item = rows[i];
    const values = item.values;
    const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
    const proposal = TL_Orchestrator_value_(values, "ai_proposal");
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    if (recordClass !== "proposal" || !proposal) {
      continue;
    }
    if (approvalStatus === "approved" || approvalStatus === "awaiting_approval" || approvalStatus === "sent" || approvalStatus === "executed") {
      result.skipped++;
      continue;
    }

    result.scanned++;
    TL_Orchestrator_updateRowFields_(item.rowNumber, {
      approval_required: "true",
      approval_status: "awaiting_approval",
      execution_status: "awaiting_approval"
    }, "approval_wait");
    result.queued++;
  }

  TLW_logInfo_("approval_run", result);
  return result;
}

function TL_Orchestrator_FinalizeCaptureApproval_(rowNumber) {
  const loc = TL_AI_getInboxRow_(rowNumber);
  if (!loc) return false;

  const values = loc.values;
  const notes = String(TL_Orchestrator_value_(values, "notes") || "").trim();
  const kind = TL_Orchestrator_captureKindFromNotes_(notes);
  if (!kind) return false;

  const sender = String(TLW_getSetting_("BOSS_PHONE") || "").trim() || TL_Orchestrator_value_(values, "sender");
  const receiver = TL_Orchestrator_value_(values, "display_phone_number") || TL_Orchestrator_value_(values, "receiver");
  const updates = {
    approval_required: "false",
    approval_status: "approved",
    direction: "incoming",
    sender: sender,
    receiver: receiver,
    execution_status: kind === "journal" ? "logged" : (kind === "reminder" ? "reminder_pending" : "approved"),
    notes: TL_Capture_appendNote_(values, "boss_capture_finalized=" + kind)
  };

  if (kind === "journal") {
    updates.record_class = "communication";
    updates.task_status = "logged";
  } else {
    updates.record_class = "instruction";
    updates.task_status = kind === "reminder" ? "reminder_pending" : "pending";
  }

  TL_Orchestrator_updateRowFields_(rowNumber, updates, "boss_capture_finalized");
  return true;
}

function TL_Reminder_RunDueUnlocked_(batchSize, options) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const sendFn = options && typeof options.sendFn === "function" ? options.sendFn : TLW_sendText_;
  const now = options && options.now instanceof Date ? options.now : new Date();
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  const result = {
    ok: true,
    scanned: 0,
    fired: 0,
    archived: 0,
    skipped: 0,
    failed: 0
  };

  for (let i = rows.length - 1; i >= 0 && result.scanned < limit; i--) {
    const item = rows[i];
    const values = item.values;
    const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
    const taskStatus = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    const executionStatus = TL_Orchestrator_value_(values, "execution_status").toLowerCase();
    const notes = TL_Orchestrator_value_(values, "notes");
    if (recordClass !== "instruction" || taskStatus !== "reminder_pending") continue;
    if (executionStatus === "reminder_sent" || String(notes || "").toLowerCase().indexOf("reminder_fired_at=") !== -1) {
      result.skipped++;
      continue;
    }

    result.scanned++;
    const dueText = TL_Orchestrator_value_(values, "task_due");
    const dueAt = TL_Reminder_parseDueAt_(dueText, now);
    if (!dueAt) {
      result.skipped++;
      continue;
    }
    if (dueAt.getTime() > now.getTime()) {
      result.skipped++;
      continue;
    }

    const phoneNumberId = TL_Orchestrator_value_(values, "phone_number_id");
    const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "") || TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender"));
    if (!phoneNumberId || !bossPhone) {
      result.failed++;
      continue;
    }

    const reminderText = TL_Reminder_buildFireText_(values, dueText);
    const sendResult = sendFn(phoneNumberId, bossPhone, reminderText, item);
    if (sendResult && sendResult.ok) {
      TL_Orchestrator_updateRowFields_(item.rowNumber, {
        execution_status: "reminder_sent",
        task_status: "reminder_sent",
        notes: TL_Capture_appendNote_(values, "reminder_fired_at=" + now.toISOString())
      }, "reminder_fire");
      result.fired++;
      if (TL_Orchestrator_archiveInboxRow_(item.rowNumber)) {
        result.archived++;
      }
    } else {
      TL_Orchestrator_updateRowFields_(item.rowNumber, {
        execution_status: "reminder_send_failed",
        notes: TL_Capture_appendNote_(values, "reminder_fire_failed_at=" + now.toISOString())
      }, "reminder_fire_failed");
      result.failed++;
    }
  }

  TLW_logInfo_("reminder_run_due", result);
  return result;
}

function TL_Send_RunApprovedUnlocked_(batchSize, options) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const sendFn = options && typeof options.sendFn === "function" ? options.sendFn : TLW_sendText_;
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  const result = {
    ok: true,
    scanned: 0,
    sent: 0,
    skipped: 0,
    failed: 0
  };

  for (let i = rows.length - 1; i >= 0 && result.scanned < limit; i--) {
    const item = rows[i];
    const values = item.values;
    const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    const executionStatus = TL_Orchestrator_value_(values, "execution_status").toLowerCase();
    const proposal = TL_Orchestrator_value_(values, "ai_proposal") || TL_Orchestrator_value_(values, "text");
    if (recordClass !== "proposal" || approvalStatus !== "approved" || executionStatus === "sent" || executionStatus === "sending" || !proposal) {
      continue;
    }

    const phoneNumberId = TL_Orchestrator_value_(values, "phone_number_id");
    const toWaId = TL_Orchestrator_resolveSendTarget_(values);
    if (!phoneNumberId || !toWaId) {
      result.skipped++;
      continue;
    }

    result.scanned++;
    TL_Orchestrator_updateRowFields_(item.rowNumber, {
      execution_status: "sending"
    }, "approved_send_start");
    const sendResult = sendFn(phoneNumberId, toWaId, proposal, item);
    if (sendResult && sendResult.ok) {
      TL_Orchestrator_updateRowFields_(item.rowNumber, {
        execution_status: "sent",
      }, "approved_send");
      result.sent++;
    } else {
      TL_Orchestrator_updateRowFields_(item.rowNumber, {
        execution_status: "send_failed"
      }, "send_failed");
      result.failed++;
    }
  }

  TLW_logInfo_("send_run_approved", result);
  return result;
}

function TL_Orchestrator_buildThreadSynthesis_(thread, options) {
  const rows = (thread.rows || []).slice().sort(function(a, b) {
    return a.rowNumber - b.rowNumber;
  });
  const recent = rows.slice(-5);
  const promptFn = options && typeof options.promptFn === "function" ? options.promptFn : null;
  const useAi = !(options && options.useAi === false);
  const threadText = recent.map(function(item) {
    const values = item.values;
    const sender = TL_Orchestrator_value_(values, "sender") || "unknown";
    const text = TL_Orchestrator_value_(values, "text") || TL_Orchestrator_value_(values, "media_caption");
    return sender + ": " + text;
  }).join("\n");
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "the Boss").trim();

  const fallbackSummary = "Thread with " + rows.length + " messages from " + (TL_Orchestrator_value_(thread.latestIncomingRow.values, "sender") || "a contact");
  const fallbackProposal = "Please review this thread and approve a reply for " + bossName + ".";
  let summary = fallbackSummary;
  let proposal = fallbackProposal;

  if (promptFn) {
    try {
      const ai = promptFn(threadText, thread);
      summary = String(ai && ai.summary ? ai.summary : summary).trim() || summary;
      proposal = String(ai && ai.proposal ? ai.proposal : proposal).trim() || proposal;
    } catch (err) {
      TLW_logInfo_("synthesis_prompt_fallback", {
        root_id: thread.rootId,
        err: String(err && err.stack ? err.stack : err)
      });
    }
  } else if (useAi && typeof TL_AI_callPrompt_ === "function") {
    try {
      const prompt = [
        "You are TaskLess.",
        "Return strict JSON only.",
        '{"summary":"...","proposal":"..."}',
        "Example JSON response:",
        '{"summary":"הלקוח מבקש לעדכן את מועד הפגישה וממתין לאישור.","proposal":"שלום, ראיתי את הבקשה לעדכון מועד הפגישה. אפשר לקבוע ליום חמישי בשעה 15:00 אם זה מתאים לך."}',
        "The Boss's name is: " + bossName,
        "Summarize this WhatsApp thread and draft a concise Boss-ready reply proposal on the Boss's behalf.",
        "Thread messages:",
        threadText
      ].join("\n");
      const ai = TL_AI_callPrompt_(prompt);
      summary = String(ai.summary || summary).trim() || summary;
      proposal = String(ai.proposal || proposal).trim() || proposal;
    } catch (err) {
      TLW_logInfo_("synthesis_ai_fallback", {
        root_id: thread.rootId,
        err: String(err && err.stack ? err.stack : err)
      });
    }
  }

  const source = thread.latestIncomingRow.values;
  const displayPhoneNumber = TL_Orchestrator_value_(source, "display_phone_number");
  const phoneNumberId = TL_Orchestrator_value_(source, "phone_number_id");
  const receiver = TL_Orchestrator_value_(source, "sender");
  const sender = displayPhoneNumber;
  const recordId = "SYN_" + thread.rootId + "_" + Utilities.getUuid();
  const now = new Date();

  return {
    row: {
      timestamp: now,
      root_id: thread.rootId,
      event_id: "EVT_" + Utilities.getUuid(),
      parent_event_id: TL_Orchestrator_value_(source, "event_id"),
      record_id: recordId,
      record_version: 1,
      record_class: "proposal",
      channel: "whatsapp",
      direction: "outgoing",
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      sender: sender,
      receiver: receiver,
      message_id: recordId,
      message_type: "text",
      text: proposal,
      ai_summary: summary,
      ai_proposal: proposal,
      approval_required: "true",
      approval_status: "draft",
      execution_status: "proposal_ready",
      status_latest: "",
      status_timestamp: "",
      statuses_count: 0,
      contact_id: TL_Orchestrator_value_(source, "contact_id"),
      raw_payload_ref: "",
      notes: "orchestrator=synthesis;source_row=" + thread.latestIncomingRow.rowNumber + ";thread_size=" + rows.length + ";linked_event_id=" + String(TL_Orchestrator_value_(source, "event_id") || ""),
      task_due: "",
      task_status: "proposal_ready",
      task_priority: "",
      topic_id: TL_Orchestrator_value_(source, "topic_id"),
      topic_tagged_at: TL_Orchestrator_value_(source, "topic_tagged_at"),
      biz_stage: "",
      biz_stage_ts: "",
      payment_status: "",
      delivery_due: "",
      media_id: "",
      media_mime_type: "",
      media_sha256: "",
      media_caption: "",
      media_filename: "",
      media_is_voice: false,
      priority_level: "",
      importance_level: "",
      urgency_flag: "",
      needs_owner_now: "",
      suggested_action: ""
    },
    rawJson: TLW_safeStringify_({
      source: "TL_Orchestrator",
      root_id: thread.rootId,
      thread_text: threadText
    }, 4000)
  };
}

function TL_Orchestrator_updateRowFields_(rowNumber, updates, reason) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return false;

  Object.keys(updates || {}).forEach(function(key) {
    try {
      sh.getRange(rowNumber, TLW_colIndex_(key)).setValue(updates[key]);
    } catch (err) {
      // ignore unknown keys to keep the orchestrator narrow
    }
  });
  TLW_applyVersionBump_(rowNumber, reason || "orchestrator_update");
  return true;
}

function TL_Orchestrator_archiveInboxRow_(rowNumber) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const inbox = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  const archive = ss.getSheetByName("ARCHIVE");
  if (!inbox || !archive || !rowNumber) return false;
  if (rowNumber < 2 || rowNumber > inbox.getLastRow()) return false;
  const values = inbox.getRange(rowNumber, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues();
  archive.getRange(archive.getLastRow() + 1, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).setValues(values);
  inbox.deleteRow(rowNumber);
  return true;
}

function TL_Reminder_buildFireText_(values, dueText) {
  const summary = TL_Orchestrator_value_(values, "ai_summary") || TL_Orchestrator_value_(values, "text");
  const lines = [
    "תזכורת",
    TL_Menu_Preview_(summary || "יש לך תזכורת.", 180)
  ];
  if (String(dueText || "").trim()) {
    lines.push("מועד: " + String(dueText || "").trim());
  }
  return lines.join("\n");
}

function TL_Reminder_parseDueAt_(text, now) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const base = now instanceof Date ? new Date(now.getTime()) : new Date();
  const lowered = raw.toLowerCase();

  var match = lowered.match(/(?:in|within)\s+(\d+)\s*(minute|minutes|min|hour|hours|hr|hrs)/i);
  if (match) {
    const amount = Number(match[1] || 0);
    const unit = String(match[2] || "").toLowerCase();
    if (!amount) return null;
    const out = new Date(base.getTime());
    out.setMinutes(out.getMinutes() + (unit.indexOf("hour") === 0 || unit.indexOf("hr") === 0 ? amount * 60 : amount));
    return out;
  }

  match = raw.match(/(?:בעוד)\s*(\d+)\s*(דקות|דקה|שעות|שעה)/);
  if (match) {
    const amountHe = Number(match[1] || 0);
    const unitHe = String(match[2] || "");
    if (!amountHe) return null;
    const outHe = new Date(base.getTime());
    outHe.setMinutes(outHe.getMinutes() + (unitHe.indexOf("ש") === 0 ? amountHe * 60 : amountHe));
    return outHe;
  }

  match = raw.match(/(?:מחר)\s*(?:ב[- ]?)?(\d{1,2})[:.](\d{2})/);
  if (match) {
    const outTomorrow = new Date(base.getTime());
    outTomorrow.setDate(outTomorrow.getDate() + 1);
    outTomorrow.setHours(Number(match[1] || 0), Number(match[2] || 0), 0, 0);
    return outTomorrow;
  }

  match = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (match) {
    const outTime = new Date(base.getTime());
    outTime.setHours(Number(match[1] || 0), Number(match[2] || 0), 0, 0);
    if (outTime.getTime() < base.getTime() - 60000) {
      outTime.setDate(outTime.getDate() + 1);
    }
    return outTime;
  }

  return null;
}

function TL_Orchestrator_resolveSendTarget_(values) {
  const direction = TL_Orchestrator_value_(values, "direction");
  const receiver = TL_Orchestrator_value_(values, "receiver");
  const contactId = TL_Orchestrator_value_(values, "contact_id");
  const rootId = TL_Orchestrator_value_(values, "root_id");
  const sender = TL_Orchestrator_value_(values, "sender");
  if (direction === "outgoing") {
    if (receiver) return receiver;
    if (contactId) {
      const contactMatch = String(contactId).match(/^WA_[^_]+_(.+)$/);
      if (contactMatch && contactMatch[1]) return contactMatch[1];
    }
    const threaded = TL_Orchestrator_findThreadRecipient_(rootId);
    if (threaded) return threaded;
    return "";
  }
  return sender || receiver;
}

function TL_Orchestrator_findThreadRecipient_(rootId) {
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  for (let i = rows.length - 1; i >= 0; i--) {
    const values = rows[i].values;
    if (TL_Orchestrator_value_(values, "root_id") !== String(rootId || "")) continue;
    const direction = TL_Orchestrator_value_(values, "direction").toLowerCase();
    const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
    if (direction === "incoming" && recordClass === "communication") {
      const sender = TL_Orchestrator_value_(values, "sender");
      if (sender) return sender;
    }
    if (recordClass === "proposal") {
      const receiver = TL_Orchestrator_value_(values, "receiver");
      if (receiver) return receiver;
    }
  }
  return "";
}

function TL_BossPolicy_RunUnlocked_(options) {
  const cfg = TL_BossPolicy_getConfig_(options);
  const now = cfg.now;
  const result = {
    ok: true,
    skipped: false,
    reason: "",
    boss_phone: cfg.bossPhone,
    counts: {
      rows: 0,
      items: 0,
      urgent: 0,
      decision: 0,
      digest: 0
    },
    urgent: null,
    decision: null,
    digest: null
  };

  if (!cfg.bossPhone) {
    result.skipped = true;
    result.reason = "missing_boss_phone";
    return result;
  }
  if (cfg.doNotDisturb) {
    result.skipped = true;
    result.reason = "dnd_enabled";
    return result;
  }

  const rows = TL_BossPolicy_getRows_(options);
  const items = TL_BossPolicy_collectItems_(rows);
  result.counts.rows = rows.length;
  result.counts.items = items.length;

  const consumed = {};

  const urgentItems = TL_BossPolicy_selectUrgentItems_(items, cfg, consumed);
  result.counts.urgent = urgentItems.length;
  if (urgentItems.length) {
    if (cfg.urgentPushEnabled) {
      result.urgent = TL_BossPolicy_maybeSendPacket_("urgent", urgentItems, cfg, options, now, 0);
    } else {
      result.urgent = { ok: true, skipped: true, reason: "urgent_push_disabled" };
    }
    if (result.urgent && result.urgent.sent) {
      urgentItems.forEach(function(item) {
        consumed[item.key] = true;
      });
    }
  } else {
    result.urgent = { ok: true, skipped: true, reason: "no_urgent_items" };
  }

  const decisionItems = TL_BossPolicy_selectDecisionItems_(items, cfg, consumed);
  result.counts.decision = decisionItems.length;
  if (decisionItems.length) {
    result.decision = TL_BossPolicy_maybeSendPacket_("decision", decisionItems, cfg, options, now, cfg.decisionRequestIntervalMinutes);
    if (result.decision && result.decision.sent) {
      decisionItems.forEach(function(item) {
        consumed[item.key] = true;
      });
    }
  } else {
    result.decision = { ok: true, skipped: true, reason: "no_decision_items" };
  }

  const digestItems = TL_BossPolicy_selectDigestItems_(items, cfg, consumed);
  result.counts.digest = digestItems.length;
  if (digestItems.length) {
    result.digest = TL_BossPolicy_maybeSendPacket_("digest", digestItems, cfg, options, now, cfg.updateIntervalMinutes);
  } else {
    result.digest = { ok: true, skipped: true, reason: "no_digest_items" };
  }

  TLW_logInfo_("boss_policy_run", result);
  return result;
}

function TL_BossPolicy_getConfig_(options) {
  const settings = options && options.settings ? options.settings : null;
  return {
    now: TL_BossPolicy_now_(options),
    settings: settings,
    bossPhone: TL_BossPolicy_trim_(TL_BossPolicy_getSetting_("BOSS_PHONE", settings)),
    urgentPushEnabled: TL_BossPolicy_parseBoolean_(TL_BossPolicy_getSetting_("URGENT_PUSH_ENABLED", settings), false),
    interruptLevel: TL_BossPolicy_normalizeInterruptLevel_(TL_BossPolicy_getSetting_("BOSS_INTERRUPT_LEVEL", settings)),
    updateIntervalMinutes: TL_BossPolicy_parseNumber_(TL_BossPolicy_getSetting_("BOSS_UPDATE_INTERVAL_MINUTES", settings), 120),
    decisionRequestIntervalMinutes: TL_BossPolicy_parseNumber_(TL_BossPolicy_getSetting_("BOSS_DECISION_REQUEST_INTERVAL_MINUTES", settings), 120),
    decisionBatchSize: TL_BossPolicy_parseNumber_(TL_BossPolicy_getSetting_("BOSS_DECISION_BATCH_SIZE", settings), 5),
    maxItemsPerDigest: TL_BossPolicy_parseNumber_(TL_BossPolicy_getSetting_("BOSS_MAX_ITEMS_PER_DIGEST", settings), 10),
    urgentItemsAlwaysFirst: TL_BossPolicy_parseBoolean_(TL_BossPolicy_getSetting_("BOSS_URGENT_ITEMS_ALWAYS_FIRST", settings), true),
    includeFyiInDigest: TL_BossPolicy_parseBoolean_(TL_BossPolicy_getSetting_("BOSS_INCLUDE_FYI_IN_DIGEST", settings), false),
    doNotDisturb: TL_BossPolicy_parseBoolean_(TL_BossPolicy_getSetting_("DO_NOT_DISTURB_ENABLED", settings), false),
    sendFn: options && typeof options.sendFn === "function" ? options.sendFn : TLW_sendText_,
    state: options && options.state ? options.state : null,
    persistState: !(options && options.persistState === false),
    rows: options && Array.isArray(options.rows) ? options.rows : null
  };
}

function TL_BossPolicy_getRows_(options) {
  if (options && Array.isArray(options.rows)) {
    return options.rows.slice();
  }
  return TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
}

function TL_BossPolicy_collectItems_(rows) {
  const eventMap = {};
  (rows || []).forEach(function(item) {
    if (!item || !item.values) return;
    const eventId = TL_Orchestrator_value_(item.values, "event_id");
    if (eventId) eventMap[eventId] = item;
  });
  return (rows || []).map(function(item) {
    return TL_BossPolicy_classifyItem_(item, eventMap);
  }).filter(function(item) {
    return !!item;
  });
}

function TL_BossPolicy_classifyItem_(item, eventMap) {
  if (!item || !item.values) return null;
  const values = item.values;
  if (TL_Orchestrator_isInterfaceArtifactRow_(values, eventMap)) return null;
  const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
  const direction = TL_Orchestrator_value_(values, "direction").toLowerCase();
  const approvalRequired = TL_Orchestrator_value_(values, "approval_required").toLowerCase() === "true";
  const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
  const executionStatus = TL_Orchestrator_value_(values, "execution_status").toLowerCase();
  const priorityLevel = TL_Orchestrator_value_(values, "priority_level").toLowerCase();
  const importanceLevel = TL_Orchestrator_value_(values, "importance_level").toLowerCase();
  const urgencyFlag = TL_Orchestrator_value_(values, "urgency_flag").toLowerCase() === "true";
  const needsOwnerNow = TL_Orchestrator_value_(values, "needs_owner_now").toLowerCase() === "true";
  const suggestedAction = TL_Orchestrator_value_(values, "suggested_action").toLowerCase();
  const taskStatus = TL_Orchestrator_value_(values, "task_status").toLowerCase();
  const aiSummary = TL_Orchestrator_value_(values, "ai_summary");
  const aiProposal = TL_Orchestrator_value_(values, "ai_proposal");
  const text = TL_Orchestrator_value_(values, "text");
  const summary = aiSummary || text || aiProposal || "";
  const proposal = aiProposal || text || "";
  const isDecision = approvalRequired || recordClass === "proposal" || recordClass === "instruction" || approvalStatus === "draft" || approvalStatus === "awaiting_approval" || taskStatus === "pending" || taskStatus === "proposal_ready";
  const isUrgent = urgencyFlag || needsOwnerNow || priorityLevel === "high" || importanceLevel === "high" || suggestedAction === "reply_now" || suggestedAction === "call" || suggestedAction === "schedule" || suggestedAction === "follow_up";
  const isHigh = priorityLevel === "high" || importanceLevel === "high";
  const isFYI = !isDecision && recordClass === "communication" && direction === "incoming";
  const key = TL_Orchestrator_value_(values, "record_id") || TL_Orchestrator_value_(values, "event_id") || ("row_" + item.rowNumber);

  return {
    key: key,
    rowNumber: item.rowNumber,
    values: values,
    timestamp: item.values[0] instanceof Date ? item.values[0] : new Date(item.values[0] || Date.now()),
    recordClass: recordClass,
    direction: direction,
    approvalRequired: approvalRequired,
    approvalStatus: approvalStatus,
    executionStatus: executionStatus,
    priorityLevel: priorityLevel,
    importanceLevel: importanceLevel,
    urgencyFlag: urgencyFlag,
    needsOwnerNow: needsOwnerNow,
    suggestedAction: suggestedAction,
    taskStatus: taskStatus,
    summary: summary,
    proposal: proposal,
    sender: TL_Orchestrator_value_(values, "sender"),
    receiver: TL_Orchestrator_value_(values, "receiver"),
    contactId: TL_Orchestrator_value_(values, "contact_id"),
    rootId: TL_Orchestrator_value_(values, "root_id"),
    phoneNumberId: TL_Orchestrator_value_(values, "phone_number_id"),
    displayPhoneNumber: TL_Orchestrator_value_(values, "display_phone_number"),
    recordId: TL_Orchestrator_value_(values, "record_id"),
    messageId: TL_Orchestrator_value_(values, "message_id"),
    isDecision: isDecision,
    isUrgent: isUrgent,
    isHigh: isHigh,
    isFYI: isFYI
  };
}

function TL_Orchestrator_isInterfaceArtifactRow_(values, eventMap) {
  if (!values) return false;
  if (TL_Orchestrator_isInterfaceRequestRow_(values)) return true;

  const parentEventId = TL_Orchestrator_value_(values, "parent_event_id");
  if (!parentEventId) return false;
  const parent = eventMap && eventMap[parentEventId] ? eventMap[parentEventId] : null;
  if (!parent || !parent.values) return false;
  return TL_Orchestrator_isInterfaceRequestRow_(parent.values);
}

function TL_Orchestrator_isInterfaceRequestRow_(values, overrideText) {
  if (!values) return false;
  const direction = TL_Orchestrator_value_(values, "direction").toLowerCase();
  const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
  const sender = TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender"));
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  if (direction !== "incoming" || recordClass !== "communication" || !bossPhone || sender !== bossPhone) return false;

  const notes = TL_Orchestrator_value_(values, "notes").toLowerCase();
  if (notes.indexOf("boss_intent=show_menu") !== -1 || notes.indexOf("boss_intent=help") !== -1 || notes.indexOf("boss_intent=out_of_scope") !== -1) {
    return true;
  }

  const text = String(overrideText || TL_Capture_getInputText_(values) || "").trim();
  if (!text) return false;
  const normalized = text.toLowerCase();
  if (TL_MENU && TL_MENU.TRIGGERS && TL_MENU.TRIGGERS.some(function(t) {
    return normalized === String(t || "").trim().toLowerCase();
  })) {
    return true;
  }

  try {
    if (typeof TL_AI_RecognizeBossIntent_ === "function") {
      const intent = TL_AI_RecognizeBossIntent_(text);
      const route = String(intent && intent.route || "").trim().toLowerCase();
      const name = String(intent && intent.intent || "").trim().toLowerCase();
      if (name === "out_of_scope") return true;
      if (route === "menu" || route === "summary") return true;
    }
  } catch (e) {}

  return false;
}

function TL_BossPolicy_selectUrgentItems_(items, cfg, consumed) {
  return TL_BossPolicy_sortItems_(items.filter(function(item) {
    return !consumed[item.key] && item.isUrgent && TL_BossPolicy_interruptAllows_(cfg, item);
  }), cfg.urgentItemsAlwaysFirst).slice(0, cfg.decisionBatchSize);
}

function TL_BossPolicy_selectDecisionItems_(items, cfg, consumed) {
  return TL_BossPolicy_sortItems_(items.filter(function(item) {
    return !consumed[item.key] && item.isDecision && TL_BossPolicy_interruptAllows_(cfg, item);
  }), cfg.urgentItemsAlwaysFirst).slice(0, cfg.decisionBatchSize);
}

function TL_BossPolicy_selectDigestItems_(items, cfg, consumed) {
  const actionItems = items.filter(function(item) {
    return !consumed[item.key] && item.isDecision && TL_BossPolicy_interruptAllows_(cfg, item);
  });
  const fyiItems = cfg.includeFyiInDigest ? items.filter(function(item) {
    return !consumed[item.key] && item.isFYI && TL_BossPolicy_interruptAllows_(cfg, item);
  }) : [];
  const ordered = TL_BossPolicy_sortItems_(actionItems.concat(fyiItems), cfg.urgentItemsAlwaysFirst);
  return TL_BossPolicy_uniqueItems_(ordered).slice(0, cfg.maxItemsPerDigest);
}

function TL_BossPolicy_interruptAllows_(cfg, item) {
  const level = String(cfg.interruptLevel || "urgent_only").toLowerCase();
  if (level === "manual_only") return false;
  if (level === "urgent_only") return item.isUrgent;
  if (level === "high_and_urgent") return item.isUrgent || item.isHigh;
  return item.isDecision || item.isUrgent || item.isFYI;
}

function TL_BossPolicy_maybeSendPacket_(kind, items, cfg, options, now, intervalMinutes) {
  const result = {
    ok: true,
    kind: kind,
    skipped: false,
    reason: "",
    sent: false,
    item_count: items.length,
    signature: TL_BossPolicy_signature_(items),
    text: ""
  };

  if (!items.length) {
    result.skipped = true;
    result.reason = "no_items";
    return result;
  }

  const intervalKey = kind.toUpperCase();
  const sigKey = "TL_BOSS_LAST_" + intervalKey + "_SIG";
  const atKey = "TL_BOSS_LAST_" + intervalKey + "_AT";
  const lastSig = TL_BossPolicy_stateGet_(sigKey, options);
  const lastAtText = TL_BossPolicy_stateGet_(atKey, options);
  const lastAt = Date.parse(lastAtText);

  if (intervalMinutes > 0 && isFinite(lastAt) && (now.getTime() - lastAt) < (intervalMinutes * 60000)) {
    result.skipped = true;
    result.reason = "interval_not_elapsed";
    return result;
  }
  if (lastSig && lastSig === result.signature) {
    result.skipped = true;
    result.reason = "duplicate_signature";
    return result;
  }

  const phoneNumberId = TL_BossPolicy_resolveOutboundPhoneId_(items, cfg);
  if (!phoneNumberId) {
    result.skipped = true;
    result.reason = "missing_phone_number_id";
    return result;
  }

  const text = TL_BossPolicy_buildPacketText_(kind, items, cfg, now);
  result.text = text;
  const sendResult = cfg.sendFn(phoneNumberId, cfg.bossPhone, text, {
    kind: kind,
    items: items,
    now: now,
    settings: cfg
  });
  result.send_result = sendResult;
  result.sent = !!(sendResult && sendResult.ok);
  result.ok = result.sent;

  if (result.sent) {
    if ((kind === "decision" || kind === "urgent") && typeof TL_Menu_StoreDecisionPacket_ === "function") {
      TL_Menu_StoreDecisionPacket_(cfg.bossPhone, kind, items);
    }
    TL_BossPolicy_stateSet_(sigKey, result.signature, options);
    TL_BossPolicy_stateSet_(atKey, now.toISOString(), options);
  }

  return result;
}

function TL_BossPolicy_buildPacketText_(kind, items, cfg, now) {
  const title = kind === "urgent" ? "TaskLess דחוף" : (kind === "decision" ? "TaskLess בקשת החלטה" : "TaskLess תקציר");
  const mode = "מצב=" + cfg.interruptLevel + "; פריטים=" + items.length;
  const lines = [title, mode];
  items.forEach(function(item, index) {
    lines.push(TL_BossPolicy_formatItemLine_(item, index + 1, kind));
  });
  if (kind === "decision" || kind === "urgent") {
    lines.push("1. כן, אשר הכל");
    lines.push("2. רק חלק");
    lines.push("3. תן לי אחד אחד");
    lines.push("4. קבץ לי בצורה חכמה");
    lines.push("5. דחה לעכשיו");
    lines.push("6. חזרה לתפריט ראשי");
    lines.push("שלח את מספר האפשרות שתבחר");
  }
  if (kind === "digest") {
    lines.push("פריטי FYI נכללים רק אם נשאר מקום בחבילה.");
  }
  return lines.join("\n");
}

function TL_BossPolicy_formatItemLine_(item, index, kind) {
  const label = item.isUrgent ? "דחוף" : (item.isDecision ? "החלטה" : "FYI");
  const actor = item.receiver || item.sender || item.contactId || item.rootId || "unknown";
  const summary = TL_BossPolicy_preview_(item.summary || item.proposal || item.taskStatus || "", 90);
  const extra = item.isDecision ? TL_BossPolicy_preview_(item.proposal || item.summary || "", 90) : "";
  const id = item.recordId || item.messageId || item.key;
  const parts = [String(index) + ".", "[" + label + "]", actor, "id=" + id];
  if (summary) parts.push(summary);
  if (extra && extra !== summary) parts.push("->", extra);
  return parts.join(" ");
}

function TL_BossPolicy_resolveOutboundPhoneId_(items, cfg) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].phoneNumberId) return items[i].phoneNumberId;
  }
  const fallback = TL_BossPolicy_trim_(TL_BossPolicy_getSetting_("BUSINESS_PHONE_ID", cfg.settings)) || TL_BossPolicy_trim_(TL_BossPolicy_getSetting_("BUSINESS_PHONEID", cfg.settings));
  if (fallback) return fallback;
  return TL_BossPolicy_trim_(TLW_getSetting_("BUSINESS_PHONE_ID")) || TL_BossPolicy_trim_(TLW_getSetting_("BUSINESS_PHONEID"));
}

function TL_BossPolicy_signature_(items) {
  return TL_BossPolicy_uniqueItems_(items).slice().sort(function(a, b) {
    return String(a.key).localeCompare(String(b.key));
  }).map(function(item) {
    return [
      item.key,
      item.approvalStatus,
      item.executionStatus,
      item.priorityLevel,
      item.importanceLevel,
      item.urgencyFlag ? "1" : "0",
      item.isFYI ? "1" : "0"
    ].join("|");
  }).join("||");
}

function TL_BossPolicy_sortItems_(items, urgentFirst) {
  return items.slice().sort(function(a, b) {
    if (urgentFirst) {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      if (a.isHigh !== b.isHigh) return a.isHigh ? -1 : 1;
    }
    const at = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
    const bt = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
    if (at !== bt) return bt - at;
    return String(a.key).localeCompare(String(b.key));
  });
}

function TL_BossPolicy_uniqueItems_(items) {
  const seen = {};
  const out = [];
  items.forEach(function(item) {
    if (!item || seen[item.key]) return;
    seen[item.key] = true;
    out.push(item);
  });
  return out;
}

function TL_BossPolicy_getSetting_(key, settings) {
  const k = TLW_normalizeSettingKey_(key);
  if (!k) return "";
  if (settings) {
    const keys = Object.keys(settings);
    for (let i = 0; i < keys.length; i++) {
      if (TLW_normalizeSettingKey_(keys[i]) === k) {
        return String(settings[keys[i]] || "").trim();
      }
    }
  }
  return TLW_getSetting_(k);
}

function TL_BossPolicy_stateGet_(key, options) {
  const state = options && options.state ? options.state : null;
  if (state && Object.prototype.hasOwnProperty.call(state, key)) {
    return String(state[key] || "").trim();
  }
  try {
    return String(PropertiesService.getScriptProperties().getProperty(key) || "").trim();
  } catch (e) {
    return "";
  }
}

function TL_BossPolicy_stateSet_(key, value, options) {
  const text = String(value || "").trim();
  const state = options && options.state ? options.state : null;
  if (state) {
    state[key] = text;
  }
  if (!(options && options.persistState === false)) {
    try {
      PropertiesService.getScriptProperties().setProperty(key, text);
    } catch (e) {}
  }
}

function TL_BossPolicy_now_(options) {
  if (options && options.now) {
    return options.now instanceof Date ? new Date(options.now.getTime()) : new Date(options.now);
  }
  return new Date();
}

function TL_BossPolicy_parseBoolean_(value, fallback) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return !!fallback;
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

function TL_BossPolicy_parseNumber_(value, fallback) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return Number(fallback || 0);
  return Math.floor(n);
}

function TL_BossPolicy_normalizeInterruptLevel_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["manual_only", "urgent_only", "high_and_urgent", "all_action_items"];
  return allowed.indexOf(v) !== -1 ? v : "urgent_only";
}

function TL_BossPolicy_preview_(text, limit) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const max = Math.max(20, Number(limit || 90));
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function TL_BossPolicy_trim_(value) {
  return String(value || "").trim();
}

function TL_Orchestrator_indexThreads_(rows) {
  const threads = {};
  rows.forEach(function(item) {
    const values = item.values;
    const rootId = TL_Orchestrator_value_(values, "root_id");
    if (!rootId) return;
    const recordClass = TL_Orchestrator_value_(values, "record_class");
    const direction = TL_Orchestrator_value_(values, "direction");
    const timestamp = values[0] instanceof Date ? values[0] : new Date(values[0] || Date.now());

    if (!threads[rootId]) {
      threads[rootId] = {
        rootId: rootId,
        rows: [],
        latestIncomingRow: null,
        latestProposalRow: null,
        latestTimestamp: null
      };
    }

    const thread = threads[rootId];
    thread.rows.push(item);
    if (!thread.latestTimestamp || timestamp > thread.latestTimestamp) {
      thread.latestTimestamp = timestamp;
    }

    if (recordClass === "communication" && direction === "incoming") {
      if (!thread.latestIncomingRow || item.rowNumber > thread.latestIncomingRow.rowNumber) {
        thread.latestIncomingRow = item;
      }
    }

    if (recordClass === "proposal") {
      if (!thread.latestProposalRow || item.rowNumber > thread.latestProposalRow.rowNumber) {
        thread.latestProposalRow = item;
      }
    }
  });
  return threads;
}

function TL_Orchestrator_readRecentRows_(limit) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return [];

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const scan = Math.min(TL_Orchestrator_normalizeScanRows_(limit), lastRow - 1);
  const start = lastRow - scan + 1;
  const values = sh.getRange(start, 1, scan, TL_WEBHOOK.INBOX_HEADERS.length).getValues();
  return values.map(function(row, idx) {
    return {
      rowNumber: start + idx,
      values: row
    };
  });
}

function TL_Orchestrator_value_(values, headerName) {
  try {
    return String(values[TLW_colIndex_(headerName) - 1] || "").trim();
  } catch (err) {
    return "";
  }
}

function TL_Orchestrator_normalizeBatchSize_(batchSize) {
  const n = Number(batchSize || TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE);
  if (!isFinite(n) || n <= 0) return TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE;
  return Math.min(Math.floor(n), 20);
}

function TL_Orchestrator_normalizeScanRows_(scanRows) {
  const n = Number(scanRows || TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  if (!isFinite(n) || n <= 0) return TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS;
  return Math.min(Math.floor(n), TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
}

function TL_Orchestrator_parseLateStatusKey_(key) {
  const match = String(key || "").match(/^TL_LATE_STATUS_(.+)_(.+)$/);
  if (!match) return null;
  return {
    phoneId: match[1],
    messageId: match[2]
  };
}

function TL_Orchestrator_withLock_(label, fn) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(1000);
  if (!acquired) {
    return {
      ok: false,
      skipped: true,
      reason: "lock_busy",
      label: String(label || "")
    };
  }

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function TL_Capture_getRows_(options) {
  if (options && Array.isArray(options.rows)) {
    return options.rows.slice();
  }
  return TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
}

function TL_Capture_getInputText_(values) {
  const text = TL_Orchestrator_value_(values, "text");
  if (text) return text;
  const summary = TL_Orchestrator_value_(values, "ai_summary");
  if (summary) return summary;
  const caption = TL_Orchestrator_value_(values, "media_caption");
  if (caption) return caption;
  const proposal = TL_Orchestrator_value_(values, "ai_proposal");
  if (proposal) return proposal;
  return "";
}

function TL_Capture_normalizeExtraction_(extraction, captureText) {
  const out = {
    summary: "",
    items: []
  };

  if (!extraction) {
    return out;
  }

  const raw = extraction.raw_json || extraction.raw || extraction;
  out.summary = String(extraction.summary || raw.summary || "").trim();

  const sourceItems = Array.isArray(extraction.items) ? extraction.items : (Array.isArray(raw.items) ? raw.items : []);
  out.items = sourceItems.map(function(item) {
    return TL_Capture_normalizeItem_(item);
  }).filter(function(item) {
    return !!item;
  });

  if (!out.summary) {
    out.summary = TL_BossPolicy_preview_(captureText, 120);
  }

  return out;
}

function TL_Capture_normalizeItem_(item) {
  if (!item || typeof item !== "object") return null;
  const kind = TL_AI_normalizeBossCaptureKind_(item.kind);
  const title = String(item.title || "").trim();
  const summary = String(item.summary || title || "").trim();
  const proposal = String(item.proposal || summary || title || "").trim();
  return {
    kind: kind,
    title: title,
    summary: summary,
    proposal: proposal,
    task_due: String(item.task_due || "").trim(),
    task_priority: String(item.task_priority || "").trim().toLowerCase(),
    approval_required: String(item.approval_required || "true").trim().toLowerCase() === "true",
    notes: String(item.notes || "").trim()
  };
}

function TL_Capture_makeFallbackItem_(captureText) {
  return {
    kind: "journal",
    title: TL_BossPolicy_preview_(captureText, 60),
    summary: TL_BossPolicy_preview_(captureText, 120),
    proposal: TL_BossPolicy_preview_(captureText, 120),
    task_due: "",
    task_priority: "low",
    approval_required: true,
    notes: ""
  };
}

function TL_Capture_buildChildRow_(sourceValues, sourceRowNumber, item, index, cfg, now) {
  const rootId = TL_Orchestrator_value_(sourceValues, "root_id");
  const parentEventId = TL_Orchestrator_value_(sourceValues, "event_id");
  const parentMessageId = TL_Orchestrator_value_(sourceValues, "message_id");
  const phoneNumberId = TL_Orchestrator_value_(sourceValues, "phone_number_id");
  const displayPhone = TL_Orchestrator_value_(sourceValues, "display_phone_number");
  const bossPhone = cfg.bossPhone;
  const sender = displayPhone || TLW_getSetting_("BUSINESS_PHONE") || TLW_getSetting_("DISPLAY_PHONE_NUMBER") || "";
  const receiver = bossPhone;
  const proposalText = String(item.proposal || item.summary || item.title || "").trim();
  const summary = String(item.summary || item.title || proposalText || "").trim();
  const kind = String(item.kind || "journal").trim().toLowerCase();
  const messageId = "CAP_" + parentEventId + "_" + String(index + 1);
  const recordId = "CAPR_" + parentEventId + "_" + String(index + 1);
  const notes = [
    "boss_capture_kind=" + kind,
    "boss_capture_parent_event_id=" + parentEventId,
    "boss_capture_parent_message_id=" + parentMessageId,
    "boss_capture_source_row=" + String(sourceRowNumber || 0)
  ];
  if (item.notes) {
    notes.push("boss_capture_item_notes=" + String(item.notes).replace(/\n+/g, " "));
  }

  return {
    timestamp: now,
    root_id: rootId,
    event_id: "EVT_" + Utilities.getUuid(),
    parent_event_id: parentEventId,
    record_id: recordId,
    record_version: 1,
    record_class: "proposal",
    channel: "whatsapp",
    direction: "outgoing",
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    sender: sender,
    receiver: receiver,
    message_id: messageId,
    message_type: "text",
    text: proposalText,
    ai_summary: summary,
    ai_proposal: proposalText,
    approval_required: "true",
    approval_status: "draft",
    execution_status: "proposal_ready",
    status_latest: "",
    status_timestamp: "",
    statuses_count: 0,
    contact_id: "",
    raw_payload_ref: "",
    notes: notes.join(";"),
    task_due: String(item.task_due || ""),
    task_status: "proposal_ready",
    task_priority: String(item.task_priority || ""),
    topic_id: TL_Orchestrator_value_(sourceValues, "topic_id"),
    topic_tagged_at: TL_Orchestrator_value_(sourceValues, "topic_tagged_at"),
    biz_stage: "",
    biz_stage_ts: "",
    payment_status: "",
    delivery_due: "",
    media_id: "",
    media_mime_type: "",
    media_sha256: "",
    media_caption: "",
    media_filename: "",
    media_is_voice: false,
    priority_level: String(item.task_priority || ""),
    importance_level: String(item.task_priority || ""),
    urgency_flag: item.task_priority === "high" ? "true" : "false",
    needs_owner_now: item.task_priority === "high" ? "true" : "false",
    suggested_action: kind === "journal" ? "review_manually" : "follow_up"
  };
}

function TL_Capture_upsertChildRow_(childRow) {
  const phoneNumberId = String(childRow.phone_number_id || "").trim();
  const messageId = String(childRow.message_id || "").trim();
  const existing = TLW_findRowByMessageId_(phoneNumberId, messageId);
  if (existing) {
    return {
      ok: true,
      rowNumber: existing.row,
      row: existing.row,
      existing: true
    };
  }

  const appended = TLW_appendInboxRow_(childRow, TLW_safeStringify_({
    source: "TL_Capture_Run",
    root_id: childRow.root_id,
    parent_event_id: childRow.parent_event_id,
    capture_kind: TL_Orchestrator_captureKindFromNotes_(childRow.notes)
  }, 4000));
  return {
    ok: true,
    rowNumber: appended.row,
    row: appended.row,
    existing: false
  };
}

function TL_Capture_buildPacketItem_(childRow, rowNumber) {
  return {
    key: String(childRow.record_id || childRow.event_id || childRow.message_id || ("row_" + rowNumber)),
    rowNumber: Number(rowNumber || 0),
    recordId: String(childRow.record_id || ""),
    rootId: String(childRow.root_id || ""),
    recordClass: String(childRow.record_class || ""),
    summary: String(childRow.ai_summary || childRow.text || ""),
    proposal: String(childRow.ai_proposal || childRow.text || ""),
    sender: String(childRow.sender || ""),
    receiver: String(childRow.receiver || ""),
    contactId: String(childRow.contact_id || ""),
    approvalStatus: String(childRow.approval_status || ""),
    executionStatus: String(childRow.execution_status || ""),
    taskStatus: String(childRow.task_status || ""),
    isUrgent: String(childRow.urgency_flag || "").toLowerCase() === "true" || String(childRow.needs_owner_now || "").toLowerCase() === "true",
    isHigh: String(childRow.priority_level || "").toLowerCase() === "high" || String(childRow.importance_level || "").toLowerCase() === "high"
  };
}

function TL_Capture_buildPacketText_(summary, packetItems, cfg, now) {
  if (packetItems && packetItems.length === 1 && typeof TL_Menu_BuildDecisionPacketOneByOneReply_ === "function") {
    return TL_Menu_BuildDecisionPacketOneByOneReply_({
      kind: "capture",
      stage: "one_by_one",
      cursor: 0,
      items: packetItems
    });
  }
  const title = "בקשת החלטה";
  const lines = [
    title,
    "הבנתי כך: " + TL_BossPolicy_preview_(summary || "", 120)
  ];
  const detail = TL_BossPolicy_buildPacketText_("decision", packetItems, cfg, now);
  lines.push(detail);
  return lines.join("\n");
}

function TL_Capture_appendNote_(values, extraLine) {
  const existing = TL_Orchestrator_value_(values, "notes");
  const extra = String(extraLine || "").trim();
  if (!extra) return existing;
  if (!existing) return extra;
  if (existing.indexOf(extra) !== -1) return existing;
  return existing + "\n" + extra;
}

function TL_Orchestrator_captureKindFromNotes_(notes) {
  const text = String(notes || "");
  const match = text.match(/(?:^|[;\n])boss_capture_kind=([^;\n]+)/i);
  if (!match) return "";
  const kind = String(match[1] || "").trim().toLowerCase();
  if (kind === "reminder" || kind === "task" || kind === "journal") return kind;
  return kind === "log" || kind === "note" ? "journal" : "";
}
