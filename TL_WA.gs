/**
 * TL_WA - WhatsApp (Cloud API) send scaffold.
 * You will set:
 *  TL_CFG_WA_TOKEN
 *  TL_CFG_WA_PHONE_NUMBER_ID
 *  TL_CFG_WA_API_VERSION (default v20.0)
 */
function TL_WA_sendText_(toE164, text) {
  // Scaffold: return what would be sent. Replace with UrlFetchApp call.
  return { ok: true, stub: true, to: String(toE164||""), text: String(text||"") };
}

function TL_WA_build3Buttons_(title, body, buttons) {
  // buttons: [{id:"appr|A142-3", title:"Confirm send"}, ...] max 3
  return { title, body, buttons };
}

