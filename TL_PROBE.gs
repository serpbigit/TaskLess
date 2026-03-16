function TL_PROBE_run() {

  const sheetId = PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID");
  if (!sheetId) throw new Error("TL_SHEET_ID missing");

  const ss = SpreadsheetApp.openById(sheetId);

  let audit = ss.getSheetByName("AUDIT_LOG");
  if (!audit) audit = ss.insertSheet("AUDIT_LOG");

  audit.appendRow([
    new Date().toISOString(),
    "SYST",
    "PROBE_OK",
    JSON.stringify({sheet: ss.getName()}),
    "",
    "",
    ""
  ]);

  let open = ss.getSheetByName("OPEN");
  if (!open) open = ss.insertSheet("OPEN");

  open.appendRow([
    new Date().toISOString(),
    new Date().toISOString(),
    "972000000000",
    "probe",
    "probe",
    "probe message",
    "wa_message",
    "whatsapp",
    "OPEN",
    "",
    "",
    "",
    "{}",
    "PROBE",
    new Date().toISOString()
  ]);

  return "PROBE OK";
}
