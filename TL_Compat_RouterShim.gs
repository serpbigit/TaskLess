/**
 * TL_Compat_RouterShim
 * Purpose: restore missing helper functions expected by TL_Router.gs / TL_Webhook.gs
 */

function _nowIso_() {
  return new Date().toISOString();
}

function _json_(obj) {
  return JSON.stringify(obj || {});
}

function TL_Log_append_(actor, eventType, payloadObj, taskId, batchId) {
  if (typeof TL_Audit_append_ === "function") {
    TL_Audit_append_(
      actor || "SYST",
      eventType || "",
      {
        payload: payloadObj || {},
        taskId: taskId || "",
        batchId: batchId || ""
      }
    );
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("AUDIT_LOG");
  if (!sh) sh = ss.insertSheet("AUDIT_LOG");

  if (sh.getLastRow() === 0) {
    sh.appendRow(["ts","actor","eventType","payloadJson","taskId","batchId","payloadJson2"]);
    sh.setFrozenRows(1);
  }

  sh.appendRow([
    new Date().toISOString(),
    String(actor || "SYST"),
    String(eventType || ""),
    JSON.stringify(payloadObj || {}),
    String(taskId || ""),
    String(batchId || ""),
    ""
  ]);
}

function TL_Menu_text_(ctx) {
  var lines = [
    "TaskLess Menu",
    "1. Send a command",
    "2. Show open tasks",
    "3. Show future features"
  ];

  if (ctx && ctx.batchId) lines.push("batchId: " + ctx.batchId);
  if (ctx && ctx.taskId) lines.push("taskId: " + ctx.taskId);

  return lines.join("\n");
}

function TL_Parse_envelope_(raw) {
  var payload = raw || {};
  var entry = (payload.entry && payload.entry[0]) ? payload.entry[0] : {};
  var change = (entry.changes && entry.changes[0]) ? entry.changes[0] : {};
  var value = change.value || {};
  var metadata = value.metadata || {};
  var msg = (value.messages && value.messages[0]) ? value.messages[0] : null;

  if (!msg) {
    return {
      ok: false,
      source: "wa_cloud",
      object: String(payload.object || ""),
      entryId: String(entry.id || ""),
      changeField: String(change.field || ""),
      meta: {
        phone_number_id: String(metadata.phone_number_id || ""),
        display_phone_number: String(metadata.display_phone_number || "")
      },
      from: "",
      text: "",
      interactive: null,
      raw: payload
    };
  }

  var text = "";
  if (msg.type === "text" && msg.text && msg.text.body) {
    text = String(msg.text.body || "");
  }

  return {
    ok: true,
    source: "wa_cloud",
    object: String(payload.object || ""),
    entryId: String(entry.id || ""),
    changeField: String(change.field || ""),
    meta: {
      phone_number_id: String(metadata.phone_number_id || ""),
      display_phone_number: String(metadata.display_phone_number || "")
    },
    from: String(msg.from || ""),
    text: text,
    interactive: msg.interactive || null,
    messageId: String(msg.id || ""),
    messageType: String(msg.type || ""),
    raw: payload
  };
}
