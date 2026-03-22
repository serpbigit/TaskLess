/**
 * Helper_RebuildSchema
 * Applies a schema (tabs + headers) deterministically.
 *
 * Modes:
 * - "verify_only": no changes; returns report
 * - "create_missing": create missing tabs and fix header row if mismatched
 */

function Helper_ApplySchema(schemaJson, mode) {
  var ss = Helper_GetSpreadsheet_();
  var m = String(mode || "verify_only").trim();

  var schema = schemaJson;
  if (typeof schemaJson === "string") schema = JSON.parse(schemaJson);
  if (!schema || !schema.tabs || !schema.tabs.length) throw new Error("Invalid schema: missing tabs");

  var report = { applied_iso:new Date().toISOString(), mode:m, actions:[], ok:true };
  function push(action, details) { report.actions.push({ action:action, details:details||{} }); }

  schema.tabs.forEach(function(t){
    var tab = String(t.tab || "").trim();
    if (!tab) return;
    var expectedHeaders = (t.headers || []).map(function(x){ return String(x||"").trim(); });

    var sh = ss.getSheetByName(tab);
    if (!sh) {
      if (m === "create_missing") { sh = ss.insertSheet(tab); push("create_sheet", { tab:tab }); }
      else { push("missing_sheet", { tab:tab }); report.ok=false; return; }
    }

    var lastCol = Math.max(sh.getLastColumn(), expectedHeaders.length);
    if (lastCol < 1) lastCol = expectedHeaders.length;

    var actual = [];
    if (lastCol > 0) {
      actual = sh.getRange(1,1,1,lastCol).getValues()[0].map(function(v){ return String(v||"").trim(); });
      while (actual.length && !actual[actual.length-1]) actual.pop();
    }

    var mismatch = (expectedHeaders.length !== actual.length);
    if (!mismatch) {
      for (var i=0; i<expectedHeaders.length; i++) {
        if (String(expectedHeaders[i]||"") !== String(actual[i]||"")) { mismatch=true; break; }
      }
    }

    if (mismatch) {
      if (m === "create_missing") {
        sh.getRange(1,1,1,expectedHeaders.length).setValues([expectedHeaders]);
        sh.setFrozenRows(1);
        push("set_headers", { tab:tab, expected:expectedHeaders, actual:actual });
      } else {
        push("headers_mismatch", { tab:tab, expected:expectedHeaders, actual:actual });
        report.ok=false;
      }
    } else {
      push("headers_ok", { tab:tab });
    }
  });

  var json = JSON.stringify(report, null, 2);
  try { Logger.log(json); } catch(e) {}
  return json;
}

