/**
 * TL_Audit - legacy audit shim.
 * Writes to canonical LOG so old callers do not require a separate AUDIT_LOG tab.
 */

function TL_Audit_append_(actor, eventType, payloadObj) {
  var ss = typeof TL_Schema_getSpreadsheet_ === "function"
    ? TL_Schema_getSpreadsheet_()
    : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("LOG");
  if (!sh) sh = ss.insertSheet("LOG");

  var headers = ["timestamp","level","component","message","meta_json"];
  var rng = sh.getRange(1, 1, 1, headers.length);
  var cur = rng.getValues()[0];
  var needs = false;
  for (var i = 0; i < headers.length; i++) {
    if (String(cur[i] || "") !== String(headers[i] || "")) { needs = true; break; }
  }
  if (needs) {
    rng.setValues([headers]);
    sh.setFrozenRows(1);
  }

  sh.appendRow([
    new Date().toISOString(),
    "INFO",
    String(actor || "TL_Audit"),
    String(eventType || ""),
    JSON.stringify(payloadObj || {})
  ]);
}
