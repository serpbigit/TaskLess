/**
 * TL_Util.gs
 * Utilities for bound-sheet inspection + compact dumping for sharing in chat.
 * Also includes small safe helpers used by Router/Webhook.
 */

const TL_INBOX = {
  SHEET: "INBOX",
  HEADERS: [
    "timestamp","root_id","event_id","parent_event_id","record_id","record_version","record_class",
    "channel","direction","phone_number_id","display_phone_number","sender","receiver",
    "message_id","message_type","text","ai_summary","ai_proposal",
    "approval_required","approval_status","execution_status",
    "status_latest","status_timestamp","statuses_count",
    "contact_id","raw_payload_ref","notes",
    "task_due","task_status","task_priority",
    "topic_id","topic_tagged_at",
    "biz_stage","biz_stage_ts","payment_status","delivery_due",
    "media_id","media_mime_type","media_sha256","media_caption","media_filename","media_is_voice",
    "priority_level","importance_level","urgency_flag","needs_owner_now","suggested_action",
    "thread_id","thread_subject","latest_message_at","external_url","participants_json"
  ]
};

function TL_colIndex_(headerName) {
  const idx = TL_INBOX.HEADERS.indexOf(String(headerName || "").trim());
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
