function Onboarding_RegisterPhone() {
  const token = String(PropertiesService.getScriptProperties().getProperty("TL_SYSTEM_TOKEN") || "").trim();
  if (!token) throw new Error("Missing Script Property TL_SYSTEM_TOKEN");

  const phoneNumberId = "896133996927016";
  const pin = "123456"; // replace with your real 6-digit WhatsApp 2-step verification PIN

  const url = "https://graph.facebook.com/v21.0/" + phoneNumberId + "/register";

  const payload = {
    messaging_product: "whatsapp",
    pin: pin
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

  Logger.log("HTTP " + res.getResponseCode());
  Logger.log(res.getContentText());

  return {
    status: res.getResponseCode(),
    body: res.getContentText()
  };
}
