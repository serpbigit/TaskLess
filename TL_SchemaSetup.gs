/**
 * TL_SchemaSetup - creates/updates TaskLess Sheets tabs and headers.
 *
 * Usage:
 *   TL_EnsureSchema();                  // create missing tabs; set headers if empty
 *   TL_ResetSchema(true);               // force reset headers (clears data!) - use with care
 */

const TL_SCHEMA = {
  INBOX_HEADERS: [
    "timestamp","root_id","event_id","parent_event_id","record_id","record_version","record_class",
    "channel","direction","phone_number_id","display_phone_number","sender","receiver",
    "message_id","message_type","text","ai_summary","ai_proposal",
    "approval_required","approval_status","execution_status",
    "status_latest","status_timestamp","statuses_count",
    "contact_id","raw_payload_ref","notes",
    "task_due","task_status","task_priority",
    "topic_id","topic_tagged_at",
    "biz_stage","biz_stage_ts","payment_status","delivery_due",
    "media_id","media_mime_type","media_sha256","media_caption","media_filename","media_is_voice"
  ],
  CONTACTS_HEADERS: [
    "contact_id","name","alias","org","website","phone1","phone2","email","role","tags","last_note","last_enriched_at"
  ],
  CONTACT_ENRICHMENTS_HEADERS: [
    "timestamp","contact_id","contact_name","note_type","note_text","source","linked_record_id","topic_id","notes"
  ],
  TOPICS_HEADERS: [
    "topic_id","contact_id","contact_name","topic_summary","last_used_at","usage_count","recent_examples_json","notes"
  ],
  SETTINGS_HEADERS: [
    "key","value","description"
  ],
  LOG_HEADERS: [
    "timestamp","level","component","message","meta_json"
  ],
  ALLOWED_TABS: [
    "INBOX",
    "ARCHIVE",
    "CONTACTS",
    "CONTACT_ENRICHMENTS",
    "TOPICS",
    "SETTINGS",
    "LOG"
  ],
  SETTINGS_DEFAULTS: [
    ["WORK_HOURS_START","09:00","used for suggesting available scheduling"],
    ["WORK_HOURS_END","17:00","used for suggesting available scheduling"],
    ["DEFAULT_MEETING_MINUTES","60","used for suggesting available scheduling"],
    ["DEFAULT_TZ","Asia/Jerusalem",""],
    ["AI_DEFAULT_LANGUAGE","Hebrew","default language for AI drafts/summaries"],
    ["API END POINT","",""],
    ["API TOKEN","",""],
    ["BOSS_PHONE","","msisdn for Boss channel (wa_id will be inferred)"],
    ["thread_window_minutes","120","minutes to keep messages in same root/topic"],
    ["reply_mode","consolidated","consolidated|per_message"],
    ["status_cache_enabled","true","buffer unmatched statuses and merge later"],
    ["ai_voice_transcription","true","transcribe/diarize voice notes"],
    ["ai_summary_enabled","true","generate ai_summary/ai_proposal automatically"]
  ]
};

function TL_EnsureSchema() {
  const ss = SpreadsheetApp.getActive();
  ensureTab_(ss, "INBOX", TL_SCHEMA.INBOX_HEADERS, false);
  ensureTab_(ss, "ARCHIVE", TL_SCHEMA.INBOX_HEADERS, false);
  ensureTab_(ss, "CONTACTS", TL_SCHEMA.CONTACTS_HEADERS, false);
  ensureTab_(ss, "CONTACT_ENRICHMENTS", TL_SCHEMA.CONTACT_ENRICHMENTS_HEADERS, false);
  ensureTab_(ss, "TOPICS", TL_SCHEMA.TOPICS_HEADERS, false);
  ensureTab_(ss, "SETTINGS", TL_SCHEMA.SETTINGS_HEADERS, false);
  ensureTab_(ss, "LOG", TL_SCHEMA.LOG_HEADERS, false);
  seedSettings_(ss);
}

function TL_ResetSchema(forceClear) {
  const ss = SpreadsheetApp.getActive();
  ensureTab_(ss, "INBOX", TL_SCHEMA.INBOX_HEADERS, !!forceClear);
  ensureTab_(ss, "ARCHIVE", TL_SCHEMA.INBOX_HEADERS, !!forceClear);
  ensureTab_(ss, "CONTACTS", TL_SCHEMA.CONTACTS_HEADERS, !!forceClear);
  ensureTab_(ss, "CONTACT_ENRICHMENTS", TL_SCHEMA.CONTACT_ENRICHMENTS_HEADERS, !!forceClear);
  ensureTab_(ss, "TOPICS", TL_SCHEMA.TOPICS_HEADERS, !!forceClear);
  ensureTab_(ss, "SETTINGS", TL_SCHEMA.SETTINGS_HEADERS, !!forceClear);
  ensureTab_(ss, "LOG", TL_SCHEMA.LOG_HEADERS, !!forceClear);
  seedSettings_(ss);
}

/**
 * Removes tabs not in the allowed schema list.
 * Destructive: deletes entire sheets. Use with caution.
 */
function TL_PruneTabs() {
  const ss = SpreadsheetApp.getActive();
  const allowed = new Set(TL_SCHEMA.ALLOWED_TABS);
  ss.getSheets().forEach(sh => {
    const name = sh.getName();
    if (!allowed.has(name)) {
      ss.deleteSheet(sh);
    }
  });
}

function ensureTab_(ss, name, headers, forceClear) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  } else if (forceClear) {
    sh.clearContents();
  }
  const range = sh.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  sh.setFrozenRows(1);
}

function seedSettings_(ss) {
  const sh = ss.getSheetByName("SETTINGS");
  if (!sh) return;
  const lastRow = sh.getLastRow();
  // If only header is present (row 1), seed defaults
  if (lastRow < 2) {
    sh.getRange(2, 1, TL_SCHEMA.SETTINGS_DEFAULTS.length, TL_SCHEMA.SETTINGS_HEADERS.length)
      .setValues(TL_SCHEMA.SETTINGS_DEFAULTS);
    return;
  }
  // Otherwise, upsert missing keys without overwriting existing values
  const existing = new Map();
  const rows = sh.getRange(2, 1, lastRow - 1, 2).getValues(); // key, value
  rows.forEach(r => { const k = String(r[0]||"").trim(); if (k) existing.set(k, true); });
  const toAdd = TL_SCHEMA.SETTINGS_DEFAULTS.filter(([k]) => !existing.has(k));
  if (toAdd.length) {
    sh.getRange(lastRow + 1, 1, toAdd.length, TL_SCHEMA.SETTINGS_HEADERS.length).setValues(toAdd);
  }
}
