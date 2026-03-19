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

function TL_Synthesis_RunUnlocked_(batchSize, options) {
  const limit = TL_Orchestrator_normalizeBatchSize_(batchSize);
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  const cutoff = new Date(Date.now() - TL_ORCHESTRATOR.DEFAULT_QUIET_WINDOW_MINUTES * 60000);
  const promptFn = options && typeof options.promptFn === "function" ? options.promptFn : null;
  const useAi = !(options && options.useAi === false);
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
  return (rows || []).map(function(item) {
    return TL_BossPolicy_classifyItem_(item);
  }).filter(function(item) {
    return !!item;
  });
}

function TL_BossPolicy_classifyItem_(item) {
  if (!item || !item.values) return null;
  const values = item.values;
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
