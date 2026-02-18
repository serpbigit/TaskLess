/**
 * TL_Config - Script Properties helper (minimal)
 * Keep secrets/config here: sheetId, WA token, router/biz numbers, etc.
 */
function TL_Config_get_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === undefined || v === "") ? fallback : v;
}
function TL_Config_set_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

