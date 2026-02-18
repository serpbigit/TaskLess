/**
 * TL_Log - append-only audit log (client sheet, tab AUDIT_LOG by default).
 * Keep 30 days via TL_Retention_prune30Days_().
 */
function TL_Log_append_(actor, eventType, env, extra) {
  try {
    const ss = TL_Sheets_getStore_();
    if (!ss) return;

    const tab = TL_Config_get_("TL_CFG_TAB_AUDIT", "AUDIT_LOG");
    const sh = TL_Sheets_ensureTab_(ss, tab, [
      "ts","actor","eventType","userE164","refId","chunkId","payload"
    ]);

    const ts = new Date().toISOString();
    const userE164 = (env && env.from) ? env.from : "";
    const refId = (extra && extra.refId) ? extra.refId : "";
    const chunkId = (extra && extra.chunkId) ? extra.chunkId : "";
    const payload = JSON.stringify({
      text: env ? env.text : "",
      interactive: env ? env.interactive : null,
      extra: extra || {}
    });

    sh.appendRow([ts, actor, eventType, userE164, refId, chunkId, payload]);
  } catch (e) {
    // swallow logging errors (never block core flow)
  }
}

