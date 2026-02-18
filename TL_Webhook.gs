/**
 * TL_Webhook - POC Web App entrypoints (bounded)
 * - GET: Meta verify (when hub.* params exist) OR simple health check
 * - POST: logs inbound + routes to TL_Parse + TL_Router
 */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var mode = String(p["hub.mode"] || "");
  var token = String(p["hub.verify_token"] || "");
  var challenge = String(p["hub.challenge"] || "");

  // Meta verification path (only when hub.* params exist)
  if (mode) {
    var expected = String(PropertiesService.getScriptProperties().getProperty("TL_VERIFY_TOKEN") || "");
    if (mode === "subscribe" && expected && token === expected) {
      return ContentService.createTextOutput(challenge).setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput("forbidden").setMimeType(ContentService.MimeType.TEXT);
  }

  // Normal health check
  return ContentService.createTextOutput("TaskLess POC ok").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var raw = (e && e.postData && typeof e.postData.contents === "string") ? e.postData.contents : "";
    var payload = raw ? JSON.parse(raw) : {};

    // Minimal audit so we can see POST arrived (never block)
    try {
      TL_Audit_append_("SYSTEM", "WEBHOOK_POST_IN", {
        rawLen: raw.length,
        keys: Object.keys(payload || {})
      });
    } catch (auditErr) {}

    // Parse + route (your existing files)
    var env = TL_Parse_envelope_(payload);
    var out = TL_Router_handle_(env);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, out: out }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var msg = String(err && err.stack ? err.stack : err);

    try { TL_Audit_append_("SYSTEM", "WEBHOOK_POST_ERR", { error: msg }); } catch (auditErr2) {}

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: msg }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
