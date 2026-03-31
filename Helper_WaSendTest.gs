function Helper_WaSendTestMessage() {

  const phoneNumberId = "896133996927016";   // sender (your WA business line)
  const token = PropertiesService.getScriptProperties().getProperty("TL_SYSTEM_TOKEN");

  const url = "https://graph.facebook.com/v21.0/" + phoneNumberId + "/messages";

  const payload = {
    messaging_product: "whatsapp",
    to: "972552360035",
    type: "text",
    text: {
      body: "DealWise POC message"
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

  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());
}
