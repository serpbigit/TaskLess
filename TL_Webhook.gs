/**
 * TL_Webhook - WhatsApp Cloud API webhook entry (GET verify + POST events)
 *
 * Required Script Properties:
 * - TL_VERIFY_TOKEN        (string)  webhook verify token
 * - TL_SHEET_ID            (string)  spreadsheet ID containing INBOX/LOG
 * - META_USER_ACCESS_TOKEN (string)  Graph API token (optional for COEX_checkPhoneNumberState)
 *
 */
const TL_WEBHOOK = {
  INBOX_SHEET: "INBOX",
  MAX_IDEMPOTENCY_SCAN_ROWS: 2000,
  INBOX_HEADERS: [
    "timestamp","root_id","event_id","parent_event_id","record_id","record_version","record_class",
    "channel","direction","phone_number_id","display_phone_number","sender","receiver",
    "message_id","message_type","text","ai_summary","ai_proposal",
    "approval_required","approval_status","execution_status",
    "status_latest","status_timestamp","statuses_count",
    "contact_id","raw_payload_ref","notes",
    "task_due","task_status","task_priority",
    "topic_id","topic_tagged_at",
    "biz_stage","biz_stage_ts","payment_status","delivery_due"
  ]
};

function doGet(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};
    const mode = String(p["hub.mode"] || "");
    const token = String(p["hub.verify_token"] || "");
    const challenge = String(p["hub.challenge"] || "");

    const expected = String(PropertiesService.getScriptProperties().getProperty("TL_VERIFY_TOKEN") || "");
    if (mode === "subscribe" && expected && token === expected) {
      return ContentService.createTextOutput(challenge).setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput("forbidden").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("error").setMimeType(ContentService.MimeType.TEXT);
  }
}

function doPost(e) {
  const started = new Date();
  try {
    const raw = (e && e.postData && typeof e.postData.contents === "string") ? e.postData.contents : "";
    if (!raw) {
    TLW_logDebug_("empty_post", { when: started.toISOString() });
      return TLW_json_({ ok:true, empty:true });
    }

    let payload = {};
    try { payload = JSON.parse(raw); }
    catch (parseErr) {
    TLW_logDebug_("invalid_json", { err:String(parseErr), raw: raw.slice(0,500) });
      return TLW_json_({ ok:true, parse_error:true });
    }

    TLW_logInfo_("webhook_received", { bytes: raw.length, entries: (payload && payload.entry && payload.entry.length) ? payload.entry.length : 0 });

    const events = TLW_extractEvents_(payload);

    // Boss menu quick-path: only messages with text from BOSS_PHONE
    const menuReply = TLW_tryBossMenu_(events);
    if (menuReply && menuReply.toSend) {
      const sent = TLW_sendText_(menuReply.toPhoneId, menuReply.toWaId, menuReply.text);
      TLW_logInfo_("menu_reply", { to: menuReply.toWaId, phone_id: menuReply.toPhoneId, ok: sent.ok, status: sent.status, body: sent.body });
      return TLW_json_({ ok:true, menu:true });
    }

    if (!events.length) {
      TLW_logDebug_("webhook_no_events", { raw: TLW_safeStringify_(payload, 2000) });
      return TLW_json_({ ok:true, events:0 });
    }

    let appended=0, skipped=0, updated=0;
    const rawJson = TLW_safeStringify_(payload, 8000);

    events.forEach(ev => {
      const enriched = TLW_enrichEvent_(ev, started);
      if (!enriched) { skipped++; return; }

      if (enriched.record_class === "status") {
        const didUpdate = TLW_upsertStatus_(enriched, rawJson);
        if (didUpdate) { updated++; return; }
        TLW_logInfo_("status_no_match", { phone: enriched.phone_number_id, msg: enriched.message_id });
        return; // do not append orphan status rows
      }

      const duplicate = TLW_isDuplicate_(enriched);
      if (duplicate) { skipped++; return; }

      TLW_appendInboxRow_(enriched, rawJson);
      appended++;
    });

    if ((appended + updated) === 0) {
      TLW_logInfo_("webhook_no_writes", { skipped, events: events.length });
    }

    return TLW_json_({ ok:true, appended, skipped, updated });
  } catch (err) {
    TLW_logInfo_("doPost_error", { err:String(err && err.stack ? err.stack : err) });
    return TLW_json_({ ok:true, error:true });
  }
}

/** ---- Optional helper: check phone state (coexist) ---- */
function COEX_checkPhoneNumberState(phoneNumberId) {
  const id = String(phoneNumberId || "").trim();
  if (!id) throw new Error("Missing phoneNumberId");

  const token = String(PropertiesService.getScriptProperties().getProperty("META_USER_ACCESS_TOKEN") || "").trim();
  if (!token) throw new Error("Missing Script Property META_USER_ACCESS_TOKEN");

  const fields = [
    "id","display_phone_number","verified_name","status","platform_type",
    "code_verification_status","name_status","quality_rating","health_status"
  ].join(",");

  const url = "https://graph.facebook.com/v24.0/" + encodeURIComponent(id) + "?fields=" + encodeURIComponent(fields);
  const res = UrlFetchApp.fetch(url, { method:"get", muteHttpExceptions:true, headers:{ Authorization:"Bearer " + token } });

  const status = res.getResponseCode();
  const body = res.getContentText();

  TLW_logInfo_("coex_check_state", { phone_number_id:id, status, body });

  return { status, body };
}

/** ---- internals ---- */
function TLW_extractEvents_(payload) {
  const out = [];
  if (!payload || !payload.entry || !payload.entry.length) return out;

  payload.entry.forEach(entry => {
    const changes = entry && entry.changes ? entry.changes : [];
    changes.forEach(ch => {
      const field = String(ch.field || "");
      const val = ch.value || {};
      const meta = val.metadata || {};
      const displayPhone = String(meta.display_phone_number || "");
      const phoneId = String(meta.phone_number_id || "");

      if (field === "messages" && val.messages && val.messages.length) {
        val.messages.forEach(m => {
          const from = String(m.from || "");
          const recipient = String(m.recipient_id || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";
          out.push({ event_type:"messages", display_phone_number:displayPhone, phone_number_id:phoneId, from, recipient_id:recipient, message_id:msgId, message_type:type, text, statuses_count:0 });
        });
      }

      if (field === "message_echoes" && val.message_echoes && val.message_echoes.length) {
        val.message_echoes.forEach(m => {
          const from = String(m.from || "");
          const recipient = String(m.recipient_id || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";
          out.push({ event_type:"message_echoes", display_phone_number:displayPhone, phone_number_id:phoneId, from, recipient_id:recipient, message_id:msgId, message_type:type, text, statuses_count:0 });
        });
      }

      if (field === "smb_message_echoes" && val.message_echoes && val.message_echoes.length) {
        val.message_echoes.forEach(m => {
          const from = String(m.from || "");
          const recipient = String(m.recipient_id || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";
          out.push({ event_type:"smb_message_echoes", display_phone_number:displayPhone, phone_number_id:phoneId, from, recipient_id:recipient, message_id:msgId, message_type:type, text, statuses_count:0 });
        });
      }

      const statuses = val.statuses || [];
      if (statuses && statuses.length) {
        statuses.forEach(s => {
          const msgId = String(s.id || "");
          const st = String(s.status || "status_update");
          const recipient = String(s.recipient_id || "");
          out.push({ event_type:"statuses", display_phone_number:displayPhone, phone_number_id:phoneId, from:"", recipient_id:recipient, message_id:msgId, message_type:st, text:"", statuses_count:1, status_timestamp:String(s.timestamp || "") });
        });
      }
    });
  });

  return out;
}

function TLW_tryBossMenu_(events) {
  if (!events || !events.length) return null;

  // Find the first text event that should be handled by the boss menu flow:
  // explicit trigger, numeric choice, or follow-up while menu state is active.
  const candidates = events.filter(ev => ev.message_type === "text");
  const normalized = candidates.map(e=>({from:e.from, type:e.event_type, msg_id:e.message_id, text:String(e.text||"").trim().toLowerCase()}));
  TLW_logInfo_("menu_match_attempt", { candidates: normalized });
  const triggerText = ["תפריט","menu","/menu"];
  const msg = candidates.find(ev => {
    const text = String(ev.text || "").trim().toLowerCase();
    if (!text) return false;
    if (triggerText.includes(text)) return true;
    if (TL_MENU.CHOICES.includes(text)) return true;
    return TL_Menu_GetState_(String(ev.from || "").trim()) !== "idle";
  });
  if (!msg) return null;

  const enriched = TLW_enrichEvent_(msg, new Date());
  let inboxRow = null;
  if (enriched) {
    if (TLW_isDuplicate_(enriched)) {
      const existing = TLW_findRowByMessageId_(enriched.phone_number_id || "", enriched.message_id || "");
      if (existing) inboxRow = { row: existing.row };
    } else {
      const appended = TLW_appendInboxRow_(enriched, "");
      if (appended) inboxRow = { row: appended.row };
    }
  }

  // log trigger detection
  TLW_logInfo_("menu_trigger", { from: msg.from, text: msg.text || "", phone_id: msg.phone_number_id || "" });

  const replyText = TL_Menu_HandleBossMessage_({
    from: msg.from,
    text: msg.text || "",
    recipient_id: msg.recipient_id || "",
    phone_number_id: msg.phone_number_id || ""
  }, inboxRow);

  if (!replyText) return null;
  const toPhoneId = msg.phone_number_id || TLW_getSetting_("BUSINESS_PHONE_ID") || TLW_getSetting_("BUSINESS_PHONEID") || TLW_getSetting_("BUSINESS_PHONE");
  return { toSend: true, toPhoneId, toWaId: msg.from, text: replyText };
}

function TLW_enrichEvent_(ev, ts) {
  const nowIso = (ts || new Date()).toISOString();
  const phoneId = String(ev.phone_number_id || "");
  const msgId = String(ev.message_id || "");

  // topic id (placeholder hash)
  const topicId = TLW_topicIdFromText_(ev.text || "");

  // direction + channel
  const eventType = String(ev.event_type || "");
  const direction = (eventType === "messages") ? "incoming" : "outgoing";
  const channel = "whatsapp";

  // contact resolution (simple deterministic id)
  const baseSender = String(ev.from || "");
  const baseRecipient = String(ev.recipient_id || "");
  const contactNumber = (direction === "incoming") ? baseSender : (baseRecipient || "");
  const contactId = contactNumber ? ("WA_" + phoneId + "_" + contactNumber) : "";

  // sender/receiver normalization
  let sender = baseSender;
  let receiver = "";
  if (direction === "incoming") {
    sender = contactNumber;
    receiver = String(ev.display_phone_number || "");
  } else {
    sender = String(ev.display_phone_number || ""); // business
    receiver = contactNumber;
  }

  // record ids
  const recordId = msgId ? ("REC_" + phoneId + "_" + msgId) : ("REC_" + nowIso + "_" + Math.random().toString(36).slice(2,8));
  const rootId = TLW_resolveRootId_(contactId, topicId, ts);

  return {
    timestamp: ts || new Date(),
    root_id: rootId,
    event_id: "EVT_" + Utilities.getUuid(),
    parent_event_id: "",
    record_id: recordId,
    record_version: 1,
    record_class: (eventType === "statuses") ? "status" : "communication",
    channel: channel,
    direction: (eventType === "statuses") ? "status" : direction,
    phone_number_id: phoneId,
    display_phone_number: String(ev.display_phone_number || ""),
    sender: sender,
    receiver: receiver,
    message_id: msgId,
    message_type: String(ev.message_type || ""),
    text: String(ev.text || ""),
    ai_summary: "",
    ai_proposal: "",
    approval_required: "",
    approval_status: "",
    execution_status: "",
    status_latest: (eventType === "statuses") ? String(ev.message_type || "") : "",
    status_timestamp: (eventType === "statuses") ? (ev.status_timestamp || "") : "",
    statuses_count: Number(ev.statuses_count || 0),
    contact_id: contactId,
    raw_payload_ref: "",
    notes: "",
    task_due: "",
    task_status: "",
    task_priority: "",
    topic_id: topicId,
    topic_tagged_at: nowIso,
    biz_stage: "",
    biz_stage_ts: "",
    payment_status: "",
    delivery_due: ""
  };
}

function TLW_appendInboxRow_(obj, rawJson) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  if (!ss) throw new Error("Missing Script Property TL_SHEET_ID");

  let sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) sh = ss.insertSheet(TL_WEBHOOK.INBOX_SHEET);

  const range = sh.getRange(1,1,1,TL_WEBHOOK.INBOX_HEADERS.length);
  const existing = range.getValues()[0];
  const needs = existing.some((v,i)=>String(v||"")!==String(TL_WEBHOOK.INBOX_HEADERS[i]||""));
  if (needs) { range.setValues([TL_WEBHOOK.INBOX_HEADERS]); sh.setFrozenRows(1); }

  // set raw payload ref to rawJson (trimmed by caller)
  const row = [
    obj.timestamp || new Date(),
    String(obj.root_id||""),
    String(obj.event_id||""),
    String(obj.parent_event_id||""),
    String(obj.record_id||""),
    Number(obj.record_version||1),
    String(obj.record_class||""),
    String(obj.channel||""),
    String(obj.direction||""),
    String(obj.phone_number_id||""),
    String(obj.display_phone_number||""),
    String(obj.sender||""),
    String(obj.receiver||""),
    String(obj.message_id||""),
    String(obj.message_type||""),
    String(obj.text||""),
    String(obj.ai_summary||""),
    String(obj.ai_proposal||""),
    String(obj.approval_required||""),
    String(obj.approval_status||""),
    String(obj.execution_status||""),
    String(obj.status_latest||""),
    String(obj.status_timestamp||""),
    Number(obj.statuses_count||0),
    String(obj.contact_id||""),
    String(obj.raw_payload_ref||"") || rawJson,
    String(obj.notes||""),
    String(obj.task_due||""),
    String(obj.task_status||""),
    String(obj.task_priority||""),
    String(obj.topic_id||""),
    String(obj.topic_tagged_at||""),
    String(obj.biz_stage||""),
    String(obj.biz_stage_ts||""),
    String(obj.payment_status||""),
    String(obj.delivery_due||"")
  ];

  sh.appendRow(row);
  return { sh, row: sh.getLastRow() };
}

function TLW_getRecentMessageIdSet_() {
  const set = new Set();
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
    if (!sh) return set;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return set;

    const start = Math.max(2, lastRow - TL_WEBHOOK.MAX_IDEMPOTENCY_SCAN_ROWS + 1);
    const count = lastRow - start + 1;
    const values = sh.getRange(start, 10, count, 5).getValues(); // phone_number_id (J) through message_id (N)
    values.forEach(r => {
      const phoneId = String(r[0]||"").trim();
      const msgId = String(r[4]||"").trim();
      if (msgId) set.add(phoneId + "|" + msgId);
    });
  } catch (e) {}
  return set;
}

function TLW_upsertStatus_(ev, rawJson) {
  const messageId = String(ev.message_id || "");
  if (!messageId) return false;

  const loc = TLW_findRowByMessageId_(ev.phone_number_id || "", messageId);
  if (!loc) return false;

  const { sh, row } = loc;
  const current = Number(sh.getRange(row, 24).getValue() || 0); // statuses_count col (X)
  const version = Number(sh.getRange(row, 6).getValue() || 1); // record_version col F
  sh.getRange(row, 22).setValue(String(ev.message_type || ""));       // status_latest
  sh.getRange(row, 23).setValue(String(ev.status_timestamp || ""));   // status_timestamp
  sh.getRange(row, 24).setValue(current + 1);                         // statuses_count
  sh.getRange(row, 26).setValue(rawJson);                             // raw_payload_ref
  sh.getRange(row, 6).setValue(version + 1);                          // record_version
  TLW_logDebug_("status_merge", { phone: ev.phone_number_id, msg: messageId, row });
  return true;
}

function TLW_findRowByMessageId_(phoneId, messageId) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
    if (!sh) return null;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return null;

    const start = Math.max(2, lastRow - TL_WEBHOOK.MAX_IDEMPOTENCY_SCAN_ROWS + 1);
    const count = lastRow - start + 1;
    const ids = sh.getRange(start, 10, count, 5).getValues(); // phone_number_id (J) through message_id (N)

    // search from newest to oldest for speed
    for (let i = ids.length - 1; i >= 0; i--) {
      const pId = String(ids[i][0]||"").trim();
      const mId = String(ids[i][4]||"").trim();
      if (pId === String(phoneId||"") && mId === messageId) return { sh, row: start + i };
    }
  } catch (e) {}
  return null;
}

function TLW_logInfo_(label, data) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    let sh = ss.getSheetByName("LOG");
    if (!sh) sh = ss.insertSheet("LOG");
    const headers = ["timestamp","level","component","message","meta_json"];
    const existing = sh.getRange(1,1,1,headers.length).getValues()[0];
    const needs = existing.some((v,i)=>String(v||"")!==String(headers[i]||""));
    if (needs) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); }
    sh.appendRow([new Date(), "info", "webhook", String(label||""), TLW_safeStringify_(data, 4000)]);
  } catch(e) {}
}

function TLW_logDebug_(label, data) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    let sh = ss.getSheetByName("LOG");
    if (!sh) sh = ss.insertSheet("LOG");
    const headers = ["timestamp","level","component","message","meta_json"];
    const existing = sh.getRange(1,1,1,headers.length).getValues()[0];
    const needs = existing.some((v,i)=>String(v||"")!==String(headers[i]||""));
    if (needs) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); }
    sh.appendRow([new Date(), "debug", "webhook", String(label||""), TLW_safeStringify_(data, 4000)]);
  } catch(e) {}
}

function TLW_safeStringify_(obj, maxLen) {
  const lim = (typeof maxLen==="number" && isFinite(maxLen)) ? maxLen : 4000;
  let s="";
  try { s = JSON.stringify(obj); } catch(e){ s = String(obj); }
  if (s.length > lim) return s.slice(0, lim) + "...";
  return s;
}

function TLW_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj||{})).setMimeType(ContentService.MimeType.JSON);
}

function TLW_getSetting_(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  const sp = PropertiesService.getScriptProperties().getProperty(k);
  if (sp) return String(sp).trim();
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName("SETTINGS");
    if (!sh) return "";
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return "";
    const vals = sh.getRange(2,1,lastRow-1,2).getValues(); // key,value
    for (let i=0;i<vals.length;i++){
      if (String(vals[i][0]||"").trim() === k) return String(vals[i][1]||"").trim();
    }
  } catch (e) {}
  return "";
}

function TLW_isDuplicate_(enriched) {
  const messageId = String(enriched.message_id || "");
  const phoneId = String(enriched.phone_number_id || "");
  if (!messageId) return false;
  const set = TLW_getRecentMessageIdSet_();
  return set.has(phoneId + "|" + messageId);
}

function TLW_getMetaAccessToken_() {
  const scriptProps = PropertiesService.getScriptProperties();
  const preferred = [
    "TL_META_SYSTEM_USER_TOKEN",
    "TL_SYSTEM_TOKEN",
    "META_USER_ACCESS_TOKEN",
    "TL_USER_ACCESS_TOKEN"
  ];

  for (let i = 0; i < preferred.length; i++) {
    const token = String(scriptProps.getProperty(preferred[i]) || "").trim();
    if (token) return token;
  }

  return TLW_getSetting_("API TOKEN");
}

function TLW_parseSendTextResponse_(body, fallbackWaId) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(body || "{}"));
  } catch (e) {}

  const messages = parsed && parsed.messages ? parsed.messages : [];
  const contacts = parsed && parsed.contacts ? parsed.contacts : [];
  const messageId = messages.length ? String(messages[0].id || "").trim() : "";
  const waId = contacts.length ? String(contacts[0].wa_id || "").trim() : String(fallbackWaId || "").trim();

  return {
    raw: parsed,
    messageId: messageId,
    waId: waId
  };
}

function TLW_logOutboundTextSend_(phoneNumberId, toWaId, text, responseBody) {
  const parsed = TLW_parseSendTextResponse_(responseBody, toWaId);
  const outgoingEvent = {
    event_type: "message_echoes",
    display_phone_number: "",
    phone_number_id: String(phoneNumberId || "").trim(),
    from: "",
    recipient_id: parsed.waId,
    message_id: parsed.messageId,
    message_type: "text",
    text: String(text || ""),
    statuses_count: 0
  };
  const enriched = TLW_enrichEvent_(outgoingEvent, new Date());
  if (!enriched) return;
  if (TLW_isDuplicate_(enriched)) return;
  TLW_appendInboxRow_(enriched, TLW_safeStringify_({
    source: "TLW_sendText_",
    send_response: parsed.raw || String(responseBody || "")
  }, 4000));
}

function TLW_sendText_(phoneNumberId, toWaId, text) {
  const token = TLW_getMetaAccessToken_();
  if (!token) throw new Error("Missing Meta access token (TL_META_SYSTEM_USER_TOKEN/TL_SYSTEM_TOKEN/META_USER_ACCESS_TOKEN/TL_USER_ACCESS_TOKEN/API TOKEN)");
  const url = "https://graph.facebook.com/v19.0/" + encodeURIComponent(phoneNumberId) + "/messages";
  const payload = {
    messaging_product: "whatsapp",
    to: toWaId,
    type: "text",
    text: { body: text }
  };
  try {
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const result = { ok: res.getResponseCode() === 200, status: res.getResponseCode(), body: res.getContentText() };
    if (result.ok) {
      TLW_logOutboundTextSend_(phoneNumberId, toWaId, text, result.body);
    }
    return result;
  } catch (e) {
    TLW_logInfo_("menu_send_error", { error: String(e) });
    return { ok: false, status: 0, body: String(e) };
  }
}

function TLW_topicIdFromText_(text) {
  const t = String(text || "").trim();
  if (!t) return "topic_unknown";
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, t)).slice(0,8);
  return "topic_" + hash;
}

function TLW_resolveRootId_(contactId, topicId, ts) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  const now = ts || new Date();
  const windowMinutes = 120; // default thread window
  const cutoff = new Date(now.getTime() - windowMinutes*60000);
  let candidate = null;
  if (sh) {
    const lastRow = sh.getLastRow();
    const start = Math.max(2, lastRow - TL_WEBHOOK.MAX_IDEMPOTENCY_SCAN_ROWS + 1);
    const count = lastRow - start + 1;
    if (count > 0) {
      const vals = sh.getRange(start,1,count,31).getValues(); // up to topic_id col
      for (let i = vals.length - 1; i >= 0; i--) {
        const rowTs = vals[i][0];
        const cId = String(vals[i][24] || ""); // contact_id col Y? wait column 25 index 24 zero-based
        const tId = String(vals[i][30] || ""); // topic_id column 31 zero-based 30
        const root = String(vals[i][1] || ""); // root_id column 2 zero-based1
        if (cId === contactId && tId === topicId && rowTs && rowTs >= cutoff) {
          candidate = root || candidate;
          break;
        }
      }
    }
  }
  return candidate || ("root_" + Utilities.getUuid());
}
