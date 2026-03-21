/**
 * TL_Webhook_Diagnostics
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

const TL_DIAG = {
  AUDIT_SHEET: "LOG",
  OPEN_SHEET: "OPEN",
  OPEN_HEADERS: [
    "createdAt","updatedAt","userE164","refId","chunkId","title","kind","channel",
    "status","askedAt","answeredAt","executedAt","draftOrPromptJson","lastAction","lastActionAt"
  ]
};

function TL_DIAG_runAll() {
  const nowIso = new Date().toISOString();
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();

  if (!sheetId) {
    throw new Error("Missing Script Property TL_SHEET_ID");
  }

  const ss = SpreadsheetApp.openById(sheetId);

  TL_DIAG_appendAudit_(ss, "DIAG_START", {
    nowIso: nowIso,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName()
  });

  TL_DIAG_appendOpenSample_(ss, nowIso);

  TL_DIAG_appendAudit_(ss, "DIAG_DONE", {
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

function TL_DIAG_appendAudit_(ss, eventType, payloadObj) {
  let sh = ss.getSheetByName(TL_DIAG.AUDIT_SHEET);
  if (!sh) sh = ss.insertSheet(TL_DIAG.AUDIT_SHEET);

  if (sh.getLastRow() === 0) {
    sh.appendRow(["timestamp","level","component","message","meta_json"]);
    sh.setFrozenRows(1);
  }

  sh.appendRow([
    new Date().toISOString(),
    "INFO",
    "TL_DIAG",
    String(eventType || ""),
    TL_DIAG_safeStringify_(payloadObj, 8000),
  ]);
}

function TL_DIAG_appendOpenSample_(ss, nowIso) {
  let sh = ss.getSheetByName(TL_DIAG.OPEN_SHEET);
  if (!sh) sh = ss.insertSheet(TL_DIAG.OPEN_SHEET);

  TL_DIAG_ensureOpenHeaders_(sh);

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

function TL_DIAG_ensureOpenHeaders_(sh) {
  const range = sh.getRange(1, 1, 1, TL_DIAG.OPEN_HEADERS.length);
  const existing = range.getValues()[0];
  const needs = existing.some(function(v, i) {
    return String(v || "") !== String(TL_DIAG.OPEN_HEADERS[i] || "");
  });

  if (needs) {
    range.setValues([TL_DIAG.OPEN_HEADERS]);
    sh.setFrozenRows(1);
  }
}

function TL_DIAG_safeStringify_(obj, maxLen) {
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
