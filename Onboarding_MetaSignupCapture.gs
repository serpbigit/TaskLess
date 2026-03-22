/**
 * Onboarding_MetaSignupCapture.gs
 * Paused as web-app entrypoint so TL_Webhook.gs remains the single canonical doGet/doPost.
 * Original logic preserved under named handlers.
 */

const ONBOARDING_META_SIGNUP = {
  SECRET_PROP: "TL_FORWARD_SECRET",
  TARGET_SPREADSHEET_ID: "1uvsBjZd15X5tWmxQAsGUEBDeIP9rXOW52bDYPNlUJ5k",
  TARGET_SHEET_NAME: "Sheet1",
  HEADERS: [
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
  ]
};

function Onboarding_MetaSignupCapture_doGet(e) {
  return Onboarding_MetaSignupCapture_jsonOut_({
    ok: true,
    service: "Onboarding_MetaSignupCapture",
    ts: new Date().toISOString()
  });
}

function Onboarding_MetaSignupCapture_doPost(e) {
  const got = e && e.parameter && e.parameter.tl_secret ? String(e.parameter.tl_secret) : "";
  const expected = PropertiesService.getScriptProperties().getProperty(ONBOARDING_META_SIGNUP.SECRET_PROP);

  if (!expected) {
    return Onboarding_MetaSignupCapture_jsonOut_({
      ok: false,
      error: "Server not configured (missing script property: " + ONBOARDING_META_SIGNUP.SECRET_PROP + ")"
    });
  }

  if (!got || got !== expected) {
    return Onboarding_MetaSignupCapture_jsonOut_({
      ok: false,
      error: "Unauthorized"
    });
  }

  const bodyText = Onboarding_MetaSignupCapture_safeGetBodyText_(e);
  if (!bodyText) {
    return Onboarding_MetaSignupCapture_jsonOut_({
      ok: false,
      error: "Empty body"
    });
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    return Onboarding_MetaSignupCapture_jsonOut_({
      ok: false,
      error: "Invalid JSON body"
    });
  }

  const ss = SpreadsheetApp.openById(ONBOARDING_META_SIGNUP.TARGET_SPREADSHEET_ID);
  const sh = ss.getSheetByName(ONBOARDING_META_SIGNUP.TARGET_SHEET_NAME) || ss.insertSheet(ONBOARDING_META_SIGNUP.TARGET_SHEET_NAME);
  Onboarding_MetaSignupCapture_ensureHeaders_(sh);

  const serverTs = new Date();

  const receivedAt = Onboarding_MetaSignupCapture_safeStr_(body.receivedAt);
  const ip = Onboarding_MetaSignupCapture_safeStr_(body.ip);
  const origin = Onboarding_MetaSignupCapture_safeStr_(body.origin);
  const ua = Onboarding_MetaSignupCapture_safeStr_(body.ua);
  const path = Onboarding_MetaSignupCapture_safeStr_(body.path);

  const payloadObj = body && body.payload ? body.payload : {};
  const enrichObj = body && body.enrich ? body.enrich : {};

  const source = Onboarding_MetaSignupCapture_safeStr_(payloadObj.source);
  const page = Onboarding_MetaSignupCapture_safeStr_(payloadObj.page);
  const state = Onboarding_MetaSignupCapture_safeStr_(payloadObj.state);

  const workerStep = Onboarding_MetaSignupCapture_safeStr_(enrichObj.step);
  const enrichOk = enrichObj && enrichObj.ok === true ? "TRUE" : "FALSE";
  const businessesCount = Onboarding_MetaSignupCapture_toSafeNumberStr_(enrichObj.businesses_count);

  const extracted = Onboarding_MetaSignupCapture_extractIdsFromEnrich_(enrichObj);
  const wabaIdsStr = extracted.wabaIds.join(",");
  const phoneIdsStr = extracted.phoneNumberIds.join(",");
  const displayPhoneNumbersStr = extracted.displayPhoneNumbers.join(",");
  const verifiedNamesStr = extracted.verifiedNames.join(",");
  const wabaCount = String(extracted.wabaIds.length);

  const redirectUriUsed = Onboarding_MetaSignupCapture_safeStr_(enrichObj.redirect_uri_used);
  const redirectUriFromClient = Onboarding_MetaSignupCapture_safeStr_(enrichObj.redirect_uri_from_client);
  const payloadRedirectUri = Onboarding_MetaSignupCapture_safeStr_(payloadObj.redirect_uri);

  const graphVersion = Onboarding_MetaSignupCapture_safeStr_(enrichObj.graph_version);
  const clientIdUsed = Onboarding_MetaSignupCapture_safeStr_(enrichObj.client_id_used);

  const tokenExchangeAttempted = enrichObj && enrichObj.token_exchange_attempted === true ? "TRUE" : "FALSE";
  const tokenPresent = enrichObj && enrichObj.token_present === true ? "TRUE" : "FALSE";
  const tokenValue = Onboarding_MetaSignupCapture_safeStr_(enrichObj.token_value);

  const metaErr = Onboarding_MetaSignupCapture_getMetaError_(enrichObj);
  const metaErrorCode = Onboarding_MetaSignupCapture_safeStr_(metaErr.code);
  const metaErrorSubcode = Onboarding_MetaSignupCapture_safeStr_(metaErr.error_subcode);
  const metaErrorMessage = Onboarding_MetaSignupCapture_safeStr_(metaErr.message);

  const payloadJson = Onboarding_MetaSignupCapture_safeJson_(payloadObj);
  const enrichJson = Onboarding_MetaSignupCapture_safeJson_(enrichObj);

  sh.appendRow([
    Onboarding_MetaSignupCapture_formatTs_(serverTs),
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

  return Onboarding_MetaSignupCapture_jsonOut_({
    ok: true,
    appended: true,
    server_ts: serverTs.toISOString()
  });
}

// ---------- helpers ----------

function Onboarding_MetaSignupCapture_safeGetBodyText_(e) {
  try {
    return e && e.postData && e.postData.contents ? String(e.postData.contents) : "";
  } catch (err) {
    return "";
  }
}

function Onboarding_MetaSignupCapture_ensureHeaders_(sheet) {
  const existingLastColumn = Math.max(sheet.getLastColumn(), ONBOARDING_META_SIGNUP.HEADERS.length);
  const currentHeaderRow = existingLastColumn > 0
    ? sheet.getRange(1, 1, 1, existingLastColumn).getValues()[0]
    : [];

  const currentHeaders = currentHeaderRow.slice(0, ONBOARDING_META_SIGNUP.HEADERS.length).map(function(v) {
    return String(v || "").trim();
  });

  const expectedSignature = ONBOARDING_META_SIGNUP.HEADERS.join("||");
  const currentSignature = currentHeaders.join("||");

  if (currentSignature !== expectedSignature) {
    sheet.getRange(1, 1, 1, ONBOARDING_META_SIGNUP.HEADERS.length).setValues([ONBOARDING_META_SIGNUP.HEADERS]);
  }
}

function Onboarding_MetaSignupCapture_safeStr_(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function Onboarding_MetaSignupCapture_toSafeNumberStr_(v) {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function Onboarding_MetaSignupCapture_safeJson_(obj) {
  try {
    return JSON.stringify(obj || {}, null, 0);
  } catch (e) {
    return JSON.stringify({
      _json_error: true,
      message: String(e && e.message ? e.message : e)
    });
  }
}

function Onboarding_MetaSignupCapture_extractIdsFromEnrich_(enrich) {
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

function Onboarding_MetaSignupCapture_getMetaError_(enrich) {
  const empty = { code: "", error_subcode: "", message: "" };
  if (!enrich || !enrich.body || !enrich.body.error) return empty;

  const err = enrich.body.error || {};
  return {
    code: err.code || "",
    error_subcode: err.error_subcode || "",
    message: err.message || ""
  };
}

function Onboarding_MetaSignupCapture_jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function Onboarding_MetaSignupCapture_formatTs_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
}
