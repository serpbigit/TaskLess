/**
 * Temporary migration helpers for copying Script Properties between Apps Script projects.
 *
 * Usage from GAS UI:
 *   1. Run Temp_Helper_ExportScriptProperties()
 *   2. Copy the JSON from Execution log
 *   3. Paste it into an import helper in the target project
 *
 * Default export excludes transient runtime/cache keys.
 */

function Temp_Helper_ExportScriptProperties() {
  return Temp_Helper_ExportScriptPropertiesCore_(false);
}

function Temp_Helper_ExportAllScriptProperties() {
  return Temp_Helper_ExportScriptPropertiesCore_(true);
}

function Temp_Helper_ExportScriptPropertiesCore_(includeTransient) {
  const props = PropertiesService.getScriptProperties().getProperties() || {};
  const out = {};
  const keys = Object.keys(props).sort();

  keys.forEach(function(key) {
    if (!includeTransient && Temp_Helper_IsTransientScriptProperty_(key)) return;
    out[key] = String(props[key] || "");
  });

  const payload = {
    exported_at: new Date().toISOString(),
    include_transient: !!includeTransient,
    count: Object.keys(out).length,
    properties: out
  };

  const json = JSON.stringify(payload, null, 2);
  Logger.log("Temp_Helper_ExportScriptProperties %s", json);
  try { console.log("Temp_Helper_ExportScriptProperties", json); } catch (e) {}
  return payload;
}

function Temp_Helper_IsTransientScriptProperty_(key) {
  const k = String(key || "").trim().toUpperCase();
  if (!k) return false;

  return (
    k.indexOf("MENU_STATE_") === 0 ||
    k.indexOf("MENU_PACKET_") === 0 ||
    k.indexOf("MENU_INTENT_") === 0 ||
    k.indexOf("TL_LATE_STATUS_") === 0 ||
    k.indexOf("TL_SEEN_") === 0 ||
    k === "TL_SEEN_CLEAN_COUNTER" ||
    k === "TL_EMAIL_LAST_PULL_AT" ||
    k === "TL_EMAIL_LAST_PULL_QUERY" ||
    k === "TL_EMAIL_LAST_PULL_MAX_MSG_AT"
  );
}
