/**
 * TL_DraftContext
 *
 * Builds a compact drafting brief from contact memory and recent history.
 * Current scope:
 * - last 5 contact enrichments
 * - last 5 recent emails
 * - last 5 recent WhatsApp items
 *
 * Topic/example retrieval is intentionally deferred to the next phase.
 */

const TL_DRAFT_CONTEXT = {
  ENRICHMENT_LIMIT: 5,
  EMAIL_LIMIT: 5,
  WHATSAPP_LIMIT: 5,
  EMAIL_SCAN_ROWS: 120,
  INBOX_SCAN_ROWS: 250
};

function TL_DraftContext_BuildForInboxRowValues_(values, options) {
  const identity = TL_DraftContext_buildIdentity_(
    String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase(),
    String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase(),
    TL_Orchestrator_value_(values, "contact_id"),
    TL_Orchestrator_value_(values, "sender"),
    TL_Orchestrator_value_(values, "receiver")
  );
  const mergedOptions = Object.assign({}, options || {}, {
    excludeWhatsAppSourceId: String(TL_Orchestrator_value_(values, "record_id") || TL_Orchestrator_value_(values, "message_id") || "").trim()
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
    excludeEmailRefId: String(snapshot && snapshot.refId || payload.refId || "").trim()
  });
  return TL_DraftContext_build_(identity, mergedOptions);
}

function TL_DraftContext_build_(identity, options) {
  const resolved = TL_DraftContext_resolveContact_(identity);
  const enrichments = TL_DraftContext_fetchEnrichments_(resolved, options);
  const emails = TL_DraftContext_fetchEmails_(resolved, options);
  const whatsapps = TL_DraftContext_fetchWhatsApps_(resolved, options);

  return {
    ok: true,
    contact: resolved,
    enrichments: enrichments,
    emails: emails,
    whatsapps: whatsapps,
    promptBrief: TL_DraftContext_renderPromptBrief_(resolved, enrichments, emails, whatsapps),
    reviewBrief: TL_DraftContext_renderReviewBrief_(resolved, enrichments, emails, whatsapps)
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
    const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
    if (!sheetId) return out;
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = ss.getSheetByName("CONTACTS");
    if (!sh || sh.getLastRow() < 2) return out;
    const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const headers = values[0];
    const idx = {};
    headers.forEach(function(header, index) { idx[String(header || "")] = index; });

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rowContactId = String(row[idx.contact_id] || "").trim();
      const rowName = String(row[idx.name] || "").trim();
      const rowPhone1 = TL_Contacts_normalizePhoneField_(row[idx.phone1_normalized] || row[idx.phone1] || "");
      const rowPhone2 = TL_Contacts_normalizePhoneField_(row[idx.phone2_normalized] || row[idx.phone2] || "");
      const rowEmail = TL_Contacts_normalizeEmail_(row[idx.email_normalized] || row[idx.email] || "");
      const matches = (targetContactId && rowContactId === targetContactId) ||
        (targetPhone && (rowPhone1 === targetPhone || rowPhone2 === targetPhone)) ||
        (targetEmail && rowEmail === targetEmail);
      if (!matches) continue;
      return {
        contactId: rowContactId || targetContactId,
        name: rowName,
        phone: rowPhone1 || rowPhone2 || targetPhone,
        email: rowEmail || targetEmail
      };
    }
  } catch (err) {}

  return out;
}

function TL_DraftContext_fetchEnrichments_(contact, options) {
  const out = [];
  const contactId = String(contact && contact.contactId || "").trim();
  if (!contactId) return out;
  try {
    const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
    if (!sheetId) return out;
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = ss.getSheetByName("CONTACT_ENRICHMENTS");
    if (!sh || sh.getLastRow() < 2) return out;
    const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const headers = values[0];
    const idx = {};
    headers.forEach(function(header, index) { idx[String(header || "")] = index; });
    const rows = values.slice(1).filter(function(row) {
      return String(row[idx.contact_id] || "").trim() === contactId;
    }).sort(function(a, b) {
      return TL_DraftContext_safeDate_(b[idx.timestamp]).getTime() - TL_DraftContext_safeDate_(a[idx.timestamp]).getTime();
    });
    const limit = Number((options && options.enrichmentLimit) || TL_DRAFT_CONTEXT.ENRICHMENT_LIMIT);
    rows.slice(0, limit).forEach(function(row) {
      out.push({
        timestamp: TL_DraftContext_safeDate_(row[idx.timestamp]).toISOString(),
        noteType: String(row[idx.note_type] || "").trim(),
        noteText: String(row[idx.note_text] || "").trim(),
        source: String(row[idx.source] || "").trim()
      });
    });
  } catch (err) {}
  return out;
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
  const excludeSourceId = String(options && options.excludeWhatsAppSourceId || "").trim();
  const rows = TL_Orchestrator_readRecentRows_(Number((options && options.inboxScanRows) || TL_DRAFT_CONTEXT.INBOX_SCAN_ROWS));
  const matches = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const values = rows[i].values;
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
    if (channel !== "whatsapp" || recordClass === "status") continue;
    const sourceId = String(TL_Orchestrator_value_(values, "record_id") || TL_Orchestrator_value_(values, "message_id") || "").trim();
    if (excludeSourceId && sourceId === excludeSourceId) continue;
    const rowContactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
    const sender = TL_Contacts_normalizePhoneField_(TL_Orchestrator_value_(values, "sender") || "");
    const receiver = TL_Contacts_normalizePhoneField_(TL_Orchestrator_value_(values, "receiver") || "");
    const hit = (contactId && rowContactId === contactId) || (phone && (sender === phone || receiver === phone));
    if (!hit) continue;
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

function TL_DraftContext_renderPromptBrief_(contact, enrichments, emails, whatsapps) {
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

  return lines.join("\n");
}

function TL_DraftContext_renderReviewBrief_(contact, enrichments, emails, whatsapps) {
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
