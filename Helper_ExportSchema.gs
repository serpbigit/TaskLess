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

