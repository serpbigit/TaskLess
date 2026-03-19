/**
 * TL_AI - Gemini-compatible helpers for smoke tests, row proposals, and voice transcription.
 *
 * This does not auto-send anything. It calls the configured AI endpoint
 * and writes results back into INBOX only when explicitly invoked.
 */

function TL_AI_getConfig_() {
  const endpoint = String(TLW_getSetting_("API END POINT") || "").trim();
  const token = String(TLW_getSetting_("API TOKEN") || "").trim();
  const language = String(TLW_getSetting_("AI_DEFAULT_LANGUAGE") || "Hebrew").trim();
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "Reuven").trim();

  if (!endpoint) throw new Error("Missing SETTINGS value: API END POINT");
  if (!token) throw new Error("Missing SETTINGS value: API TOKEN");

  return {
    endpoint: endpoint,
    token: token,
    language: language,
    bossName: bossName
  };
}

function TL_AI_buildPrompt_(inputText, language, bossName) {
  return [
    "You are TaskLess, a business communication assistant.",
    "Return strict JSON only.",
    "Language: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Reuven"),
    "Required JSON shape:",
    '{"summary":"...","proposal":"..."}',
    "Example JSON response:",
    '{"summary":"לקוח מבקש לקבוע פגישה מחר בבוקר.","proposal":"שלום, אפשר לקבוע מחר בבוקר. אשמח אם תאשר שעה שנוחה לך."}',
    "The proposal should be a concise draft reply written on the Boss's behalf.",
    "User message:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildTriagePrompt_(inputText, language, bossName) {
  return [
    "You are Amanda, the TaskLess AI assistant for business communication triage.",
    "Analyze the incoming message and return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Reuven"),
    "Required JSON shape:",
    '{"priority_level":"low|medium|high","importance_level":"low|medium|high","urgency_flag":"true|false","needs_owner_now":"true|false","suggested_action":"reply_now|reply_later|call|schedule|follow_up|wait|ignore|review_manually","summary":"...","proposal":"..."}',
    "Example JSON response:",
    '{"priority_level":"high","importance_level":"high","urgency_flag":"true","needs_owner_now":"true","suggested_action":"reply_now","summary":"לקוח מבקש תשובה דחופה לגבי פגישה להיום.","proposal":"השב במהירות, אשר שקיבלת, והצע זמן סופי לפגישה."}',
    "Interpret urgency narrowly: only true when timing matters now or soon.",
    "Interpret importance as business relevance, money, reputation, commitment, or customer risk.",
    "Message:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildBossCapturePrompt_(inputText, language, bossName) {
  return [
    "You are TaskLess.",
    "Split one Boss capture into multiple proposed child records.",
    "Return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Reuven"),
    "Required JSON shape:",
    '{"summary":"...","items":[{"kind":"reminder|task|journal","title":"...","summary":"...","proposal":"...","task_due":"...","task_priority":"low|medium|high","approval_required":"true","notes":"..."}]}',
    "Example JSON response:",
    '{"summary":"הבוס נתן שלוש הנחיות: תזכורת, משימה ורישום ליומן.","items":[{"kind":"reminder","title":"לקחת תרופה בבוקר","summary":"תזכורת לקחת תרופה מחר בבוקר.","proposal":"לקבוע תזכורת למחר בבוקר לקחת תרופה.","task_due":"מחר בבוקר","task_priority":"high","approval_required":"true","notes":""},{"kind":"task","title":"להתקשר ליעקב","summary":"צריך להתקשר ליעקב.","proposal":"ליצור משימה להתקשר ליעקב.","task_due":"","task_priority":"medium","approval_required":"true","notes":""},{"kind":"journal","title":"לקחתי כדור בערב","summary":"נרשם ביומן שנלקח כדור בערב בשעה 22:00.","proposal":"לרשום ביומן: לקחתי כדור הערב בשעה 22:00.","task_due":"","task_priority":"low","approval_required":"true","notes":""}]}',
    "Rules:",
    "Emit one item per distinct intent.",
    "Keep reminder and task items concrete and actionable.",
    "Keep journal items factual and non-actionable.",
    "Use empty strings when a field is unknown.",
    "Always set approval_required to true.",
    "Capture text:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildTranscriptionPrompt_(language) {
  return [
    "You are TaskLess, a business communication assistant.",
    "Transcribe the provided audio.",
    "Return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "Required JSON shape:",
    '{"transcript":"...","summary":"..."}',
    "Example JSON response:",
    '{"transcript":"בוקר טוב, תזכירי לי להתקשר לרואה החשבון מחר.","summary":"הדובר מבקש תזכורת להתקשר לרואה החשבון מחר."}',
    "The transcript should preserve the spoken wording as closely as possible.",
    "The summary should be one short sentence."
  ].join("\n");
}

function TL_AI_parseResponseText_(bodyText) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(bodyText || "{}"));
  } catch (e) {
    throw new Error("AI response is not valid JSON: " + e.message);
  }

  const candidates = parsed && parsed.candidates ? parsed.candidates : [];
  if (!candidates.length) {
    throw new Error("AI response has no candidates");
  }

  const parts = (((candidates[0] || {}).content || {}).parts || []);
  const text = parts.map(p => String((p && p.text) || "")).join("").trim();
  if (!text) {
    throw new Error("AI response candidate is empty");
  }

  return text;
}

function TL_AI_parseJsonBlock_(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("AI text payload is empty");

  let jsonText = raw;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) jsonText = fenced[1].trim();

  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("AI text is not valid JSON: " + e.message + " :: " + jsonText.slice(0, 300));
  }

  return {
    summary: String(parsed.summary || "").trim(),
    proposal: String(parsed.proposal || "").trim(),
    raw: parsed
  };
}

function TL_AI_parseBossCaptureJson_(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("AI text payload is empty");

  let jsonText = raw;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) jsonText = fenced[1].trim();

  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("AI text is not valid JSON: " + e.message + " :: " + jsonText.slice(0, 300));
  }

  const items = Array.isArray(parsed.items) ? parsed.items.map(function(item) {
    return TL_AI_normalizeBossCaptureItem_(item);
  }).filter(function(item) {
    return !!item;
  }) : [];

  return {
    summary: String(parsed.summary || "").trim(),
    items: items,
    raw: parsed
  };
}

function TL_AI_call_(contents, generationConfig) {
  const cfg = TL_AI_getConfig_();
  const payload = {
    contents: contents,
    generationConfig: generationConfig || {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  };

  const res = UrlFetchApp.fetch(cfg.endpoint, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-goog-api-key": cfg.token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  const body = res.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("AI request failed: " + status + " :: " + body);
  }

  return {
    status: status,
    body: body
  };
}

function TL_AI_callPrompt_(promptText) {
  const res = TL_AI_call_([{
    role: "user",
    parts: [{ text: String(promptText || "") }]
  }], {
    temperature: 0.2,
    responseMimeType: "application/json"
  });

  const responseText = TL_AI_parseResponseText_(res.body);
  const parsed = TL_AI_parseJsonBlock_(responseText);

  return {
    ok: true,
    status: res.status,
    summary: parsed.summary,
    proposal: parsed.proposal,
    raw_text: responseText,
    raw_json: parsed.raw,
    response_body: res.body
  };
}

function TL_AI_ExtractBossCapture_(inputText) {
  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildBossCapturePrompt_(String(inputText || ""), cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);
  const parsed = TL_AI_parseBossCaptureJson_(result.raw_text);

  return {
    ok: true,
    status: result.status,
    summary: String(parsed.summary || result.summary || "").trim(),
    items: parsed.items,
    raw_text: result.raw_text,
    raw_json: parsed.raw,
    response_body: result.response_body
  };
}

function TL_AI_SmokeTest() {
  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildPrompt_(
    "לקוח כתב: האם אפשר לקבוע פגישה מחר ב-10:00?",
    cfg.language,
    cfg.bossName
  );
  const result = TL_AI_callPrompt_(prompt);
  TLW_logInfo_("ai_smoke_test", {
    status: result.status,
    summary: result.summary,
    proposal: result.proposal
  });
  Logger.log("TL_AI_SmokeTest: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_AI_CapabilitiesTest() {
  return TL_AI_TestPrompt(
    "What are your capabilities? Can you transcribe a media file, answer a general question, and search within a specific website?"
  );
}

function TL_AI_TestPrompt(promptText) {
  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildPrompt_(String(promptText || ""), cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);
  TLW_logInfo_("ai_test_prompt", {
    status: result.status,
    summary: result.summary,
    proposal: result.proposal
  });
  Logger.log("TL_AI_TestPrompt: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_AI_TestLatestIncoming() {
  const loc = TL_AI_findLatestIncomingRow_();
  if (!loc) throw new Error("No incoming communication row found in INBOX");

  const rowData = loc.values;
  const text = String(rowData[TLW_colIndex_("text") - 1] || "").trim();
  const messageType = String(rowData[TLW_colIndex_("message_type") - 1] || "").trim();
  const mediaCaption = String(rowData[TLW_colIndex_("media_caption") - 1] || "").trim();
  const inputText = text || mediaCaption || ("Incoming " + messageType + " message");

  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildPrompt_(inputText, cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);

  loc.sh.getRange(loc.row, TLW_colIndex_("ai_summary")).setValue(result.summary);
  loc.sh.getRange(loc.row, TLW_colIndex_("ai_proposal")).setValue(result.proposal);
  TLW_applyVersionBump_(loc.row, "ai_test_latest_incoming");

  TLW_logInfo_("ai_test_latest_incoming", {
    row: loc.row,
    message_type: messageType,
    summary: result.summary,
    proposal: result.proposal
  });

  Logger.log("TL_AI_TestLatestIncoming: %s", JSON.stringify({
    row: loc.row,
    message_type: messageType,
    summary: result.summary,
    proposal: result.proposal
  }, null, 2));

  return {
    ok: true,
    row: loc.row,
    message_type: messageType,
    input_text: inputText,
    summary: result.summary,
    proposal: result.proposal
  };
}

function TL_AI_TriageInboxRow_(rowNumber) {
  const loc = TL_AI_getInboxRow_(rowNumber);
  if (!loc) throw new Error("INBOX row not found: " + rowNumber);

  const rowData = loc.values;
  const inputText = TL_AI_getCanonicalInputText_(rowData);
  if (!inputText) throw new Error("Row has no usable input text for triage: " + rowNumber);

  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildTriagePrompt_(inputText, cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);

  const triage = {
    priority_level: TL_AI_normalizeLevel_(result.raw_json.priority_level),
    importance_level: TL_AI_normalizeLevel_(result.raw_json.importance_level),
    urgency_flag: TL_AI_normalizeBooleanString_(result.raw_json.urgency_flag),
    needs_owner_now: TL_AI_normalizeBooleanString_(result.raw_json.needs_owner_now),
    suggested_action: TL_AI_normalizeSuggestedAction_(result.raw_json.suggested_action),
    summary: String(result.raw_json.summary || result.summary || "").trim(),
    proposal: String(result.raw_json.proposal || result.proposal || "").trim()
  };

  loc.sh.getRange(loc.row, TLW_colIndex_("priority_level")).setValue(triage.priority_level);
  loc.sh.getRange(loc.row, TLW_colIndex_("importance_level")).setValue(triage.importance_level);
  loc.sh.getRange(loc.row, TLW_colIndex_("urgency_flag")).setValue(triage.urgency_flag);
  loc.sh.getRange(loc.row, TLW_colIndex_("needs_owner_now")).setValue(triage.needs_owner_now);
  loc.sh.getRange(loc.row, TLW_colIndex_("suggested_action")).setValue(triage.suggested_action);
  loc.sh.getRange(loc.row, TLW_colIndex_("ai_summary")).setValue(triage.summary);
  loc.sh.getRange(loc.row, TLW_colIndex_("ai_proposal")).setValue(triage.proposal);
  TLW_applyVersionBump_(loc.row, "ai_triage");

  TLW_logInfo_("ai_triage_row", {
    row: loc.row,
    priority_level: triage.priority_level,
    importance_level: triage.importance_level,
    urgency_flag: triage.urgency_flag,
    needs_owner_now: triage.needs_owner_now,
    suggested_action: triage.suggested_action
  });

  Logger.log("TL_AI_TriageInboxRow_: %s", JSON.stringify({
    row: loc.row,
    input_text: inputText,
    triage: triage
  }, null, 2));

  return Object.assign({ ok: true, row: loc.row, input_text: inputText }, triage);
}

function TL_AI_TriageLatestIncoming() {
  const loc = TL_AI_findLatestIncomingRow_();
  if (!loc) throw new Error("No incoming communication row found in INBOX");
  return TL_AI_TriageInboxRow_(loc.row);
}

function TL_AI_TranscribeLatestVoice() {
  const loc = TL_AI_findLatestVoiceRow_();
  if (!loc) throw new Error("No incoming voice row found in INBOX");
  return TL_AI_TranscribeInboxRow_(loc.row);
}

function TL_AI_TranscribeInboxRow_(rowNumber) {
  const loc = TL_AI_getInboxRow_(rowNumber);
  if (!loc) throw new Error("INBOX row not found: " + rowNumber);

  const rowData = loc.values;
  const messageType = String(rowData[TLW_colIndex_("message_type") - 1] || "").trim().toLowerCase();
  const mediaId = String(rowData[TLW_colIndex_("media_id") - 1] || "").trim();
  const phoneId = String(rowData[TLW_colIndex_("phone_number_id") - 1] || "").trim();
  const existingText = String(rowData[TLW_colIndex_("text") - 1] || "").trim();
  const existingNotes = String(rowData[TLW_colIndex_("notes") - 1] || "").trim();
  const isVoice = String(rowData[TLW_colIndex_("media_is_voice") - 1] || "").trim().toLowerCase() === "true";

  if (!mediaId) throw new Error("Row has no media_id: " + rowNumber);
  if (!(messageType === "voice" || (messageType === "audio" && isVoice) || isVoice)) {
    throw new Error("Row is not a voice note: " + rowNumber + " (" + messageType + ")");
  }

  const media = TL_AI_downloadMetaMedia_(mediaId, phoneId);
  const transcript = TL_AI_TranscribeAudioBlob_(media.blob, media.mimeType || media.info.mime_type || "audio/ogg");

  const finalText = transcript.transcript || existingText;
  const noteLines = [
    "voice_transcription_status=ok",
    "voice_transcription_mime_type=" + String(media.mimeType || ""),
    "voice_transcription_bytes=" + String(media.sizeBytes || 0)
  ];
  const mergedNotes = existingNotes
    ? (existingNotes + "\n" + noteLines.join("\n"))
    : noteLines.join("\n");

  loc.sh.getRange(loc.row, TLW_colIndex_("text")).setValue(finalText);
  loc.sh.getRange(loc.row, TLW_colIndex_("ai_summary")).setValue(transcript.summary);
  loc.sh.getRange(loc.row, TLW_colIndex_("notes")).setValue(mergedNotes);
  TLW_applyVersionBump_(loc.row, "voice_transcription");

  TLW_logInfo_("ai_voice_transcribed", {
    row: loc.row,
    media_id: mediaId,
    mime_type: media.mimeType,
    bytes: media.sizeBytes,
    transcript_preview: finalText.slice(0, 200),
    summary: transcript.summary
  });

  Logger.log("TL_AI_TranscribeInboxRow_: %s", JSON.stringify({
    row: loc.row,
    media_id: mediaId,
    mime_type: media.mimeType,
    transcript: finalText,
    summary: transcript.summary
  }, null, 2));

  return {
    ok: true,
    row: loc.row,
    media_id: mediaId,
    mime_type: media.mimeType,
    transcript: finalText,
    summary: transcript.summary
  };
}

function TL_AI_TranscribeAudioBlob_(blob, mimeType) {
  if (!blob) throw new Error("Missing audio blob");
  const bytes = blob.getBytes();
  if (!bytes || !bytes.length) throw new Error("Audio blob is empty");

  // Gemini inline audio requests should stay well below the 20 MB total request limit.
  if (bytes.length > 18 * 1024 * 1024) {
    throw new Error("Audio too large for inline transcription; add Files API upload flow");
  }

  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildTranscriptionPrompt_(cfg.language);
  const res = TL_AI_call_([{
    role: "user",
    parts: [
      { text: prompt },
      {
        inlineData: {
          mimeType: String(mimeType || "audio/ogg"),
          data: Utilities.base64Encode(bytes)
        }
      }
    ]
  }], {
    temperature: 0.1,
    responseMimeType: "application/json"
  });

  const responseText = TL_AI_parseResponseText_(res.body);
  const parsed = TL_AI_parseJsonBlock_(responseText);

  return {
    ok: true,
    status: res.status,
    transcript: String(parsed.raw.transcript || "").trim(),
    summary: String(parsed.raw.summary || "").trim(),
    raw_text: responseText,
    raw_json: parsed.raw,
    response_body: res.body
  };
}

function TL_AI_fetchMetaMediaInfo_(mediaId, phoneNumberId) {
  const token = TLW_getMetaAccessToken_();
  if (!token) throw new Error("Missing Meta access token for media retrieval");

  let url = "https://graph.facebook.com/v19.0/" + encodeURIComponent(String(mediaId || "").trim());
  if (phoneNumberId) {
    url += "?phone_number_id=" + encodeURIComponent(String(phoneNumberId || "").trim());
  }

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const status = res.getResponseCode();
  const body = res.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("Meta media info request failed: " + status + " :: " + body);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error("Meta media info is not valid JSON: " + e.message);
  }

  return parsed;
}

function TL_AI_downloadMetaMedia_(mediaId, phoneNumberId) {
  const info = TL_AI_fetchMetaMediaInfo_(mediaId, phoneNumberId);
  const mediaUrl = String(info.url || "").trim();
  if (!mediaUrl) throw new Error("Meta media info missing url");

  const token = TLW_getMetaAccessToken_();
  const res = UrlFetchApp.fetch(mediaUrl, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + token
    }
  });

  const status = res.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Meta media download failed: " + status + " :: " + res.getContentText());
  }

  const blob = res.getBlob();
  return {
    info: info,
    blob: blob,
    mimeType: String(blob.getContentType() || info.mime_type || "").trim(),
    sizeBytes: blob.getBytes().length
  };
}

function TL_AI_findLatestIncomingRow_() {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const width = TL_WEBHOOK.INBOX_HEADERS.length;
  for (let row = lastRow; row >= 2; row--) {
    const values = sh.getRange(row, 1, 1, width).getValues()[0];
    const direction = String(values[TLW_colIndex_("direction") - 1] || "").trim().toLowerCase();
    const recordClass = String(values[TLW_colIndex_("record_class") - 1] || "").trim().toLowerCase();
    if (direction === "incoming" && recordClass === "communication") {
      return { sh: sh, row: row, values: values };
    }
  }

  return null;
}

function TL_AI_getCanonicalInputText_(rowData) {
  const text = String(rowData[TLW_colIndex_("text") - 1] || "").trim();
  const messageType = String(rowData[TLW_colIndex_("message_type") - 1] || "").trim();
  const mediaCaption = String(rowData[TLW_colIndex_("media_caption") - 1] || "").trim();
  return text || mediaCaption || ("Incoming " + messageType + " message");
}

function TL_AI_normalizeLevel_(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

function TL_AI_normalizeBooleanString_(value) {
  const v = String(value || "").trim().toLowerCase();
  return (v === "true" || v === "yes" || v === "1") ? "true" : "false";
}

function TL_AI_normalizeSuggestedAction_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["reply_now","reply_later","call","schedule","follow_up","wait","ignore","review_manually"];
  return allowed.indexOf(v) !== -1 ? v : "review_manually";
}

function TL_AI_normalizeBossCaptureKind_(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "reminder") return "reminder";
  if (v === "task") return "task";
  if (v === "journal" || v === "log" || v === "note") return "journal";
  return "journal";
}

function TL_AI_normalizeBossCaptureItem_(item) {
  if (!item || typeof item !== "object") return null;
  const kind = TL_AI_normalizeBossCaptureKind_(item.kind);
  const title = String(item.title || "").trim();
  const summary = String(item.summary || title || "").trim();
  const proposal = String(item.proposal || summary || title || "").trim();
  const taskDue = String(item.task_due || "").trim();
  const taskPriority = TL_AI_normalizeLevel_(item.task_priority);
  const notes = String(item.notes || "").trim();
  return {
    kind: kind,
    title: title,
    summary: summary,
    proposal: proposal,
    task_due: taskDue,
    task_priority: taskPriority,
    approval_required: "true",
    notes: notes
  };
}

function TL_AI_findLatestVoiceRow_() {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const width = TL_WEBHOOK.INBOX_HEADERS.length;
  for (let row = lastRow; row >= 2; row--) {
    const values = sh.getRange(row, 1, 1, width).getValues()[0];
    const direction = String(values[TLW_colIndex_("direction") - 1] || "").trim().toLowerCase();
    const recordClass = String(values[TLW_colIndex_("record_class") - 1] || "").trim().toLowerCase();
    const messageType = String(values[TLW_colIndex_("message_type") - 1] || "").trim().toLowerCase();
    const mediaId = String(values[TLW_colIndex_("media_id") - 1] || "").trim();
    const isVoice = String(values[TLW_colIndex_("media_is_voice") - 1] || "").trim().toLowerCase() === "true";
    if (direction === "incoming" && recordClass === "communication" && mediaId && (messageType === "voice" || (messageType === "audio" && isVoice) || isVoice)) {
      return { sh: sh, row: row, values: values };
    }
  }

  return null;
}

function TL_AI_getInboxRow_(rowNumber) {
  const row = Number(rowNumber || 0);
  if (!isFinite(row) || row < 2) return null;

  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh) return null;
  if (row > sh.getLastRow()) return null;

  return {
    sh: sh,
    row: row,
    values: sh.getRange(row, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0]
  };
}
