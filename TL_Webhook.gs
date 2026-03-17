/**
 * TL_Webhook - WhatsApp Cloud API webhook entry (GET verify + POST events)
 *
 * Required Script Properties:
 * - TL_VERIFY_TOKEN        (string)  webhook verify token
 * - TL_SHEET_ID            (string)  spreadsheet ID containing WEBHOOK_LOG
 * - META_USER_ACCESS_TOKEN (string)  Graph API token (optional for COEX_checkPhoneNumberState)
 *
 * Tabs:
 * - WEBHOOK_LOG (auto-created)
 */
const TL_WEBHOOK = {
  LOG_SHEET: "WEBHOOK_LOG",
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

    const events = TLW_extractEvents_(payload);
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
      }

      const duplicate = TLW_isDuplicate_(enriched);
      if (duplicate) { skipped++; return; }

      TLW_appendInboxRow_(enriched, rawJson);
      appended++;
    });

    return TLW_json_({ ok:true, appended, skipped, updated });
  } catch (err) {
    TLW_logDebug_("doPost_error", { err:String(err && err.stack ? err.stack : err) });
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

  TLW_appendRow_({
    ts:new Date(), event_type:"coex_check_state",
    display_phone_number:"", phone_number_id:id, from:"",
    message_id:"", message_type:"HTTP_" + status, text:"",
    statuses_count:0, raw_json: body
  }, true);

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
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";
          out.push({ event_type:"messages", display_phone_number:displayPhone, phone_number_id:phoneId, from, message_id:msgId, message_type:type, text, statuses_count:0 });
        });
      }

      if (field === "message_echoes" && val.message_echoes && val.message_echoes.length) {
        val.message_echoes.forEach(m => {
          const from = String(m.from || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";
          out.push({ event_type:"message_echoes", display_phone_number:displayPhone, phone_number_id:phoneId, from, message_id:msgId, message_type:type, text, statuses_count:0 });
        });
      }

      if (field === "smb_message_echoes" && val.message_echoes && val.message_echoes.length) {
        val.message_echoes.forEach(m => {
          const from = String(m.from || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";
          out.push({ event_type:"smb_message_echoes", display_phone_number:displayPhone, phone_number_id:phoneId, from, message_id:msgId, message_type:type, text, statuses_count:0 });
        });
      }

      const statuses = val.statuses || [];
      if (statuses && statuses.length) {
        statuses.forEach(s => {
          const msgId = String(s.id || "");
          const st = String(s.status || "status_update");
          out.push({ event_type:"statuses", display_phone_number:displayPhone, phone_number_id:phoneId, from:"", message_id:msgId, message_type:st, text:"", statuses_count:1, status_timestamp:String(s.timestamp || "") });
        });
      }
    });
  });

  return out;
}

function TLW_enrichEvent_(ev, ts) {
  const nowIso = (ts || new Date()).toISOString();
  const phoneId = String(ev.phone_number_id || "");
  const msgId = String(ev.message_id || "");

  // contact resolution (simple deterministic id)
  const sender = String(ev.from || "");
  const contactId = sender ? ("WA_" + phoneId + "_" + sender) : "";

  // topic id (placeholder hash)
  const topicId = TLW_topicIdFromText_(ev.text || "");

  // direction + channel
  const eventType = String(ev.event_type || "");
  const direction = (eventType === "messages") ? "incoming" : "outgoing";
  const channel = "whatsapp";

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
    receiver: "",
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

function TLW_logDebug_(label, data) {
  try {
    TLW_appendRow_({
      ts:new Date(), event_type:"debug_" + String(label||"log"),
      display_phone_number:"", phone_number_id:"", from:"",
      message_id:"", message_type:"", text:"",
      statuses_count:0, raw_json: TLW_safeStringify_(data, 4000)
    }, true);
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

function TLW_isDuplicate_(enriched) {
  const messageId = String(enriched.message_id || "");
  const phoneId = String(enriched.phone_number_id || "");
  if (!messageId) return false;
  const set = TLW_getRecentMessageIdSet_();
  return set.has(phoneId + "|" + messageId);
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
