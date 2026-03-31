/**
 * TL_DraftContext
 *
 * Builds a compact drafting brief from contact memory and recent history.
 * Current scope:
 * - last 5 contact enrichments
 * - last 5 recent emails
 * - last 5 recent WhatsApp items
 *
 * Topic registry retrieval is included so inbound enrichment can choose from
 * customer-specific topics and propose new candidates when needed.
 */

const TL_DRAFT_CONTEXT = {
  ENRICHMENT_LIMIT: 5,
  EMAIL_LIMIT: 5,
  WHATSAPP_LIMIT: 5,
  EMAIL_SCAN_ROWS: 120,
  INBOX_SCAN_ROWS: 250,
  TOPIC_LIMIT: 25,
  TOPIC_EXAMPLE_LIMIT: 3,
  TOPIC_EXAMPLE_WINDOW_DAYS: 60
};

function TL_DraftContext_BuildForInboxRowValues_(values, options) {
  const currentSourceId = String(TL_Orchestrator_value_(values, "record_id") || TL_Orchestrator_value_(values, "message_id") || "").trim();
  const identity = TL_DraftContext_buildIdentity_(
    String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase(),
    String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase(),
    TL_Orchestrator_value_(values, "contact_id"),
    TL_Orchestrator_value_(values, "sender"),
    TL_Orchestrator_value_(values, "receiver")
  );
  const mergedOptions = Object.assign({}, options || {}, {
    excludeWhatsAppSourceId: currentSourceId,
    excludeWhatsAppSourceIds: TL_DraftContext_mergeSourceIds_(
      currentSourceId,
      options && options.excludeWhatsAppSourceIds
    ),
    excludeTopicRecordId: String(TL_Orchestrator_value_(values, "record_id") || "").trim(),
    excludeTopicMessageId: String(TL_Orchestrator_value_(values, "message_id") || "").trim(),
    currentTopicId: String(TL_Orchestrator_value_(values, "topic_id") || "").trim()
  });
  return TL_DraftContext_build_(identity, mergedOptions);
}

function TL_DraftContext_BuildForEmailSnapshot_(snapshot, options) {
  const payload = snapshot && snapshot.payload ? snapshot.payload : {};
  const identity = {
    contactId: String(payload.contactId || "").trim(),
    phone: "",
    email: String(payload.senderEmail || snapshot && snapshot.senderEmail || "").trim().toLowerCase()
  };
  const mergedOptions = Object.assign({}, options || {}, {
    excludeEmailRefId: String(snapshot && snapshot.refId || payload.refId || "").trim(),
    excludeTopicRecordId: String(snapshot && snapshot.refId || payload.refId || "").trim(),
    excludeTopicMessageId: String(payload.latestMsgId || snapshot && snapshot.chunkId || "").trim(),
    currentTopicId: String(TL_Orchestrator_value_(snapshot && snapshot.values || [], "topic_id") || "").trim()
  });
  return TL_DraftContext_build_(identity, mergedOptions);
}

function TL_DraftContext_build_(identity, options) {
  const resolved = TL_DraftContext_resolveContact_(identity);
  const enrichments = TL_DraftContext_fetchEnrichments_(resolved, options);
  const emails = TL_DraftContext_fetchEmails_(resolved, options);
  const whatsapps = TL_DraftContext_fetchWhatsApps_(resolved, options);
  const topics = TL_DraftContext_fetchTopics_(resolved, options);
  const topicOwners = TL_DraftContext_fetchTopicOwners_(String(options && options.currentTopicId || "").trim(), options);
  const topicExamples = TL_DraftContext_fetchTopicExamples_(String(options && options.currentTopicId || "").trim(), options);

  return {
    ok: true,
    contact: resolved,
    enrichments: enrichments,
    emails: emails,
    whatsapps: whatsapps,
    topics: topics,
    topicOwners: topicOwners,
    topicExamples: topicExamples,
    promptBrief: TL_DraftContext_renderPromptBrief_(resolved, enrichments, emails, whatsapps, topicOwners, topics, topicExamples),
    reviewBrief: TL_DraftContext_renderReviewBrief_(resolved, enrichments, emails, whatsapps, topicOwners, topicExamples)
  };
}

function TL_DraftContext_buildIdentity_(channel, direction, contactId, sender, receiver) {
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  const normalizedDirection = String(direction || "").trim().toLowerCase();
  const actor = normalizedDirection === "incoming"
    ? sender
    : (receiver || sender);
  const emailSource = normalizedChannel === "email"
    ? (actor || sender || receiver)
    : "";
  return {
    contactId: String(contactId || "").trim(),
    phone: normalizedChannel === "email" ? "" : TL_Contacts_normalizePhoneField_(actor || ""),
    email: TL_DraftContext_extractEmailAddress_(emailSource)
  };
}

function TL_DraftContext_extractEmailAddress_(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const match = raw.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
  return match ? String(match[0] || "").trim().toLowerCase() : raw;
}

function TL_DraftContext_resolveContact_(identity) {
  const want = identity || {};
  const targetContactId = String(want.contactId || "").trim();
  const targetPhone = TL_Contacts_normalizePhoneField_(want.phone || "");
  const targetEmail = TL_Contacts_normalizeEmail_(want.email || "");
  const out = {
    contactId: targetContactId,
    name: "",
    phone: targetPhone,
    email: targetEmail
  };

  try {
    const contacts = typeof TL_Contacts_readSearchContacts_ === "function"
      ? TL_Contacts_readSearchContacts_()
      : [];
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const rowContactId = String(contact && (contact.contactId || contact.crmId) || "").trim();
      const rowName = String(contact && (contact.name || contact.displayName) || "").trim();
      const phones = TL_Contacts_mergeMultiValueLists_([
        [contact && contact.phone1, contact && contact.phone2],
        contact && contact.phones
      ]).map(function(value) {
        return TL_Contacts_normalizePhoneField_(value);
      }).filter(Boolean);
      const emails = TL_Contacts_mergeMultiValueLists_([
        [contact && contact.email],
        contact && contact.emails
      ]).map(function(value) {
        return TL_Contacts_normalizeEmail_(value);
      }).filter(Boolean);
      const matches = (targetContactId && rowContactId === targetContactId) ||
        (targetPhone && phones.indexOf(targetPhone) !== -1) ||
        (targetEmail && emails.indexOf(targetEmail) !== -1);
      if (!matches) continue;
      return {
        contactId: rowContactId || targetContactId,
        name: rowName,
        phone: phones[0] || targetPhone,
        email: emails[0] || targetEmail
      };
    }
  } catch (err) {}

  return out;
}

function TL_DraftContext_fetchEnrichments_(contact, options) {
  const out = [];
  const safe = contact && typeof contact === "object" ? contact : {};
  const nowIso = new Date().toISOString();
  const personal = String(safe.personalSummary || safe.personal_summary || "").trim();
  const business = String(safe.businessSummary || safe.business_summary || "").trim();
  const state = String(safe.currentState || safe.current_state || "").trim();
  const nextAction = String(safe.nextAction || safe.next_action || "").trim();
  if (personal) {
    out.push({ timestamp: nowIso, noteType: "personal_summary", noteText: personal, source: "contacts_row" });
  }
  if (business) {
    out.push({ timestamp: nowIso, noteType: "business_summary", noteText: business, source: "contacts_row" });
  }
  if (state) {
    out.push({ timestamp: nowIso, noteType: "current_state", noteText: state, source: "contacts_row" });
  }
  if (nextAction) {
    out.push({ timestamp: nowIso, noteType: "next_action", noteText: nextAction, source: "contacts_row" });
  }
  const limit = Number((options && options.enrichmentLimit) || TL_DRAFT_CONTEXT.ENRICHMENT_LIMIT);
  return out.slice(0, limit > 0 ? limit : TL_DRAFT_CONTEXT.ENRICHMENT_LIMIT);
}

function TL_DraftContext_fetchEmails_(contact, options) {
  const out = [];
  const email = TL_Contacts_normalizeEmail_(contact && contact.email || "");
  if (!email || typeof TL_Orchestrator_readRecentRows_ !== "function") return out;
  const excludeRefId = String(options && options.excludeEmailRefId || "").trim();
  const rows = TL_Orchestrator_readRecentRows_(Number((options && options.emailScanRows) || TL_DRAFT_CONTEXT.EMAIL_SCAN_ROWS)).filter(function(item) {
    const values = item.values;
    if (String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase() !== "email") return false;
    if (String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase() !== "communication") return false;
    if (String(TL_Orchestrator_value_(values, "message_type") || "").trim().toLowerCase() !== "email_thread") return false;
    const senderEmail = TL_Contacts_normalizeEmail_(TL_Orchestrator_value_(values, "sender") || "");
    const receiverEmail = TL_Contacts_normalizeEmail_(TL_Orchestrator_value_(values, "receiver") || "");
    const recordId = String(TL_Orchestrator_value_(values, "record_id") || "").trim();
    return (senderEmail === email || receiverEmail === email) && (!excludeRefId || recordId !== excludeRefId);
  });
  rows.sort(function(a, b) {
    const ad = TL_DraftContext_safeDate_(TL_Orchestrator_value_(a.values, "latest_message_at") || TL_Orchestrator_value_(a.values, "timestamp"));
    const bd = TL_DraftContext_safeDate_(TL_Orchestrator_value_(b.values, "latest_message_at") || TL_Orchestrator_value_(b.values, "timestamp"));
    return bd.getTime() - ad.getTime();
  });
  rows.slice(0, Number((options && options.emailLimit) || TL_DRAFT_CONTEXT.EMAIL_LIMIT)).forEach(function(item) {
    const values = item.values;
    const payload = TL_Email_parseInboxPayload_(TL_Orchestrator_value_(values, "raw_payload_ref"));
    out.push({
      at: TL_DraftContext_safeDate_(TL_Orchestrator_value_(values, "latest_message_at") || TL_Orchestrator_value_(values, "timestamp")).toISOString(),
      subject: String(TL_Orchestrator_value_(values, "thread_subject") || payload.subject || "").trim(),
      summary: TL_DraftContext_preview_(String(
        (payload.triage && payload.triage.summary) ||
        TL_Orchestrator_value_(values, "ai_summary") ||
        payload.flattenedText ||
        TL_Orchestrator_value_(values, "text") ||
        ""
      ).trim(), 180),
      status: String(TL_Orchestrator_value_(values, "execution_status") || TL_Orchestrator_value_(values, "approval_status") || "").trim()
    });
  });
  return out;
}

function TL_DraftContext_fetchWhatsApps_(contact, options) {
  const out = [];
  const contactId = String(contact && contact.contactId || "").trim();
  const phone = TL_Contacts_normalizePhoneField_(contact && contact.phone || "");
  if (typeof TL_Orchestrator_readRecentRows_ !== "function" || (!contactId && !phone)) return out;
  const excludeSourceIds = TL_DraftContext_buildSourceIdSet_(
    options && options.excludeWhatsAppSourceIds,
    options && options.excludeWhatsAppSourceId
  );
  const rows = TL_Orchestrator_readRecentRows_(Number((options && options.inboxScanRows) || TL_DRAFT_CONTEXT.INBOX_SCAN_ROWS));
  const matches = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const values = rows[i].values;
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
    if (channel !== "whatsapp" || recordClass === "status") continue;
    const sourceId = String(TL_Orchestrator_value_(values, "record_id") || TL_Orchestrator_value_(values, "message_id") || "").trim();
    if (sourceId && excludeSourceIds[sourceId]) continue;
    const rowContactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
    const sender = TL_Contacts_normalizePhoneField_(TL_Orchestrator_value_(values, "sender") || "");
    const receiver = TL_Contacts_normalizePhoneField_(TL_Orchestrator_value_(values, "receiver") || "");
    const hit = (contactId && rowContactId === contactId) || (phone && (sender === phone || receiver === phone));
    if (!hit) continue;
    if (TL_DraftContext_shouldSkipWhatsAppHistoryRow_(values)) continue;
    matches.push({
      values: values,
      at: TL_DraftContext_safeDate_(TL_Orchestrator_value_(values, "timestamp") || values[0]),
      sourceId: sourceId
    });
  }
  matches.sort(function(a, b) {
    return b.at.getTime() - a.at.getTime();
  });
  matches.slice(0, Number((options && options.whatsAppLimit) || TL_DRAFT_CONTEXT.WHATSAPP_LIMIT)).forEach(function(item) {
    const values = item.values;
    out.push({
      at: item.at.toISOString(),
      direction: String(TL_Orchestrator_value_(values, "direction") || "").trim(),
      summary: TL_DraftContext_preview_(String(
        TL_Orchestrator_value_(values, "ai_summary") ||
        TL_Orchestrator_value_(values, "text") ||
        TL_Orchestrator_value_(values, "ai_proposal") ||
        ""
      ).trim(), 180),
      taskStatus: String(TL_Orchestrator_value_(values, "task_status") || "").trim()
    });
  });
  return out;
}

function TL_DraftContext_mergeSourceIds_(primary, extra) {
  const out = [];
  const pushValue = function(value) {
    const normalized = String(value || "").trim();
    if (!normalized || out.indexOf(normalized) !== -1) return;
    out.push(normalized);
  };
  pushValue(primary);
  if (Array.isArray(extra)) {
    extra.forEach(pushValue);
  } else {
    pushValue(extra);
  }
  return out;
}

function TL_DraftContext_buildSourceIdSet_(values, fallbackValue) {
  const out = {};
  TL_DraftContext_mergeSourceIds_(fallbackValue, values).forEach(function(value) {
    out[value] = true;
  });
  return out;
}

function TL_DraftContext_shouldSkipWhatsAppHistoryRow_(values) {
  const direction = String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase();
  if (direction !== "outgoing") return false;
  const preview = [
    TL_Orchestrator_value_(values, "text"),
    TL_Orchestrator_value_(values, "ai_summary"),
    TL_Orchestrator_value_(values, "ai_proposal")
  ].map(function(value) {
    return String(value || "").trim();
  }).filter(Boolean).join("\n");
  return TL_DraftContext_isSyntheticWhatsAppSystemText_(preview);
}

function TL_DraftContext_isSyntheticWhatsAppSystemText_(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.indexOf("do you want to approve the following items") !== -1) return true;
  if (normalized.indexOf("total items:") !== -1 &&
      (normalized.indexOf("give me one by one") !== -1 ||
        normalized.indexOf("group smartly for me") !== -1 ||
        normalized.indexOf("return to main menu") !== -1 ||
        normalized.indexOf("return to main") !== -1)) {
    return true;
  }
  return false;
}

function TL_DraftContext_renderPromptBrief_(contact, enrichments, emails, whatsapps, topicOwners, topics, topicExamples) {
  const lines = [
    "Draft context brief:"
  ];
  if (contact && (contact.contactId || contact.name || contact.phone || contact.email)) {
    lines.push([
      "Contact:",
      contact.name || "",
      contact.phone ? ("phone=" + contact.phone) : "",
      contact.email ? ("email=" + contact.email) : "",
      contact.contactId ? ("contact_id=" + contact.contactId) : ""
    ].filter(Boolean).join(" "));
  } else {
    lines.push("Contact: unresolved");
  }

  lines.push("Last contact enrichments:");
  if (enrichments && enrichments.length) {
    enrichments.forEach(function(item, idx) {
      lines.push("[" + (idx + 1) + "] " + item.timestamp + " | " + item.noteType + " | " + item.noteText);
    });
  } else {
    lines.push("none");
  }

  lines.push("Last emails:");
  if (emails && emails.length) {
    emails.forEach(function(item, idx) {
      lines.push("[" + (idx + 1) + "] " + item.at + " | " + item.subject + " | " + item.summary);
    });
  } else {
    lines.push("none");
  }

  lines.push("Last WhatsApps:");
  if (whatsapps && whatsapps.length) {
    whatsapps.forEach(function(item, idx) {
      lines.push("[" + (idx + 1) + "] " + item.at + " | " + item.direction + " | " + item.summary);
    });
  } else {
    lines.push("none");
  }

  lines.push("Likely topic handlers:");
  if (topicOwners && topicOwners.length) {
    TL_DraftContext_renderTopicOwnersSection_(topicOwners).forEach(function(line) {
      lines.push(line);
    });
  } else {
    lines.push("none");
  }

  const topicLines = TL_DraftContext_renderTopicSection_(topics);
  lines.push("Topic registry (customer-specific):");
  if (topicLines.length) {
    topicLines.forEach(function(line) {
      lines.push(line);
    });
  } else {
    lines.push("none");
  }

  lines.push("Similar topic examples:");
  if (topicExamples && topicExamples.length) {
    TL_DraftContext_renderTopicExampleSection_(topicExamples).forEach(function(line) {
      lines.push(line);
    });
  } else {
    lines.push("none");
  }

  return lines.join("\n");
}

function TL_DraftContext_fetchTopicOwners_(topicId, options) {
  const normalizedTopicId = String(topicId || "").trim();
  if (!normalizedTopicId || typeof TL_Contacts_findTopicOwners_ !== "function") return [];
  return TL_Contacts_findTopicOwners_(normalizedTopicId, {
    limit: Number(options && options.topicOwnerLimit || 3)
  });
}

function TL_DraftContext_fetchTopicExamples_(topicId, options) {
  const out = [];
  const normalizedTopicId = String(topicId || "").trim();
  if (!normalizedTopicId || typeof TL_Orchestrator_readRecentRows_ !== "function") return out;

  const scanRows = Number((options && options.inboxScanRows) || TL_DRAFT_CONTEXT.INBOX_SCAN_ROWS);
  const limit = Number((options && options.topicExampleLimit) || TL_DRAFT_CONTEXT.TOPIC_EXAMPLE_LIMIT);
  const windowDays = Number((options && options.topicExampleWindowDays) || TL_DRAFT_CONTEXT.TOPIC_EXAMPLE_WINDOW_DAYS);
  const excludeRecordId = String(options && options.excludeTopicRecordId || "").trim();
  const excludeMessageId = String(options && options.excludeTopicMessageId || "").trim();
  const cutoffMs = Date.now() - (Math.max(windowDays, 1) * 24 * 60 * 60 * 1000);

  const rows = TL_Orchestrator_readRecentRows_(scanRows);
  (rows || []).forEach(function(item) {
    const values = item && item.values ? item.values : [];
    if (String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase() !== "communication") return;
    if (String(TL_Orchestrator_value_(values, "topic_id") || "").trim() !== normalizedTopicId) return;

    const recordId = String(TL_Orchestrator_value_(values, "record_id") || "").trim();
    const messageId = String(TL_Orchestrator_value_(values, "message_id") || "").trim();
    if ((excludeRecordId && recordId === excludeRecordId) || (excludeMessageId && messageId === excludeMessageId)) return;

    const at = TL_DraftContext_safeDate_(TL_Orchestrator_value_(values, "latest_message_at") || TL_Orchestrator_value_(values, "timestamp"));
    if (at.getTime() < cutoffMs) return;

    const example = TL_DraftContext_topicExampleFromValues_(values, at);
    if (!example) return;
    out.push(example);
  });

  out.sort(function(a, b) {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return TL_DraftContext_safeDate_(b.at).getTime() - TL_DraftContext_safeDate_(a.at).getTime();
  });

  return out.slice(0, limit > 0 ? limit : TL_DRAFT_CONTEXT.TOPIC_EXAMPLE_LIMIT);
}

function TL_DraftContext_topicExampleFromValues_(values, at) {
  const direction = String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase();
  const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
  const approvalStatus = String(TL_Orchestrator_value_(values, "approval_status") || "").trim().toLowerCase();
  const executionStatus = String(TL_Orchestrator_value_(values, "execution_status") || "").trim().toLowerCase();
  const aiProposal = String(TL_Orchestrator_value_(values, "ai_proposal") || "").trim();
  const aiSummary = String(TL_Orchestrator_value_(values, "ai_summary") || "").trim();
  const text = String(TL_Orchestrator_value_(values, "text") || "").trim();
  const subject = String(TL_Orchestrator_value_(values, "thread_subject") || "").trim();
  const messageType = String(TL_Orchestrator_value_(values, "message_type") || "").trim().toLowerCase();

  if (messageType === "status") return null;

  const strongCompleted = direction === "outgoing" && (
    approvalStatus === "approved" ||
    executionStatus.indexOf("sent") !== -1 ||
    executionStatus.indexOf("executed") !== -1 ||
    executionStatus.indexOf("delivered") !== -1
  );
  const usableOutgoingDraft = direction === "outgoing" && !!aiProposal;
  const summaryText = TL_DraftContext_preview_(aiSummary || text || aiProposal || subject, 140);
  const replyText = TL_DraftContext_preview_(aiProposal || text, 140);
  const hasUsefulText = !!(summaryText || replyText);
  if (!hasUsefulText) return null;

  let rankScore = 0;
  if (strongCompleted) rankScore += 300;
  else if (usableOutgoingDraft) rankScore += 200;
  else if (direction === "outgoing") rankScore += 120;
  else rankScore += 80;
  if (channel === "whatsapp") rankScore += 10;
  if (approvalStatus) rankScore += 5;
  if (executionStatus) rankScore += 5;

  return {
    at: (at instanceof Date ? at : TL_DraftContext_safeDate_(at)).toISOString(),
    channel: channel,
    direction: direction || "unknown",
    approvalStatus: approvalStatus,
    executionStatus: executionStatus,
    summary: summaryText,
    reply: replyText,
    rankScore: rankScore
  };
}

function TL_DraftContext_renderTopicExampleSection_(topicExamples) {
  const out = [];
  (topicExamples || []).forEach(function(item, idx) {
    const bits = [];
    bits.push("[" + (idx + 1) + "]");
    if (item.at) bits.push(item.at);
    if (item.channel) bits.push(item.channel);
    if (item.direction) bits.push(item.direction);
    if (item.executionStatus) bits.push("execution=" + item.executionStatus);
    else if (item.approvalStatus) bits.push("approval=" + item.approvalStatus);
    if (item.summary) bits.push("summary=" + item.summary);
    if (item.reply && item.reply !== item.summary) bits.push("reply=" + item.reply);
    out.push(bits.join(" | "));
  });
  return out;
}

function TL_DraftContext_fetchTopics_(contact, options) {
  return [];
}

function TL_DraftContext_topicRowToObject_(headers, row, rowNumber) {
  const out = {
    rowNumber: rowNumber,
    topicId: "",
    contactId: "",
    contactName: "",
    topicSummary: "",
    lastUsedAt: "",
    usageCount: 0,
    recentExamplesJson: "",
    notes: ""
  };
  if (!headers || !row) return out;
  headers.forEach(function(header, index) {
    const key = String(header || "");
    const value = row[index];
    if (key === "topic_id") out.topicId = String(value || "").trim();
    else if (key === "contact_id") out.contactId = String(value || "").trim();
    else if (key === "contact_name") out.contactName = String(value || "").trim();
    else if (key === "topic_summary") out.topicSummary = String(value || "").trim();
    else if (key === "last_used_at") out.lastUsedAt = String(value || "").trim();
    else if (key === "usage_count") out.usageCount = Number(value || 0);
    else if (key === "recent_examples_json") out.recentExamplesJson = String(value || "").trim();
    else if (key === "notes") out.notes = String(value || "").trim();
  });
  return out;
}

function TL_DraftContext_renderTopicSection_(topics) {
  const out = [];
  (topics || []).forEach(function(topic, idx) {
    const bits = [];
    const topicId = String(topic && topic.topicId || "").trim();
    const summary = String(topic && topic.topicSummary || "").trim();
    const contactName = String(topic && topic.contactName || "").trim();
    const usageCount = Number(topic && topic.usageCount || 0);
    const examples = String(topic && topic.recentExamplesPreview || "").trim();
    bits.push("[" + (idx + 1) + "]" + (topicId ? " " + topicId : ""));
    if (summary) bits.push(summary);
    if (contactName) bits.push("contact=" + contactName);
    if (usageCount) bits.push("usage=" + usageCount);
    if (examples) bits.push("examples=" + examples);
    out.push(bits.join(" | "));
  });
  return out;
}

function TL_DraftContext_renderTopicOwnersSection_(topicOwners) {
  return (topicOwners || []).map(function(item, idx) {
    const bits = [];
    bits.push("[" + (idx + 1) + "]");
    if (item && item.name) bits.push(item.name);
    if (item && item.routingRole) bits.push("routing_role=" + item.routingRole);
    if (item && item.role) bits.push("role=" + item.role);
    if (item && item.org) bits.push("org=" + item.org);
    if (item && (item.phone1 || item.email)) bits.push([item.phone1, item.email].filter(Boolean).join(" | "));
    return bits.join(" ");
  }).filter(Boolean);
}

function TL_DraftContext_renderReviewBrief_(contact, enrichments, emails, whatsapps, topicOwners, topicExamples) {
  const lines = [];
  const contactBits = [];
  const contactName = String(contact && contact.name || "").trim();
  const contactPhone = String(contact && contact.phone || "").trim();
  const contactEmail = String(contact && contact.email || "").trim();

  if (contactName) contactBits.push(contactName);
  if (contactPhone) contactBits.push("phone=" + contactPhone);
  if (contactEmail) contactBits.push("email=" + contactEmail);

  lines.push(contactBits.length ? ("איש קשר: " + contactBits.join(" | ")) : "איש קשר: לא זוהה");

  const enrichLines = TL_DraftContext_renderReviewSection_(enrichments, 2, function(item) {
    const noteType = String(item && item.noteType || "").trim();
    const noteText = String(item && item.noteText || "").trim();
    return [noteType, noteText].filter(Boolean).join(" | ");
  });
  if (enrichLines.length) lines.push("זיכרון: " + enrichLines.join(" ; "));

  const emailLines = TL_DraftContext_renderReviewSection_(emails, 1, function(item) {
    const subject = String(item && item.subject || "").trim();
    const summary = String(item && item.summary || "").trim();
    const parts = [];
    if (subject) parts.push(subject);
    if (summary) parts.push(summary);
    return parts.join(" | ");
  });
  if (emailLines.length) lines.push("אימייל: " + emailLines.join(" ; "));

  const whatsappLines = TL_DraftContext_renderReviewSection_(whatsapps, 1, function(item) {
    const direction = String(item && item.direction || "").trim();
    const summary = String(item && item.summary || "").trim();
    const parts = [];
    if (direction) parts.push(direction);
    if (summary) parts.push(summary);
    return parts.join(" | ");
  });
  if (whatsappLines.length) lines.push("וואטסאפ: " + whatsappLines.join(" ; "));

  const topicOwnerLines = TL_DraftContext_renderReviewSection_(topicOwners, 2, function(item) {
    const parts = [];
    if (item && item.name) parts.push(item.name);
    if (item && item.routingRole) parts.push("routing_role=" + item.routingRole);
    else if (item && item.role) parts.push("role=" + item.role);
    if (item && item.org) parts.push("org=" + item.org);
    return parts.join(" | ");
  });
  if (topicOwnerLines.length) lines.push("מטפל אפשרי: " + topicOwnerLines.join(" ; "));

  const topicExampleLines = TL_DraftContext_renderReviewSection_(topicExamples, 2, function(item) {
    const parts = [];
    if (item && item.direction) parts.push(item.direction);
    if (item && item.summary) parts.push(item.summary);
    if (item && item.reply && item.reply !== item.summary) parts.push("reply=" + item.reply);
    return parts.join(" | ");
  });
  if (topicExampleLines.length) lines.push("נושא דומה: " + topicExampleLines.join(" ; "));

  return lines.join("\n");
}

function TL_DraftContext_renderReviewSection_(items, limit, formatter) {
  const out = [];
  const max = Number(limit || 0);
  (items || []).slice(0, max > 0 ? max : (items || []).length).forEach(function(item) {
    const text = String(formatter ? formatter(item) : "").trim();
    if (text) out.push(text);
  });
  return out;
}

function TL_DraftContext_preview_(text, limit) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const lim = Number(limit || 180);
  if (!value || value.length <= lim) return value;
  return value.slice(0, lim) + "...";
}

function TL_DraftContext_safeDate_(value) {
  const dt = value instanceof Date ? value : new Date(value || "");
  return isNaN(dt.getTime()) ? new Date(0) : dt;
}
