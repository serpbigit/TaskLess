/**
 * TL_OnboardingCapture.gs
 * Paused as web-app entrypoint so TL_Webhook.gs remains the single canonical doGet/doPost.
 * Original logic preserved under named handlers.
 */

const TL_SECRET_PROP = "TL_FORWARD_SECRET";
const TARGET_SPREADSHEET_ID = "1uvsBjZd15X5tWmxQAsGUEBDeIP9rXOW52bDYPNlUJ5k";
const TARGET_SHEET_NAME = "Sheet1";

const HEADERS = [
  "server_ts",
  "receivedAt",
  "ip",
  "origin",
  "ua",
  "path",
  "source",
  "page",
  "state",
  "worker_step",
  "enrich_ok",
  "businesses_count",
  "waba_count",
  "waba_ids",
  "phone_number_ids",
  "display_phone_numbers",
  "verified_names",
  "redirect_uri_used",
  "redirect_uri_from_client",
  "payload_redirect_uri",
  "graph_version",
  "client_id_used",
  "token_exchange_attempted",
  "token_present",
  "token_value",
  "meta_error_code",
  "meta_error_subcode",
  "meta_error_message",
  "payload_json",
  "enrich_json"
];

function TL_OnboardingCapture_doGet(e) {
  return jsonOut_({
    ok: true,
    service: "TL_OnboardingCapture",
    ts: new Date().toISOString()
  });
}

function TL_OnboardingCapture_doPost(e) {
  const got = e && e.parameter && e.parameter.tl_secret ? String(e.parameter.tl_secret) : "";
  const expected = PropertiesService.getScriptProperties().getProperty(TL_SECRET_PROP);

  if (!expected) {
    return jsonOut_({
      ok: false,
      error: "Server not configured (missing script property: " + TL_SECRET_PROP + ")"
    });
  }

  if (!got || got !== expected) {
    return jsonOut_({
      ok: false,
      error: "Unauthorized"
    });
  }

  const bodyText = safeGetBodyText_(e);
  if (!bodyText) {
    return jsonOut_({
      ok: false,
      error: "Empty body"
    });
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: "Invalid JSON body"
    });
  }

  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const sh = ss.getSheetByName(TARGET_SHEET_NAME) || ss.insertSheet(TARGET_SHEET_NAME);
  ensureHeaders_(sh);

  const serverTs = new Date();

  const receivedAt = safeStr_(body.receivedAt);
  const ip = safeStr_(body.ip);
  const origin = safeStr_(body.origin);
  const ua = safeStr_(body.ua);
  const path = safeStr_(body.path);

  const payloadObj = body && body.payload ? body.payload : {};
  const enrichObj = body && body.enrich ? body.enrich : {};

  const source = safeStr_(payloadObj.source);
  const page = safeStr_(payloadObj.page);
  const state = safeStr_(payloadObj.state);

  const workerStep = safeStr_(enrichObj.step);
  const enrichOk = enrichObj && enrichObj.ok === true ? "TRUE" : "FALSE";
  const businessesCount = toSafeNumberStr_(enrichObj.businesses_count);

  const extracted = extractIdsFromEnrich_(enrichObj);
  const wabaIdsStr = extracted.wabaIds.join(",");
  const phoneIdsStr = extracted.phoneNumberIds.join(",");
  const displayPhoneNumbersStr = extracted.displayPhoneNumbers.join(",");
  const verifiedNamesStr = extracted.verifiedNames.join(",");
  const wabaCount = String(extracted.wabaIds.length);

  const redirectUriUsed = safeStr_(enrichObj.redirect_uri_used);
  const redirectUriFromClient = safeStr_(enrichObj.redirect_uri_from_client);
  const payloadRedirectUri = safeStr_(payloadObj.redirect_uri);

  const graphVersion = safeStr_(enrichObj.graph_version);
  const clientIdUsed = safeStr_(enrichObj.client_id_used);

  const tokenExchangeAttempted = enrichObj && enrichObj.token_exchange_attempted === true ? "TRUE" : "FALSE";
  const tokenPresent = enrichObj && enrichObj.token_present === true ? "TRUE" : "FALSE";
  const tokenValue = safeStr_(enrichObj.token_value);

  const metaErr = getMetaError_(enrichObj);
  const metaErrorCode = safeStr_(metaErr.code);
  const metaErrorSubcode = safeStr_(metaErr.error_subcode);
  const metaErrorMessage = safeStr_(metaErr.message);

  const payloadJson = safeJson_(payloadObj);
  const enrichJson = safeJson_(enrichObj);

  sh.appendRow([
    formatTs_(serverTs),
    receivedAt,
    ip,
    origin,
    ua,
    path,
    source,
    page,
    state,
    workerStep,
    enrichOk,
    businessesCount,
    wabaCount,
    wabaIdsStr,
    phoneIdsStr,
    displayPhoneNumbersStr,
    verifiedNamesStr,
    redirectUriUsed,
    redirectUriFromClient,
    payloadRedirectUri,
    graphVersion,
    clientIdUsed,
    tokenExchangeAttempted,
    tokenPresent,
    tokenValue,
    metaErrorCode,
    metaErrorSubcode,
    metaErrorMessage,
    payloadJson,
    enrichJson
  ]);

  return jsonOut_({
    ok: true,
    appended: true,
    server_ts: serverTs.toISOString()
  });
}

// ---------- helpers ----------

function safeGetBodyText_(e) {
  try {
    return e && e.postData && e.postData.contents ? String(e.postData.contents) : "";
  } catch (err) {
    return "";
  }
}

function ensureHeaders_(sheet) {
  const existingLastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const currentHeaderRow = existingLastColumn > 0
    ? sheet.getRange(1, 1, 1, existingLastColumn).getValues()[0]
    : [];

  const currentHeaders = currentHeaderRow.slice(0, HEADERS.length).map(function(v) {
    return String(v || "").trim();
  });

  const expectedSignature = HEADERS.join("||");
  const currentSignature = currentHeaders.join("||");

  if (currentSignature !== expectedSignature) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function safeStr_(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toSafeNumberStr_(v) {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function safeJson_(obj) {
  try {
    return JSON.stringify(obj || {}, null, 0);
  } catch (e) {
    return JSON.stringify({
      _json_error: true,
      message: String(e && e.message ? e.message : e)
    });
  }
}

function extractIdsFromEnrich_(enrich) {
  const out = {
    wabaIds: [],
    phoneNumberIds: [],
    displayPhoneNumbers: [],
    verifiedNames: []
  };

  if (!enrich) return out;

  const wabas = Array.isArray(enrich.wabas) ? enrich.wabas : [];

  const wabaSet = {};
  const phoneSet = {};
  const displaySet = {};
  const verifiedSet = {};

  for (var i = 0; i < wabas.length; i++) {
    const w = wabas[i] || {};

    if (w.waba_id) wabaSet[String(w.waba_id)] = true;

    const phones = Array.isArray(w.phone_numbers) ? w.phone_numbers : [];
    for (var j = 0; j < phones.length; j++) {
      const p = phones[j] || {};
      if (p.id) phoneSet[String(p.id)] = true;
      if (p.display_phone_number) displaySet[String(p.display_phone_number)] = true;
      if (p.verified_name) verifiedSet[String(p.verified_name)] = true;
    }
  }

  out.wabaIds = Object.keys(wabaSet);
  out.phoneNumberIds = Object.keys(phoneSet);
  out.displayPhoneNumbers = Object.keys(displaySet);
  out.verifiedNames = Object.keys(verifiedSet);

  return out;
}

function getMetaError_(enrich) {
  const empty = { code: "", error_subcode: "", message: "" };
  if (!enrich || !enrich.body || !enrich.body.error) return empty;

  const err = enrich.body.error || {};
  return {
    code: err.code || "",
    error_subcode: err.error_subcode || "",
    message: err.message || ""
  };
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatTs_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
}
