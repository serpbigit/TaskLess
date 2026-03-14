/**
 * TL_descriptive_minimumWabaPhoneIds.gs
 *
 * Goal:
 * - Start from a known Business / portfolio ID
 * - List WABAs under that business
 * - For each WABA, try to list phone numbers
 *
 * Uses:
 * - Script Property: TL_SYSTEM_TOKEN
 * - Direct Business / portfolio ID: 975374408148507
 */

const TL_GRAPH_VERSION = "v21.0";
const TL_GRAPH_BASE = `https://graph.facebook.com/${TL_GRAPH_VERSION}`;
const TL_TOKEN_PROPERTY_KEY = "TL_SYSTEM_TOKEN";

// This is a BUSINESS / PORTFOLIO ID, not a WABA ID
const TL_BUSINESS_ID = "975374408148507";

function TL_descriptive_run_minimum() {
  const token = TL_getToken_();
  if (!token) throw new Error(`Missing Script Property: ${TL_TOKEN_PROPERTY_KEY}`);

  Logger.log("=== DIRECT BUSINESS LOOKUP ===");
  Logger.log(`BUSINESS ID: ${TL_BUSINESS_ID}`);

  const biz = TL_fetchJson_(
    TL_buildUrl_(TL_BUSINESS_ID, {
      fields: "id,name"
    }),
    token
  );

  Logger.log("=== BUSINESS ===");
  Logger.log(`Business ID: ${biz.id || ""}`);
  Logger.log(`Business name: ${biz.name || ""}`);

  // 1) WABAs owned by this business
  const ownedWabas = TL_fetchJson_(
    TL_buildEdgeUrl_(TL_BUSINESS_ID, "owned_whatsapp_business_accounts", {
      fields: "id,name"
    }),
    token
  );

  const owned = Array.isArray(ownedWabas.data) ? ownedWabas.data : [];
  Logger.log(`Owned WABAs count: ${owned.length}`);

  // 2) WABAs shared to / client WABAs for this business
  let client = [];
  try {
    const clientWabas = TL_fetchJson_(
      TL_buildEdgeUrl_(TL_BUSINESS_ID, "client_whatsapp_business_accounts", {
        fields: "id,name"
      }),
      token
    );
    client = Array.isArray(clientWabas.data) ? clientWabas.data : [];
  } catch (err) {
    Logger.log("Could not read client_whatsapp_business_accounts edge.");
    Logger.log(String(err && err.message ? err.message : err));
  }

  Logger.log(`Client/shared WABAs count: ${client.length}`);

  // Merge unique WABAs
  const wabaMap = {};
  owned.forEach(function(w) {
    if (w && w.id) wabaMap[String(w.id)] = w;
  });
  client.forEach(function(w) {
    if (w && w.id) wabaMap[String(w.id)] = w;
  });

  const allWabas = Object.keys(wabaMap).map(function(id) { return wabaMap[id]; });

  Logger.log(`Total unique WABAs found: ${allWabas.length}`);

  if (allWabas.length === 0) {
    Logger.log("No WABAs found under this business.");
    Logger.log("Possible causes:");
    Logger.log("1) Wrong business/portfolio ID");
    Logger.log("2) Token lacks whatsapp_business_management access");
    Logger.log("3) This system user/app is not assigned to the relevant assets");
    return;
  }

  allWabas.forEach(function(w) {
    const wabaId = String(w.id || "");
    const wabaName = String(w.name || "");

    Logger.log("=== WABA ===");
    Logger.log(`WABA ID: ${wabaId}`);
    Logger.log(`WABA name: ${wabaName}`);

    // Try phone_numbers edge
    try {
      const phoneEdge = TL_fetchJson_(
        TL_buildEdgeUrl_(wabaId, "phone_numbers", {
          fields: "id,display_phone_number,verified_name,quality_rating,status"
        }),
        token
      );

      const phoneNumbers = Array.isArray(phoneEdge.data) ? phoneEdge.data : [];
      Logger.log(`Phone numbers count: ${phoneNumbers.length}`);

      if (phoneNumbers.length === 0) {
        Logger.log("No phone numbers returned for this WABA.");
      }

      phoneNumbers.forEach(function(pn) {
        Logger.log("--- PHONE NUMBER ---");
        Logger.log(`PHONE_NUMBER_ID: ${pn.id || ""}`);
        Logger.log(`display_phone_number: ${pn.display_phone_number || ""}`);
        Logger.log(`verified_name: ${pn.verified_name || ""}`);
        Logger.log(`quality_rating: ${pn.quality_rating || ""}`);
        Logger.log(`status: ${pn.status || ""}`);
      });

    } catch (err) {
      Logger.log(`Could not read phone_numbers for WABA ${wabaId}`);
      Logger.log(String(err && err.message ? err.message : err));
    }
  });
}

/** Helpers */

function TL_getToken_() {
  return PropertiesService.getScriptProperties().getProperty(TL_TOKEN_PROPERTY_KEY);
}

function TL_buildUrl_(objectId, params) {
  const qp = [];
  Object.keys(params || {}).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    qp.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  });
  const query = qp.length ? "?" + qp.join("&") : "";
  return `${TL_GRAPH_BASE}/${encodeURIComponent(String(objectId))}${query}`;
}

function TL_buildEdgeUrl_(objectId, edgeName, params) {
  const qp = [];
  Object.keys(params || {}).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    qp.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  });
  const query = qp.length ? "?" + qp.join("&") : "";
  return `${TL_GRAPH_BASE}/${encodeURIComponent(String(objectId))}/${encodeURIComponent(String(edgeName))}${query}`;
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