/**
 * TL_Util.gs
 * Utilities for bound-sheet inspection + compact dumping for sharing in chat.
 * Also includes small safe helpers used by Router/Webhook.
 */

const TL_INBOX = {
  SHEET: "ACTIVITY",
  HEADERS: [
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
  ]
};

const TL_ACTIVITY_HEADER_ALIASES = {
  message_type: "activity_kind",
  ai_summary: "summary",
  ai_proposal: "draft_reply",
  wa_group_id: "group_id"
};

const TL_ACTIVITY_HEADER_CANONICAL_ALIASES = {
  activity_kind: ["message_type"],
  summary: ["ai_summary"],
  draft_reply: ["ai_proposal"],
  group_id: ["wa_group_id"]
};

function TL_Activity_canonicalHeader_(headerName) {
  const raw = String(headerName || "").trim();
  if (!raw) return "";
  return TL_ACTIVITY_HEADER_ALIASES[raw] || raw;
}

function TL_Activity_aliasCandidates_(headerName) {
  const canonical = TL_Activity_canonicalHeader_(headerName);
  const aliases = TL_ACTIVITY_HEADER_CANONICAL_ALIASES[canonical] || [];
  return [canonical].concat(aliases);
}

function TL_colIndex_(headerName) {
  const idx = TL_INBOX.HEADERS.indexOf(TL_Activity_canonicalHeader_(headerName));
  if (idx === -1) throw new Error("Unknown INBOX header: " + headerName);
  return idx + 1;
}

function _json_(obj) {
  try { return JSON.stringify(obj); }
  catch (e) {
    try { return String(obj); } catch (e2) { return "[unstringifiable]"; }
  }
}

function _nowIso_() {
  return new Date().toISOString();
}

function TL_Activity_responseExpectedFromSuggestedAction_(suggestedAction) {
  const action = String(suggestedAction || "").trim().toLowerCase();
  if (!action) return false;
  if (action === "ignore" || action === "wait") return false;
  return [
    "reply_now",
    "reply_later",
    "call",
    "schedule",
    "follow_up",
    "review_manually"
  ].indexOf(action) !== -1;
}

function TL_Activity_attentionRequiredFromSuggestedAction_(suggestedAction) {
  const action = String(suggestedAction || "").trim().toLowerCase();
  if (!action) return false;
  return [
    "reply_now",
    "reply_later",
    "call",
    "schedule",
    "follow_up",
    "review_manually"
  ].indexOf(action) !== -1;
}

function TL_Activity_boolString_(value) {
  return value ? "true" : "false";
}

function TL_Activity_pickValue_(obj, headerName, fallback) {
  const safe = obj && typeof obj === "object" ? obj : {};
  const candidates = TL_Activity_aliasCandidates_(headerName);
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (Object.prototype.hasOwnProperty.call(safe, key) && safe[key] !== undefined && safe[key] !== null && safe[key] !== "") {
      return safe[key];
    }
  }
  return fallback;
}

function TL_Activity_normalizeRowObject_(obj) {
  const safe = obj && typeof obj === "object" ? obj : {};
  const out = {};
  TL_INBOX.HEADERS.forEach(function(header) {
    out[header] = TL_Activity_pickValue_(safe, header, "");
  });

  out.timestamp = String(out.timestamp || _nowIso_()).trim();
  out.updated_at = String(out.updated_at || out.timestamp).trim();
  out.activity_kind = String(out.activity_kind || "").trim();
  out.summary = String(out.summary || "").trim();
  out.draft_reply = String(out.draft_reply || "").trim();
  out.group_id = String(out.group_id || "").trim();
  out.response_expected = String(out.response_expected || "").trim();
  out.response_expected_reason = String(out.response_expected_reason || "").trim();
  out.attention_required = String(out.attention_required || "").trim();
  out.business_opportunity = String(out.business_opportunity || "").trim();
  out.media_is_voice = String(out.media_is_voice || "").trim().toLowerCase() === "true" ? "true" : "false";
  out.statuses_count = Number(out.statuses_count || 0);
  return out;
}

function TL_Activity_attachLegacyAliases_(rowObj) {
  const safe = rowObj && typeof rowObj === "object" ? rowObj : {};
  safe.message_type = String(safe.message_type || safe.activity_kind || "").trim();
  safe.ai_summary = String(safe.ai_summary || safe.summary || "").trim();
  safe.ai_proposal = String(safe.ai_proposal || safe.draft_reply || "").trim();
  safe.wa_group_id = String(safe.wa_group_id || safe.group_id || "").trim();
  return safe;
}

/**
 * Returns bound spreadsheetId + all tab names.
 * Safe to run from Apps Script editor.
 */
function TL_Util_listSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = ss.getSheets().map(function(sh){ return sh.getName(); });
  var out = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    tabs: names
  };
  Logger.log(_json_(out));
  return out;
}

/**
 * Dumps a sheet as 2D array (values), with optional row limit.
 * @param {string} sheetName
 * @param {number} rowLimit optional (default 50)
 */
function TL_Util_dumpSheet(sheetName, rowLimit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(String(sheetName || ""));
  if (!sh) return { ok:false, error:"sheet not found", sheetName: String(sheetName||"") };

  var max = (rowLimit == null || rowLimit === "") ? 50 : Number(rowLimit);
  if (!isFinite(max) || max <= 0) max = 50;

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow === 0 || lastCol === 0) {
    return { ok:true, sheetName: sh.getName(), rows: 0, cols: 0, values: [] };
  }

  var rows = Math.min(lastRow, max);
  var values = sh.getRange(1, 1, rows, lastCol).getValues();

  return {
    ok: true,
    sheetName: sh.getName(),
    rows: rows,
    cols: lastCol,
    lastRow: lastRow,
    lastCol: lastCol,
    values: values
  };
}

/**
 * Dumps multiple sheets into one compact object.
 * @param {string} csvNames comma-separated sheet names. If omitted => all sheets.
 * @param {number} rowLimit optional per sheet (default 25)
 */
function TL_Util_dumpSheets(csvNames, rowLimit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var all = ss.getSheets().map(function(sh){ return sh.getName(); });

  var names = String(csvNames || "").trim()
    ? String(csvNames).split(",").map(function(s){ return s.trim(); }).filter(Boolean)
    : all;

  var out = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    requested: names,
    dumps: {}
  };

  names.forEach(function(name){
    out.dumps[name] = TL_Util_dumpSheet(name, rowLimit);
  });

  return out;
}

/**
 * Returns a compact JSON string for copy/paste into chat.
 * @param {string} csvNames optional
 * @param {number} rowLimit optional
 */
function TL_Util_dumpSheetsJson(csvNames, rowLimit) {
  var obj = TL_Util_dumpSheets(csvNames, rowLimit);
  return _json_(obj);
}
