/**
 * TL_Audit - append-only audit log for bounded sheet POC
 * Tab: AUDIT_LOG
 * Columns: ts, actor, eventType, payloadJson
 */

function TL_Audit_append_(actor, eventType, payloadObj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("AUDIT_LOG");
  if (!sh) sh = ss.insertSheet("AUDIT_LOG");

  // ensure headers
  var headers = ["ts","actor","eventType","payloadJson"];
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
    String(actor || ""),
    String(eventType || ""),
    JSON.stringify(payloadObj || {})
  ]);
}
