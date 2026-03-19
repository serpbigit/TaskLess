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
  TRIGGER_HANDLER: "TL_Orchestrator_Run"
};

function TL_Orchestrator_Run() {
  return TL_Orchestrator_withLock_("orchestrator", function() {
    const result = {
      ok: true,
      version: TL_ORCHESTRATOR.VERSION,
      repair: TL_Repair_RunUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      ai: TL_AI_RunPendingUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      synthesis: TL_Synthesis_RunUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      approval: TL_Approval_RunUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE),
      send: TL_Send_RunApprovedUnlocked_(TL_ORCHESTRATOR.DEFAULT_BATCH_SIZE)
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

function TL_Orchestrator_RunNow() {
  return TL_Orchestrator_Run();
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

function TL_Synthesis_Run(batchSize) {
  return TL_Orchestrator_withLock_("synthesis", function() {
    return TL_Synthesis_RunUnlocked_(batchSize);
  });
}

function TL_Approval_Run(batchSize) {
  return TL_Orchestrator_withLock_("approval", function() {
    return TL_Approval_RunUnlocked_(batchSize);
  });
}

function TL_Send_RunApproved(batchSize) {
  return TL_Orchestrator_withLock_("send", function() {
    return TL_Send_RunApprovedUnlocked_(batchSize);
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

function TL_Synthesis_RunUnlocked_(batchSize) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  const cutoff = new Date(Date.now() - TL_ORCHESTRATOR.DEFAULT_QUIET_WINDOW_MINUTES * 60000);
  const threads = TL_Orchestrator_indexThreads_(rows);
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

    const synthesis = TL_Orchestrator_buildThreadSynthesis_(thread);
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

function TL_Send_RunApprovedUnlocked_(batchSize) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
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
    const sendResult = TLW_sendText_(phoneNumberId, toWaId, proposal);
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

function TL_Orchestrator_buildThreadSynthesis_(thread) {
  const rows = (thread.rows || []).slice().sort(function(a, b) {
    return a.rowNumber - b.rowNumber;
  });
  const recent = rows.slice(-5);
  const threadText = recent.map(function(item) {
    const values = item.values;
    const sender = TL_Orchestrator_value_(values, "sender") || "unknown";
    const text = TL_Orchestrator_value_(values, "text") || TL_Orchestrator_value_(values, "media_caption");
    return sender + ": " + text;
  }).join("\n");

  const fallbackSummary = "Thread with " + rows.length + " messages from " + (TL_Orchestrator_value_(thread.latestIncomingRow.values, "sender") || "a contact");
  const fallbackProposal = "Please review this thread and approve a reply.";
  let summary = fallbackSummary;
  let proposal = fallbackProposal;

  if (typeof TL_AI_callPrompt_ === "function") {
    try {
      const prompt = [
        "You are TaskLess.",
        "Return strict JSON only.",
        '{"summary":"...","proposal":"..."}',
        "Summarize this WhatsApp thread and draft a concise Boss-ready reply proposal.",
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
