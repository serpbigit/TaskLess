/**
 * TL_TestReminder
 *
 * Deterministic runners for reminder dispatch and archive-on-success.
 */

function TL_TestReminder_RunAll() {
  return {
    parser: TL_TestReminder_ParseDueRun(),
    fire_and_archive: TL_TestReminder_FireAndArchiveRun()
  };
}

function TL_TestReminder_ParseDueRun() {
  const base = new Date("2026-03-19T10:00:00Z");
  const inMinutes = TL_Reminder_parseDueAt_("in 10 minutes", base);
  const tomorrow = TL_Reminder_parseDueAt_("מחר ב-08:00", base);
  const output = {
    ok: !!inMinutes && !!tomorrow,
    in_minutes_iso: inMinutes ? inMinutes.toISOString() : "",
    tomorrow_iso: tomorrow ? tomorrow.toISOString() : ""
  };
  Logger.log("TL_TestReminder_ParseDueRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestReminder_FireAndArchiveRun() {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const inbox = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  const archive = ss.getSheetByName("ARCHIVE");
  if (!inbox || !archive) throw new Error("Missing INBOX or ARCHIVE");

  const beforeArchive = archive.getLastRow();
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "972500000999").trim();
  const phoneNumberId = String(TLW_getSetting_("BUSINESS_PHONE_ID") || "896133996927016").trim();
  const displayPhone = String(TLW_getSetting_("BUSINESS_PHONE") || TLW_getSetting_("DISPLAY_PHONE_NUMBER") || "972506847373").trim();
  const rowObj = {
    timestamp: new Date(Date.now() - 20 * 60 * 1000),
    root_id: "root_reminder_test_" + Utilities.getUuid(),
    event_id: "EVT_" + Utilities.getUuid(),
    parent_event_id: "",
    record_id: "REC_" + Utilities.getUuid(),
    record_version: 1,
    record_class: "instruction",
    channel: "whatsapp",
    direction: "incoming",
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    sender: bossPhone,
    receiver: displayPhone,
    message_id: "msg_" + Utilities.getUuid(),
    message_type: "text",
    text: "Take medicine",
    ai_summary: "תזכורת לקחת תרופה.",
    ai_proposal: "תזכורת לקחת תרופה.",
    approval_required: "false",
    approval_status: "approved",
    execution_status: "reminder_pending",
    status_latest: "",
    status_timestamp: "",
    statuses_count: 0,
    contact_id: "WA_" + phoneNumberId + "_" + bossPhone,
    raw_payload_ref: "",
    notes: "boss_capture_kind=reminder\nboss_capture_finalized=reminder",
    task_due: "in 1 minutes",
    task_status: "reminder_pending",
    task_priority: "high",
    topic_id: "topic_unknown",
    topic_tagged_at: new Date().toISOString(),
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
    priority_level: "high",
    importance_level: "high",
    urgency_flag: "true",
    needs_owner_now: "true",
    suggested_action: "follow_up"
  };

  const appended = TLW_appendInboxRow_(rowObj, TLW_safeStringify_({ source: "TL_TestReminder_FireAndArchiveRun" }, 2000));
  const sent = [];
  const result = TL_Reminder_RunDueUnlocked_(5, {
    now: new Date(Date.now() + 2 * 60 * 1000),
    sendFn: function(phoneId, toWaId, text) {
      sent.push({
        phoneId: String(phoneId || ""),
        toWaId: String(toWaId || ""),
        text: String(text || "")
      });
      return { ok: true, status: 200, body: "{}" };
    }
  });

  const archiveRows = archive.getLastRow();
  const archiveValues = archiveRows > beforeArchive ? archive.getRange(archiveRows, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0] : null;
  const inboxLoc = TLW_findRowByMessageId_(phoneNumberId, rowObj.message_id);
  const output = {
    ok: !!result && result.fired === 1 && result.archived === 1 && sent.length === 1 && !inboxLoc && !!archiveValues,
    source_row: appended.row,
    fired: result ? result.fired : 0,
    archived: result ? result.archived : 0,
    sent_count: sent.length,
    archive_last_record_id: archiveValues ? String(archiveValues[TLW_colIndex_("record_id") - 1] || "") : ""
  };
  Logger.log("TL_TestReminder_FireAndArchiveRun: %s", JSON.stringify(output, null, 2));
  return output;
}
