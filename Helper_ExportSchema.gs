/**
 * Helper_ExportSchema
 * - Exports spreadsheet tabs + headers as pasteable JSON
 *
 * Uses Script Property TL_SHEET_ID if set; otherwise uses active spreadsheet.
 */

function Helper_GetSpreadsheet_() {
  var id = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function Helper_ListTabsAndHeaders() {
  var ss = Helper_GetSpreadsheet_();
  var sheets = ss.getSheets();
  var out = [];
  for (var i=0; i<sheets.length; i++) {
    var sh = sheets[i];
    var name = sh.getName();
    var lastCol = sh.getLastColumn();
    var headers = [];
    if (lastCol > 0) {
      headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v||"").trim(); });
      while (headers.length && !headers[headers.length-1]) headers.pop();
    }
    out.push({ tab:name, headers:headers, lastRow:sh.getLastRow(), lastCol:lastCol });
  }
  return out;
}

function Helper_ExportSchemaJson() {
  var schema = {
    version: "sheet-export-1",
    exported_iso: new Date().toISOString(),
    sheet_id: String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim(),
    tabs: Helper_ListTabsAndHeaders()
  };
  var json = JSON.stringify(schema, null, 2);
  try { Logger.log(json); } catch(e) {}
  return json;
}

function Helper_RunGate() {
  return Helper_RunDealWiseReleaseGate();
}

function Helper_RunGateReadOnly() {
  return Helper_RunDealWiseReleaseGate_ReadOnly();
}

function Helper_EmailPullAndExportSchema() {
  var pull = typeof TL_Email_RunScheduled === "function"
    ? TL_Email_RunScheduled()
    : { ok: false, error: "missing TL_Email_RunScheduled" };
  var schemaJson = Helper_ExportSchemaJson();
  var schema = {};
  try {
    schema = JSON.parse(String(schemaJson || "{}"));
  } catch (e) {
    schema = { ok: false, error: "schema_json_parse_failed" };
  }
  return {
    ok: !!(pull && pull.ok),
    pull: pull,
    schema: schema
  };
}

function Helper_ApplyStep2SchemaAndExport() {
  var reset = typeof TL_ResetDealWiseOperationalSheets === "function"
    ? TL_ResetDealWiseOperationalSheets(true)
    : { ok: false, error: "missing TL_ResetDealWiseOperationalSheets" };
  var ensure = typeof TL_EnsureSchema === "function"
    ? TL_EnsureSchema()
    : { ok: false, error: "missing TL_EnsureSchema" };
  var normalize = typeof TL_Schema_NormalizeDealWiseLayout === "function"
    ? TL_Schema_NormalizeDealWiseLayout()
    : { ok: false, error: "missing TL_Schema_NormalizeDealWiseLayout" };
  var schemaJson = Helper_ExportSchemaJson();
  var schema = {};
  try {
    schema = JSON.parse(String(schemaJson || "{}"));
  } catch (e) {
    schema = { ok: false, error: "schema_json_parse_failed" };
  }
  return {
    ok: !!(
      (reset === undefined || reset === null || reset.ok !== false) &&
      (ensure === undefined || ensure === null || ensure.ok !== false) &&
      (normalize === undefined || normalize === null || normalize.ok !== false)
    ),
    reset: reset,
    ensure: ensure,
    normalize: normalize,
    schema: schema
  };
}

function Helper_NormalizeDealWiseLayoutAndExport() {
  var normalize = typeof TL_Schema_NormalizeDealWiseLayout === "function"
    ? TL_Schema_NormalizeDealWiseLayout()
    : { ok: false, error: "missing TL_Schema_NormalizeDealWiseLayout" };
  var schemaJson = Helper_ExportSchemaJson();
  var schema = {};
  try {
    schema = JSON.parse(String(schemaJson || "{}"));
  } catch (e) {
    schema = { ok: false, error: "schema_json_parse_failed" };
  }
  return {
    ok: !!(normalize === undefined || normalize === null || normalize.ok !== false),
    normalize: normalize,
    schema: schema
  };
}

function Helper_RepairNoReplyApprovalStatesAndExport() {
  var repair = typeof TL_Email_ReconcileNoReplyApprovalStates === "function"
    ? TL_Email_ReconcileNoReplyApprovalStates({ dryRun: false, batchSize: 80 })
    : { ok: false, error: "missing TL_Email_ReconcileNoReplyApprovalStates" };
  var schemaJson = Helper_ExportSchemaJson();
  var schema = {};
  try {
    schema = JSON.parse(String(schemaJson || "{}"));
  } catch (e) {
    schema = { ok: false, error: "schema_json_parse_failed" };
  }
  return {
    ok: !!(repair === undefined || repair === null || repair.ok !== false),
    repair: repair,
    schema: schema
  };
}

