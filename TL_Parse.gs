/**
 * TL_Parse.gs
 * Minimal envelope parser for TaskLess POC.
 */
function TL_Parse_envelope_(raw) {
  try {
    var obj = raw;
    if (typeof raw === "string") obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") {
      return { ok: false, error: "Parse: payload is not an object" };
    }

    var entry0  = (obj.entry && obj.entry[0]) ? obj.entry[0] : null;
    var change0 = (entry0 && entry0.changes && entry0.changes[0]) ? entry0.changes[0] : null;
    var value   = (change0 && change0.value) ? change0.value : null;
    var msg0    = (value && value.messages && value.messages[0]) ? value.messages[0] : null;
    var meta    = (value && value.metadata) ? value.metadata : {};

    var textBody = null;
    if (msg0 && msg0.type === "text" && msg0.text && typeof msg0.text.body === "string") {
      textBody = msg0.text.body;
    }

    var messageId = msg0 && msg0.id ? String(msg0.id) : "";
    var dedupeKey = messageId ? ("wa:" + messageId) : ("wa:nomsg:" + new Date().toISOString());

    return {
      ok: true,
      envelope: {
        source: "wa_cloud",
        object: obj.object || "",
        entryId: entry0 && entry0.id ? String(entry0.id) : "",
        changeField: change0 && change0.field ? String(change0.field) : "",
        meta: {
          phone_number_id: meta.phone_number_id || "",
          display_phone_number: meta.display_phone_number || ""
        },
        message: {
          id: messageId,
          from: msg0 && msg0.from ? String(msg0.from) : "",
          timestamp: msg0 && msg0.timestamp ? String(msg0.timestamp) : "",
          type: msg0 && msg0.type ? String(msg0.type) : "",
          textBody: textBody,
          raw: msg0 || null
        },
        dedupeKey: dedupeKey
      }
    };
  } catch (e) {
    return { ok: false, error: "Parse exception: " + (e && e.stack ? e.stack : e) };
  }
}
