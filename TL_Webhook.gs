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
  INBOX_SHEET: TL_INBOX.SHEET,
  MAX_IDEMPOTENCY_SCAN_ROWS: 2000,
  MEDIA_MESSAGE_TYPES: ["image","document","audio","video"],
  INBOX_HEADERS: TL_INBOX.HEADERS
};

function TLW_colIndex_(headerName) {
  return TL_colIndex_(headerName);
}

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
      if (TLW_claimReplySend_("menu_text", menuReply.messageId)) {
        TLW_logInfo_("menu_reply_deduped", { to: menuReply.toWaId, msg_id: menuReply.messageId || "", phone_id: menuReply.toPhoneId || "" });
        return TLW_json_({ ok:true, menu:true, deduped:true });
      }
      const sent = TLW_sendText_(menuReply.toPhoneId, menuReply.toWaId, menuReply.text);
      if (!(sent && sent.ok)) TLW_releaseReplySend_("menu_text", menuReply.messageId);
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

      const appendedRow = TLW_appendInboxRow_(enriched, rawJson);
      const repairedCount = TLW_tryApplyCachedStatuses_(enriched.phone_number_id || "", enriched.message_id || "", appendedRow.row);
      const bossTextMenuReply = TLW_tryBossMenuFromTextRow_(enriched, appendedRow);
      if (bossTextMenuReply && bossTextMenuReply.consumed) {
        appended++;
        updated += repairedCount;
        return;
      }
      TLW_tryAutoVoiceTranscription_(enriched, appendedRow);
      const voiceMenuReply = TLW_tryBossMenuFromInboxRow_(enriched, appendedRow);
      if (voiceMenuReply && voiceMenuReply.sent) {
        appended++;
        updated += repairedCount;
        return;
      }
      TLW_tryAutoAiTriage_(enriched, appendedRow);
      TLW_tryAutoBossCapture_(enriched, appendedRow);
      appended++;
      updated += repairedCount;
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
function TLW_extractMessageContent_(m) {
  const type = String(m && m.type || "");
  const text = (type === "text" && m && m.text && m.text.body) ? String(m.text.body) : "";
  const isExplicitMediaType = TL_WEBHOOK.MEDIA_MESSAGE_TYPES.indexOf(type) !== -1;
  const media = (isExplicitMediaType && m && m[type] && typeof m[type] === "object") ? m[type] : {};
  const caption = String(media.caption || "");
  const filename = String(media.filename || "");
  const mimeType = String(media.mime_type || "");
  const sha256 = String(media.sha256 || "");
  const mediaId = String(media.id || "");
  const isVoice = !!media.voice;

  return {
    message_type: (type === "audio" && isVoice) ? "voice" : type,
    text: text || caption,
    media_id: mediaId,
    media_mime_type: mimeType,
    media_sha256: sha256,
    media_caption: caption,
    media_filename: filename,
    media_is_voice: isVoice
  };
}

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
        const contacts = Array.isArray(val.contacts) ? val.contacts : [];
        val.messages.forEach(m => {
          const from = String(m.from || "");
          const recipient = String(m.recipient_id || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const content = TLW_extractMessageContent_(m);
          const contactMatch = contacts.find(function(contact) {
            return String(contact && contact.wa_id || "").trim() === from;
          }) || contacts[0] || {};
          const profileName = String(contactMatch && contactMatch.profile && contactMatch.profile.name || "").trim();
          out.push({
            event_type:"messages",
            display_phone_number:displayPhone,
            phone_number_id:phoneId,
            from,
            recipient_id:recipient,
            message_id:msgId,
            message_type:content.message_type,
            text: content.text,
            contact_name: profileName,
            statuses_count:0,
            media_id: content.media_id,
            media_mime_type: content.media_mime_type,
            media_sha256: content.media_sha256,
            media_caption: content.media_caption,
            media_filename: content.media_filename,
            media_is_voice: content.media_is_voice
          });
        });
      }

      if (field === "message_echoes" && val.message_echoes && val.message_echoes.length) {
        val.message_echoes.forEach(m => {
          const from = String(m.from || "");
          const recipient = String(m.recipient_id || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const content = TLW_extractMessageContent_(m);
          out.push({
            event_type:"message_echoes",
            display_phone_number:displayPhone,
            phone_number_id:phoneId,
            from,
            recipient_id:recipient,
            message_id:msgId,
            message_type:content.message_type,
            text: content.text,
            statuses_count:0,
            media_id: content.media_id,
            media_mime_type: content.media_mime_type,
            media_sha256: content.media_sha256,
            media_caption: content.media_caption,
            media_filename: content.media_filename,
            media_is_voice: content.media_is_voice
          });
        });
      }

      if (field === "smb_message_echoes" && val.message_echoes && val.message_echoes.length) {
        val.message_echoes.forEach(m => {
          const from = String(m.from || "");
          const recipient = String(m.recipient_id || "");
          const msgId = String(m.id || "");
          const type = String(m.type || "");
          const content = TLW_extractMessageContent_(m);
          out.push({
            event_type:"smb_message_echoes",
            display_phone_number:displayPhone,
            phone_number_id:phoneId,
            from,
            recipient_id:recipient,
            message_id:msgId,
            message_type:content.message_type,
            text: content.text,
            statuses_count:0,
            media_id: content.media_id,
            media_mime_type: content.media_mime_type,
            media_sha256: content.media_sha256,
            media_caption: content.media_caption,
            media_filename: content.media_filename,
            media_is_voice: content.media_is_voice
          });
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
  // boss text always belongs to the boss-assistant route first.
  const candidates = events.filter(ev => ev.message_type === "text");
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const normalized = candidates.map(e=>({from:e.from, type:e.event_type, msg_id:e.message_id, text:String(e.text||"").trim().toLowerCase()}));
  TLW_logInfo_("menu_match_attempt", { candidates: normalized });
  const bossCandidate = bossPhone ? candidates.find(function(ev) {
    return TLW_normalizePhone_(String(ev && ev.from || "").trim()) === bossPhone;
  }) : null;
  const msg = bossCandidate || candidates.find(ev => {
    const text = String(ev.text || "").trim().toLowerCase();
    return TL_Menu_ShouldHandleText_(String(ev.from || "").trim(), text);
  });
  if (!msg) {
    TLW_logInfo_("menu_match_none", {
      candidates: normalized.length,
      boss_phone: bossPhone,
      candidate_froms: normalized.map(function(item) { return TLW_normalizePhone_(item.from || ""); })
    });
    return null;
  }

  TLW_logInfo_("menu_match_selected", {
    from: msg.from || "",
    msg_id: msg.message_id || "",
    text: String(msg.text || "").trim()
  });

  const enriched = TLW_enrichEvent_(msg, new Date());
  let inboxRow = null;
  if (enriched) {
    if (TLW_isDuplicate_(enriched)) {
      const existing = TLW_findRowByMessageId_(enriched.phone_number_id || "", enriched.message_id || "");
      if (existing) inboxRow = { row: existing.row };
    } else {
      const appended = TLW_appendInboxRow_(enriched, "");
      if (appended) {
        inboxRow = { row: appended.row };
        TLW_tryApplyCachedStatuses_(enriched.phone_number_id || "", enriched.message_id || "", appended.row);
      }
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

  if (inboxRow && inboxRow.row) {
    TLW_markInterfaceHandledRow_(inboxRow.row, "menu_text", String(msg.text || "").trim());
  }

  const normalizedText = String(msg.text || "").trim().toLowerCase();
  const isExplicitTrigger = TL_MENU && TL_MENU.TRIGGERS && TL_MENU.TRIGGERS.some(function(t) {
    return normalizedText === String(t || "").trim().toLowerCase();
  });
  const fallbackReply = isExplicitTrigger
    ? (TL_MENU && TL_MENU.HELP_TRIGGERS && TL_MENU.HELP_TRIGGERS.some(function(t) {
        return normalizedText === String(t || "").trim().toLowerCase();
      }) ? TL_Menu_BuildHelpMenu_() : TL_Menu_BuildMenuReply_())
    : "";
  const finalReplyText = replyText === null || typeof replyText === "undefined"
    ? String(fallbackReply || "")
    : String(replyText);

  if (!finalReplyText) {
    TLW_logInfo_("menu_reply_empty", {
      from: msg.from || "",
      msg_id: msg.message_id || "",
      text: String(msg.text || "").trim()
    });
    return null;
  }
  const toPhoneId = msg.phone_number_id || TLW_getSetting_("BUSINESS_PHONE_ID") || TLW_getSetting_("BUSINESS_PHONEID") || TLW_getSetting_("BUSINESS_PHONE");
  TLW_logInfo_("menu_reply_ready", {
    to: msg.from || "",
    msg_id: msg.message_id || "",
    text: String(msg.text || "").trim()
  });
  return { toSend: true, toPhoneId, toWaId: msg.from, text: finalReplyText, messageId: String(msg.message_id || "").trim() };
}

function TLW_markInterfaceHandledRow_(rowNumber, kind, textValue) {
  try {
    const row = Number(rowNumber || 0);
    if (!row || typeof TL_AI_getInboxRow_ !== "function" || typeof TL_Orchestrator_updateRowFields_ !== "function") return false;
    const loc = TL_AI_getInboxRow_(row);
    if (!loc || !loc.values) return false;
    const notes = typeof TL_Capture_appendNote_ === "function"
      ? TL_Capture_appendNote_(loc.values, [
          "menu_interface_handled=true",
          "menu_interface_kind=" + String(kind || "menu").replace(/[;\n]+/g, "_"),
          "menu_interface_text=" + String(textValue || "").replace(/\n+/g, " ").replace(/[;]+/g, ",")
        ].join(";"))
      : String(TL_Orchestrator_value_(loc.values, "notes") || "");
    TL_Orchestrator_updateRowFields_(row, {
      notes: notes,
      execution_status: "interface_handled"
    }, "menu_interface");
    return true;
  } catch (e) {
    TLW_logInfo_("menu_interface_mark_error", {
      row: Number(rowNumber || 0),
      err: String(e && e.stack ? e.stack : e)
    });
    return false;
  }
}

function TLW_tryBossMenuFromTextRow_(enriched, appendedRow, options) {
  try {
    if (!enriched || !appendedRow || !appendedRow.row) return null;
    if (String(enriched.direction || "").trim().toLowerCase() !== "incoming") return null;
    const recordClass = String(enriched.record_class || "").trim().toLowerCase();
    if (recordClass !== "communication" && recordClass !== "interface") return null;
    if (String(enriched.message_type || "").trim().toLowerCase() !== "text") return null;

    const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
    const sender = TLW_normalizePhone_(enriched.sender || enriched.from || "");
    if (!bossPhone || sender !== bossPhone) return null;

    const inputText = String(enriched.text || "").trim();
    if (!inputText) return null;

    TLW_logInfo_("menu_text_fallback_selected", {
      row: appendedRow.row,
      from: sender,
      msg_id: String(enriched.message_id || ""),
      text: inputText,
      state: typeof TL_Menu_GetState_ === "function" ? TL_Menu_GetState_(sender) : ""
    });

    const replyText = TL_Menu_HandleBossMessage_({
      from: sender,
      text: inputText,
      recipient_id: String(enriched.receiver || "").trim(),
      phone_number_id: String(enriched.phone_number_id || "").trim()
    }, {
      row: appendedRow.row
    }, Object.assign({}, options && options.menuOptions ? options.menuOptions : {}));

    const normalizedText = inputText.toLowerCase();
    const isExplicitTrigger = (typeof TL_Menu_IsMenuCommand_ === "function" && TL_Menu_IsMenuCommand_(normalizedText)) ||
      (typeof TL_Menu_IsHelpCommand_ === "function" && TL_Menu_IsHelpCommand_(normalizedText));
    const fallbackReply = isExplicitTrigger
      ? ((typeof TL_Menu_IsHelpCommand_ === "function" && TL_Menu_IsHelpCommand_(normalizedText))
          ? TL_Menu_BuildHelpMenu_()
          : TL_Menu_BuildMenuReply_())
      : "";
    const finalReplyText = replyText === null || typeof replyText === "undefined"
      ? String(fallbackReply || "")
      : String(replyText);

    if (!finalReplyText) {
      TLW_markInterfaceHandledRow_(appendedRow.row, "boss_text_ignored", inputText);
      TLW_logInfo_("menu_text_fallback_empty", {
        row: appendedRow.row,
        from: sender,
        msg_id: String(enriched.message_id || ""),
        text: inputText
      });
      return { consumed: true, sent: false, text: "" };
    }

    TLW_markInterfaceHandledRow_(appendedRow.row, "menu_text", inputText);
    const textMessageId = String(enriched.message_id || "").trim();
    if (TLW_claimReplySend_("menu_text", textMessageId)) {
      TLW_logInfo_("menu_text_fallback_deduped", {
        row: appendedRow.row,
        to: sender,
        msg_id: textMessageId
      });
      return { consumed: true, sent: false, deduped: true, text: finalReplyText };
    }
    const toPhoneId = String(enriched.phone_number_id || "").trim() ||
      TLW_getSetting_("BUSINESS_PHONE_ID") ||
      TLW_getSetting_("BUSINESS_PHONEID") ||
      TLW_getSetting_("BUSINESS_PHONE");
    const sent = TLW_sendText_(toPhoneId, sender, finalReplyText);
    if (!(sent && sent.ok)) TLW_releaseReplySend_("menu_text", textMessageId);
    TLW_logInfo_("menu_text_fallback_reply", {
      row: appendedRow.row,
      to: sender,
      msg_id: textMessageId,
      ok: !!(sent && sent.ok),
      status: sent && sent.status ? sent.status : "",
      text: inputText
    });
    return {
      consumed: true,
      sent: !!(sent && sent.ok),
      response: sent,
      text: finalReplyText
    };
  } catch (err) {
    TLW_logInfo_("menu_text_fallback_error", {
      row: appendedRow && appendedRow.row ? appendedRow.row : "",
      message_id: enriched && enriched.message_id ? enriched.message_id : "",
      err: String(err && err.stack ? err.stack : err)
    });
    return {
      consumed: false,
      sent: false,
      err: String(err && err.stack ? err.stack : err)
    };
  }
}

function TLW_tryBossMenuFromInboxRow_(enriched, appendedRow, options) {
  try {
    if (!enriched || !appendedRow || !appendedRow.row) return null;
    if (String(enriched.direction || "").trim().toLowerCase() !== "incoming") return null;
    const recordClass = String(enriched.record_class || "").trim().toLowerCase();
    if (recordClass !== "communication" && recordClass !== "interface") return null;

    const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
    const sender = TLW_normalizePhone_(enriched.sender || enriched.from || "");
    if (!bossPhone || sender !== bossPhone) return null;

    const loc = typeof TL_AI_getInboxRow_ === "function" ? TL_AI_getInboxRow_(appendedRow.row) : null;
    if (!loc || !loc.values) return null;

    const messageType = String(loc.values[TLW_colIndex_("message_type") - 1] || "").trim().toLowerCase();
    const isVoice = String(loc.values[TLW_colIndex_("media_is_voice") - 1] || "").trim().toLowerCase() === "true";
    if (!(messageType === "voice" || (messageType === "audio" && isVoice) || isVoice)) return null;

    const inputText = String(loc.values[TLW_colIndex_("text") - 1] || "").trim();
    if (!inputText) return null;

    const normalizedText = inputText.toLowerCase();
    let shouldHandle = false;
    if (options && typeof options.shouldHandleFn === "function") {
      shouldHandle = !!options.shouldHandleFn(sender, inputText);
    } else {
      const explicitMenuTrigger = TL_MENU && TL_MENU.TRIGGERS && TL_MENU.TRIGGERS.some(function(t) {
        return normalizedText === String(t || "").trim().toLowerCase();
      });
      const explicitCostTrigger = TL_MENU && TL_MENU.COST_TRIGGERS && TL_MENU.COST_TRIGGERS.some(function(t) {
        return normalizedText === String(t || "").trim().toLowerCase();
      });
      if (explicitMenuTrigger || explicitCostTrigger ||
          (typeof TL_Menu_IsAiCostQuery_ === "function" && TL_Menu_IsAiCostQuery_(inputText)) ||
          (typeof TL_Menu_HasActiveFlow_ === "function" && TL_Menu_HasActiveFlow_(sender))) {
        shouldHandle = true;
      }
    }
    if (!shouldHandle) return null;

    TLW_logInfo_("menu_voice_match_selected", {
      row: appendedRow.row,
      from: sender,
      msg_id: String(enriched.message_id || ""),
      text: inputText,
      state: typeof TL_Menu_GetState_ === "function" ? TL_Menu_GetState_(sender) : ""
    });

    const replyText = TL_Menu_HandleBossMessage_({
      from: sender,
      text: inputText,
      recipient_id: String(enriched.receiver || "").trim(),
      phone_number_id: String(enriched.phone_number_id || "").trim()
    }, {
      row: appendedRow.row
    }, Object.assign({}, options && options.menuOptions ? options.menuOptions : {}));

    TLW_markInterfaceHandledRow_(appendedRow.row, "menu_voice", inputText);

    const isExplicitTrigger = TL_MENU && TL_MENU.TRIGGERS && TL_MENU.TRIGGERS.some(function(t) {
      return normalizedText === String(t || "").trim().toLowerCase();
    });
    const fallbackReply = isExplicitTrigger
      ? (TL_MENU && TL_MENU.HELP_TRIGGERS && TL_MENU.HELP_TRIGGERS.some(function(t) {
          return normalizedText === String(t || "").trim().toLowerCase();
        }) ? TL_Menu_BuildHelpMenu_() : TL_Menu_BuildMenuReply_())
      : "";
    const finalReplyText = replyText === null || typeof replyText === "undefined"
      ? String(fallbackReply || "")
      : String(replyText);
    if (!finalReplyText) {
      TLW_logInfo_("menu_voice_reply_empty", {
        row: appendedRow.row,
        from: sender,
        msg_id: String(enriched.message_id || ""),
        text: inputText
      });
      return null;
    }

    const toPhoneId = String(enriched.phone_number_id || "").trim() ||
      TLW_getSetting_("BUSINESS_PHONE_ID") ||
      TLW_getSetting_("BUSINESS_PHONEID") ||
      TLW_getSetting_("BUSINESS_PHONE");
    const voiceMessageId = String(enriched.message_id || "").trim();
    if (TLW_claimReplySend_("menu_voice", voiceMessageId)) {
      TLW_logInfo_("menu_voice_reply_deduped", {
        row: appendedRow.row,
        to: sender,
        msg_id: voiceMessageId
      });
      return { sent: false, deduped: true, text: finalReplyText };
    }
    const sent = TLW_sendText_(toPhoneId, sender, finalReplyText);
    if (!(sent && sent.ok)) TLW_releaseReplySend_("menu_voice", voiceMessageId);
    TLW_logInfo_("menu_voice_reply_ready", {
      row: appendedRow.row,
      to: sender,
      msg_id: voiceMessageId,
      ok: !!(sent && sent.ok),
      status: sent && sent.status ? sent.status : "",
      text: inputText
    });
    return {
      sent: !!(sent && sent.ok),
      response: sent,
      text: finalReplyText
    };
  } catch (err) {
    TLW_logInfo_("menu_voice_error", {
      row: appendedRow && appendedRow.row ? appendedRow.row : "",
      message_id: enriched && enriched.message_id ? enriched.message_id : "",
      err: String(err && err.stack ? err.stack : err)
    });
    return null;
  }
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
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const normalizedContactNumber = TLW_normalizePhone_(contactNumber);
  const isBossInbound = direction === "incoming" && !!bossPhone && normalizedContactNumber === bossPhone;
  const contactName = String(ev.contact_name || "").trim();

  // sender/receiver normalization
  let sender = baseSender;
  let receiver = "";
  if (direction === "incoming") {
    sender = contactNumber;
    receiver = String(ev.display_phone_number || "");
  } else {
    sender = String(ev.display_phone_number || ""); // business
    receiver = contactNumber || TLW_resolveOutgoingReceiverFallback_(phoneId, msgId, baseRecipient, ev.text || "", ts);
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
    record_class: (eventType === "statuses") ? "status" : (isBossInbound ? "interface" : "communication"),
    channel: channel,
    direction: (eventType === "statuses") ? "status" : direction,
    phone_number_id: phoneId,
    display_phone_number: String(ev.display_phone_number || ""),
    sender: sender,
    receiver: receiver,
    message_id: msgId,
    message_type: String(ev.message_type || ""),
    text: String(ev.text || ""),
    activity_kind: isBossInbound ? "assistant_command" : String(ev.message_type || ""),
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
    notes: [
      isBossInbound ? "assistant_interface=true" : "",
      contactName ? ("wa_contact_name=" + contactName.replace(/\n+/g, " ").replace(/[;]+/g, ",")) : ""
    ].filter(Boolean).join(";"),
    task_due: "",
    task_status: "",
    task_priority: "",
    topic_id: topicId,
    topic_tagged_at: nowIso,
    biz_stage: "",
    biz_stage_ts: "",
    payment_status: "",
    delivery_due: "",
    media_id: String(ev.media_id || ""),
    media_mime_type: String(ev.media_mime_type || ""),
    media_sha256: String(ev.media_sha256 || ""),
    media_caption: String(ev.media_caption || ""),
    media_filename: String(ev.media_filename || ""),
    media_is_voice: !!ev.media_is_voice,
    priority_level: "",
    importance_level: "",
    urgency_flag: "",
    needs_owner_now: "",
    suggested_action: "",
    thread_id: "",
    thread_subject: "",
    latest_message_at: "",
    external_url: "",
    participants_json: "",
    capture_language: "",
    conversation_domain: isBossInbound ? "assistant" : ""
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

  const normalized = typeof TL_Activity_normalizeRowObject_ === "function"
    ? TL_Activity_normalizeRowObject_(Object.assign({}, obj || {}, {
      raw_payload_ref: String((obj && obj.raw_payload_ref) || "") || rawJson
    }))
    : Object.assign({}, obj || {});
  const row = TL_WEBHOOK.INBOX_HEADERS.map(function(header) {
    if (header === "timestamp") return normalized.timestamp || new Date();
    if (header === "record_version") return Number(normalized.record_version || 1);
    if (header === "statuses_count") return Number(normalized.statuses_count || 0);
    if (header === "media_is_voice") return String(normalized.media_is_voice || "").trim().toLowerCase() === "true" ? "true" : "false";
    return normalized[header] !== undefined && normalized[header] !== null ? normalized[header] : "";
  });

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
    const phoneCol = TLW_colIndex_("phone_number_id");
    const msgCol = TLW_colIndex_("message_id");
    const width = msgCol - phoneCol + 1;
    const values = sh.getRange(start, phoneCol, count, width).getValues();
    values.forEach(r => {
      const phoneId = String(r[0]||"").trim();
      const msgId = String(r[width - 1]||"").trim();
      if (msgId) set.add(phoneId + "|" + msgId);
    });
  } catch (e) {}
  return set;
}

function TLW_upsertStatus_(ev, rawJson) {
  const messageId = String(ev.message_id || "");
  if (!messageId) return false;

  const loc = TLW_findRowByMessageId_(ev.phone_number_id || "", messageId);
  if (!loc) {
    return TLW_cacheLateStatus_(ev, rawJson);
  }

  const { sh, row } = loc;
  const countCol = TLW_colIndex_("statuses_count");
  const latestCol = TLW_colIndex_("status_latest");
  const tsCol = TLW_colIndex_("status_timestamp");
  const rawCol = TLW_colIndex_("raw_payload_ref");
  const current = Number(sh.getRange(row, countCol).getValue() || 0);
  sh.getRange(row, latestCol).setValue(String(ev.message_type || ""));
  sh.getRange(row, tsCol).setValue(String(ev.status_timestamp || ""));
  sh.getRange(row, countCol).setValue(current + 1);
  sh.getRange(row, rawCol).setValue(rawJson);
  TLW_applyVersionBump_(row, "status_merge");
  TLW_logDebug_("status_merge", { phone: ev.phone_number_id, msg: messageId, row });
  return true;
}

function TLW_cacheLateStatus_(ev, rawJson) {
  if (String(TLW_getSetting_("status_cache_enabled") || "true").trim().toLowerCase() !== "true") {
    TLW_logInfo_("status_cache_disabled", { phone: ev.phone_number_id, msg: ev.message_id });
    return false;
  }

  const key = TLW_lateStatusCacheKey_(ev.phone_number_id, ev.message_id);
  const payload = TLW_safeStringify_({
    phone_number_id: String(ev.phone_number_id || ""),
    message_id: String(ev.message_id || ""),
    status_latest: String(ev.message_type || ""),
    status_timestamp: String(ev.status_timestamp || ""),
    raw_payload_ref: rawJson
  }, 8000);

  const existing = TLW_getLateStatusCacheMap_().get(key) || [];
  existing.push(payload);
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(existing));
  TLW_logInfo_("status_cached", { phone: ev.phone_number_id, msg: ev.message_id, count: existing.length });
  return false;
}

function TLW_tryApplyCachedStatuses_(phoneId, messageId, rowNumber) {
  const key = TLW_lateStatusCacheKey_(phoneId, messageId);
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return 0;

  let cached = [];
  try {
    cached = JSON.parse(raw);
  } catch (e) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    return 0;
  }
  if (!cached.length) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    return 0;
  }

  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return 0;

  let applied = 0;
  cached.forEach(item => {
    let payload = null;
    try {
      payload = JSON.parse(item);
    } catch (e) {
      return;
    }
    if (!payload) return;
    const countCol = TLW_colIndex_("statuses_count");
    const latestCol = TLW_colIndex_("status_latest");
    const tsCol = TLW_colIndex_("status_timestamp");
    const rawCol = TLW_colIndex_("raw_payload_ref");
    const current = Number(sh.getRange(rowNumber, countCol).getValue() || 0);
    sh.getRange(rowNumber, latestCol).setValue(String(payload.status_latest || ""));
    sh.getRange(rowNumber, tsCol).setValue(String(payload.status_timestamp || ""));
    sh.getRange(rowNumber, countCol).setValue(current + 1);
    sh.getRange(rowNumber, rawCol).setValue(String(payload.raw_payload_ref || ""));
    TLW_applyVersionBump_(rowNumber, "late_status_repair");
    applied++;
  });

  PropertiesService.getScriptProperties().deleteProperty(key);
  if (applied) {
    TLW_logInfo_("status_cache_repaired", { phone: phoneId, msg: messageId, row: rowNumber, applied: applied });
  }
  return applied;
}

function TLW_lateStatusCacheKey_(phoneId, messageId) {
  return "TL_LATE_STATUS_" + String(phoneId || "").trim() + "_" + String(messageId || "").trim();
}

function TLW_getLateStatusCacheMap_() {
  const out = new Map();
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(key => {
    if (key.indexOf("TL_LATE_STATUS_") === 0) {
      try {
        out.set(key, JSON.parse(all[key]));
      } catch (e) {
        out.set(key, []);
      }
    }
  });
  return out;
}

function TLW_resolveOutgoingReceiverFallback_(phoneId, msgId, baseRecipient, text, ts) {
  if (baseRecipient) return String(baseRecipient || "");
  const inferred = TLW_findRecentContactByContext_(phoneId, text, ts);
  if (inferred) return inferred;
  const existing = TLW_findRowByMessageId_(phoneId, msgId);
  if (existing) return String(existing.sh.getRange(existing.row, TLW_colIndex_("receiver")).getValue() || "");
  return "";
}

function TLW_findRecentContactByContext_(phoneId, text, ts) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
    if (!sh) return "";
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return "";
    const start = Math.max(2, lastRow - TL_WEBHOOK.MAX_IDEMPOTENCY_SCAN_ROWS + 1);
    const count = lastRow - start + 1;
    const vals = sh.getRange(start, 1, count, TL_WEBHOOK.INBOX_HEADERS.length).getValues();
    const normalizedText = String(text || "").trim().toLowerCase();
    const cutoff = ts ? new Date(ts.getTime() - 2 * 60 * 60 * 1000) : null;
    let fallbackContact = "";
    for (let i = vals.length - 1; i >= 0; i--) {
      const row = vals[i];
      if (String(row[TLW_colIndex_("phone_number_id") - 1] || "").trim() !== String(phoneId || "")) continue;
      if (cutoff && row[0] instanceof Date && row[0] < cutoff) continue;
      const direction = String(row[TLW_colIndex_("direction") - 1] || "").trim().toLowerCase();
      const contact = direction === "incoming"
        ? String(row[TLW_colIndex_("sender") - 1] || "").trim()
        : String(row[TLW_colIndex_("receiver") - 1] || "").trim();
      if (!contact) continue;
      if (!fallbackContact) fallbackContact = contact;
      const candidateText = String(row[TLW_colIndex_("text") - 1] || "").trim().toLowerCase();
      if (!normalizedText || !candidateText || candidateText.indexOf(normalizedText) !== -1 || normalizedText.indexOf(candidateText) !== -1) {
        return contact;
      }
    }
    if (fallbackContact) return fallbackContact;
  } catch (e) {}
  return "";
}

function TLW_applyVersionBump_(rowNumber, reason) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
    if (!sh) return false;
    const current = Number(sh.getRange(rowNumber, TLW_colIndex_("record_version")).getValue() || 1);
    sh.getRange(rowNumber, TLW_colIndex_("record_version")).setValue(current + 1);
    sh.getRange(rowNumber, TLW_colIndex_("notes")).setValue(TLW_appendVersionNote_(String(sh.getRange(rowNumber, TLW_colIndex_("notes")).getValue() || ""), reason));
    return true;
  } catch (e) {
    return false;
  }
}

function TLW_appendVersionNote_(existing, reason) {
  const note = "record_version_bump=" + String(reason || "state_change");
  return existing ? (existing + "\n" + note) : note;
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
    const phoneCol = TLW_colIndex_("phone_number_id");
    const msgCol = TLW_colIndex_("message_id");
    const width = msgCol - phoneCol + 1;
    const ids = sh.getRange(start, phoneCol, count, width).getValues();

    // search from newest to oldest for speed
    for (let i = ids.length - 1; i >= 0; i--) {
      const pId = String(ids[i][0]||"").trim();
      const mId = String(ids[i][width - 1]||"").trim();
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

function TLW_findRowByRecordId_(recordId) {
  try {
    const key = String(recordId || "").trim();
    if (!key) return null;
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
    if (!sh) return null;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return null;

    const col = TLW_colIndex_("record_id");
    const finder = sh.getRange(2, col, lastRow - 1, 1).createTextFinder(key).matchEntireCell(true).findAll();
    if (!finder || !finder.length) return null;
    const cell = finder[finder.length - 1];
    return { sh, row: cell.getRow() };
  } catch (e) {}
  return null;
}

function TLW_replySendKey_(scope, messageId) {
  const safeScope = String(scope || "").trim();
  const safeMessageId = String(messageId || "").trim();
  if (!safeScope || !safeMessageId) return "";
  return "TL_REPLY_SENT_" + safeScope + "_" + safeMessageId;
}

function TLW_claimReplySend_(scope, messageId) {
  const key = TLW_replySendKey_(scope, messageId);
  if (!key) return false;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(key)) return true;
    props.setProperty(key, String(Date.now()));
    return false;
  } finally {
    lock.releaseLock();
  }
}

function TLW_releaseReplySend_(scope, messageId) {
  const key = TLW_replySendKey_(scope, messageId);
  if (!key) return false;
  try {
    PropertiesService.getScriptProperties().deleteProperty(key);
    return true;
  } catch (e) {
    return false;
  }
}

function TLW_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj||{})).setMimeType(ContentService.MimeType.JSON);
}

function TLW_normalizePhone_(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function TLW_normalizeSettingKey_(key) {
  return String(key || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function TLW_getSetting_(key) {
  const rawKey = String(key || "").trim();
  const normalizedKey = TLW_normalizeSettingKey_(rawKey);
  if (!normalizedKey) return "";

  try {
    const props = PropertiesService.getScriptProperties().getProperties();
    const propKeys = Object.keys(props || {});
    for (let i = 0; i < propKeys.length; i++) {
      const candidateKey = propKeys[i];
      if (TLW_normalizeSettingKey_(candidateKey) === normalizedKey) {
        return String(props[candidateKey] || "").trim();
      }
    }
  } catch (e) {}

  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName("SETTINGS");
    if (!sh) return "";
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return "";
    const vals = sh.getRange(2, 1, lastRow - 1, 2).getValues(); // key,value
    for (let i = 0; i < vals.length; i++) {
      if (TLW_normalizeSettingKey_(vals[i][0]) === normalizedKey) {
        return String(vals[i][1] || "").trim();
      }
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
    statuses_count: 0,
    media_id: "",
    media_mime_type: "",
    media_sha256: "",
    media_caption: "",
    media_filename: "",
    media_is_voice: false
  };
  const enriched = TLW_enrichEvent_(outgoingEvent, new Date());
  if (!enriched) return;
  if (TLW_isDuplicate_(enriched)) return;
  const appended = TLW_appendInboxRow_(enriched, TLW_safeStringify_({
    source: "TLW_sendText_",
    send_response: parsed.raw || String(responseBody || "")
  }, 4000));
  if (appended) {
    TLW_tryApplyCachedStatuses_(enriched.phone_number_id || "", enriched.message_id || "", appended.row);
  }
}

function TLW_sendText_(phoneNumberId, toWaId, text) {
  if (typeof TL_Automation_IsEnabled_ === "function" && !TL_Automation_IsEnabled_()) {
    const blocked = {
      ok: false,
      status: 0,
      body: "automation_disabled",
      blocked: true
    };
    TLW_logInfo_("send_blocked_automation_disabled", {
      to: String(toWaId || "").trim(),
      phone_id: String(phoneNumberId || "").trim(),
      text_preview: String(text || "").trim().slice(0, 120)
    });
    return blocked;
  }
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

function TLW_tryAutoVoiceTranscription_(enriched, appendedRow) {
  try {
    if (typeof TL_AI_TranscribeInboxRow_ !== "function") return;
    if (!enriched || !appendedRow || !appendedRow.row) return;
    if (String(TLW_getSetting_("ai_voice_transcription") || "").trim().toLowerCase() !== "true") return;
    if (String(enriched.direction || "").trim().toLowerCase() !== "incoming") return;
    const recordClass = String(enriched.record_class || "").trim().toLowerCase();
    if (recordClass !== "communication" && recordClass !== "interface") return;
    if (!String(enriched.media_id || "").trim()) return;

    const messageType = String(enriched.message_type || "").trim().toLowerCase();
    const isVoice = !!enriched.media_is_voice;
    if (!(messageType === "voice" || (messageType === "audio" && isVoice) || isVoice)) return;

    const result = TL_AI_TranscribeInboxRow_(appendedRow.row);
    TLW_logInfo_("ai_voice_transcription_auto", {
      row: appendedRow.row,
      media_id: enriched.media_id,
      summary: result && result.summary ? result.summary : ""
    });
  } catch (err) {
    TLW_logInfo_("ai_voice_transcription_error", {
      row: appendedRow && appendedRow.row ? appendedRow.row : "",
      message_id: enriched && enriched.message_id ? enriched.message_id : "",
      err: String(err && err.stack ? err.stack : err)
    });
  }
}

function TLW_tryAutoAiTriage_(enriched, appendedRow) {
  try {
    if (typeof TL_AI_TriageInboxRow_ !== "function") return;
    if (!enriched || !appendedRow || !appendedRow.row) return;
    if (String(TLW_getSetting_("ai_summary_enabled") || "").trim().toLowerCase() !== "true") return;
    if (String(enriched.direction || "").trim().toLowerCase() !== "incoming") return;
    if (String(enriched.record_class || "").trim().toLowerCase() !== "communication") return;
    if (TLW_normalizePhone_(enriched.sender || enriched.from || "") === TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "")) return;
    if (typeof TL_AI_ShouldDeferRawWhatsAppTriage_ === "function" &&
        TL_AI_ShouldDeferRawWhatsAppTriage_(enriched.channel, enriched.direction, enriched.record_class)) {
      TLW_logInfo_("ai_triage_auto_deferred", {
        row: appendedRow.row,
        message_id: enriched.message_id || "",
        reason: "await_group_synthesis"
      });
      return;
    }

    const result = TL_AI_TriageInboxRow_(appendedRow.row);
    if (result && result.skipped) {
      TLW_logInfo_("ai_triage_auto_deferred", {
        row: appendedRow.row,
        message_id: enriched.message_id || "",
        reason: result.reason || "deferred"
      });
      return;
    }
    TLW_logInfo_("ai_triage_auto", {
      row: appendedRow.row,
      message_id: enriched.message_id || "",
      priority_level: result && result.priority_level ? result.priority_level : "",
      urgency_flag: result && result.urgency_flag ? result.urgency_flag : "",
      suggested_action: result && result.suggested_action ? result.suggested_action : ""
    });
  } catch (err) {
    TLW_logInfo_("ai_triage_error", {
      row: appendedRow && appendedRow.row ? appendedRow.row : "",
      message_id: enriched && enriched.message_id ? enriched.message_id : "",
      err: String(err && err.stack ? err.stack : err)
    });
  }
}

function TLW_tryAutoBossCapture_(enriched, appendedRow, options) {
  try {
    if (typeof TL_Capture_Run !== "function") return;
    if (!enriched || !appendedRow || !appendedRow.row) return;
    if (String(enriched.direction || "").trim().toLowerCase() !== "incoming") return;
    if (String(enriched.record_class || "").trim().toLowerCase() !== "communication") return;

    const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
    const sender = TLW_normalizePhone_(enriched.sender || enriched.from || "");
    if (!bossPhone || sender !== bossPhone) return;
    const menuState = typeof TL_Menu_GetState_ === "function"
      ? String(TL_Menu_GetState_(sender) || "root").trim()
      : "root";
    if (!(typeof TL_Menu_IsCaptureState_ === "function" && TL_Menu_IsCaptureState_(menuState))) {
      TLW_logInfo_("boss_capture_auto_blocked", {
        row: appendedRow.row,
        reason: "menu_capture_not_requested",
        menu_state: menuState
      });
      return;
    }

    const loc = typeof TL_AI_getInboxRow_ === "function" ? TL_AI_getInboxRow_(appendedRow.row) : null;
    if (!loc || !loc.values) return;

    const inputText = typeof TL_Capture_getInputText_ === "function" ? TL_Capture_getInputText_(loc.values) : "";
    const mediaId = String(loc.values[TLW_colIndex_("media_id") - 1] || "").trim();
    const messageType = String(loc.values[TLW_colIndex_("message_type") - 1] || "").trim().toLowerCase();
    const isVoice = String(loc.values[TLW_colIndex_("media_is_voice") - 1] || "").trim().toLowerCase() === "true";
    if (!inputText && !(mediaId && (messageType === "voice" || (messageType === "audio" && isVoice) || isVoice))) {
      return;
    }

    const captureOptions = Object.assign({}, (options && options.captureOptions) ? options.captureOptions : {}, {
      rows: [{
        rowNumber: appendedRow.row,
        values: loc.values
      }]
    });
    const result = TL_Capture_Run(1, captureOptions);
    TLW_logInfo_("boss_capture_auto", {
      row: appendedRow.row,
      message_id: enriched.message_id || "",
      captured: result && result.captured ? result.captured : 0,
      sent: result && result.sent ? result.sent : 0,
      packets: result && result.packets ? result.packets : 0
    });
    return result;
  } catch (err) {
    TLW_logInfo_("boss_capture_auto_error", {
      row: appendedRow && appendedRow.row ? appendedRow.row : "",
      message_id: enriched && enriched.message_id ? enriched.message_id : "",
      err: String(err && err.stack ? err.stack : err)
    });
    return {
      ok: false,
      err: String(err && err.stack ? err.stack : err)
    };
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
