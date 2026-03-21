/**
 * TL_Email sidecar scaffold.
 */

const TL_EMAIL = {
  VERSION: "v1",
  DEFAULT_QUERY: 'is:important newer_than:14d -category:promotions -category:social',
  SCHEDULED_QUERY_FALLBACK: 'is:important newer_than:14d -category:promotions -category:social',
  DEFAULT_PULL_LIMIT: 20,
  DEFAULT_MESSAGES_PER_THREAD: 20,
  DEFAULT_CHARS_PER_MESSAGE: 6000,
  DEFAULT_TOTAL_CHARS: 22000,
  DEFAULT_HISTORY_DEPTH: 5,
  DEFAULT_HISTORY_EXPANDED_DEPTH: 10,
  DEFAULT_TRIAGE_BATCH_SIZE: 5,
  TRIGGER_HANDLER: "TL_Email_RunScheduled",
  PROP_LAST_PULL_AT: "TL_EMAIL_LAST_PULL_AT",
  PROP_LAST_PULL_QUERY: "TL_EMAIL_LAST_PULL_QUERY",
  PROP_LAST_PULL_MAX_MSG_AT: "TL_EMAIL_LAST_PULL_MAX_MSG_AT"
};

function TL_Email_RunScheduled() {
  return TL_Email_withLock_("scheduled", function() {
    if (typeof TL_Automation_IsEnabled_ === "function" && !TL_Automation_IsEnabled_()) {
      return { ok: true, skipped: true, reason: "automation_disabled" };
    }
    if (!TL_Email_isEnabled_()) {
      return { ok: true, skipped: true, reason: "email_pull_disabled" };
    }

    const query = String(TLW_getSetting_("EMAIL_PULL_QUERY") || TL_EMAIL.SCHEDULED_QUERY_FALLBACK).trim() || TL_EMAIL.SCHEDULED_QUERY_FALLBACK;
    const maxThreads = TL_Email_int_(TLW_getSetting_("EMAIL_PULL_MAX_THREADS"), TL_EMAIL.DEFAULT_PULL_LIMIT);
    const triageBatchSize = TL_Email_int_(TLW_getSetting_("EMAIL_TRIAGE_BATCH_SIZE"), TL_EMAIL.DEFAULT_TRIAGE_BATCH_SIZE);
    const pull = TL_Email_PullImportant_Run({
      query: query,
      maxThreads: maxThreads
    });
    const triage = TL_Email_isTriageEnabled_()
      ? TL_Email_TriagePending({ batchSize: triageBatchSize, dryRun: false })
      : { ok: true, skipped: true, reason: "email_triage_disabled" };

    const result = {
      ok: true,
      query: query,
      maxThreads: maxThreads,
      triageBatchSize: triageBatchSize,
      pull: pull,
      triage: triage
    };
    if (typeof TLW_logInfo_ === "function") TLW_logInfo_("email_run_scheduled", result);
    return result;
  });
}

function TL_Email_InstallTrigger_1m() {
  TL_Email_RemoveTriggers();
  ScriptApp.newTrigger(TL_EMAIL.TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(1)
    .create();
  return {
    ok: true,
    handler: TL_EMAIL.TRIGGER_HANDLER,
    cadence: "every 1 minute"
  };
}

function TL_Email_InstallTrigger_5m() {
  TL_Email_RemoveTriggers();
  ScriptApp.newTrigger(TL_EMAIL.TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();
  return {
    ok: true,
    handler: TL_EMAIL.TRIGGER_HANDLER,
    cadence: "every 5 minutes"
  };
}

function TL_Email_RemoveTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === TL_EMAIL.TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return { ok: true, removed: removed };
}

function TL_Email_Status() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === TL_EMAIL.TRIGGER_HANDLER;
  });
  return {
    ok: true,
    handler: TL_EMAIL.TRIGGER_HANDLER,
    trigger_count: triggers.length,
    email_pull_enabled: TLW_getSetting_("EMAIL_PULL_ENABLED"),
    email_pull_query: TLW_getSetting_("EMAIL_PULL_QUERY") || TL_EMAIL.SCHEDULED_QUERY_FALLBACK,
    email_pull_max_threads: TLW_getSetting_("EMAIL_PULL_MAX_THREADS") || String(TL_EMAIL.DEFAULT_PULL_LIMIT),
    email_triage_enabled: TLW_getSetting_("EMAIL_TRIAGE_ENABLED"),
    email_triage_batch_size: TLW_getSetting_("EMAIL_TRIAGE_BATCH_SIZE") || String(TL_EMAIL.DEFAULT_TRIAGE_BATCH_SIZE),
    checkpoint: TL_Email_getPullCheckpoint_()
  };
}

function TL_Email_withLock_(label, fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function TL_Email_isEnabled_() {
  const raw = String(TLW_getSetting_("EMAIL_PULL_ENABLED") || "true").trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "no");
}

function TL_Email_isTriageEnabled_() {
  const raw = String(TLW_getSetting_("EMAIL_TRIAGE_ENABLED") || "true").trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "no");
}

function TL_Email_PullImportant_Run(opts) {
  const options = opts || {};
  const checkpoint = TL_Email_getPullCheckpoint_();
  const query = TL_Email_buildPullQuery_(String(options.query || TL_EMAIL.DEFAULT_QUERY), checkpoint, options);
  const maxThreads = TL_Email_int_(options.maxThreads, TL_EMAIL.DEFAULT_PULL_LIMIT);
  const maxMessagesPerThread = TL_Email_int_(options.maxMessagesPerThread, TL_EMAIL.DEFAULT_MESSAGES_PER_THREAD);
  const maxCharsPerMessage = TL_Email_int_(options.maxCharsPerMessage, TL_EMAIL.DEFAULT_CHARS_PER_MESSAGE);
  const maxTotalChars = TL_Email_int_(options.maxTotalChars, TL_EMAIL.DEFAULT_TOTAL_CHARS);
  const ownerEmail = TL_Email_ownerEmail_();
  const pulledAtIso = new Date().toISOString();

  TL_Sheets_bootstrapPOC();

  const threads = GmailApp.search(query, 0, maxThreads);
  const out = [];
  let ingested = 0;
  let skipped = 0;
  let latestMsgAtIso = "";

  for (let i = 0; i < threads.length; i++) {
    const snapshot = TL_Email_NormalizeThread_(threads[i], {
      ownerEmail: ownerEmail,
      query: query,
      pulledAtIso: pulledAtIso,
      maxMessagesPerThread: maxMessagesPerThread,
      maxCharsPerMessage: maxCharsPerMessage,
      maxTotalChars: maxTotalChars
    });

    if (!snapshot.eligible) {
      skipped++;
      out.push({ refId: snapshot.refId, skipped: true, reason: snapshot.skipReason });
      continue;
    }

    TL_Email_UpsertThreadRow_(snapshot, TL_Email_tabOpen_());
    ingested++;
    out.push({ refId: snapshot.refId, subject: snapshot.subject, latestMsgId: snapshot.latestMsgId });
    if (snapshot.latestMsgDateIso && snapshot.latestMsgDateIso > latestMsgAtIso) {
      latestMsgAtIso = snapshot.latestMsgDateIso;
    }
  }

  TL_Email_recordPullCheckpoint_({
    query: query,
    completedAtIso: pulledAtIso,
    latestMsgAtIso: latestMsgAtIso,
    threadCount: threads.length,
    ingested: ingested,
    skipped: skipped
  });

  return {
    ok: true,
    query: query,
    checkpoint: TL_Email_getPullCheckpoint_(),
    ownerEmail: ownerEmail,
    pulled: threads.length,
    ingested: ingested,
    skipped: skipped,
    sample: out.slice(0, 5)
  };
}

function TL_Email_NormalizeThread_(thread, opts) {
  const options = opts || {};
  const ownerEmail = TL_Email_normEmail_(options.ownerEmail || TL_Email_ownerEmail_());
  const threadId = String(thread.getId());
  const refId = "gmail:thread:" + threadId;
  const subject = String(thread.getFirstMessageSubject() || "(no subject)");
  const allMessages = thread.getMessages();
  const messages = allMessages.slice(Math.max(0, allMessages.length - TL_Email_int_(options.maxMessagesPerThread, TL_EMAIL.DEFAULT_MESSAGES_PER_THREAD)));
  const latestMsg = allMessages.length ? allMessages[allMessages.length - 1] : null;
  const latestMsgId = latestMsg ? String(latestMsg.getId()) : "";
  const latestMsgDateIso = latestMsg ? latestMsg.getDate().toISOString() : "";
  const flattened = TL_Gmail_flattenThread_(
    messages,
    TL_Email_int_(options.maxCharsPerMessage, TL_EMAIL.DEFAULT_CHARS_PER_MESSAGE),
    TL_Email_int_(options.maxTotalChars, TL_EMAIL.DEFAULT_TOTAL_CHARS)
  );

  const messageSnapshots = messages.map(function(msg) {
    return TL_Email_messageSnapshot_(msg);
  });
  const ownerInbound = messageSnapshots.filter(function(snap) {
    return TL_Email_messageIsOwnerInbound_(snap, ownerEmail);
  });
  const senderEmail = TL_Email_pickSender_(ownerInbound, messageSnapshots, ownerEmail);
  const eligible = ownerInbound.length > 0;
  const nowIso = String(options.pulledAtIso || new Date().toISOString());
  const payload = {
    source: "gmail",
    version: TL_EMAIL.VERSION,
    threadId: threadId,
    refId: refId,
    permalink: "https://mail.google.com/mail/u/0/#inbox/" + threadId,
    subject: subject,
    latestMsgId: latestMsgId,
    latestMsgDateIso: latestMsgDateIso,
    ownerEmail: ownerEmail,
    senderEmail: senderEmail,
    participants: TL_Email_collectParticipants_(messageSnapshots),
    ownerInboundCount: ownerInbound.length,
    ownerMatchedMessages: ownerInbound,
    flattenedText: flattened.text,
    flattenedTruncated: flattened.truncated,
    query: String(options.query || TL_EMAIL.DEFAULT_QUERY),
    limits: {
      maxMessagesPerThread: TL_Email_int_(options.maxMessagesPerThread, TL_EMAIL.DEFAULT_MESSAGES_PER_THREAD),
      maxCharsPerMessage: TL_Email_int_(options.maxCharsPerMessage, TL_EMAIL.DEFAULT_CHARS_PER_MESSAGE),
      maxTotalChars: TL_Email_int_(options.maxTotalChars, TL_EMAIL.DEFAULT_TOTAL_CHARS)
    }
  };

  return {
    eligible: eligible,
    skipReason: eligible ? "" : "owner_not_in_to_or_cc",
    threadId: threadId,
    refId: refId,
    subject: subject,
    latestMsgId: latestMsgId,
    latestMsgDateIso: latestMsgDateIso,
    ownerEmail: ownerEmail,
    senderEmail: senderEmail,
    participants: TL_Email_collectParticipants_(messageSnapshots),
    ownerInboundCount: ownerInbound.length,
    flattened: flattened,
    payload: payload,
    rowObj: {
      createdAt: nowIso,
      updatedAt: nowIso,
      userE164: "",
      refId: refId,
      chunkId: latestMsgId,
      title: subject,
      kind: "email_thread",
      channel: "email",
      status: "OPEN",
      askedAt: "",
      answeredAt: "",
      executedAt: "",
      draftOrPromptJson: JSON.stringify(payload),
      lastAction: "EMAIL_PULL",
      lastActionAt: nowIso
    }
  };
}

function TL_Email_TriagePending(opts) {
  const options = opts || {};
  const dryRun = options.dryRun === true || String(options.dryRun || "").toLowerCase() === "true";
  const batchSize = TL_Email_int_(options.batchSize, 5);
  const rows = TL_Email_scanRows_([TL_Email_tabOpen_()], function(item) {
    return String(item.data.channel || "").toLowerCase() === "email" &&
      String(item.data.status || "").toUpperCase() === "OPEN";
  }, batchSize);

  const result = { ok: true, scanned: 0, triaged: 0, queued: 0, dryRun: dryRun };

  for (let i = rows.length - 1; i >= 0 && result.scanned < batchSize; i--) {
    const item = rows[i];
    result.scanned++;

    const snapshot = TL_Email_rowToSnapshot_(item.data);
    const triage = TL_Email_TriageSnapshot_(snapshot, { dryRun: dryRun });
    const proposal = TL_Email_BuildReplyProposal_(snapshot, triage, { dryRun: dryRun });
    const bossCard = TL_Email_BuildBossCard_(snapshot, triage, proposal);
    const merged = TL_Email_mergePayload_(snapshot.payload, {
      triage: triage,
      proposal: proposal,
      approvalSnapshot: bossCard,
      approvalStatus: "awaiting_approval",
      sendStatus: "pending"
    });
    const nextRow = TL_Email_rowWithUpdates_(item.data, {
      status: "REVISION",
      title: proposal.subject,
      draftOrPromptJson: JSON.stringify(merged),
      lastAction: "EMAIL_QUEUE_APPROVAL",
      lastActionAt: new Date().toISOString()
    });

    if (dryRun) {
      result.sample = result.sample || [];
      result.sample.push({ refId: snapshot.refId, triage: triage, proposal: proposal, bossCard: bossCard });
    } else {
      TL_Email_moveRow_(TL_Email_tabOpen_(), item.rowNumber, TL_Email_tabRevision_(), nextRow);
      result.queued++;
    }
    result.triaged++;
  }

  return result;
}

function TL_Email_TriageSnapshot_(snapshot, opts) {
  const options = opts || {};
  const payload = snapshot.payload || {};
  const dryRun = options.dryRun === true || String(options.dryRun || "").toLowerCase() === "true";
  const history = dryRun
    ? { ok: true, senderEmail: payload.senderEmail || snapshot.senderEmail || "", depth: 0, expanded: false, items: [] }
    : TL_Email_LookupHistory_(payload.senderEmail || snapshot.senderEmail || "", {
        triageHint: payload,
        dryRun: false
      });

  if (dryRun || !TL_Email_hasAiConfig_()) {
    return TL_Email_heuristicTriage_(payload.flattenedText || snapshot.title || "", payload, history);
  }

  const cfg = TL_AI_getConfig_();
  const draftContext = typeof TL_DraftContext_BuildForEmailSnapshot_ === "function"
    ? TL_DraftContext_BuildForEmailSnapshot_(snapshot)
    : null;
  const prompt = TL_Email_buildTriagePrompt_(payload.flattenedText || snapshot.title || "", cfg.language, cfg.bossName, history, payload, draftContext && draftContext.promptBrief);
  const result = TL_AI_callPrompt_(prompt);

  return {
    priority_level: TL_AI_normalizeLevel_(result.raw_json.priority_level),
    importance_level: TL_AI_normalizeLevel_(result.raw_json.importance_level),
    urgency_flag: TL_AI_normalizeBooleanString_(result.raw_json.urgency_flag),
    significance_flag: TL_Email_significanceFlag_(result.raw_json, history),
    needs_owner_now: TL_AI_normalizeBooleanString_(result.raw_json.needs_owner_now),
    suggested_action: TL_AI_normalizeSuggestedAction_(result.raw_json.suggested_action),
    summary: String(result.raw_json.summary || result.summary || "").trim(),
    proposal: String(result.raw_json.proposal || result.proposal || "").trim(),
    historyDepth: history.depth,
    historyUsed: history.items,
    draftContext: draftContext
  };
}

function TL_Email_significanceFlag_(rawJson, history) {
  const raw = rawJson || {};
  const sig = String(raw.significance_flag || "").toLowerCase();
  if (sig === "true") return "true";
  if (sig === "false") return "false";
  if (history && history.items && history.items.length > 0) return "true";
  return "false";
}

function TL_Email_BuildReplyProposal_(snapshot, triage, opts) {
  const payload = snapshot.payload || {};
  const senderEmail = TL_Email_normEmail_(payload.senderEmail || snapshot.senderEmail || "");
  const subject = TL_Email_replySubject_(payload.subject || snapshot.title || "");
  const body = TL_Email_replyBody_(snapshot, triage, opts || {});
  return {
    to: senderEmail,
    subject: subject,
    body: body,
    cc: "",
    bcc: "",
    replyTo: "",
    threadId: payload.threadId || snapshot.threadId || "",
    latestMsgId: payload.latestMsgId || snapshot.chunkId || "",
    summary: String(triage.summary || "").trim(),
    approvalStatus: "draft",
    sendStatus: "pending"
  };
}

function TL_Email_BuildBossCard_(snapshot, triage, proposal) {
  return {
    to: String(proposal.to || "").trim(),
    subject: String(proposal.subject || "").trim(),
    body: String(proposal.body || "").trim(),
    cc: String(proposal.cc || "").trim(),
    bcc: String(proposal.bcc || "").trim(),
    replyTo: String(proposal.replyTo || "").trim(),
    threadId: String(proposal.threadId || snapshot.threadId || "").trim(),
    latestMsgId: String(proposal.latestMsgId || snapshot.chunkId || "").trim(),
    approvalStatus: "awaiting_approval",
    sendStatus: "pending",
    summary: String(triage.summary || proposal.summary || "").trim(),
    triage: {
      priority_level: String(triage.priority_level || "medium"),
      importance_level: String(triage.importance_level || "medium"),
      urgency_flag: String(triage.urgency_flag || "false"),
      significance_flag: String(triage.significance_flag || "false"),
      needs_owner_now: String(triage.needs_owner_now || "false"),
      suggested_action: String(triage.suggested_action || "review_manually")
    },
    historyDepth: Number(triage.historyDepth || 0),
    historyUsed: triage.historyUsed || []
  };
}

function TL_Email_SendApproved(opts) {
  const options = opts || {};
  const dryRun = options.dryRun === true || String(options.dryRun || "").toLowerCase() === "true";
  const batchSize = TL_Email_int_(options.batchSize, 5);
  const rows = TL_Email_scanRows_([TL_Email_tabRevision_()], function(item) {
    const payload = TL_Email_getPayload_(item.data);
    const approval = payload.approvalSnapshot || {};
    return String(item.data.channel || "").toLowerCase() === "email" &&
      String(item.data.status || "").toUpperCase() === "REVISION" &&
      String(payload.approvalStatus || approval.approvalStatus || "").toLowerCase() === "approved" &&
      String(payload.sendStatus || approval.sendStatus || "").toLowerCase() !== "sent";
  }, batchSize);

  const result = { ok: true, scanned: 0, sent: 0, failed: 0, skipped: 0, dryRun: dryRun };

  for (let i = rows.length - 1; i >= 0 && result.scanned < batchSize; i--) {
    const item = rows[i];
    result.scanned++;
    const snapshot = TL_Email_rowToSnapshot_(item.data);
    const payload = snapshot.payload || {};
    const approval = payload.approvalSnapshot || {};
    const to = TL_Email_normEmail_(approval.to || payload.to || "");
    const subject = String(approval.subject || payload.subject || snapshot.title || "").trim();
    const body = String(approval.body || payload.body || "").trim();
    if (!to || !subject || !body) {
      result.skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        GmailApp.sendEmail(to, subject, body, {
          cc: String(approval.cc || "").trim(),
          bcc: String(approval.bcc || "").trim(),
          replyTo: String(approval.replyTo || "").trim()
        });
      } catch (err) {
        const failedPayload = TL_Email_mergePayload_(payload, {
          approvalStatus: "approved",
          sendStatus: "failed",
          sendReceipt: {
            sentAt: new Date().toISOString(),
            transport: "GmailApp.sendEmail",
            to: to,
            subject: subject,
            body: body,
            error: String(err && err.stack ? err.stack : err)
          },
          lastError: String(err && err.stack ? err.stack : err),
          lastAction: "EMAIL_SEND_FAILED",
          lastActionAt: new Date().toISOString()
        });
        TL_Email_updateRow_(TL_Email_tabRevision_(), item.rowNumber, TL_Email_rowWithUpdates_(item.data, {
          draftOrPromptJson: JSON.stringify(failedPayload),
          lastAction: "EMAIL_SEND_FAILED",
          lastActionAt: new Date().toISOString()
        }));
        result.failed++;
        continue;
      }
    }

    const sentAtIso = new Date().toISOString();
    const receipt = {
      sentAt: sentAtIso,
      transport: "GmailApp.sendEmail",
      to: to,
      subject: subject,
      body: body,
      dryRun: dryRun
    };
    const sentPayload = TL_Email_mergePayload_(payload, {
      approvalStatus: "approved",
      sendStatus: dryRun ? "dry_run_sent" : "sent",
      sendReceipt: receipt,
      executedAt: sentAtIso,
      lastAction: "EMAIL_SEND",
      lastActionAt: sentAtIso
    });
    const nextRow = TL_Email_rowWithUpdates_(item.data, {
      status: "ARCHIVE",
      draftOrPromptJson: JSON.stringify(sentPayload),
      executedAt: sentAtIso,
      lastAction: "EMAIL_SEND",
      lastActionAt: sentAtIso
    });
    TL_Email_moveRow_(TL_Email_tabRevision_(), item.rowNumber, TL_Email_tabArchive_(), nextRow);
    result.sent++;
  }

  return result;
}

function TL_Email_LookupHistory_(senderKey, opts) {
  const options = opts || {};
  const senderEmail = TL_Email_normEmail_(senderKey);
  if (!senderEmail) {
    return { ok: true, senderEmail: "", depth: 0, expanded: false, items: [] };
  }

  const payload = options.triageHint || {};
  const expanded = TL_Email_ShouldExpandHistory_(payload, payload);
  const depth = expanded ? TL_EMAIL.DEFAULT_HISTORY_EXPANDED_DEPTH : TL_EMAIL.DEFAULT_HISTORY_DEPTH;
  const threads = GmailApp.search("from:" + senderEmail + " newer_than:365d", 0, depth);
  const items = [];

  for (let i = 0; i < threads.length && items.length < depth; i++) {
    const snap = TL_Email_NormalizeThread_(threads[i], {
      ownerEmail: TL_Email_ownerEmail_(),
      query: "from:" + senderEmail + " newer_than:365d",
      maxMessagesPerThread: 5,
      maxCharsPerMessage: 1200,
      maxTotalChars: 4000,
      pulledAtIso: new Date().toISOString()
    });
    items.push({
      threadId: snap.threadId,
      refId: snap.refId,
      subject: snap.subject,
      latestMsgId: snap.latestMsgId,
      flattenedText: snap.flattened.text,
      latestMsgDateIso: snap.latestMsgDateIso
    });
  }

  return { ok: true, senderEmail: senderEmail, expanded: expanded, depth: depth, items: items };
}

function TL_Email_ShouldExpandHistory_(triage, payload) {
  const priority = String((triage && triage.priority_level) || "").toLowerCase();
  const importance = String((triage && triage.importance_level) || "").toLowerCase();
  const urgency = String((triage && triage.urgency_flag) || "").toLowerCase();
  const significance = String((triage && triage.significance_flag) || "").toLowerCase();
  const needsOwnerNow = String((triage && triage.needs_owner_now) || "").toLowerCase();
  const action = String((triage && triage.suggested_action) || "").toLowerCase();

  if (urgency === "true" || needsOwnerNow === "true") return true;
  if (priority === "high" || importance === "high" || significance === "true") return true;
  if (action === "reply_now" || action === "call" || action === "schedule" || action === "follow_up") return true;
  if (payload && payload.ownerInboundCount && Number(payload.ownerInboundCount) > 1) return true;
  const text = String((payload && (payload.flattenedText || payload.subject)) || "").toLowerCase();
  if (/(urgent|asap|now|today|immediately|deadline|invoice|payment|contract|meeting|quote|customer|client|legal|risk)/i.test(text)) {
    return true;
  }
  return false;
}

function TL_Email_replySubject_(subject) {
  const raw = String(subject || "").trim();
  return /^re:/i.test(raw) ? raw : "Re: " + raw;
}

function TL_Email_replyBody_(snapshot, triage, opts) {
  const payload = snapshot.payload || {};
  const core = String((triage && triage.proposal) || (triage && triage.summary) || payload.flattenedText || "").trim();
  return [
    "Hi,",
    "",
    core || "Thanks. I will review and get back to you shortly.",
    "",
    "Best,",
    "TaskLess"
  ].join("\n");
}

function TL_Email_heuristicTriage_(inputText, payload, history) {
  const text = String(inputText || "").trim();
  const urgency = /(urgent|asap|now|today|immediately|deadline|before|tonight)/i.test(text) ? "true" : "false";
  const importance = /(invoice|payment|contract|meeting|quote|customer|client|legal|deadline|issue|problem|risk)/i.test(text) ? "high" : "medium";
  const priority = urgency === "true" ? "high" : importance === "high" ? "medium" : "low";
  const action = urgency === "true" ? "reply_now" : (/(meeting|schedule|book)/i.test(text) ? "schedule" : "reply_later");
  const significance = TL_Email_ShouldExpandHistory_({
    priority_level: priority,
    importance_level: importance,
    urgency_flag: urgency,
    needs_owner_now: urgency,
    suggested_action: action
  }, payload) ? "true" : "false";

  return {
    priority_level: priority,
    importance_level: importance,
    urgency_flag: urgency,
    significance_flag: significance,
    needs_owner_now: urgency,
    suggested_action: action,
    summary: text.slice(0, 220) || "Email triage pending.",
    proposal: urgency === "true" ? "Reply promptly and acknowledge the request." : "Draft a concise reply for Boss review.",
    historyDepth: history.depth,
    historyUsed: history.items
  };
}

function TL_Email_buildTriagePrompt_(inputText, language, bossName, history, payload, draftContextBrief) {
  const historyText = (history && history.items && history.items.length)
    ? history.items.map(function(item, idx) {
        return "[" + (idx + 1) + "] " + item.subject + "\n" + item.flattenedText;
      }).join("\n\n")
    : "";
  return [
    "You are TaskLess, the email-side secretary assistant.",
    "Return strict JSON only.",
    "Language: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "Required JSON shape:",
    '{"priority_level":"low|medium|high","importance_level":"low|medium|high","urgency_flag":"true|false","significance_flag":"true|false","needs_owner_now":"true|false","suggested_action":"reply_now|reply_later|call|schedule|follow_up|wait|ignore|review_manually","summary":"...","proposal":"..."}',
    "Example JSON response:",
    '{"priority_level":"high","importance_level":"high","urgency_flag":"false","significance_flag":"true","needs_owner_now":"false","suggested_action":"review_manually","summary":"לקוח חשוב מבקש אישור להצעת מחיר ומצפה לתשובה מסודרת.","proposal":"הכן תשובה עניינית שמאשרת שקיבלת את המייל ומבטיחה חזרה מסודרת עם תשובה להצעת המחיר."}',
    draftContextBrief ? draftContextBrief : "Draft context brief: none",
    historyText ? "Recent sender history:\n" + historyText : "Recent sender history: none",
    "Email thread:",
    String(inputText || ""),
    payload && payload.subject ? "Thread subject: " + String(payload.subject) : ""
  ].join("\n");
}

function TL_Email_messageSnapshot_(msg) {
  const from = String(msg.getFrom() || "");
  const to = String(msg.getTo() || "");
  const cc = String(msg.getCc() || "");
  const bcc = String(msg.getBcc ? msg.getBcc() || "" : "");
  return {
    messageId: String(msg.getId() || ""),
    dateIso: msg.getDate().toISOString(),
    from: from,
    fromEmail: TL_Email_extractEmail_(from),
    to: to,
    cc: cc,
    bcc: bcc,
    subject: String(msg.getSubject() || ""),
    body: String(msg.getPlainBody() || ""),
    toEmails: TL_Email_extractEmails_(to),
    ccEmails: TL_Email_extractEmails_(cc)
  };
}

function TL_Email_messageIsOwnerInbound_(msg, ownerEmail) {
  const owner = TL_Email_normEmail_(ownerEmail);
  if (!owner) return false;
  const from = TL_Email_normEmail_(msg.fromEmail || msg.from || "");
  return from !== owner && (msg.toEmails.indexOf(owner) !== -1 || msg.ccEmails.indexOf(owner) !== -1);
}

function TL_Email_pickSender_(ownerMatchedMessages, messageSnapshots, ownerEmail) {
  const owner = TL_Email_normEmail_(ownerEmail);
  const candidates = (ownerMatchedMessages && ownerMatchedMessages.length ? ownerMatchedMessages : messageSnapshots) || [];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const from = TL_Email_normEmail_(candidates[i].fromEmail || candidates[i].from || "");
    if (from && from !== owner) return from;
  }
  return "";
}

function TL_Email_collectParticipants_(messageSnapshots) {
  const out = {};
  (messageSnapshots || []).forEach(function(msg) {
    [msg.from, msg.to, msg.cc, msg.bcc].forEach(function(value) {
      String(value || "").split(",").map(function(part) { return part.trim(); }).filter(Boolean).forEach(function(part) {
        out[part] = true;
      });
    });
  });
  return Object.keys(out);
}

function TL_Email_extractEmail_(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/<([^>]+)>/);
  const email = match ? match[1] : text;
  const cleaned = String(email || "").trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(cleaned) ? cleaned : "";
}

function TL_Email_extractEmails_(value) {
  return String(value || "").split(",").map(function(part) {
    return TL_Email_extractEmail_(part);
  }).filter(Boolean);
}

function TL_Email_normEmail_(value) {
  return TL_Email_extractEmail_(value);
}

function TL_Email_ownerEmail_() {
  const props = PropertiesService.getScriptProperties();
  const configured = String(props.getProperty("TL_EMAIL_OWNER_EMAIL") || "").trim();
  const session = String((Session.getEffectiveUser && Session.getEffectiveUser().getEmail && Session.getEffectiveUser().getEmail()) || "").trim();
  const active = String((Session.getActiveUser && Session.getActiveUser().getEmail && Session.getActiveUser().getEmail()) || "").trim();
  return TL_Email_normEmail_(configured || session || active || "");
}

function TL_Email_hasAiConfig_() {
  try {
    return typeof TL_AI_getConfig_ === "function" && !!TL_AI_getConfig_();
  } catch (err) {
    return false;
  }
}

function TL_Email_scanRows_(tabNames, predicate, limit) {
  const ss = TL_Sheets_getStore_();
  const tabs = tabNames || [TL_Email_tabOpen_(), TL_Email_tabRevision_()];
  const out = [];
  const max = TL_Email_int_(limit, 20);

  for (let t = 0; t < tabs.length; t++) {
    const sh = ss.getSheetByName(tabs[t]);
    if (!sh) continue;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) continue;
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    for (let i = 0; i < values.length && out.length < max; i++) {
      const data = TL_Email_rowValuesToObject_(headers, values[i]);
      const item = { tabName: tabs[t], rowNumber: i + 2, headers: headers, values: values[i], data: data };
      if (!predicate || predicate(item)) out.push(item);
    }
  }

  return out;
}

function TL_Email_rowValuesToObject_(headers, row) {
  const out = {};
  for (let i = 0; i < headers.length; i++) {
    out[String(headers[i] || "")] = row[i];
  }
  return out;
}

function TL_Email_rowToSnapshot_(rowObj) {
  const payload = TL_Email_getPayload_(rowObj);
  return {
    rowObj: rowObj,
    payload: payload,
    refId: String(rowObj.refId || payload.refId || ""),
    title: String(rowObj.title || payload.subject || ""),
    chunkId: String(rowObj.chunkId || payload.latestMsgId || ""),
    threadId: String(payload.threadId || ""),
    senderEmail: String(payload.senderEmail || ""),
    channel: String(rowObj.channel || "email")
  };
}

function TL_Email_getPayload_(rowObj) {
  try {
    return JSON.parse(String(rowObj && rowObj.draftOrPromptJson ? rowObj.draftOrPromptJson : "{}"));
  } catch (err) {
    return {};
  }
}

function TL_Email_mergePayload_(basePayload, patch) {
  return Object.assign({}, basePayload || {}, patch || {});
}

function TL_Email_rowWithUpdates_(rowObj, patch) {
  return Object.assign({}, rowObj || {}, patch || {}, {
    updatedAt: new Date().toISOString()
  });
}

function TL_Email_UpsertThreadRow_(snapshot, tabName) {
  const row = snapshot.rowObj || snapshot.row || null;
  if (!row || !snapshot.refId) throw new Error("TL_Email_UpsertThreadRow_: invalid snapshot");
  TL_Sheets_upsertTask_(tabName || TL_Email_tabOpen_(), row, "refId", snapshot.refId);
  return { ok: true, refId: snapshot.refId, tab: tabName || TL_Email_tabOpen_() };
}

function TL_Email_updateRow_(tabName, rowNumber, rowObj) {
  const ss = TL_Sheets_getStore_();
  const sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error("Missing tab: " + tabName);
  TL_Sheets_writeTaskRow_(sh, TL_Sheets_taskHeaders_(), rowNumber, rowObj);
  return { ok: true, tab: tabName, row: rowNumber };
}

function TL_Email_moveRow_(fromTab, rowNumber, toTab, rowObj) {
  const ss = TL_Sheets_getStore_();
  const fromSh = ss.getSheetByName(fromTab);
  const toSh = TL_Sheets_ensureTab_(ss, toTab, TL_Sheets_taskHeaders_());
  TL_Sheets_appendTask_(toSh, TL_Sheets_taskHeaders_(), rowObj);
  if (fromSh && rowNumber >= 2 && rowNumber <= fromSh.getLastRow()) {
    fromSh.deleteRow(rowNumber);
  }
  return { ok: true, from: fromTab, to: toTab };
}

function TL_Email_buildSyntheticSnapshot_() {
  const now = new Date().toISOString();
  const threadId = "thread_" + Utilities.getUuid();
  const refId = "gmail:thread:" + threadId;
  const payload = {
    source: "gmail",
    version: TL_EMAIL.VERSION,
    threadId: threadId,
    refId: refId,
    permalink: "https://mail.google.com/mail/u/0/#inbox/" + threadId,
    subject: "Project update needed",
    latestMsgId: "msg_" + Utilities.getUuid(),
    latestMsgDateIso: now,
    ownerEmail: TL_Email_ownerEmail_() || "owner@example.com",
    senderEmail: "sender@example.com",
    participants: ["sender@example.com", "owner@example.com"],
    ownerInboundCount: 1,
    ownerMatchedMessages: [{
      messageId: "msg_" + Utilities.getUuid(),
      dateIso: now,
      from: "Sender <sender@example.com>",
      fromEmail: "sender@example.com",
      to: "Owner <owner@example.com>",
      cc: "",
      bcc: "",
      subject: "Project update needed",
      body: "Can you review the updated plan and confirm?"
    }],
    flattenedText: [
      "---",
      "DATE: " + now,
      "FROM: Sender <sender@example.com>",
      "TO: Owner <owner@example.com>",
      "SUBJECT: Project update needed",
      "",
      "Can you review the updated plan and confirm?"
    ].join("\n"),
    flattenedTruncated: false
  };

  return {
    eligible: true,
    skipReason: "",
    threadId: threadId,
    refId: refId,
    subject: payload.subject,
    latestMsgId: payload.latestMsgId,
    latestMsgDateIso: payload.latestMsgDateIso,
    ownerEmail: payload.ownerEmail,
    senderEmail: payload.senderEmail,
    participants: payload.participants,
    ownerInboundCount: 1,
    flattened: { text: payload.flattenedText, truncated: false },
    payload: payload,
    rowObj: {
      createdAt: now,
      updatedAt: now,
      userE164: "",
      refId: refId,
      chunkId: payload.latestMsgId,
      title: payload.subject,
      kind: "email_thread",
      channel: "email",
      status: "OPEN",
      askedAt: "",
      answeredAt: "",
      executedAt: "",
      draftOrPromptJson: JSON.stringify(payload),
      lastAction: "EMAIL_PULL",
      lastActionAt: now
    }
  };
}

function TL_Email_TestSmokeTest() {
  const snapshot = TL_Email_buildSyntheticSnapshot_();
  const triage = TL_Email_TriageSnapshot_(snapshot, { dryRun: true });
  const proposal = TL_Email_BuildReplyProposal_(snapshot, triage, { dryRun: true });
  const bossCard = TL_Email_BuildBossCard_(snapshot, triage, proposal);
  return {
    ok: true,
    snapshot: {
      refId: snapshot.refId,
      subject: snapshot.title,
      senderEmail: snapshot.senderEmail
    },
    triage: triage,
    proposal: proposal,
    bossCard: bossCard
  };
}

function TL_Email_TestHistoryGating() {
  return {
    ok: true,
    low: TL_Email_ShouldExpandHistory_({
      priority_level: "low",
      importance_level: "low",
      urgency_flag: "false",
      needs_owner_now: "false",
      suggested_action: "reply_later"
    }, { ownerInboundCount: 1, subject: "hello" }),
    high: TL_Email_ShouldExpandHistory_({
      priority_level: "high",
      importance_level: "medium",
      urgency_flag: "false",
      needs_owner_now: "false",
      suggested_action: "reply_later"
    }, { ownerInboundCount: 1, subject: "urgent invoice follow up" })
  };
}

function TL_Email_tabOpen_() { return TL_Config_get_("TL_CFG_TAB_OPEN", "OPEN"); }
function TL_Email_tabRevision_() { return TL_Config_get_("TL_CFG_TAB_REVISION", "REVISION"); }
function TL_Email_tabArchive_() { return TL_Config_get_("TL_CFG_TAB_ARCHIVE", "ARCHIVE"); }

function TL_Email_int_(value, fallback) {
  const n = Number(value);
  const def = Number(fallback || 0);
  if (!isFinite(n) || n <= 0) return def;
  return Math.max(1, Math.floor(n));
}

function TL_Email_getPullCheckpoint_() {
  const props = PropertiesService.getScriptProperties();
  return {
    lastPullAtIso: String(props.getProperty(TL_EMAIL.PROP_LAST_PULL_AT) || ""),
    lastPullQuery: String(props.getProperty(TL_EMAIL.PROP_LAST_PULL_QUERY) || ""),
    lastPullMaxMsgAtIso: String(props.getProperty(TL_EMAIL.PROP_LAST_PULL_MAX_MSG_AT) || "")
  };
}

function TL_Email_buildPullQuery_(baseQuery, checkpoint, opts) {
  const options = opts || {};
  const query = String(baseQuery || TL_EMAIL.DEFAULT_QUERY).trim();
  if (options.useCheckpoint === false) return query;

  const state = checkpoint || TL_Email_getPullCheckpoint_();
  const lastPullAtIso = String(state.lastPullAtIso || "").trim();
  if (!lastPullAtIso) return query;

  const afterPart = TL_Email_queryAfterDate_(lastPullAtIso);
  if (!afterPart) return query;
  if (/\bafter:/i.test(query)) return query;
  return query + " " + afterPart;
}

function TL_Email_queryAfterDate_(isoText) {
  const dt = new Date(String(isoText || ""));
  if (isNaN(dt.getTime())) return "";
  return "after:" + Utilities.formatDate(dt, Session.getScriptTimeZone(), "yyyy/MM/dd");
}

function TL_Email_recordPullCheckpoint_(state) {
  const props = PropertiesService.getScriptProperties();
  const completedAtIso = String((state && state.completedAtIso) || new Date().toISOString());
  const next = {
    [TL_EMAIL.PROP_LAST_PULL_AT]: completedAtIso,
    [TL_EMAIL.PROP_LAST_PULL_QUERY]: String((state && state.query) || ""),
    [TL_EMAIL.PROP_LAST_PULL_MAX_MSG_AT]: String((state && state.latestMsgAtIso) || "")
  };
  props.setProperties(next, false);
  return {
    ok: true,
    checkpoint: TL_Email_getPullCheckpoint_(),
    written: next
  };
}
