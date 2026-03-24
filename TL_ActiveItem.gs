/**
 * TL_ActiveItem
 *
 * Lightweight durable active-item storage per Boss wa_id.
 * First scope: keep lookup/context work alive across turns.
 */

const TL_ACTIVE_ITEM = {
  KEY_PREFIX: "ACTIVE_ITEM_",
  PAUSED_KEY_PREFIX: "PAUSED_ITEMS_",
  MAX_PAUSED: 5
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

function TL_ActiveItem_GetPaused_(waId) {
  const key = TL_ActiveItem_pausedKey_(waId);
  if (!key) return [];
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(function(item) {
      return item && typeof item === "object";
    }) : [];
  } catch (e) {
    return [];
  }
}

function TL_ActiveItem_ClearPaused_(waId) {
  const key = TL_ActiveItem_pausedKey_(waId);
  if (!key) return false;
  PropertiesService.getScriptProperties().deleteProperty(key);
  return true;
}

function TL_ActiveItem_PauseCurrent_(waId, reason) {
  const current = TL_ActiveItem_Get_(waId);
  if (!current || !current.item_id) return { ok: true, paused: false };
  const paused = TL_ActiveItem_GetPaused_(waId);
  const nextItem = Object.assign({}, current, {
    status: "paused",
    paused_at: new Date().toISOString(),
    pause_reason: String(reason || "replaced").trim() || "replaced"
  });
  const deduped = [nextItem].concat(paused.filter(function(item) {
    return String(item && item.item_id || "").trim() !== String(current.item_id || "").trim();
  })).slice(0, TL_ACTIVE_ITEM.MAX_PAUSED);
  PropertiesService.getScriptProperties().setProperty(TL_ActiveItem_pausedKey_(waId), JSON.stringify(deduped));
  TL_ActiveItem_Clear_(waId);
  return {
    ok: true,
    paused: true,
    item: nextItem,
    paused_count: deduped.length
  };
}

function TL_ActiveItem_ResumeLatest_(waId) {
  const paused = TL_ActiveItem_GetPaused_(waId);
  if (!paused.length) return { ok: true, resumed: false };
  const item = paused[0];
  const rest = paused.slice(1);
  if (rest.length) {
    PropertiesService.getScriptProperties().setProperty(TL_ActiveItem_pausedKey_(waId), JSON.stringify(rest));
  } else {
    TL_ActiveItem_ClearPaused_(waId);
  }
  const resumed = TL_ActiveItem_normalize_(waId, Object.assign({}, item, {
    status: "active"
  }));
  TL_ActiveItem_Set_(waId, resumed);
  return {
    ok: true,
    resumed: true,
    item: resumed,
    paused_count: rest.length
  };
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
    row_number: Number(safe.row_number || 0),
    capture_kind: String(safe.capture_kind || "").trim().toLowerCase(),
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
    resolved_topic_summary: String(safe.resolved_topic_summary || "").trim(),
    subject: String(safe.subject || "").trim(),
    recipient_destination: String(safe.recipient_destination || "").trim(),
    resolution_status: String(safe.resolution_status || "").trim().toLowerCase()
  };
}

function TL_ActiveItem_key_(waId) {
  const id = String(waId || "").trim();
  if (!id) return "";
  return TL_ACTIVE_ITEM.KEY_PREFIX + id;
}

function TL_ActiveItem_pausedKey_(waId) {
  const id = String(waId || "").trim();
  if (!id) return "";
  return TL_ACTIVE_ITEM.PAUSED_KEY_PREFIX + id;
}
