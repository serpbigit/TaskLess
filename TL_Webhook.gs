/**
 * TL_Webhook - WhatsApp Cloud API webhook entry (GET verify + POST events)
 *
 * Required Script Properties:
 * - TL_VERIFY_TOKEN        webhook verify token
 * - TL_SHEET_ID            spreadsheet ID containing OPEN / WEBHOOK_LOG
 * - META_USER_ACCESS_TOKEN Graph API token (optional for COEX_checkPhoneNumberState)
 *
 * Tabs:
 * - WEBHOOK_LOG
 * - OPEN
 */
const TL_WEBHOOK = {
  LOG_SHEET: "WEBHOOK_LOG",
  OPEN_SHEET: "OPEN",
  LOG_HEADERS: [
    "ts","event_type","display_phone_number","phone_number_id",
    "from","message_id","message_type","text","statuses_count","raw_json"
  ],
  OPEN_HEADERS: [
    "createdAt","updatedAt","userE164","refId","chunkId","title","kind","channel",
    "status","askedAt","answeredAt","executedAt","draftOrPromptJson","lastAction","lastActionAt"
  ],
  MAX_IDEMPOTENCY_SCAN_ROWS: 2000
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
      return TLW_json_({ ok: true, empty: true });
    }

    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch (parseErr) {
      TLW_logDebug_("invalid_json", { err: String(parseErr), raw: raw.slice(0, 500) });
      return TLW_json_({ ok: true, parse_error: true });
    }

    const events = TLW_extractEvents_(payload);
    if (!events.length) {
      TLW_appendLogRow_({
        ts: new Date(),
        event_type: "webhook_no_events",
        display_phone_number: "",
        phone_number_id: "",
        from: "",
        message_id: "",
        message_type: "",
        text: "",
        statuses_count: 0,
        raw_json: TLW_safeStringify_(payload, 4000)
      }, true);

      return TLW_json_({ ok: true, events: 0 });
    }

    const idSet = TLW_getRecentMessageIdSet_();
    let appended = 0;
    let skipped = 0;
    let openAppended = 0;

    events.forEach(ev => {
      const messageId = String(ev.message_id || "");
      if (messageId && idSet.has(messageId)) {
        skipped++;
        return;
      }

      TLW_appendLogRow_({
        ts: new Date(),
        event_type: ev.event_type || "messages",
        display_phone_number: ev.display_phone_number || "",
        phone_number_id: ev.phone_number_id || "",
        from: ev.from || "",
        message_id: messageId,
        message_type: ev.message_type || "",
        text: ev.text || "",
        statuses_count: ev.statuses_count || 0,
        raw_json: TLW_safeStringify_(payload, 8000)
      }, false);

      if (ev.event_type === "messages" && ev.message_type === "text" && messageId) {
        TLW_appendOpenRow_(ev);
        openAppended++;
      }

      if (messageId) idSet.add(messageId);
      appended++;
    });

    return TLW_json_({ ok: true, appended: appended, skipped: skipped, openAppended: openAppended });
  } catch (err) {
    TLW_logDebug_("doPost_error", { err: String(err && err.stack ? err.stack : err) });
    return TLW_json_({ ok: true, error: true });
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
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + token }
  });

  const status = res.getResponseCode();
  const body = res.getContentText();

  TLW_appendLogRow_({
    ts: new Date(),
    event_type: "coex_check_state",
    display_phone_number: "",
    phone_number_id: id,
    from: "",
    message_id: "",
    message_type: "HTTP_" + status,
    text: "",
    statuses_count: 0,
    raw_json: body
  }, true);

  return { status: status, body: body };
}

/** ---- internals ---- */
function TLW_extractEvents_(payload) {
  const out = [];
  if (!payload || !payload.entry || !payload.entry.length) return out;

  payload.entry.forEach(function(entry) {
    const changes = entry && entry.changes ? entry.changes : [];
    changes.forEach(function(ch) {
      const field = String(ch.field || "");
      const val = ch.value || {};
      const meta = val.metadata || {};
      const displayPhone = String(meta.display_phone_number || "");
      const phoneId = String(meta.phone_number_id || "");

      const contacts = val.contacts || [];
      const firstContact = contacts.length ? contacts[0] : {};
      const profileName = firstContact && firstContact.profile ? String(firstContact.profile.name || "") : "";
      const waId = String(firstContact.wa_id || "");

      if (field === "messages" && val.messages && val.messages.length) {
        val.messages.forEach(function(m) {
          const from = String(m.from || waId || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const ts = String(m.timestamp || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";

          out.push({
            event_type: "messages",
            display_phone_number: displayPhone,
            phone_number_id: phoneId,
            from: from,
            message_id: msgId,
            message_type: type,
            text: text,
            statuses_count: 0,
            profile_name: profileName,
            timestamp: ts
          });
        });
      }

      const statuses = val.statuses || [];
      if (statuses && statuses.length) {
        out.push({
          event_type: "statuses",
          display_phone_number: displayPhone,
          phone_number_id: phoneId,
          from: "",
          message_id: "",
          message_type: "status_update",
          text: "",
          statuses_count: statuses.length,
          profile_name: "",
          timestamp: ""
        });
      }
    });
  });

  return out;
}

function TLW_appendOpenRow_(ev) {
  const ss = TLW_getSpreadsheet_();
  let sh = ss.getSheetByName(TL_WEBHOOK.OPEN_SHEET);
  if (!sh) sh = ss.insertSheet(TL_WEBHOOK.OPEN_SHEET);

  TLW_ensureHeaders_(sh, TL_WEBHOOK.OPEN_HEADERS);

  const nowIso = new Date().toISOString();
  const messageId = String(ev.message_id || "");
  const text = String(ev.text || "");
  const title = text ? text.slice(0, 120) : "[WhatsApp message]";

  const draft = {
    source: "whatsapp",
    display_phone_number: String(ev.display_phone_number || ""),
    phone_number_id: String(ev.phone_number_id || ""),
    from: String(ev.from || ""),
    profile_name: String(ev.profile_name || ""),
    messageId: messageId,
    message_type: String(ev.message_type || ""),
    text: text,
    timestamp: String(ev.timestamp || "")
  };

  sh.appendRow([
    nowIso,
    nowIso,
    String(ev.from || ""),
    "wa:msg:" + messageId,
    messageId,
    title,
    "wa_message",
    "whatsapp",
    "OPEN",
    nowIso,
    "",
    "",
    JSON.stringify(draft),
    "WA_INGEST",
    nowIso
  ]);
}

function TLW_appendLogRow_(obj, allowDuplicate) {
  const ss = TLW_getSpreadsheet_();
  let sh = ss.getSheetByName(TL_WEBHOOK.LOG_SHEET);
  if (!sh) sh = ss.insertSheet(TL_WEBHOOK.LOG_SHEET);

  TLW_ensureHeaders_(sh, TL_WEBHOOK.LOG_HEADERS);

  const messageId = String(obj.message_id || "");
  if (!allowDuplicate && messageId) {
    const set = TLW_getRecentMessageIdSet_();
    if (set.has(messageId)) return;
  }

  sh.appendRow([
    obj.ts || new Date(),
    String(obj.event_type || ""),
    String(obj.display_phone_number || ""),
    String(obj.phone_number_id || ""),
    String(obj.from || ""),
    String(obj.message_id || ""),
    String(obj.message_type || ""),
    String(obj.text || ""),
    Number(obj.statuses_count || 0),
    String(obj.raw_json || "")
  ]);
}

function TLW_getSpreadsheet_() {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) throw new Error("Missing Script Property TL_SHEET_ID");
  return SpreadsheetApp.openById(sheetId);
}

function TLW_ensureHeaders_(sh, headers) {
  const range = sh.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0];
  const needs = existing.some(function(v, i) {
    return String(v || "") !== String(headers[i] || "");
  });

  if (needs) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function TLW_getRecentMessageIdSet_() {
  const set = new Set();

  try {
    const ss = TLW_getSpreadsheet_();
    const sh = ss.getSheetByName(TL_WEBHOOK.LOG_SHEET);
    if (!sh) return set;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return set;

    const start = Math.max(2, lastRow - TL_WEBHOOK.MAX_IDEMPOTENCY_SCAN_ROWS + 1);
    const count = lastRow - start + 1;
    const values = sh.getRange(start, 6, count, 1).getValues();

    values.forEach(function(r) {
      const id = String(r[0] || "").trim();
      if (id) set.add(id);
    });
  } catch (e) {}

  return set;
}

function TLW_logDebug_(label, data) {
  try {
    TLW_appendLogRow_({
      ts: new Date(),
      event_type: "debug_" + String(label || "log"),
      display_phone_number: "",
      phone_number_id: "",
      from: "",
      message_id: "",
      message_type: "",
      text: "",
      statuses_count: 0,
      raw_json: TLW_safeStringify_(data, 4000)
    }, true);
  } catch (e) {}
}

function TLW_safeStringify_(obj, maxLen) {
  const lim = (typeof maxLen === "number" && isFinite(maxLen)) ? maxLen : 4000;
  let s = "";
  try {
    s = JSON.stringify(obj);
  } catch (e) {
    s = String(obj);
  }

  if (s.length > lim) return s.slice(0, lim) + "...";
  return s;
}

function TLW_json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}
