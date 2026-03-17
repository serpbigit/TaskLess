/**
 * TL_Menu_Handler - simple Boss menu flow (Hebrew).
 *
 * Flow:
 * - Boss sends "היי"/"תפריט"/"menu" -> return menu.
 * - Boss sends "1" -> expect next message as free-form note (record_class=instruction, task_status=logged).
 * - Boss sends "2" -> expect next message as meeting request; parse datetime if possible; set task_status=pending.
 * - Boss sends "3" -> return brief list of unattended items.
 *
 * State is stored per boss wa_id in ScriptProperties (lightweight).
 */

const TL_MENU = {
  TRIGGERS: ["תפריט","menu","/menu"],
  CHOICES: ["1","2","3"],
  STATE_KEY_PREFIX: "MENU_STATE_", // + wa_id
  MAX_PENDING_SUMMARY: 5
};

function TL_Menu_HandleBossMessage_(ev, inboxRow) {
  const bossPhone = String(PropertiesService.getScriptProperties().getProperty("BOSS_PHONE") || "").trim();
  const from = String(ev.from || "");
  if (bossPhone && from !== bossPhone) return null; // if boss phone set, enforce; otherwise allow anyone

  const text = String(ev.text || "").trim();
  if (!text) return TL_Menu_BuildMenuReply_();

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
  return [
    "שלום ראובן,",
    "בחר פעולה (שלח רק את המספר):",
    "1. רישום ללא תאריך (למשל: \"לקחתי עכשיו תרופה 20 מ\"\"ג\")",
    "2. קביעת פגישה ביומן",
    "3. בדיקת הודעות חשובות לטיפול"
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

function TL_Menu_LogNote_(ev, inboxRow, taskStatus) {
  // reuse existing inbox row; enrich fields
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  // record_class = instruction, task_status = logged
  sh.getRange(r, TLW_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TLW_colIndex_("task_status")).setValue(taskStatus || "logged");
}

function TL_Menu_LogMeetingRequest_(ev, inboxRow) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  sh.getRange(r, TLW_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TLW_colIndex_("task_status")).setValue("pending");
  // naive parse: leave task_due blank for now; future: parse date/time
}

function TL_Menu_BuildPendingSummary_() {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return "אין כרגע פריטים דחופים.";
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return "אין כרגע פריטים דחופים.";
  const vals = sh.getRange(2,1,Math.min(lastRow-1,100),16).getValues(); // timestamp..text
  const pending = vals.filter(r => String(r[19]||"").toLowerCase() !== "done"); // task_status col T index 19 zero-based
  if (!pending.length) return "אין כרגע פריטים דחופים.";
  const top = pending.slice(0, TL_MENU.MAX_PENDING_SUMMARY).map(r => {
    const ts = r[0];
    const text = r[15] || "";
    return "- " + (ts instanceof Date ? ts.toLocaleString("he-IL") : ts) + ": " + text;
  });
  return "דגימה קצרה של פריטים פתוחים:\n" + top.join("\n");
}
