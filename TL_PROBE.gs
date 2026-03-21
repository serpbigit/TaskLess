function TL_PROBE_run() {

  const sheetId = PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID");
  if (!sheetId) throw new Error("TL_SHEET_ID missing");

  const ss = SpreadsheetApp.openById(sheetId);

  if (typeof TL_Audit_append_ === "function") {
    TL_Audit_append_("SYST", "PROBE_OK", {sheet: ss.getName()});
  }

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
