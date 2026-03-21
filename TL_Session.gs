/**
 * TL_Session
 *
 * Session-layer helpers that turn prepared evidence from WhatsApp INBOX rows
 * and email sidecar rows into grouped cleanup/planning views.
 */

const TL_SESSION = {
  DEFAULT_LIMIT: 5,
  DEFAULT_INBOX_SCAN_ROWS: 150,
  DEFAULT_EMAIL_SCAN_ROWS: 40,
  SURFACES: {
    PLATE_NOW: "plate_now",
    ATTENTION: "attention",
    APPROVALS: "approvals",
    NEXT_STEPS: "next_steps"
  }
};

function TL_Session_Definition_() {
  return {
    ok: true,
    operating_principle: "prepare locally. decide globally",
    surfaces: [
      {
        key: TL_SESSION.SURFACES.PLATE_NOW,
        title: "מה על הצלחת שלי עכשיו",
        description: "Grouped cleanup view across prepared WhatsApp and email work."
      },
      {
        key: TL_SESSION.SURFACES.ATTENTION,
        title: "מה צריך תשומת לב",
        description: "Soft attention view with explanations instead of hard urgency claims."
      },
      {
        key: TL_SESSION.SURFACES.APPROVALS,
        title: "ממתין לאישורים",
        description: "Anything waiting for Boss confirmation before execution."
      },
      {
        key: TL_SESSION.SURFACES.NEXT_STEPS,
        title: "צעדים הבאים",
        description: "Prepared next actions derived from existing metadata and drafts."
      }
    ]
  };
}

function TL_Session_BuildSurface_(surface, options) {
  const kind = TL_Session_normalizeSurface_(surface);
  const groups = TL_Session_selectSurfaceGroups_(
    kind,
    TL_Session_groupItems_(TL_Session_collectPreparedItems_(options), options),
    options
  );
  return TL_Session_renderSurface_(kind, groups, options);
}

function TL_Session_collectPreparedItems_(options) {
  const context = {
    contactsIndex: TL_Session_getContactsIndex_()
  };
  return []
    .concat(TL_Session_collectInboxPreparedItems_(options, context))
    .concat(TL_Session_collectEmailPreparedItems_(options, context));
}

function TL_Session_collectInboxPreparedItems_(options, context) {
  if (typeof TL_Orchestrator_readRecentRows_ !== "function") return [];
  const scanRows = Number((options && options.inboxScanRows) || TL_SESSION.DEFAULT_INBOX_SCAN_ROWS);
  const rows = TL_Orchestrator_readRecentRows_(scanRows);
  const out = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const item = TL_Session_inboxRowToItem_(rows[i], context);
    if (item) out.push(item);
  }
  return out;
}

function TL_Session_collectEmailPreparedItems_(options, context) {
  if (typeof TL_Email_scanRows_ !== "function") return [];
  const scanRows = Number((options && options.emailScanRows) || TL_SESSION.DEFAULT_EMAIL_SCAN_ROWS);
  const rows = TL_Email_scanRows_([TL_Email_tabOpen_(), TL_Email_tabRevision_()], null, scanRows);
  const out = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const item = TL_Session_emailRowToItem_(rows[i], context);
    if (item) out.push(item);
  }
  return out;
}

function TL_Session_inboxRowToItem_(row, context) {
  if (!row || !row.values) return null;
  const values = row.values;
  const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
  const direction = TL_Orchestrator_value_(values, "direction").toLowerCase();
  const text = TL_Orchestrator_value_(values, "text");
  const summary = TL_Orchestrator_value_(values, "ai_summary") || text || TL_Orchestrator_value_(values, "ai_proposal");
  const notes = TL_Orchestrator_value_(values, "notes");
  if (recordClass === "status") return null;
  if (!summary && !notes) return null;
  if (String(notes || "").toLowerCase().indexOf("boss_capture_state=ignored_interface") !== -1) return null;

  const actorPhone = direction === "incoming"
    ? TL_Orchestrator_value_(values, "sender")
    : (TL_Orchestrator_value_(values, "receiver") || TL_Orchestrator_value_(values, "sender"));
  const entity = TL_Session_resolveEntityKey_({
    contactId: TL_Orchestrator_value_(values, "contact_id"),
    phone: actorPhone,
    label: actorPhone
  }, context);
  const evidence = TL_Session_buildInboxEvidence_(values);
  const item = {
    source: "inbox",
    channel: String(TL_Orchestrator_value_(values, "channel") || "whatsapp").toLowerCase(),
    rowNumber: Number(row.rowNumber || 0),
    sourceId: String(TL_Orchestrator_value_(values, "record_id") || TL_Orchestrator_value_(values, "message_id") || ("inbox_row_" + row.rowNumber)),
    recordClass: recordClass,
    direction: direction,
    rootId: TL_Orchestrator_value_(values, "root_id"),
    topicId: TL_Orchestrator_value_(values, "topic_id"),
    entityKey: entity.key,
    entityLabel: entity.label,
    title: TL_Menu_Preview_(summary || text || "", 80),
    summary: String(summary || "").trim(),
    approvalStatus: TL_Orchestrator_value_(values, "approval_status").toLowerCase(),
    executionStatus: TL_Orchestrator_value_(values, "execution_status").toLowerCase(),
    taskStatus: TL_Orchestrator_value_(values, "task_status").toLowerCase(),
    suggestedAction: TL_Orchestrator_value_(values, "suggested_action").toLowerCase(),
    dueText: TL_Orchestrator_value_(values, "task_due"),
    urgencyFlag: TL_Orchestrator_value_(values, "urgency_flag").toLowerCase(),
    needsOwnerNow: TL_Orchestrator_value_(values, "needs_owner_now").toLowerCase(),
    priorityLevel: TL_Orchestrator_value_(values, "priority_level").toLowerCase(),
    importanceLevel: TL_Orchestrator_value_(values, "importance_level").toLowerCase(),
    lastAt: TL_Session_parseDate_(values[0]),
    evidence: evidence
  };
  item.score = TL_Session_scoreItem_(item);
  return item;
}

function TL_Session_emailRowToItem_(row, context) {
  if (!row || !row.data) return null;
  const snapshot = typeof TL_Email_rowToSnapshot_ === "function" ? TL_Email_rowToSnapshot_(row.data) : null;
  const payload = snapshot && snapshot.payload ? snapshot.payload : {};
  const approval = payload.approvalSnapshot || {};
  const triage = payload.triage || {};
  const senderEmail = String(payload.senderEmail || snapshot && snapshot.senderEmail || "").trim().toLowerCase();
  const summary = String((approval.summary || triage.summary || payload.subject || row.data.title || "")).trim();
  if (!summary) return null;

  const entity = TL_Session_resolveEntityKey_({
    email: senderEmail,
    label: senderEmail || String(row.data.title || "").trim()
  }, context);
  const evidence = TL_Session_buildEmailEvidence_(row.data, payload);
  const item = {
    source: "email",
    channel: "email",
    rowNumber: Number(row.rowNumber || 0),
    sourceId: String(row.data.refId || payload.refId || ("email_row_" + row.rowNumber)),
    recordClass: "communication",
    direction: "incoming",
    rootId: String(payload.threadId || row.data.refId || ""),
    topicId: String(payload.threadId || ""),
    entityKey: entity.key,
    entityLabel: entity.label,
    title: TL_Menu_Preview_(String(payload.subject || row.data.title || summary || ""), 80),
    summary: summary,
    approvalStatus: String(payload.approvalStatus || approval.approvalStatus || "").toLowerCase(),
    executionStatus: String(payload.sendStatus || approval.sendStatus || "").toLowerCase(),
    taskStatus: String(row.data.status || "").toLowerCase(),
    suggestedAction: String(triage.suggested_action || "").toLowerCase(),
    dueText: "",
    urgencyFlag: String(triage.urgency_flag || "").toLowerCase(),
    needsOwnerNow: String(triage.needs_owner_now || "").toLowerCase(),
    priorityLevel: String(triage.priority_level || "").toLowerCase(),
    importanceLevel: String(triage.importance_level || "").toLowerCase(),
    lastAt: TL_Session_parseDate_(payload.latestMsgDateIso || row.data.updatedAt || row.data.createdAt),
    evidence: evidence
  };
  item.score = TL_Session_scoreItem_(item);
  return item;
}

function TL_Session_buildInboxEvidence_(values) {
  const out = [];
  const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
  const taskStatus = TL_Orchestrator_value_(values, "task_status").toLowerCase();
  const executionStatus = TL_Orchestrator_value_(values, "execution_status").toLowerCase();
  const due = TL_Orchestrator_value_(values, "task_due");
  const suggested = TL_Orchestrator_value_(values, "suggested_action").toLowerCase();
  const urgencyFlag = TL_Orchestrator_value_(values, "urgency_flag").toLowerCase() === "true";
  const needsOwnerNow = TL_Orchestrator_value_(values, "needs_owner_now").toLowerCase() === "true";
  const notes = TL_Orchestrator_value_(values, "notes").toLowerCase();
  const ts = TL_Session_parseDate_(values[0]);
  const ageHours = ts ? Math.floor((Date.now() - ts.getTime()) / 3600000) : 0;

  if (approvalStatus === "draft" || approvalStatus === "awaiting_approval") out.push("ממתין לאישור");
  if (due) out.push("יש יעד: " + TL_Menu_Preview_(due, 24));
  if (taskStatus === "reminder_pending" || executionStatus === "reminder_pending") out.push("תזכורת פתוחה");
  if (suggested === "follow_up") out.push("אותת כמעקב");
  if (suggested === "reply_now") out.push("אותת כמועמד לתגובה");
  if (urgencyFlag || needsOwnerNow) out.push("סומן קודם כצריך תשומת לב");
  if (notes.indexOf("boss_capture_kind=task") !== -1) out.push("פריט מבוסס בקשת בוס");
  if (notes.indexOf("boss_capture_kind=reminder") !== -1) out.push("פריט מבוסס תזכורת");
  if (ageHours >= 48) out.push("פתוח כבר " + ageHours + " שעות");
  return TL_Session_uniqueStrings_(out);
}

function TL_Session_buildEmailEvidence_(rowData, payload) {
  const out = [];
  const status = String(rowData.status || "").toUpperCase();
  const triage = payload && payload.triage ? payload.triage : {};
  const approval = payload && payload.approvalSnapshot ? payload.approvalSnapshot : {};
  if (status === "OPEN") out.push("אימייל פתוח");
  if (status === "REVISION") out.push("טיוטת אימייל מוכנה לביקורת");
  if (String(payload.approvalStatus || approval.approvalStatus || "").toLowerCase() === "awaiting_approval") out.push("ממתין לאישור");
  if (String(triage.suggested_action || "").toLowerCase() === "follow_up") out.push("אותת כמעקב");
  if (String(triage.urgency_flag || "").toLowerCase() === "true" || String(triage.needs_owner_now || "").toLowerCase() === "true") out.push("סומן כהדורש תשומת לב");
  if (Number(triage.historyDepth || 0) > 0) out.push("יש היסטוריה קודמת עם השולח");
  return TL_Session_uniqueStrings_(out);
}

function TL_Session_scoreItem_(item) {
  let score = 0;
  if (!item) return score;
  if (item.approvalStatus === "draft" || item.approvalStatus === "awaiting_approval") score += 4;
  if (item.suggestedAction === "reply_now" || item.suggestedAction === "call" || item.suggestedAction === "schedule") score += 3;
  if (item.suggestedAction === "follow_up") score += 2;
  if (item.taskStatus === "pending" || item.taskStatus === "captured" || item.taskStatus === "proposal_ready") score += 2;
  if (item.dueText) score += 2;
  if (item.urgencyFlag === "true" || item.needsOwnerNow === "true") score += 1;
  if (item.priorityLevel === "high" || item.importanceLevel === "high") score += 1;
  return score;
}

function TL_Session_groupItems_(items) {
  const groups = {};
  (items || []).forEach(function(item) {
    if (!item) return;
    const key = String(item.entityKey || item.rootId || item.topicId || item.sourceId || Utilities.getUuid());
    if (!groups[key]) {
      groups[key] = {
        key: key,
        label: String(item.entityLabel || item.title || "פריט לא מזוהה"),
        items: [],
        channels: [],
        evidence: [],
        latestAt: item.lastAt || null,
        score: 0,
        topItem: item
      };
    }
    const group = groups[key];
    group.items.push(item);
    if (group.channels.indexOf(item.channel) === -1) group.channels.push(item.channel);
    group.evidence = TL_Session_uniqueStrings_(group.evidence.concat(item.evidence || []));
    if (item.lastAt && (!group.latestAt || item.lastAt.getTime() > group.latestAt.getTime())) group.latestAt = item.lastAt;
    if (item.score > group.score) {
      group.score = item.score;
      group.topItem = item;
    }
  });

  return Object.keys(groups).map(function(key) {
    const group = groups[key];
    if (group.items.length > 1) group.evidence.push("יש " + group.items.length + " פריטים קשורים");
    if (group.channels.length > 1) group.evidence.push("יש הקשר רב-ערוצי");
    group.evidence = TL_Session_uniqueStrings_(group.evidence);
    return group;
  });
}

function TL_Session_selectSurfaceGroups_(surface, groups, options) {
  const limit = Number((options && options.limit) || TL_SESSION.DEFAULT_LIMIT);
  const selected = (groups || []).filter(function(group) {
    const top = group.topItem || {};
    if (surface === TL_SESSION.SURFACES.APPROVALS) {
      return group.items.some(function(item) {
        return item.approvalStatus === "draft" || item.approvalStatus === "awaiting_approval";
      });
    }
    if (surface === TL_SESSION.SURFACES.NEXT_STEPS) {
      return group.items.some(function(item) {
        const action = String(item.suggestedAction || "").toLowerCase();
        return !!action && action !== "ignore" && action !== "wait" && action !== "review_manually";
      });
    }
    if (surface === TL_SESSION.SURFACES.ATTENTION) {
      return group.score >= 3 || group.channels.length > 1;
    }
    return group.score > 0 || group.items.length > 1;
  });

  selected.sort(function(a, b) {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const at = a.latestAt instanceof Date ? a.latestAt.getTime() : 0;
    const bt = b.latestAt instanceof Date ? b.latestAt.getTime() : 0;
    return bt - at;
  });

  return selected.slice(0, limit);
}

function TL_Session_renderSurface_(surface, groups) {
  const title = TL_Session_surfaceTitle_(surface);
  if (!groups || !groups.length) {
    return [title, TL_Session_emptyText_(surface)].join("\n");
  }
  const lines = [title];
  groups.forEach(function(group) {
    lines.push(TL_Session_formatGroupLine_(surface, group));
  });
  return lines.join("\n");
}

function TL_Session_formatGroupLine_(surface, group) {
  const channels = group.channels.length ? group.channels.join("+") : "unknown";
  const evidence = (group.evidence || []).slice(0, 3).join("; ");
  const next = TL_Session_actionLabel_(group.topItem && group.topItem.suggestedAction);
  const parts = [
    "- " + String(group.label || "פריט"),
    group.items.length > 1 ? (String(group.items.length) + " פריטים") : "פריט אחד",
    channels
  ];
  if (surface === TL_SESSION.SURFACES.NEXT_STEPS && next) {
    parts.push("הצעה: " + next);
  }
  if (evidence) {
    parts.push("סיבות: " + evidence);
  } else if (group.topItem && group.topItem.summary) {
    parts.push(TL_Menu_Preview_(group.topItem.summary, 70));
  }
  return parts.join(" | ");
}

function TL_Session_surfaceTitle_(surface) {
  if (surface === TL_SESSION.SURFACES.ATTENTION) return "מה צריך תשומת לב";
  if (surface === TL_SESSION.SURFACES.APPROVALS) return "ממתין לאישורים";
  if (surface === TL_SESSION.SURFACES.NEXT_STEPS) return "צעדים הבאים";
  return "מה על הצלחת שלי עכשיו";
}

function TL_Session_emptyText_(surface) {
  if (surface === TL_SESSION.SURFACES.ATTENTION) return "אין כרגע פריטים בולטים שצריכים תשומת לב.";
  if (surface === TL_SESSION.SURFACES.APPROVALS) return "אין כרגע פריטים שממתינים לאישור.";
  if (surface === TL_SESSION.SURFACES.NEXT_STEPS) return "אין כרגע הצעות פעולה בולטות.";
  return "אין כרגע פריטים פתוחים בולטים.";
}

function TL_Session_actionLabel_(action) {
  const value = String(action || "").trim().toLowerCase();
  const map = {
    reply_now: "להכין תגובה",
    reply_later: "להחזיר תשובה מאוחר יותר",
    call: "להתקשר",
    schedule: "לתאם",
    follow_up: "לעקוב",
    review_manually: "לבדוק ידנית"
  };
  return map[value] || "";
}

function TL_Session_normalizeSurface_(surface) {
  const value = String(surface || "").trim().toLowerCase();
  if (value === TL_SESSION.SURFACES.PLATE_NOW) return TL_SESSION.SURFACES.PLATE_NOW;
  if (value === TL_SESSION.SURFACES.ATTENTION) return TL_SESSION.SURFACES.ATTENTION;
  if (value === "urgent") return TL_SESSION.SURFACES.ATTENTION;
  if (value === "approvals") return TL_SESSION.SURFACES.APPROVALS;
  if (value === "next_steps") return TL_SESSION.SURFACES.NEXT_STEPS;
  return TL_SESSION.SURFACES.PLATE_NOW;
}

function TL_Session_getContactsIndex_() {
  const out = {
    byContactId: {},
    byPhone: {},
    byEmail: {}
  };
  try {
    const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
    if (!sheetId) return out;
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = ss.getSheetByName("CONTACTS");
    if (!sh || sh.getLastRow() < 2) return out;
    const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const headers = values[0];
    const rows = values.slice(1);
    const idxContact = headers.indexOf("contact_id");
    const idxName = headers.indexOf("name");
    const idxPhone1 = headers.indexOf("phone1");
    const idxPhone2 = headers.indexOf("phone2");
    const idxEmail = headers.indexOf("email");
    const idxPhone1Normalized = headers.indexOf("phone1_normalized");
    const idxPhone2Normalized = headers.indexOf("phone2_normalized");
    const idxEmailNormalized = headers.indexOf("email_normalized");
    rows.forEach(function(row) {
      const contactId = String(idxContact >= 0 ? row[idxContact] : "").trim();
      if (!contactId) return;
      const record = {
        contactId: contactId,
        name: String(idxName >= 0 ? row[idxName] : "").trim(),
        phone1: TLW_normalizePhone_(idxPhone1Normalized >= 0 ? row[idxPhone1Normalized] : (idxPhone1 >= 0 ? row[idxPhone1] : "")),
        phone2: TLW_normalizePhone_(idxPhone2Normalized >= 0 ? row[idxPhone2Normalized] : (idxPhone2 >= 0 ? row[idxPhone2] : "")),
        email: String(idxEmailNormalized >= 0 ? row[idxEmailNormalized] : (idxEmail >= 0 ? row[idxEmail] : "")).trim().toLowerCase()
      };
      out.byContactId[contactId] = record;
      if (record.phone1) out.byPhone[record.phone1] = record;
      if (record.phone2) out.byPhone[record.phone2] = record;
      if (record.email) out.byEmail[record.email] = record;
    });
  } catch (err) {}
  return out;
}

function TL_Session_resolveEntityKey_(input, context) {
  const cfg = input || {};
  const index = context && context.contactsIndex ? context.contactsIndex : TL_Session_getContactsIndex_();
  const contactId = String(cfg.contactId || "").trim();
  const phone = TLW_normalizePhone_(cfg.phone || "");
  const email = String(cfg.email || "").trim().toLowerCase();

  let record = null;
  if (contactId && index.byContactId[contactId]) record = index.byContactId[contactId];
  if (!record && phone && index.byPhone[phone]) record = index.byPhone[phone];
  if (!record && email && index.byEmail[email]) record = index.byEmail[email];

  if (record) {
    return {
      key: "contact:" + record.contactId,
      label: record.name || email || phone || record.contactId
    };
  }
  if (contactId) return { key: "contact:" + contactId, label: String(cfg.label || contactId) };
  if (email) return { key: "email:" + email, label: String(cfg.label || email) };
  if (phone) return { key: "phone:" + phone, label: String(cfg.label || phone) };
  return { key: "unknown:" + String(cfg.label || "item"), label: String(cfg.label || "פריט לא מזוהה") };
}

function TL_Session_parseDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value || "").trim();
  if (!text) return null;
  const dt = new Date(text);
  return isNaN(dt.getTime()) ? null : dt;
}

function TL_Session_uniqueStrings_(items) {
  const out = [];
  (items || []).forEach(function(item) {
    const value = String(item || "").trim();
    if (value && out.indexOf(value) === -1) out.push(value);
  });
  return out;
}
