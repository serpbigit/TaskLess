/**
 * TL_WA_POC_Router.gs
 * Paused as web-app entrypoint so TL_Webhook.gs remains the single canonical doPost.
 * Original logic preserved under a named handler.
 */

function TL_WA_POC_Router_doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const msg = value?.messages?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!msg) {
      TL_Log_("WA_NO_MESSAGE", payload);
      return TL_OK_();
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

    TL_Log_("WA_MESSAGE_STORED", draftJson);

    return TL_OK_();
  } catch (err) {
    TL_Log_("WA_ERROR", err.toString());
    return TL_OK_();
  }
}

function TL_OK_() {
  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}

function TL_Log_(type, data) {
  if (typeof TL_Audit_append_ === "function") {
    TL_Audit_append_("TL_WA_POC_Router", String(type || ""), data || {});
  }
}
