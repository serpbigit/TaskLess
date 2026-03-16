/**
 * TL_Dedupe - prevent double processing due to webhook retries.
 */
function TL_Dedupe_seen_(msgId) {
  const props = PropertiesService.getScriptProperties();
  const key = "TL_SEEN_" + msgId;
  if (props.getProperty(key)) return true;
  props.setProperty(key, String(Date.now()));

  // light cleanup every ~30 messages
  const n = Number(props.getProperty("TL_SEEN_CLEAN_COUNTER") || "0") + 1;
  props.setProperty("TL_SEEN_CLEAN_COUNTER", String(n));
  if (n % 30 === 0) TL_Dedupe_cleanup_();
  return false;
}

function TL_Dedupe_cleanup_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  const ttlMs = 24 * 60 * 60 * 1000;

  Object.keys(all).forEach(k => {
    if (!k.startsWith("TL_SEEN_")) return;
    if (k === "TL_SEEN_CLEAN_COUNTER") return;
    const ts = Number(all[k] || "0");
    if (ts && (now - ts) > ttlMs) props.deleteProperty(k);
  });
}

