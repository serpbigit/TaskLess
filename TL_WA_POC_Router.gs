/**
 * TL_WA_POC_Router.gs
 * Helper only. No doPost here.
 */

function TL_WA_POC_Router_handle_(payload) {
  const entry = payload && payload.entry && payload.entry[0] ? payload.entry[0] : {};
  const change = entry && entry.changes && entry.changes[0] ? entry.changes[0] : {};
  const value = change.value || {};
  const msg = value && value.messages && value.messages[0] ? value.messages[0] : null;

  if (!msg) {
    return { ok: true, note: "no message in payload" };
  }

  return {
    ok: true,
    from: String(msg.from || ""),
    messageId: String(msg.id || ""),
    type: String(msg.type || ""),
    text: (msg.type === "text" && msg.text && msg.text.body) ? String(msg.text.body || "") : "",
    phone_number_id: String((value.metadata && value.metadata.phone_number_id) || ""),
    display_phone_number: String((value.metadata && value.metadata.display_phone_number) || "")
  };
}
