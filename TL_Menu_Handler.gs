/**
 * TL_Menu_Handler - Boss menu flow (Hebrew).
 *
 * Flow:
 * - Boss sends "היי"/"תפריט"/"menu" -> return menu.
 * - Boss sends "1" -> expect next message as free-form note (record_class=instruction, task_status=logged).
 * - Boss sends "2" -> expect next message as meeting request; parse datetime if possible; set task_status=pending.
 * - Boss sends "3" -> return brief list of unattended items.
 * - When the secretary sends a decision packet, Boss replies with numbered
 *   confirmation modes that always preserve final approval control.
 *
 * State is stored per boss wa_id in ScriptProperties (lightweight).
 */

const TL_MENU = {
  TRIGGERS: ["תפריט","menu","/menu"],
  CHOICES: ["1","2","3"],
  STATE_KEY_PREFIX: "MENU_STATE_", // + wa_id
  PACKET_KEY_PREFIX: "MENU_PACKET_", // + wa_id
  MAX_PENDING_SUMMARY: 5
};

function TL_Menu_HandleBossMessage_(ev, inboxRow) {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  const from = String(ev.from || "").trim();
  const bossWaId = from;
  if (bossPhone && from !== bossPhone) return null; // if boss phone set, enforce; otherwise allow anyone

  const text = String(ev.text || "").trim().toLowerCase();
  if (!text) return TL_Menu_BuildMenuReply_();

  const packetReply = TL_Menu_HandleDecisionPacketReply_(bossWaId, text);
  if (packetReply) return packetReply;

  // Check triggers
  if (TL_MENU.TRIGGERS.some(t => text === t)) {
    TL_Menu_SetState_(bossWaId, "idle");
    return TL_Menu_BuildMenuReply_();
  }

  // Check if numeric choice
  if (TL_MENU.CHOICES.includes(text)) {
    TL_Menu_SetState_(bossWaId, text);
    return TL_Menu_BuildChoiceAck_(text);
  }

  // Otherwise, consume based on current state
  const state = TL_Menu_GetState_(bossWaId);
  if (state === "1") {
    // Free-form note
    TL_Menu_LogNote_(ev, inboxRow, "logged");
    TL_Menu_SetState_(bossWaId, "idle");
    return "✅ נרשם. תודה.";
  }
  if (state === "2") {
    TL_Menu_LogMeetingRequest_(ev, inboxRow);
    TL_Menu_SetState_(bossWaId, "idle");
    return "✅ התקבל. אעדכן אותך כשאשלים עיבוד/לו״ז.";
  }
  if (state === "3") {
    TL_Menu_SetState_(bossWaId, "idle");
    return TL_Menu_BuildPendingSummary_();
  }

  // Default: show menu
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_BuildMenuReply_() {
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "ראובן").trim();
  return [
    "שלום " + bossName + ",",
    "בחר פעולה:",
    "1. רישום ללא תאריך (למשל: \"לקחתי עכשיו תרופה 20 מ\"\"ג\")",
    "2. קביעת פגישה ביומן",
    "3. בדיקת הודעות חשובות לטיפול",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildChoiceAck_(choice) {
  if (choice === "1") return "רשום/אמור מה אתה רוצה להזין שעשית.";
  if (choice === "2") return "כתוב פרטי פגישה (תאריך/שעה/נושא). לדוגמה: \"פגישה עם יוסי מחר ב-10:00\"";
  if (choice === "3") return TL_Menu_BuildPendingSummary_();
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_SetState_(waId, state) {
  PropertiesService.getScriptProperties().setProperty(TL_MENU.STATE_KEY_PREFIX + waId, state);
}

function TL_Menu_GetState_(waId) {
  return String(PropertiesService.getScriptProperties().getProperty(TL_MENU.STATE_KEY_PREFIX + waId) || "idle");
}

function TL_Menu_ShouldHandleText_(waId, text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (TL_MENU.TRIGGERS.some(t => normalized === t)) return true;
  if (TL_Menu_HasDecisionPacket_(waId)) return true;
  if (TL_Menu_GetState_(waId) !== "idle") return true;
  return TL_MENU.CHOICES.indexOf(normalized) !== -1;
}

function TL_Menu_HasDecisionPacket_(waId) {
  return !!TL_Menu_GetDecisionPacket_(waId);
}

function TL_Menu_GetDecisionPacket_(waId) {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(TL_MENU.PACKET_KEY_PREFIX + String(waId || "").trim());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.items && parsed.items.length ? parsed : null;
  } catch (e) {
    return null;
  }
}

function TL_Menu_SetDecisionPacket_(waId, packet) {
  const normalizedWaId = String(waId || "").trim();
  if (!normalizedWaId) return false;
  if (!packet || !packet.items || !packet.items.length) {
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.PACKET_KEY_PREFIX + normalizedWaId);
    return true;
  }
  const safe = {
    kind: String(packet.kind || "decision"),
    stage: String(packet.stage || "root"),
    cursor: Number(packet.cursor || 0),
    created_at: String(packet.created_at || new Date().toISOString()),
    items: (packet.items || []).map(function(item) {
      return {
        key: String(item.key || ""),
        rowNumber: Number(item.rowNumber || 0),
        recordId: String(item.recordId || ""),
        rootId: String(item.rootId || ""),
        recordClass: String(item.recordClass || ""),
        summary: String(item.summary || ""),
        proposal: String(item.proposal || ""),
        sender: String(item.sender || ""),
        receiver: String(item.receiver || ""),
        contactId: String(item.contactId || ""),
        approvalStatus: String(item.approvalStatus || ""),
        executionStatus: String(item.executionStatus || ""),
        taskStatus: String(item.taskStatus || ""),
        isUrgent: !!item.isUrgent,
        isHigh: !!item.isHigh
      };
    }).filter(function(item) {
      return !!item.rowNumber;
    })
  };
  PropertiesService.getScriptProperties().setProperty(TL_MENU.PACKET_KEY_PREFIX + normalizedWaId, JSON.stringify(safe));
  return true;
}

function TL_Menu_ClearDecisionPacket_(waId) {
  PropertiesService.getScriptProperties().deleteProperty(TL_MENU.PACKET_KEY_PREFIX + String(waId || "").trim());
}

function TL_Menu_StoreDecisionPacket_(waId, kind, items) {
  const packetItems = (items || []).map(function(item) {
    return {
      key: item.key,
      rowNumber: item.rowNumber,
      recordId: item.recordId,
      rootId: item.rootId,
      recordClass: item.recordClass,
      summary: item.summary,
      proposal: item.proposal,
      sender: item.sender,
      receiver: item.receiver,
      contactId: item.contactId,
      approvalStatus: item.approvalStatus,
      executionStatus: item.executionStatus,
      taskStatus: item.taskStatus,
      isUrgent: item.isUrgent,
      isHigh: item.isHigh
    };
  }).filter(function(item) {
    return !!item.rowNumber;
  });
  if (!packetItems.length) return false;
  return TL_Menu_SetDecisionPacket_(waId, {
    kind: kind || "decision",
    stage: "root",
    cursor: 0,
    created_at: new Date().toISOString(),
    items: packetItems
  });
}

function TL_Menu_HandleDecisionPacketReply_(waId, text) {
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (!packet) return null;

  const choice = String(text || "").trim();
  if (!choice) return TL_Menu_BuildDecisionPacketReply_(packet);

  if (packet.stage === "root") {
    return TL_Menu_HandleDecisionPacketRootReply_(waId, packet, choice);
  }
  if (packet.stage === "few") {
    return TL_Menu_HandleDecisionPacketFewReply_(waId, packet, choice);
  }
  if (packet.stage === "smart") {
    return TL_Menu_HandleDecisionPacketSmartReply_(waId, packet, choice);
  }
  if (packet.stage === "one_by_one") {
    return TL_Menu_HandleDecisionPacketOneByOneReply_(waId, packet, choice);
  }

  TL_Menu_ClearDecisionPacket_(waId);
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_HandleDecisionPacketRootReply_(waId, packet, choice) {
  if (choice === "1") {
    const approved = TL_Menu_ApprovePacketItems_(packet.items);
    TL_Menu_ClearDecisionPacket_(waId);
    return [
      "אישרתי את כל הפריטים בחבילה.",
      "סה\"כ אושרו: " + approved.approved,
      approved.failed ? ("נכשלו: " + approved.failed) : "",
      "המערכת תמשיך לעיבוד/שליחה לפי הזרימה הרגילה."
    ].filter(Boolean).join("\n");
  }
  if (choice === "2") {
    packet.stage = "few";
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketFewReply_(packet);
  }
  if (choice === "3") {
    packet.stage = "one_by_one";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }
  if (choice === "4") {
    packet.stage = "smart";
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketSmartReply_(packet);
  }
  if (choice === "5") {
    TL_Menu_ClearDecisionPacket_(waId);
    return "בסדר. לא בוצע דבר כרגע.";
  }
  if (choice === "6") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  }
  return TL_Menu_BuildDecisionPacketReply_(packet);
}

function TL_Menu_HandleDecisionPacketFewReply_(waId, packet, choice) {
  if (choice === "1") {
    const subset = packet.items.slice(0, Math.min(3, packet.items.length));
    const approved = TL_Menu_ApprovePacketItems_(subset);
    TL_Menu_ClearDecisionPacket_(waId);
    return "אישרתי חלק מהחבילה. אושרו " + approved.approved + " פריטים ראשונים.";
  }
  if (choice === "2") {
    const urgentOnly = packet.items.filter(function(item) { return item.isUrgent; });
    const approved = TL_Menu_ApprovePacketItems_(urgentOnly);
    TL_Menu_ClearDecisionPacket_(waId);
    return "אישרתי רק את הפריטים הדחופים. אושרו " + approved.approved + " פריטים.";
  }
  if (choice === "3") {
    const topOne = packet.items.slice(0, 1);
    const approved = TL_Menu_ApprovePacketItems_(topOne);
    TL_Menu_ClearDecisionPacket_(waId);
    return "אישרתי רק את הפריט הראשון. אושרו " + approved.approved + " פריטים.";
  }
  if (choice === "4") {
    packet.stage = "root";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketReply_(packet);
  }
  if (choice === "5") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  }
  return TL_Menu_BuildDecisionPacketFewReply_(packet);
}

function TL_Menu_HandleDecisionPacketSmartReply_(waId, packet, choice) {
  if (choice === "1") {
    const smartSubset = packet.items.filter(function(item) {
      return item.isUrgent || item.isHigh;
    });
    const approved = TL_Menu_ApprovePacketItems_(smartSubset);
    const remaining = Math.max(packet.items.length - approved.approved, 0);
    TL_Menu_ClearDecisionPacket_(waId);
    return [
      "אישרתי את הדחופים/החשובים בלבד.",
      "אושרו: " + approved.approved,
      "נשארו ללא אישור: " + remaining
    ].join("\n");
  }
  if (choice === "2") {
    const exceptions = packet.items.filter(function(item) {
      return !(item.isUrgent || item.isHigh);
    });
    if (!exceptions.length) {
      packet.stage = "root";
      TL_Menu_SetDecisionPacket_(waId, packet);
      return "אין כרגע חריגים. כל הפריטים נראים דחופים/חשובים.";
    }
    packet.stage = "one_by_one";
    packet.cursor = 0;
    packet.items = exceptions;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }
  if (choice === "3") {
    packet.stage = "root";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketReply_(packet);
  }
  if (choice === "4") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  }
  return TL_Menu_BuildDecisionPacketSmartReply_(packet);
}

function TL_Menu_HandleDecisionPacketOneByOneReply_(waId, packet, choice) {
  const current = packet.items[packet.cursor || 0];
  if (!current) {
    TL_Menu_ClearDecisionPacket_(waId);
    return "סיימנו את הסקירה אחד-אחד.";
  }

  if (choice === "1") {
    TL_Menu_ApprovePacketItems_([current]);
    packet.cursor = Number(packet.cursor || 0) + 1;
  } else if (choice === "2") {
    packet.cursor = Number(packet.cursor || 0) + 1;
  } else if (choice === "3") {
    TL_Menu_ClearDecisionPacket_(waId);
    return "עצרתי את הסקירה אחד-אחד.";
  } else if (choice === "4") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  } else {
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }

  if (!packet.items[packet.cursor || 0]) {
    TL_Menu_ClearDecisionPacket_(waId);
    return "סיימנו את הסקירה. אין עוד פריטים בחבילה.";
  }

  TL_Menu_SetDecisionPacket_(waId, packet);
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
}

function TL_Menu_ApprovePacketItems_(items) {
  const unique = {};
  const result = { approved: 0, failed: 0 };
  (items || []).forEach(function(item) {
    if (!item || !item.rowNumber || unique[item.rowNumber]) return;
    unique[item.rowNumber] = true;
    if (TL_Menu_ApproveDecisionRow_(item.rowNumber)) result.approved++;
    else result.failed++;
  });
  return result;
}

function TL_Menu_ApproveDecisionRow_(rowNumber) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
    if (!sh || !rowNumber) return false;

    const values = sh.getRange(rowNumber, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0];
    const approvalRequired = String(values[TLW_colIndex_("approval_required") - 1] || "").trim().toLowerCase() === "true";
    const approvalStatus = String(values[TLW_colIndex_("approval_status") - 1] || "").trim().toLowerCase();
    const executionStatus = String(values[TLW_colIndex_("execution_status") - 1] || "").trim().toLowerCase();
    const taskStatus = String(values[TLW_colIndex_("task_status") - 1] || "").trim().toLowerCase();
    const updates = {
      approval_required: approvalRequired ? "true" : String(values[TLW_colIndex_("approval_required") - 1] || ""),
      approval_status: "approved"
    };

    if (executionStatus !== "sent" && executionStatus !== "executed") {
      updates.execution_status = "approved";
    }
    if (taskStatus === "pending" || taskStatus === "proposal_ready" || taskStatus === "awaiting_approval") {
      updates.task_status = "approved";
    }

    if (typeof TL_Orchestrator_updateRowFields_ === "function") {
      TL_Orchestrator_updateRowFields_(rowNumber, updates, "boss_confirm");
    } else {
      Object.keys(updates).forEach(function(key) {
        sh.getRange(rowNumber, TLW_colIndex_(key)).setValue(updates[key]);
      });
      TLW_applyVersionBump_(rowNumber, "boss_confirm");
    }
    if (!approvalRequired && approvalStatus === "approved") return true;
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_BuildDecisionPacketReply_(packet) {
  return [
    TL_Menu_BuildDecisionPacketHeader_(packet),
    "1. כן, אשר הכל",
    "2. רק חלק",
    "3. תן לי אחד אחד",
    "4. קבץ לי בצורה חכמה",
    "5. דחה לעכשיו",
    "6. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketFewReply_(packet) {
  return [
    "אישור חלקי",
    "1. אשר את 3 הראשונים",
    "2. אשר רק דחופים",
    "3. אשר רק את הראשון",
    "4. חזרה לתפריט קודם",
    "5. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketSmartReply_(packet) {
  const urgentCount = packet.items.filter(function(item) { return item.isUrgent || item.isHigh; }).length;
  const exceptionCount = Math.max(packet.items.length - urgentCount, 0);
  return [
    "חלוקה חכמה",
    "דחופים/חשובים: " + urgentCount,
    "חריגים: " + exceptionCount,
    "1. אשר רק דחופים/חשובים",
    "2. עבור על החריגים אחד אחד",
    "3. חזרה לתפריט קודם",
    "4. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketOneByOneReply_(packet) {
  const current = packet.items[packet.cursor || 0];
  if (!current) return "אין עוד פריטים בחבילה.";
  const index = Number(packet.cursor || 0) + 1;
  const total = packet.items.length;
  const actor = current.receiver || current.sender || current.contactId || current.rootId || "לא ידוע";
  const summary = TL_Menu_Preview_(current.summary || current.proposal || current.taskStatus || "", 140);
  return [
    "בדיקה אחד-אחד " + index + "/" + total,
    actor,
    summary,
    "1. אשר",
    "2. דלג",
    "3. עצור",
    "4. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketHeader_(packet) {
  const total = packet.items.length;
  const urgent = packet.items.filter(function(item) { return item.isUrgent; }).length;
  return [
    "האם לאשר את הפריטים הבאים?",
    "סה\"כ פריטים: " + total,
    "דחופים: " + urgent
  ].join("\n");
}

function TL_Menu_Preview_(text, limit) {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  const max = Number(limit || 140);
  if (!raw) return "";
  return raw.length > max ? (raw.slice(0, max) + "...") : raw;
}

function TL_Menu_LogNote_(ev, inboxRow, taskStatus) {
  // reuse existing inbox row; enrich fields
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  // record_class = instruction, task_status = logged
  sh.getRange(r, TLW_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TLW_colIndex_("task_status")).setValue(taskStatus || "logged");
  TLW_applyVersionBump_(r, "menu_note");
}

function TL_Menu_LogMeetingRequest_(ev, inboxRow) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  sh.getRange(r, TLW_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TLW_colIndex_("task_status")).setValue("pending");
  TLW_applyVersionBump_(r, "menu_meeting");
  // naive parse: leave task_due blank for now; future: parse date/time
}

function TL_Menu_BuildPendingSummary_() {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return "אין כרגע פריטים דחופים.";
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return "אין כרגע פריטים דחופים.";
  const vals = sh.getRange(2, 1, Math.min(lastRow - 1, 100), TL_WEBHOOK.INBOX_HEADERS.length).getValues();
  const pending = vals.filter(r => String(r[19]||"").toLowerCase() !== "done"); // task_status col T index 19 zero-based
  if (!pending.length) return "אין כרגע פריטים דחופים.";
  const top = pending.slice(0, TL_MENU.MAX_PENDING_SUMMARY).map(r => {
    const ts = r[0];
    const text = r[15] || "";
    return "- " + (ts instanceof Date ? ts.toLocaleString("he-IL") : ts) + ": " + text;
  });
  return "דגימה קצרה של פריטים פתוחים:\n" + top.join("\n");
}
