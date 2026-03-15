/**
 * TL_descriptive_minimumWabaPhoneIds.gs
 * WABA-FIRST VERSION
 */

const TL_GRAPH_VERSION = "v21.0";
const TL_GRAPH_BASE = "https://graph.facebook.com/" + TL_GRAPH_VERSION;
const TL_TOKEN_PROPERTY_KEY = "TL_SYSTEM_TOKEN";
const TL_WABA_ID = "1359984478739186";

function TL_descriptive_run_minimum() {
  const token = TL_getToken_();
  if (!token) throw new Error("Missing Script Property: " + TL_TOKEN_PROPERTY_KEY);

  Logger.log("=== WABA-FIRST VERSION ===");
  Logger.log("WABA ID: " + TL_WABA_ID);

  const waba = TL_fetchJson_(
    TL_buildUrl_(TL_WABA_ID, {
      fields: "id,name,message_template_namespace"
    }),
    token
  );

  Logger.log("=== WABA ===");
  Logger.log("WABA ID: " + String(waba.id || ""));
  Logger.log("WABA name: " + String(waba.name || ""));
  Logger.log("message_template_namespace: " + String(waba.message_template_namespace || ""));

  const phoneEdge = TL_fetchJson_(
    TL_buildEdgeUrl_(TL_WABA_ID, "phone_numbers", {
      fields: "id,display_phone_number,verified_name,quality_rating,status,platform_type,code_verification_status"
    }),
    token
  );

  const phoneNumbers = Array.isArray(phoneEdge.data) ? phoneEdge.data : [];
  Logger.log("Phone numbers count: " + phoneNumbers.length);

  if (phoneNumbers.length === 0) {
    Logger.log("No phone numbers returned for this WABA.");
    return;
  }

  phoneNumbers.forEach(function(pn) {
    Logger.log("=== PHONE NUMBER ===");
    Logger.log("PHONE_NUMBER_ID: " + String(pn.id || ""));
    Logger.log("display_phone_number: " + String(pn.display_phone_number || ""));
    Logger.log("verified_name: " + String(pn.verified_name || ""));
    Logger.log("quality_rating: " + String(pn.quality_rating || ""));
    Logger.log("status: " + String(pn.status || ""));
    Logger.log("platform_type: " + String(pn.platform_type || ""));
    Logger.log("code_verification_status: " + String(pn.code_verification_status || ""));
  });
}

function TL_getToken_() {
  return PropertiesService.getScriptProperties().getProperty(TL_TOKEN_PROPERTY_KEY);
}

function TL_buildUrl_(objectId, params) {
  const qp = [];
  Object.keys(params || {}).forEach(function(k) {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    qp.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  });
  const query = qp.length ? "?" + qp.join("&") : "";
  return TL_GRAPH_BASE + "/" + encodeURIComponent(String(objectId)) + query;
}

function TL_buildEdgeUrl_(objectId, edgeName, params) {
  const qp = [];
  Object.keys(params || {}).forEach(function(k) {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    qp.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  });
  const query = qp.length ? "?" + qp.join("&") : "";
  return TL_GRAPH_BASE + "/" + encodeURIComponent(String(objectId)) + "/" + encodeURIComponent(String(edgeName)) + query;
}

function TL_fetchJson_(url, token) {
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {}

  if (code < 200 || code >= 300) {
    Logger.log("=== GRAPH ERROR ===");
    Logger.log("HTTP " + code);
    Logger.log("URL: " + url);
    Logger.log(text);
    const msg = (json && json.error && json.error.message) ? json.error.message : "Unknown Graph error";
    throw new Error("Graph API error (HTTP " + code + "): " + msg);
  }

  if (json && json.error) {
    throw new Error("Graph API error: " + (json.error.message || "Unknown"));
  }

  return json;
}
