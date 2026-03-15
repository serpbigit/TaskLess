function doPost(e) {
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
      now,                // createdAt
      now,                // updatedAt
      userPhone,          // userE164
      refId,              // refId
      chunkId,            // chunkId
      text.substring(0,120), // title
      "wa_message",       // kind
      "whatsapp",         // channel
      "OPEN",             // status
      now,                // askedAt
      "",                 // answeredAt
      "",                 // executedAt
      JSON.stringify(draftJson), // draftOrPromptJson
      "WA_INGEST",        // lastAction
      now                 // lastActionAt
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

  const log = SpreadsheetApp.getActive().getSheetByName("AUDIT_LOG");

  if (!log) return;

  log.appendRow([
    new Date().toISOString(),
    type,
    JSON.stringify(data)
  ]);

}
