/**
 * Helper_MinimumWabaPhoneIds.gs
 *
 * Goal:
 * - Start from a known WABA ID
 * - Read the WABA directly
 * - List phone numbers under that WABA
 *
 * Uses:
 * - Script Property: TL_SYSTEM_TOKEN
 * - Direct WABA ID: 1359984478739186
 */

const HELPER_GRAPH_VERSION = "v21.0";
const HELPER_GRAPH_BASE = `https://graph.facebook.com/${HELPER_GRAPH_VERSION}`;
const HELPER_TOKEN_PROPERTY_KEY = "TL_SYSTEM_TOKEN";

// This is a WABA ID from Meta UI
const HELPER_WABA_ID = "1359984478739186";

function Helper_MinimumWabaPhoneIds_Run() {
  const token = Helper_MinimumWabaPhoneIds_getToken_();
  if (!token) throw new Error(`Missing Script Property: ${HELPER_TOKEN_PROPERTY_KEY}`);

  Logger.log("=== DIRECT WABA LOOKUP ===");
  Logger.log(`WABA ID: ${HELPER_WABA_ID}`);

  const waba = Helper_MinimumWabaPhoneIds_fetchJson_(
    Helper_MinimumWabaPhoneIds_buildUrl_(HELPER_WABA_ID, {
      fields: "id,name,message_template_namespace"
    }),
    token
  );

  Logger.log("=== WABA ===");
  Logger.log(`WABA ID: ${waba.id || ""}`);
  Logger.log(`WABA name: ${waba.name || ""}`);
  Logger.log(`message_template_namespace: ${waba.message_template_namespace || ""}`);

  const phoneEdge = Helper_MinimumWabaPhoneIds_fetchJson_(
    Helper_MinimumWabaPhoneIds_buildEdgeUrl_(HELPER_WABA_ID, "phone_numbers", {
      fields: "id,display_phone_number,verified_name,quality_rating,status,platform_type,code_verification_status"
    }),
    token
  );

  const phoneNumbers = Array.isArray(phoneEdge.data) ? phoneEdge.data : [];
  Logger.log(`Phone numbers count: ${phoneNumbers.length}`);

  if (phoneNumbers.length === 0) {
    Logger.log("No phone numbers returned for this WABA.");
    Logger.log("Possible causes:");
    Logger.log("1) Token lacks whatsapp_business_management access");
    Logger.log("2) System user is not assigned to this WABA / phone asset");
    Logger.log("3) The WABA exists but phone numbers are not accessible to this token");
    return;
  }

  phoneNumbers.forEach(function(pn) {
    Logger.log("=== PHONE NUMBER ===");
    Logger.log(`PHONE_NUMBER_ID: ${pn.id || ""}`);
    Logger.log(`display_phone_number: ${pn.display_phone_number || ""}`);
    Logger.log(`verified_name: ${pn.verified_name || ""}`);
    Logger.log(`quality_rating: ${pn.quality_rating || ""}`);
    Logger.log(`status: ${pn.status || ""}`);
    Logger.log(`platform_type: ${pn.platform_type || ""}`);
    Logger.log(`code_verification_status: ${pn.code_verification_status || ""}`);
  });
}

/** Helpers */

function Helper_MinimumWabaPhoneIds_getToken_() {
  return PropertiesService.getScriptProperties().getProperty(HELPER_TOKEN_PROPERTY_KEY);
}

function Helper_MinimumWabaPhoneIds_buildUrl_(objectId, params) {
  const qp = [];
  Object.keys(params || {}).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    qp.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  });
  const query = qp.length ? "?" + qp.join("&") : "";
  return `${HELPER_GRAPH_BASE}/${encodeURIComponent(String(objectId))}${query}`;
}

function Helper_MinimumWabaPhoneIds_buildEdgeUrl_(objectId, edgeName, params) {
  const qp = [];
  Object.keys(params || {}).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    qp.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  });
  const query = qp.length ? "?" + qp.join("&") : "";
  return `${HELPER_GRAPH_BASE}/${encodeURIComponent(String(objectId))}/${encodeURIComponent(String(edgeName))}${query}`;
}

function Helper_MinimumWabaPhoneIds_fetchJson_(url, token) {
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
    Logger.log(`HTTP ${code}`);
    Logger.log(`URL: ${url}`);
    Logger.log(text);
    const msg = (json && json.error && json.error.message) ? json.error.message : "Unknown Graph error";
    throw new Error(`Graph API error (HTTP ${code}): ${msg}`);
  }

  if (json && json.error) {
    throw new Error(`Graph API error: ${json.error.message || "Unknown"}`);
  }

  return json;
}
