/**
 * Onboarding_GenerateSystemUserToken
 *
 * Requires Script Properties:
 * - TL_USER_ACCESS_TOKEN
 * - TL_SYSTEM_USER_ID
 * - TL_META_APP_ID
 * - TL_META_APP_SECRET
 *
 * Writes back:
 * - TL_SYSTEM_TOKEN
 */

function Onboarding_fetchJson_(url, options) {
  const res = UrlFetchApp.fetch(url, Object.assign({
    muteHttpExceptions: true
  }, options || {}));

  const code = res.getResponseCode();
  const text = res.getContentText();

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error("Non-JSON response from Meta. HTTP " + code + ". Body: " + text);
  }

  return {
    ok: code >= 200 && code < 300,
    code: code,
    json: json,
    raw: text
  };
}

function Onboarding_requireProp_(key) {
  const value = TL_Config_get_(key, "");
  if (!value) throw new Error("Missing Script Property: " + key);
  return String(value).trim();
}

function Onboarding_graphBase_() {
  return "https://graph.facebook.com/v25.0";
}

function Onboarding_buildAppSecretProof_(accessToken, appSecret) {
  const bytes = Utilities.computeHmacSha256Signature(accessToken, appSecret);
  return bytes.map(function(b) {
    const n = b < 0 ? b + 256 : b;
    return ("0" + n.toString(16)).slice(-2);
  }).join("");
}

function Onboarding_DescribeSystemUserForTokenGen() {
  const adminToken   = Onboarding_requireProp_("TL_USER_ACCESS_TOKEN");
  const appSecret    = Onboarding_requireProp_("TL_META_APP_SECRET");
  const systemUserId = Onboarding_requireProp_("TL_SYSTEM_USER_ID");
  const proof        = Onboarding_buildAppSecretProof_(adminToken, appSecret);

  const url =
    Onboarding_graphBase_() + "/" + encodeURIComponent(systemUserId) +
    "?fields=id,name" +
    "&access_token=" + encodeURIComponent(adminToken) +
    "&appsecret_proof=" + encodeURIComponent(proof);

  const out = Onboarding_fetchJson_(url, { method: "get" });
  Logger.log(JSON.stringify(out.json, null, 2));

  if (!out.ok) {
    throw new Error("System user describe failed. HTTP " + out.code + ": " + out.raw);
  }

  return out.json;
}

function Onboarding_GenerateSystemUserToken() {
  const adminToken   = Onboarding_requireProp_("TL_USER_ACCESS_TOKEN");
  const appSecret    = Onboarding_requireProp_("TL_META_APP_SECRET");
  const systemUserId = Onboarding_requireProp_("TL_SYSTEM_USER_ID");
  const appId        = Onboarding_requireProp_("TL_META_APP_ID");
  const proof        = Onboarding_buildAppSecretProof_(adminToken, appSecret);

  const scopes = [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
    "whatsapp_business_manage_events"
  ].join(",");

  const url =
    Onboarding_graphBase_() + "/" + encodeURIComponent(systemUserId) + "/access_tokens" +
    "?access_token=" + encodeURIComponent(adminToken) +
    "&appsecret_proof=" + encodeURIComponent(proof);

  const payload =
    "business_app=" + encodeURIComponent(appId) +
    "&scope=" + encodeURIComponent(scopes) +
    "&set_token_expires_in_60_days=false";

  const out = Onboarding_fetchJson_(url, {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: payload
  });

  Logger.log(JSON.stringify(out.json, null, 2));

  if (!out.ok) {
    throw new Error("Meta token generation failed. HTTP " + out.code + ": " + out.raw);
  }

  const token =
    out.json.access_token ||
    (out.json.data && out.json.data.access_token) ||
    "";

  if (!token) {
    throw new Error("Meta responded without an access_token. Response: " + out.raw);
  }

  TL_Config_set_("TL_SYSTEM_TOKEN", token);

  return {
    ok: true,
    storedScriptProperty: "TL_SYSTEM_TOKEN",
    systemUserId: systemUserId,
    appId: appId
  };
}
