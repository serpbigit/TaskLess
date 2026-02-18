/**
 * TaskLess v0 — GAS Webhook Receiver + Logger
 *
 * Script Properties required:
 * - TL_VERIFY_TOKEN        (string)  Used for webhook verification GET
 * - TL_SHEET_ID            (string)  Spreadsheet ID containing WEBHOOK_LOG tab
 * - META_USER_ACCESS_TOKEN (string)  Graph API token (user/system user token with WA perms)
 *
 * Sheets:
 * - WEBHOOK_LOG (auto-created) with columns:
 *   ts, event_type, display_phone_number, phone_number_id, from, message_id,
 *   message_type, text, statuses_count, raw_json
 *
 * Notes:
 * - Idempotency: we avoid appending duplicate message_id rows.
 * - We always return 200 quickly for POST to avoid webhook retries.
 * - Coexist markers are future; this file only logs + provides phone state checks.
 */

const TL = {
  LOG_SHEET: "WEBHOOK_LOG",
  HEADERS: [
    "ts",
    "event_type",
    "display_phone_number",
    "phone_number_id",
    "from",
    "message_id",
    "message_type",
    "text",
    "statuses_count",
    "raw_json"
  ],
  MAX_IDEMPOTENCY_SCAN_ROWS: 2000 // scan last N rows for message_id set
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
    // Never throw on webhook verify
    return ContentService.createTextOutput("error").setMimeType(ContentService.MimeType.TEXT);
  }
}

function doPost(e) {
  const started = new Date();
  try {
    const raw = (e && e.postData && typeof e.postData.contents === "string") ? e.postData.contents : "";
    if (!raw) {
      logDebug_("empty_post", { when: started.toISOString() });
      return json_(200, { ok: true, empty: true });
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (parseErr) {
      logDebug_("invalid_json", { err: String(parseErr), raw: raw.slice(0, 500) });
      return json_(200, { ok: true, parse_error: true });
    }

    const events = tlExtractWebhookEvents_(payload);
    if (!events.length) {
      // Still log a meta row so you can see something arrived
      appendWebhookRow_({
        ts: new Date(),
        event_type: "webhook_no_events",
        display_phone_number: "",
        phone_number_id: "",
        from: "",
        message_id: "",
        message_type: "",
        text: "",
        statuses_count: 0,
        raw_json: safeStringify_(payload, 4000)
      }, { allowDuplicate: true });
      return json_(200, { ok: true, events: 0 });
    }

    const idSet = getRecentMessageIdSet_(); // idempotency window
    let appended = 0;
    let skipped = 0;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const messageId = String(ev.message_id || "");

      if (messageId && idSet.has(messageId)) {
        skipped++;
        continue;
      }

      appendWebhookRow_({
        ts: new Date(),
        event_type: ev.event_type || "messages",
        display_phone_number: ev.display_phone_number || "",
        phone_number_id: ev.phone_number_id || "",
        from: ev.from || "",
        message_id: messageId,
        message_type: ev.message_type || "",
        text: ev.text || "",
        statuses_count: ev.statuses_count || 0,
        raw_json: safeStringify_(payload, 8000)
      }, { allowDuplicate: false });

      if (messageId) idSet.add(messageId);
      appended++;
    }

    return json_(200, { ok: true, appended: appended, skipped: skipped });
  } catch (err) {
    logDebug_("doPost_error", { err: String(err && err.message ? err.message : err) });
    // Still 200 to avoid webhook retry storms
    return json_(200, { ok: true, error: true });
  }
}

/** --------- Public utilities --------- */

function runSelfTest() {
  appendWebhookRow_({
    ts: new Date(),
    event_type: "debug_append_row",
    display_phone_number: "",
    phone_number_id: "",
    from: "",
    message_id: "",
    message_type: "",
    text: "If you see this row, sheet write works.",
    statuses_count: 0,
    raw_json: JSON.stringify({ ok: true })
  }, { allowDuplicate: true });

  Logger.log("Self test appended.");
}

function COEX_checkPhoneNumberState(phoneNumberId) {
  const id = String(phoneNumberId || "").trim();
  if (!id) throw new Error("Missing phoneNumberId");

  const token = String(PropertiesService.getScriptProperties().getProperty("META_USER_ACCESS_TOKEN") || "").trim();
  if (!token) throw new Error("Missing Script Property META_USER_ACCESS_TOKEN");

  const fields = [
    "id",
    "display_phone_number",
    "verified_name",
    "status",
    "platform_type",
    "code_verification_status",
    "name_status",
    "quality_rating",
    "health_status"
  ].join(",");

  const url = "https://graph.facebook.com/v24.0/" + encodeURIComponent(id) + "?fields=" + encodeURIComponent(fields);
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + token }
  });

  const status = res.getResponseCode();
  const body = res.getContentText();

  appendWebhookRow_({
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
  }, { allowDuplicate: true });

  Logger.log("COEX_checkPhoneNumberState HTTP " + status + ": " + body);
  return { status: status, body: body };
}

/** --------- Parsing --------- */

function tlExtractWebhookEvents_(payload) {
  const out = [];
  if (!payload || !payload.entry || !payload.entry.length) return out;

  for (let i = 0; i < payload.entry.length; i++) {
    const entry = payload.entry[i];
    const changes = entry && entry.changes ? entry.changes : [];
    for (let j = 0; j < changes.length; j++) {
      const ch = changes[j];
      const field = String(ch.field || "");
      const val = ch.value || {};

      const meta = val.metadata || {};
      const displayPhone = String(meta.display_phone_number || "");
      const phoneId = String(meta.phone_number_id || "");

      // Messages
      if (field === "messages" && val.messages && val.messages.length) {
        const contacts = (val.contacts && val.contacts.length) ? val.contacts : [];
        for (let k = 0; k < val.messages.length; k++) {
          const m = val.messages[k];
          const from = String(m.from || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const text = (type === "text" && m.text && m.text.body) ? String(m.text.body) : "";

          out.push({
            event_type: "messages",
            display_phone_number: displayPhone,
            phone_number_id: phoneId,
            from: from,
            message_id: msgId,
            message_type: type,
            text: text,
            statuses_count: 0
          });
        }
      }

      // Status updates
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
          statuses_count: statuses.length
        });
      }
    }
  }
  return out;
}

/** --------- Logging + Sheets --------- */

function appendWebhookRow_(obj, opts) {
  const options = opts || {};
  const allowDuplicate = !!options.allowDuplicate;

  const sh = getOrCreateSheet_(TL.LOG_SHEET);
  ensureHeaders_(sh, TL.HEADERS);

  const messageId = String(obj.message_id || "");
  if (!allowDuplicate && messageId) {
    const idSet = getRecentMessageIdSet_();
    if (idSet.has(messageId)) return;
  }

  const row = [
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
  ];

  sh.appendRow(row);
}

function logDebug_(label, data) {
  appendWebhookRow_({
    ts: new Date(),
    event_type: "debug_" + String(label || "log"),
    display_phone_number: "",
    phone_number_id: "",
    from: "",
    message_id: "",
    message_type: "",
    text: "",
    statuses_count: 0,
    raw_json: safeStringify_(data, 4000)
  }, { allowDuplicate: true });
}

function getOrCreateSheet_(name) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function getSpreadsheet_() {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) throw new Error("Missing Script Property TL_SHEET_ID");
  return SpreadsheetApp.openById(sheetId);
}

function ensureHeaders_(sh, headers) {
  const range = sh.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0];
  const needs = existing.some((v, i) => String(v || "") !== String(headers[i] || ""));
  if (needs) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function getRecentMessageIdSet_() {
  const set = new Set();
  try {
    const sh = getOrCreateSheet_(TL.LOG_SHEET);
    ensureHeaders_(sh, TL.HEADERS);

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return set;

    const start = Math.max(2, lastRow - TL.MAX_IDEMPOTENCY_SCAN_ROWS + 1);
    const count = lastRow - start + 1;

    // message_id column = 6 (F)
    const values = sh.getRange(start, 6, count, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      const id = String(values[i][0] || "").trim();
      if (id) set.add(id);
    }
  } catch (err) {
    // If idempotency scan fails, we still prefer logging over failing the webhook.
    // We'll just return an empty set.
  }
  return set;
}

/** --------- Helpers --------- */

function safeStringify_(obj, maxLen) {
  const lim = (typeof maxLen === "number" && isFinite(maxLen)) ? maxLen : 4000;
  let s = "";
  try {
    s = JSON.stringify(obj);
  } catch (err) {
    s = String(obj);
  }
  if (s.length > lim) return s.slice(0, lim) + "…";
  return s;
}

function json_(code, obj) {
  const out = ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
  // Apps Script doesn't let us set status codes directly in ContentService;
  // returning 200 is fine for webhook usage.
  return out;
}

