/**
 * Onboarding_SubscribeAppToWaba.gs
 *
 * Purpose:
 * Force-subscribe this app to the target WhatsApp Business Account so webhook events
 * can actually flow from the WABA to the app webhook.
 *
 * Uses Script Properties:
 * - TL_SYSTEM_TOKEN   (required)
 * - TL_META_WABA_ID   (optional; falls back to known current WABA)
 *
 * Current known WABA fallback:
 * - 1359984478739186
 */

function Onboarding_SubscribeAppToWaba() {
  const token = String(PropertiesService.getScriptProperties().getProperty("TL_SYSTEM_TOKEN") || "").trim();
  if (!token) throw new Error("Missing Script Property TL_SYSTEM_TOKEN");

  const wabaId = String(
    PropertiesService.getScriptProperties().getProperty("TL_META_WABA_ID") ||
    "1359984478739186"
  ).trim();
  if (!wabaId) throw new Error("Missing WABA ID");

  const url = "https://graph.facebook.com/v25.0/" + encodeURIComponent(wabaId) + "/subscribed_apps";

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  const body = res.getContentText();

  Logger.log("HTTP " + status);
  Logger.log(body);

  return {
    ok: status >= 200 && status < 300,
    status: status,
    wabaId: wabaId,
    body: body
  };
}

function Onboarding_ListSubscribedApps() {
  const token = String(PropertiesService.getScriptProperties().getProperty("TL_SYSTEM_TOKEN") || "").trim();
  if (!token) throw new Error("Missing Script Property TL_SYSTEM_TOKEN");

  const wabaId = String(
    PropertiesService.getScriptProperties().getProperty("TL_META_WABA_ID") ||
    "1359984478739186"
  ).trim();
  if (!wabaId) throw new Error("Missing WABA ID");

  const url =
    "https://graph.facebook.com/v25.0/" +
    encodeURIComponent(wabaId) +
    "/subscribed_apps";

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  const body = res.getContentText();

  Logger.log("HTTP " + status);
  Logger.log(body);

  return {
    ok: status >= 200 && status < 300,
    status: status,
    wabaId: wabaId,
    body: body
  };
}
