/**
 * Helper_WebhookDiagnostics
 *
 * Purpose:
 * - Prove the script can open the target spreadsheet
 * - Prove it can append to LOG
 * - Prove it can append to OPEN
 * - Give deterministic timestamps and sample payloads
 *
 * Required Script Properties:
 * - TL_SHEET_ID
 */

const HELPER_WEBHOOK_DIAG = {
  AUDIT_SHEET: "LOG",
  OPEN_SHEET: "OPEN",
  OPEN_HEADERS: [
    "createdAt","updatedAt","userE164","refId","chunkId","title","kind","channel",
    "status","askedAt","answeredAt","executedAt","draftOrPromptJson","lastAction","lastActionAt"
  ]
};

function Helper_WebhookDiagnostics_RunAll() {
  const nowIso = new Date().toISOString();
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();

  if (!sheetId) {
    throw new Error("Missing Script Property TL_SHEET_ID");
  }

  const ss = SpreadsheetApp.openById(sheetId);

  Helper_WebhookDiagnostics_appendAudit_(ss, "DIAG_START", {
    nowIso: nowIso,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName()
  });

  Helper_WebhookDiagnostics_appendOpenSample_(ss, nowIso);

  Helper_WebhookDiagnostics_appendAudit_(ss, "DIAG_DONE", {
    nowIso: nowIso,
    result: "audit_and_open_written"
  });

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    wroteAudit: true,
    wroteOpen: true,
    nowIso: nowIso
  };
}

function Helper_WebhookDiagnostics_appendAudit_(ss, eventType, payloadObj) {
  let sh = ss.getSheetByName(HELPER_WEBHOOK_DIAG.AUDIT_SHEET);
  if (!sh) sh = ss.insertSheet(HELPER_WEBHOOK_DIAG.AUDIT_SHEET);

  if (sh.getLastRow() === 0) {
    sh.appendRow(["timestamp","level","component","message","meta_json"]);
    sh.setFrozenRows(1);
  }

  sh.appendRow([
    new Date().toISOString(),
    "INFO",
    "Helper_WebhookDiagnostics",
    String(eventType || ""),
    Helper_WebhookDiagnostics_safeStringify_(payloadObj, 8000),
  ]);
}

function Helper_WebhookDiagnostics_appendOpenSample_(ss, nowIso) {
  let sh = ss.getSheetByName(HELPER_WEBHOOK_DIAG.OPEN_SHEET);
  if (!sh) sh = ss.insertSheet(HELPER_WEBHOOK_DIAG.OPEN_SHEET);

  Helper_WebhookDiagnostics_ensureOpenHeaders_(sh);

  const sampleMessageId = "diag_" + nowIso.replace(/[:.]/g, "").replace(/-/g, "");
  const samplePayload = {
    source: "diag",
    display_phone_number: "972506847373",
    phone_number_id: "DIAG_PHONE_ID",
    from: "972552360035",
    profile_name: "Diagnostic Sender",
    messageId: sampleMessageId,
    message_type: "text",
    text: "TL diagnostic sample",
    timestamp: nowIso
  };

  sh.appendRow([
    nowIso,
    nowIso,
    "972552360035",
    "wa:msg:" + sampleMessageId,
    sampleMessageId,
    "TL diagnostic sample",
    "wa_message",
    "whatsapp",
    "OPEN",
    nowIso,
    "",
    "",
    JSON.stringify(samplePayload),
    "WA_DIAG",
    nowIso
  ]);
}

function Helper_WebhookDiagnostics_ensureOpenHeaders_(sh) {
  const range = sh.getRange(1, 1, 1, HELPER_WEBHOOK_DIAG.OPEN_HEADERS.length);
  const existing = range.getValues()[0];
  const needs = existing.some(function(v, i) {
    return String(v || "") !== String(HELPER_WEBHOOK_DIAG.OPEN_HEADERS[i] || "");
  });

  if (needs) {
    range.setValues([HELPER_WEBHOOK_DIAG.OPEN_HEADERS]);
    sh.setFrozenRows(1);
  }
}

function Helper_WebhookDiagnostics_safeStringify_(obj, maxLen) {
  const lim = (typeof maxLen === "number" && isFinite(maxLen)) ? maxLen : 4000;
  let s = "";
  try {
    s = JSON.stringify(obj);
  } catch (e) {
    s = String(obj);
  }
  if (s.length > lim) return s.slice(0, lim) + "...";
  return s;
}
