/**
 * TL_Log.gs
 * Compatibility shim so Router can call TL_Log_append_
 * Internally delegates to the legacy audit shim, which now writes to LOG.
 */

function TL_Log_append_(actor, eventType, payloadObj, taskId, batchId) {
  if (typeof TL_Audit_append_ === "function") {
    return TL_Audit_append_(actor, eventType, payloadObj, taskId, batchId);
  }
  // fallback no-op to avoid breaking pipeline
  return;
}
