/**
 * TL_Webhook — Sprint 1 Deterministic Command Router
 * Minimal deterministic grammar enforcement.
 * No AI. No parse layer. No TL_Router.
 */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var mode = String(p["hub.mode"] || "");
  var token = String(p["hub.verify_token"] || "");
  var challenge = String(p["hub.challenge"] || "");

  if (mode) {
    var expected = String(PropertiesService.getScriptProperties().getProperty("TL_VERIFY_TOKEN") || "");
    if (mode === "subscribe" && expected && token === expected) {
      return ContentService.createTextOutput(challenge)
        .setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput("forbidden")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService.createTextOutput("TaskLess Deterministic Router OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {

    var raw = (e && e.postData && typeof e.postData.contents === "string")
      ? e.postData.contents
      : "";

    if (!raw) {
      return _reject_("EMPTY_BODY");
    }

    var payload = JSON.parse(raw);

    var text = String(payload.text || "").trim();

    if (!text.startsWith("TL:CMD:")) {
      return _reject_("INVALID_GRAMMAR");
    }

    var userId = String(payload.userId || "");
    var batchVersion = String(payload.batchVersion || "");

    if (!userId) {
      return _reject_("MISSING_USER");
    }

    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName("COMMANDS_INBOX");

    if (!sheet) {
      throw new Error("COMMANDS_INBOX sheet missing");
    }

    sheet.appendRow([
      new Date(),
      userId,
      text,
      batchVersion,
      "RECEIVED"
    ]);

    _logEvent_("CMD_RECEIVED", {
      userId: userId,
      text: text,
      batchVersion: batchVersion
    });

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        status: "ACCEPTED",
        command: text
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return _reject_(String(err && err.message ? err.message : err));
  }
}

function _reject_(reason) {
  _logEvent_("CMD_REJECTED", { reason: reason });

  return ContentService
    .createTextOutput(JSON.stringify({
      ok: false,
      error: reason
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _logEvent_(type, data) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName("EVENTS_LOG");
    if (!sheet) return;

    sheet.appendRow([
      new Date(),
      type,
      JSON.stringify(data || {})
    ]);
  } catch (e) {}
}
