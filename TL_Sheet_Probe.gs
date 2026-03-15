/**
 * TL_Sheet_Probe
 * Hard-fail diagnostics for spreadsheet access and writes.
 * No silent catches.
 */

function TL_PROBE_run() {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) throw new Error("Missing Script Property TL_SHEET_ID");

  const ss = SpreadsheetApp.openById(sheetId);
  const nowIso = new Date().toISOString();

  let audit = ss.getSheetByName("AUDIT_LOG");
  if (!audit) audit = ss.insertSheet("AUDIT_LOG");
  if (audit.getLastRow() === 0) {
    audit.appendRow(["ts","actor","eventType","payloadJson","taskId","batchId","payloadJson2"]);
    audit.setFrozenRows(1);
  }

  audit.appendRow([
    nowIso,
    "SYST",
    "PROBE_OK",
    JSON.stringify({
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      activeUrl: ss.getUrl()
    }),
    "",
    "",
    ""
  ]);

  let open = ss.getSheetByName("OPEN");
  if (!open) open = ss.insertSheet("OPEN");

  const headers = [
    "createdAt","updatedAt","userE164","refId","chunkId","title","kind","channel",
    "status","askedAt","answeredAt","executedAt","draftOrPromptJson","lastAction","lastActionAt"
  ];
  const existing = open.getRange(1,1,1,headers.length).getValues()[0];
  const needs = existing.some((v, i) => String(v || "") !== String(headers[i] || ""));
  if (needs) {
    open.getRange(1,1,1,headers.length).setValues([headers]);
    open.setFrozenRows(1);
  }

  const probeId = "probe_" + nowIso.replace(/[:.]/g, "").replace(/-/g, "");
  open.appendRow([
    nowIso,
    nowIso,
    "972552360035",
    "wa:msg:" + probeId,
    probeId,
    "Probe write OK",
    "wa_message",
    "whatsapp",
    "OPEN",
    nowIso,
    "",
    "",
    JSON.stringify({ source: "probe", probeId: probeId }),
    "WA_PROBE",
    nowIso
  ]);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    probeId: probeId
  };
}
