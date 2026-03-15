/**
 * TL_WA_SendTest.gs
 *
 * Required Script Properties:
 * - TL_SYSTEM_TOKEN
 * - TL_WA_PHONE_NUMBER_ID
 */

const TL_WA_GRAPH_VERSION = "v21.0";

function TL_WA_sendText(toE164, bodyText) {
  const token = String(PropertiesService.getScriptProperties().getProperty("TL_SYSTEM_TOKEN") || "").trim();
  if (!token) throw new Error("Missing Script Property TL_SYSTEM_TOKEN");

  const phoneNumberId = String(PropertiesService.getScriptProperties().getProperty("TL_WA_PHONE_NUMBER_ID") || "").trim();
  if (!phoneNumberId) throw new Error("Missing Script Property TL_WA_PHONE_NUMBER_ID");

  const to = String(toE164 || "").replace(/\D/g, "");
  if (!to) throw new Error("Missing recipient E164 number");

  const body = String(bodyText || "").trim();
  if (!body) throw new Error("Missing body text");

  const url = "https://graph.facebook.com/" + TL_WA_GRAPH_VERSION + "/" + phoneNumberId + "/messages";

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: {
      preview_url: false,
      body: body
    }
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const responseText = res.getContentText();

  Logger.log("HTTP " + code);
  Logger.log(responseText);

  if (code < 200 || code >= 300) {
    throw new Error("WhatsApp send failed. HTTP " + code + " :: " + responseText);
  }

  return {
    ok: true,
    status: code,
    response: responseText
  };
}

function TL_WA_sendTestMessage() {
  return TL_WA_sendText("972552360035", "TaskLess test reply OK");
}
