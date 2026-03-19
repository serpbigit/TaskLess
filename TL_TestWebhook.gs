/**
 * TL_TestWebhook - internal webhook simulation harness.
 *
 * Use preview functions to validate parsing without writing to INBOX.
 * Use write functions to exercise the real doPost() path with fake webhook payloads.
 */

function TL_TestWebhook_MediaPreviewSuite() {
  const suite = TL_TestWebhook_buildMediaSuite_();
  const results = suite.map(item => ({
    name: item.name,
    payload: item.payload,
    events: TLW_extractEvents_(item.payload)
  }));
  Logger.log("TL_TestWebhook_MediaPreviewSuite: %s", JSON.stringify(results, null, 2));
  return results;
}

function TL_TestWebhook_MediaWriteSuite() {
  const suite = TL_TestWebhook_buildMediaSuite_();
  const results = suite.map(item => TL_TestWebhook_runPayload_(item.name, item.payload));
  Logger.log("TL_TestWebhook_MediaWriteSuite: %s", JSON.stringify(results, null, 2));
  return results;
}

function TL_TestWebhook_Image() {
  return TL_TestWebhook_runPayload_("image", TL_TestWebhook_buildImagePayload_());
}

function TL_TestWebhook_Document() {
  return TL_TestWebhook_runPayload_("document", TL_TestWebhook_buildDocumentPayload_());
}

function TL_TestWebhook_Voice() {
  return TL_TestWebhook_runPayload_("voice", TL_TestWebhook_buildVoicePayload_());
}

function TL_TestWebhook_Video() {
  return TL_TestWebhook_runPayload_("video", TL_TestWebhook_buildVideoPayload_());
}

function TL_TestWebhook_LateStatusRepairSuite() {
  const messageId = TL_TestWebhook_fakeMessageId_("status-repair");
  const statusPayload = TL_TestWebhook_buildStatusPayload_(messageId, "delivered");
  const messagePayload = TL_TestWebhook_buildMessagePayload_("text", {
    text: { body: "late status repair test" }
  }, messageId);

  const statusResult = TL_TestWebhook_runPayload_("late-status-first", statusPayload);
  const messageResult = TL_TestWebhook_runPayload_("late-status-second", messagePayload);
  const row = TLW_findRowByMessageId_(TL_TestWebhook_getPhoneNumberId_(), messageId);
  const snapshot = row ? row.sh.getRange(row.row, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0] : [];

  const result = {
    message_id: messageId,
    statusResult: statusResult,
    messageResult: messageResult,
    row: row ? row.row : "",
    final_status_latest: snapshot ? String(snapshot[TLW_colIndex_("status_latest") - 1] || "") : "",
    final_status_timestamp: snapshot ? String(snapshot[TLW_colIndex_("status_timestamp") - 1] || "") : "",
    final_statuses_count: snapshot ? Number(snapshot[TLW_colIndex_("statuses_count") - 1] || 0) : 0,
    final_record_version: snapshot ? Number(snapshot[TLW_colIndex_("record_version") - 1] || 0) : 0
  };
  Logger.log("TL_TestWebhook_LateStatusRepairSuite: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestWebhook_OutgoingMissingRecipientPreview() {
  const payload = TL_TestWebhook_buildOutgoingEchoPayload_(false);
  const result = {
    name: "outgoing-missing-recipient",
    events: TLW_extractEvents_(payload)
  };
  Logger.log("TL_TestWebhook_OutgoingMissingRecipientPreview: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestWebhook_OutgoingMissingRecipientWriteSuite() {
  const seedMessageId = TL_TestWebhook_fakeMessageId_("seed");
  const echoMessageId = TL_TestWebhook_fakeMessageId_("echo-missing-recipient");
  const seedPayload = TL_TestWebhook_buildMessagePayload_("text", {
    text: { body: "seed conversation for fallback" }
  }, seedMessageId);
  const echoPayload = TL_TestWebhook_buildOutgoingEchoPayload_(false, echoMessageId);

  const seedResult = TL_TestWebhook_runPayload_("outgoing-fallback-seed", seedPayload);
  const echoResult = TL_TestWebhook_runPayload_("outgoing-fallback-echo", echoPayload);
  const row = TLW_findRowByMessageId_(TL_TestWebhook_getPhoneNumberId_(), echoMessageId);
  const snapshot = row ? row.sh.getRange(row.row, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0] : [];

  const result = {
    seed_message_id: seedMessageId,
    echo_message_id: echoMessageId,
    seedResult: seedResult,
    echoResult: echoResult,
    row: row ? row.row : "",
    final_receiver: snapshot ? String(snapshot[TLW_colIndex_("receiver") - 1] || "") : "",
    final_direction: snapshot ? String(snapshot[TLW_colIndex_("direction") - 1] || "") : ""
  };
  Logger.log("TL_TestWebhook_OutgoingMissingRecipientWriteSuite: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestWebhook_ImagePreview() {
  return TL_TestWebhook_previewPayload_("image", TL_TestWebhook_buildImagePayload_());
}

function TL_TestWebhook_DocumentPreview() {
  return TL_TestWebhook_previewPayload_("document", TL_TestWebhook_buildDocumentPayload_());
}

function TL_TestWebhook_VoicePreview() {
  return TL_TestWebhook_previewPayload_("voice", TL_TestWebhook_buildVoicePayload_());
}

function TL_TestWebhook_VideoPreview() {
  return TL_TestWebhook_previewPayload_("video", TL_TestWebhook_buildVideoPayload_());
}

function TL_TestWebhook_previewPayload_(name, payload) {
  const result = {
    name: String(name || ""),
    events: TLW_extractEvents_(payload)
  };
  Logger.log("TL_TestWebhook_previewPayload_: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestWebhook_runPayload_(name, payload) {
  const response = doPost({
    postData: {
      contents: JSON.stringify(payload)
    }
  });

  let body = "";
  try {
    body = response.getContent();
  } catch (e) {
    body = String(response);
  }

  const result = {
    name: String(name || ""),
    response_body: body,
    events: TLW_extractEvents_(payload)
  };
  Logger.log("TL_TestWebhook_runPayload_: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestWebhook_buildMediaSuite_() {
  return [
    { name: "image", payload: TL_TestWebhook_buildImagePayload_() },
    { name: "document", payload: TL_TestWebhook_buildDocumentPayload_() },
    { name: "voice", payload: TL_TestWebhook_buildVoicePayload_() },
    { name: "video", payload: TL_TestWebhook_buildVideoPayload_() }
  ];
}

function TL_TestWebhook_buildImagePayload_() {
  return TL_TestWebhook_buildMessagePayload_("image", {
    image: {
      id: TL_TestWebhook_fakeMediaId_("image"),
      mime_type: "image/jpeg",
      sha256: TL_TestWebhook_fakeSha256_("image"),
      caption: "test image caption"
    }
  });
}

function TL_TestWebhook_buildDocumentPayload_() {
  return TL_TestWebhook_buildMessagePayload_("document", {
    document: {
      id: TL_TestWebhook_fakeMediaId_("document"),
      mime_type: "application/pdf",
      sha256: TL_TestWebhook_fakeSha256_("document"),
      filename: "test-document.pdf",
      caption: "test document caption"
    }
  });
}

function TL_TestWebhook_buildVoicePayload_() {
  return TL_TestWebhook_buildMessagePayload_("audio", {
    audio: {
      id: TL_TestWebhook_fakeMediaId_("voice"),
      mime_type: "audio/ogg; codecs=opus",
      sha256: TL_TestWebhook_fakeSha256_("voice"),
      voice: true
    }
  });
}

function TL_TestWebhook_buildVideoPayload_() {
  return TL_TestWebhook_buildMessagePayload_("video", {
    video: {
      id: TL_TestWebhook_fakeMediaId_("video"),
      mime_type: "video/mp4",
      sha256: TL_TestWebhook_fakeSha256_("video"),
      caption: "test video caption"
    }
  });
}

function TL_TestWebhook_buildMessagePayload_(type, bodyFields, messageIdOverride) {
  const phoneNumberId = TL_TestWebhook_getPhoneNumberId_();
  const displayPhoneNumber = TL_TestWebhook_getDisplayPhoneNumber_();
  const fromWaId = TL_TestWebhook_getFromWaId_();
  const messageId = String(messageIdOverride || TL_TestWebhook_fakeMessageId_(type));
  const message = {
    from: fromWaId,
    id: messageId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: String(type || "")
  };

  Object.keys(bodyFields || {}).forEach(function(key) {
    message[key] = bodyFields[key];
  });

  return {
    object: "whatsapp_business_account",
    entry: [{
      id: TL_TestWebhook_getWabaId_(),
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: displayPhoneNumber,
            phone_number_id: phoneNumberId
          },
          contacts: [{
            profile: { name: "Test Contact" },
            wa_id: fromWaId
          }],
          messages: [message]
        }
      }]
    }]
  };
}

function TL_TestWebhook_buildStatusPayload_(messageId, status, timestamp) {
  const phoneNumberId = TL_TestWebhook_getPhoneNumberId_();
  const displayPhoneNumber = TL_TestWebhook_getDisplayPhoneNumber_();
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: TL_TestWebhook_getWabaId_(),
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: displayPhoneNumber,
            phone_number_id: phoneNumberId
          },
          statuses: [{
            id: String(messageId || ""),
            status: String(status || "delivered"),
            timestamp: String(timestamp || Math.floor(Date.now() / 1000))
          }]
        }
      }]
    }]
  };
}

function TL_TestWebhook_buildOutgoingEchoPayload_(withRecipient, messageIdOverride) {
  const phoneNumberId = TL_TestWebhook_getPhoneNumberId_();
  const displayPhoneNumber = TL_TestWebhook_getDisplayPhoneNumber_();
  const messageId = String(messageIdOverride || TL_TestWebhook_fakeMessageId_("echo"));
  const echo = {
    from: "",
    id: messageId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "text",
    text: { body: "outgoing echo fallback test" }
  };
  if (withRecipient) {
    echo.recipient_id = TL_TestWebhook_getFromWaId_();
  }

  return {
    object: "whatsapp_business_account",
    entry: [{
      id: TL_TestWebhook_getWabaId_(),
      changes: [{
        field: "message_echoes",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: displayPhoneNumber,
            phone_number_id: phoneNumberId
          },
          message_echoes: [echo]
        }
      }]
    }]
  };
}

function TL_TestWebhook_fakeMessageId_(type) {
  return "test-" + String(type || "msg") + "-" + Utilities.getUuid();
}

function TL_TestWebhook_fakeMediaId_(type) {
  return "media-" + String(type || "item") + "-" + Utilities.getUuid();
}

function TL_TestWebhook_fakeSha256_(label) {
  return Utilities.base64Encode(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(label || "") + "-" + Utilities.getUuid()
  ));
}

function TL_TestWebhook_getPhoneNumberId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("TL_META_PHONE_NUMBER_ID") ||
    TLW_getSetting_("BUSINESS_PHONE_ID") ||
    TLW_getSetting_("BUSINESS_PHONEID") ||
    "896133996927016"
  ).trim();
}

function TL_TestWebhook_getDisplayPhoneNumber_() {
  return String(
    TLW_getSetting_("BUSINESS_PHONE") ||
    TLW_getSetting_("DISPLAY_PHONE_NUMBER") ||
    "972506847373"
  ).trim();
}

function TL_TestWebhook_getFromWaId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("BOSS_PHONE") ||
    TLW_getSetting_("BOSS_PHONE") ||
    "972552630035"
  ).trim();
}

function TL_TestWebhook_getWabaId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("TL_META_WABA_ID") ||
    "test-waba-id"
  ).trim();
}
