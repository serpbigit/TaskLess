/**
 * TL_Util.gs
 * Small helpers used by Router/Webhook for safe logging/serialization.
 */
function _json_(obj) {
  try { return JSON.stringify(obj); }
  catch (e) {
    try { return String(obj); } catch (e2) { return "[unstringifiable]"; }
  }
}

function _nowIso_() {
  return new Date().toISOString();
}
