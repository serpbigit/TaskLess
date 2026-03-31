/**
 * TL_SchemaSetup - creates/updates DealWise Sheets tabs and headers.
 *
 * Usage:
 *   TL_EnsureSchema();                  // create missing tabs; set headers if empty
 *   TL_ResetSchema(true);               // force reset headers (clears data!) - use with care
 */

const TL_SCHEMA = {
  INBOX_HEADERS: [
    "timestamp","root_id","event_id","parent_event_id","record_id","record_version","record_class",
    "channel","direction","phone_number_id","display_phone_number","sender","receiver",
    "message_id","activity_kind","text","summary","draft_reply",
    "response_expected","response_expected_reason","attention_required","business_opportunity",
    "approval_required","approval_status","execution_status","reply_status",
    "status_latest","status_timestamp","statuses_count",
    "contact_id","group_id","raw_payload_ref","notes",
    "task_due","task_status","task_priority",
    "topic_id","topic_tagged_at","biz_stage","biz_stage_ts","payment_status","delivery_due",
    "latest_message_at","priority_level","importance_level","urgency_flag","needs_owner_now","suggested_action",
    "thread_id","thread_subject","external_url","participants_json","capture_language","conversation_domain",
    "media_id","media_mime_type","media_sha256","media_caption","media_filename","media_is_voice",
    "resolved_at","resolved_reason","updated_at"
  ],
  CONTACTS_HEADERS: [
    "contact_id","display_name","relationship_type","phones","emails","identity_terms","org","role","tags",
    "personal_history","business_history","deal_stage","deal_score","priority_score",
    "next_step_summary","next_step_due","next_step_channel","waiting_on","open_loop_status",
    "last_signal_summary","last_signal_at","last_inbound_at","last_outbound_at","last_replied_at","unreplied_inbound_count",
    "source_system","source_id","notes_internal","last_updated"
  ],
  SETTINGS_HEADERS: [
    "key","value","description"
  ],
  LOG_HEADERS: [
    "timestamp","level","component","message","meta_json"
  ],
  AI_COST_TRACKER_HEADERS: [
    "Date","Model","Input_Tokens","Output_Tokens","Cost_ILS"
  ],
  REMOVABLE_LEGACY_TABS: [
    "PENDING",
    "COMMANDS_INBOX",
    "AUDIT_LOG"
  ],
  ALLOWED_TABS: [
    "ACTIVITY",
    "ARCHIVE",
    "CONTACTS",
    "SETTINGS",
    "LOG",
    "AI_Cost_Tracker"
  ],
  SETTINGS_DEFAULTS: [
    ["AUTOMATION_ENABLED","true","global kill switch for outbound automation and background runs"],
    ["WORK_HOURS_START","09:00","used for suggesting available scheduling"],
    ["WORK_HOURS_END","17:00","used for suggesting available scheduling"],
    ["DEFAULT_MEETING_MINUTES","60","used for suggesting available scheduling"],
    ["DEFAULT_TZ","Asia/Jerusalem",""],
    ["AI_DEFAULT_LANGUAGE","Hebrew","default language for Boss-facing menus, summaries, and approvals"],
    ["REPLY_LANGUAGE_POLICY","match_incoming","match_incoming|boss_language. Controls draft reply language selection."],
    ["API END POINT","",""],
    ["API TOKEN","",""],
    ["BOSS_NAME","","display/use name for the Boss in menus and AI drafting context; leave blank for generic Boss fallback"],
    ["BOSS_PHONE","","msisdn for Boss channel (wa_id will be inferred)"],
    ["BOSS_PROACTIVE_UPDATES_ENABLED","false","allow proactive boss digests and decision packets; keep false until explicitly enabled"],
    ["URGENT_PUSH_ENABLED","false","allow urgent secretary push interruptions outside normal pull/digest flow"],
    ["BOSS_INTERRUPT_LEVEL","urgent_only","manual_only|urgent_only|high_and_urgent|all_action_items"],
    ["BOSS_UPDATE_INTERVAL_MINUTES","120","digest/update cadence for secretary summaries"],
    ["BOSS_DECISION_REQUEST_INTERVAL_MINUTES","120","cadence for prompting Boss for pending decisions"],
    ["BOSS_DECISION_BATCH_SIZE","5","default number of decision items to present in one batch"],
    ["BOSS_CONTEXT_RESTART_MINUTES","15","after this many idle minutes, any new non-command boss text defaults back to the main menu instead of continuing stale context"],
    ["BOSS_MAX_ITEMS_PER_DIGEST","10","maximum items to include in one digest/update"],
    ["BOSS_URGENT_ITEMS_ALWAYS_FIRST","true","urgent items should be ordered before normal items in batches/digests"],
    ["BOSS_INCLUDE_FYI_IN_DIGEST","false","include FYI/non-action rows in digests when capacity remains"],
    ["DO_NOT_DISTURB_ENABLED","false","suppress proactive secretary pushes outside explicit pull mode"],
    ["EMAIL_PULL_ENABLED","true","enable scheduled Gmail pull worker"],
    ["EMAIL_OWNER_EMAIL","reuven007@gmail.com","explicit Gmail owner address used for deterministic inbound matching; leave blank to fall back to script properties/session user"],
    ["EMAIL_PULL_QUERY","is:important newer_than:14d -category:promotions -category:social","query used by the scheduled Gmail pull worker"],
    ["EMAIL_PULL_MAX_THREADS","20","maximum Gmail threads pulled per scheduled run"],
    ["EMAIL_TRIAGE_ENABLED","true","triage newly pulled email threads into revision queue"],
    ["EMAIL_TRIAGE_BATCH_SIZE","5","maximum pulled email rows to triage per scheduled run"],
    ["WHATSAPP_GROUP_QUIET_MINUTES","3","silence needed before sealing an inbound WhatsApp burst into one reply item"],
    ["WHATSAPP_GROUP_MAX_MINUTES","12","maximum total length of one grouped inbound WhatsApp burst before starting a new one"],
    ["thread_window_minutes","120","minutes to keep messages in same root/topic"],
    ["reply_mode","consolidated","consolidated|per_message"],
    ["status_cache_enabled","true","buffer unmatched statuses and merge later"],
    ["ai_voice_transcription","true","transcribe/diarize voice notes"],
    ["ai_summary_enabled","true","generate ai_summary/ai_proposal automatically"]
  ]
};

function TL_EnsureSchema() {
  const ss = TL_Schema_getSpreadsheet_();
  ensureTab_(ss, "ACTIVITY", TL_SCHEMA.INBOX_HEADERS, false);
  ensureTab_(ss, "ARCHIVE", TL_SCHEMA.INBOX_HEADERS, false);
  ensureTab_(ss, "CONTACTS", TL_SCHEMA.CONTACTS_HEADERS, false);
  ensureTab_(ss, "SETTINGS", TL_SCHEMA.SETTINGS_HEADERS, false);
  ensureTab_(ss, "LOG", TL_SCHEMA.LOG_HEADERS, false);
  ensureTab_(ss, "AI_Cost_Tracker", TL_SCHEMA.AI_COST_TRACKER_HEADERS, false);
  seedSettings_(ss);
}

function TL_ResetSchema(forceClear) {
  const ss = TL_Schema_getSpreadsheet_();
  ensureTab_(ss, "ACTIVITY", TL_SCHEMA.INBOX_HEADERS, !!forceClear);
  ensureTab_(ss, "ARCHIVE", TL_SCHEMA.INBOX_HEADERS, !!forceClear);
  ensureTab_(ss, "CONTACTS", TL_SCHEMA.CONTACTS_HEADERS, !!forceClear);
  ensureTab_(ss, "SETTINGS", TL_SCHEMA.SETTINGS_HEADERS, !!forceClear);
  ensureTab_(ss, "LOG", TL_SCHEMA.LOG_HEADERS, !!forceClear);
  ensureTab_(ss, "AI_Cost_Tracker", TL_SCHEMA.AI_COST_TRACKER_HEADERS, !!forceClear);
  seedSettings_(ss);
}

function TL_ResetDealWiseOperationalSheets(forceClearArchive) {
  const ss = TL_Schema_getSpreadsheet_();
  ensureTab_(ss, "ACTIVITY", TL_SCHEMA.INBOX_HEADERS, true);
  ensureTab_(ss, "CONTACTS", TL_SCHEMA.CONTACTS_HEADERS, true);
  ensureTab_(ss, "ARCHIVE", TL_SCHEMA.INBOX_HEADERS, forceClearArchive !== false);
  const legacyInbox = ss.getSheetByName("INBOX");
  if (legacyInbox) ss.deleteSheet(legacyInbox);
  return {
    ok: true,
    reset_tabs: ["ACTIVITY", "CONTACTS", "ARCHIVE"],
    removed_tabs: legacyInbox ? ["INBOX"] : []
  };
}

/**
 * Removes tabs not in the allowed schema list.
 * Destructive: deletes entire sheets. Use with caution.
 */
function TL_PruneTabs() {
  const ss = TL_Schema_getSpreadsheet_();
  const allowed = new Set(TL_SCHEMA.ALLOWED_TABS);
  ss.getSheets().forEach(sh => {
    const name = sh.getName();
    if (!allowed.has(name)) {
      ss.deleteSheet(sh);
    }
  });
}

function TL_PruneDeadLegacyTabs() {
  const ss = TL_Schema_getSpreadsheet_();
  const removed = [];
  TL_SCHEMA.REMOVABLE_LEGACY_TABS.forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    ss.deleteSheet(sh);
    removed.push(name);
  });
  return {
    ok: true,
    removed: removed
  };
}

function TL_Schema_getSpreadsheet_() {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (sheetId) return SpreadsheetApp.openById(sheetId);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureTab_(ss, name, headers, forceClear) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  } else if (forceClear) {
    sh.clearContents();
  }
  TL_Schema_normalizeTopRows_(sh, headers);
  const range = sh.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  sh.setFrozenRows(1);
}

function TL_Schema_normalizeTopRows_(sh, headers) {
  if (!sh) return;
  const targetHeaders = Array.isArray(headers) ? headers.map(function(v) { return String(v || "").trim(); }) : [];
  const width = targetHeaders.length || Math.max(1, sh.getLastColumn());
  const lastRow = Math.max(1, sh.getLastRow());
  const scanRows = Math.min(Math.max(lastRow, 3), 5);
  const values = sh.getRange(1, 1, scanRows, width).getDisplayValues();
  let headerRow = -1;

  for (let i = 0; i < values.length; i++) {
    if (TL_Schema_rowsMatch_(values[i], targetHeaders)) {
      headerRow = i + 1;
      break;
    }
  }

  if (headerRow > 1) {
    sh.deleteRows(1, headerRow - 1);
  } else {
    while (sh.getLastRow() > 1 && TL_Schema_rowBlank_(sh, 1, width)) {
      sh.deleteRow(1);
    }
  }

  while (sh.getLastRow() >= 2 && TL_Schema_rowBlank_(sh, 2, width)) {
    sh.deleteRow(2);
  }
}

function TL_Schema_rowBlank_(sh, rowNumber, width) {
  const values = sh.getRange(rowNumber, 1, 1, width).getDisplayValues()[0] || [];
  for (let i = 0; i < values.length; i++) {
    if (String(values[i] || "").trim()) return false;
  }
  return true;
}

function TL_Schema_rowsMatch_(actual, expected) {
  const left = Array.isArray(actual) ? actual : [];
  const right = Array.isArray(expected) ? expected : [];
  if (!right.length) return false;
  for (let i = 0; i < right.length; i++) {
    if (String(left[i] || "").trim() !== String(right[i] || "").trim()) return false;
  }
  return true;
}

function TL_Schema_NormalizeDealWiseLayout() {
  const ss = TL_Schema_getSpreadsheet_();
  ensureTab_(ss, "ACTIVITY", TL_SCHEMA.INBOX_HEADERS, false);
  ensureTab_(ss, "ARCHIVE", TL_SCHEMA.INBOX_HEADERS, false);
  ensureTab_(ss, "CONTACTS", TL_SCHEMA.CONTACTS_HEADERS, false);
  ensureTab_(ss, "SETTINGS", TL_SCHEMA.SETTINGS_HEADERS, false);
  ensureTab_(ss, "LOG", TL_SCHEMA.LOG_HEADERS, false);
  ensureTab_(ss, "AI_Cost_Tracker", TL_SCHEMA.AI_COST_TRACKER_HEADERS, false);
  return { ok: true, normalized_tabs: TL_SCHEMA.ALLOWED_TABS.slice() };
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
