/**
 * TL_Parse - normalize inbound payload.
 * This stays tolerant until we lock the Meta webhook schema.
 */
function TL_Parse_envelope_(payload) {
  payload = payload || {};
  const text = String(payload.text || payload.body || payload.message || "");

  const msgId =
    payload.msgId ||
    payload.messageId ||
    (payload.messages && payload.messages[0] && payload.messages[0].id) ||
    (payload.entry && payload.entry[0] && payload.entry[0].changes && payload.entry[0].changes[0] &&
      payload.entry[0].changes[0].value && payload.entry[0].changes[0].value.messages &&
      payload.entry[0].changes[0].value.messages[0] && payload.entry[0].changes[0].value.messages[0].id) ||
    ("local-" + Utilities.getUuid());

  const from =
    payload.from ||
    payload.sender ||
    (payload.messages && payload.messages[0] && payload.messages[0].from) ||
    (payload.entry && payload.entry[0] && payload.entry[0].changes && payload.entry[0].changes[0] &&
      payload.entry[0].changes[0].value && payload.entry[0].changes[0].value.messages &&
      payload.entry[0].changes[0].value.messages[0] && payload.entry[0].changes[0].value.messages[0].from) ||
    "";

  const hasAudio =
    Boolean(payload.audio || payload.voice || payload.mediaUrl) ||
    (payload.messages && payload.messages[0] && payload.messages[0].type === "audio") ||
    (payload.entry && payload.entry[0] && payload.entry[0].changes && payload.entry[0].changes[0] &&
      payload.entry[0].changes[0].value && payload.entry[0].changes[0].value.messages &&
      payload.entry[0].changes[0].value.messages[0] &&
      payload.entry[0].changes[0].value.messages[0].type === "audio");

  // Interactive payload (future: Meta interactive replies)
  const interactive =
    payload.interactive ||
    payload.button ||
    payload.listReply ||
    payload.payload ||
    null;

  return {
    msgId,
    from: String(from || ""),
    text,
    hasAudio,
    interactive,
    raw: payload
  };
}

