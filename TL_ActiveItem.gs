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
    if (!TL_ActiveItem_IsValid_(parsed)) {
      TL_ActiveItem_Clear_(waId);
      return null;
    }
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
  return TL_ActiveItem_ResumeByIndex_(waId, 1);
}

function TL_ActiveItem_ResumeByIndex_(waId, index) {
  const paused = TL_ActiveItem_GetPaused_(waId);
  const safeIndex = Number(index || 1);
  if (!paused.length || !isFinite(safeIndex) || safeIndex < 1 || safeIndex > paused.length) {
    return { ok: true, resumed: false };
  }
  const item = paused[safeIndex - 1];
  const rest = paused.filter(function(_, idx) {
    return idx !== (safeIndex - 1);
  });
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
    paused_count: rest.length,
    resumed_index: safeIndex
  };
}

function TL_ActiveItem_normalize_(waId, item) {
  const nowIso = new Date().toISOString();
  const safe = item && typeof item === "object" ? item : {};
  const existingOpenedAt = String(safe.opened_at || "").trim();
  const candidateContacts = Array.isArray(safe.candidate_contacts) ? safe.candidate_contacts.slice(0, 5).map(function(contact) {
    const row = contact && typeof contact === "object" ? contact : {};
    return {
      contactId: String(row.contactId || row.crmId || row.contact_id || "").trim(),
      crmId: String(row.crmId || row.contactId || row.contact_id || "").trim(),
      name: String(row.name || row.displayName || "").trim(),
      displayName: String(row.displayName || row.name || "").trim(),
      phone1: String(row.phone1 || "").trim(),
      phone2: String(row.phone2 || "").trim(),
      email: String(row.email || "").trim(),
      org: String(row.org || "").trim(),
      role: String(row.role || "").trim()
    };
  }).filter(function(contact) {
    return String(contact.contactId || "").trim() || String(contact.name || "").trim();
  }) : [];
  return {
    item_id: String(safe.item_id || ("AI_" + Utilities.getUuid())).trim(),
    wa_id: String(waId || safe.wa_id || "").trim(),
    session_version: String(safe.session_version || (typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : "menu_runtime_v1")).trim(),
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
    resolution_status: String(safe.resolution_status || "").trim().toLowerCase(),
    task_due: String(safe.task_due || "").trim(),
    due_label: String(safe.due_label || "").trim(),
    candidate_contacts: candidateContacts,
    enrichment_note_type: String(safe.enrichment_note_type || "").trim().toLowerCase(),
    enrichment_note_text: String(safe.enrichment_note_text || "").trim(),
    enrichment_summary: String(safe.enrichment_summary || "").trim(),
    enrichment_proposal: String(safe.enrichment_proposal || "").trim()
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

function TL_ActiveItem_IsValid_(item) {
  if (!item || typeof item !== "object") return false;
  const ttlMinutes = typeof TL_Menu_ActiveFlowTtlMinutes_ === "function" ? TL_Menu_ActiveFlowTtlMinutes_() : 90;
  const version = typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : "menu_runtime_v1";
  const itemVersion = String(item.session_version || "").trim();
  if (itemVersion !== version) return false;
  const timestamp = String(item.updated_at || item.opened_at || "").trim();
  const ts = Date.parse(timestamp);
  if (!timestamp || !isFinite(ts)) return false;
  return (Date.now() - ts) <= (Number(ttlMinutes || 0) * 60 * 1000);
}
