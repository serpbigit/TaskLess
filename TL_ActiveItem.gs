/**
 * TL_ActiveItem
 *
 * Lightweight durable active-item storage per Boss wa_id.
 * First scope: keep lookup/context work alive across turns.
 */

const TL_ACTIVE_ITEM = {
  KEY_PREFIX: "ACTIVE_ITEM_"
};

function TL_ActiveItem_Get_(waId) {
  const key = TL_ActiveItem_key_(waId);
  if (!key) return null;
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    return null;
  }
}

function TL_ActiveItem_Set_(waId, item) {
  const key = TL_ActiveItem_key_(waId);
  if (!key) return false;
  const safe = TL_ActiveItem_normalize_(waId, item || {});
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(safe));
  return true;
}

function TL_ActiveItem_Clear_(waId) {
  const key = TL_ActiveItem_key_(waId);
  if (!key) return false;
  PropertiesService.getScriptProperties().deleteProperty(key);
  return true;
}

function TL_ActiveItem_normalize_(waId, item) {
  const nowIso = new Date().toISOString();
  const safe = item && typeof item === "object" ? item : {};
  const existingOpenedAt = String(safe.opened_at || "").trim();
  return {
    item_id: String(safe.item_id || ("AI_" + Utilities.getUuid())).trim(),
    wa_id: String(waId || safe.wa_id || "").trim(),
    kind: String(safe.kind || "").trim().toLowerCase(),
    status: String(safe.status || "active").trim().toLowerCase(),
    opened_at: existingOpenedAt || nowIso,
    updated_at: nowIso,
    source_text: String(safe.source_text || "").trim(),
    contact_query: String(safe.contact_query || "").trim(),
    search_queries: Array.isArray(safe.search_queries) ? safe.search_queries.slice() : [],
    topic_query: String(safe.topic_query || "").trim(),
    topic_id: String(safe.topic_id || "").trim(),
    reply_preamble: String(safe.reply_preamble || "").trim(),
    resolved_contact_id: String(safe.resolved_contact_id || "").trim(),
    resolved_contact_name: String(safe.resolved_contact_name || "").trim(),
    resolved_topic_summary: String(safe.resolved_topic_summary || "").trim()
  };
}

function TL_ActiveItem_key_(waId) {
  const id = String(waId || "").trim();
  if (!id) return "";
  return TL_ACTIVE_ITEM.KEY_PREFIX + id;
}
