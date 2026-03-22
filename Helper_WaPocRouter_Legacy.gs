/**
 * Helper_WaPocRouter_Legacy.gs
 * Paused as web-app entrypoint so TL_Webhook.gs remains the single canonical doPost.
 * Original logic preserved under a named handler.
 */

function Helper_WaPocRouterLegacy_doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const msg = value?.messages?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!msg) {
      Helper_WaPocRouterLegacy_log_("WA_NO_MESSAGE", payload);
      return Helper_WaPocRouterLegacy_ok_();
    }

    const userPhone = msg.from;
    const messageId = msg.id;
    const text = msg.text?.body || "";

    const now = new Date().toISOString();

    const refId = "wa:msg:" + messageId;
    const chunkId = messageId;

    const draftJson = {
      source: "whatsapp",
      phone_number_id: phoneNumberId,
      from: userPhone,
      messageId: messageId,
      text: text
    };

    const sheet = SpreadsheetApp.getActive().getSheetByName("OPEN");

    sheet.appendRow([
      now,
      now,
      userPhone,
      refId,
      chunkId,
      text.substring(0,120),
      "wa_message",
      "whatsapp",
      "OPEN",
      now,
      "",
      "",
      JSON.stringify(draftJson),
      "WA_INGEST",
      now
    ]);

    Helper_WaPocRouterLegacy_log_("WA_MESSAGE_STORED", draftJson);

    return Helper_WaPocRouterLegacy_ok_();
  } catch (err) {
    Helper_WaPocRouterLegacy_log_("WA_ERROR", err.toString());
    return Helper_WaPocRouterLegacy_ok_();
  }
}

function Helper_WaPocRouterLegacy_ok_() {
  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function Helper_WaPocRouterLegacy_log_(type, data) {
  if (typeof TL_Audit_append_ === "function") {
    TL_Audit_append_("Helper_WaPocRouter_Legacy", String(type || ""), data || {});
  }
}
