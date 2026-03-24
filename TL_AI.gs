/**
 * TL_AI - Gemini-compatible helpers for smoke tests, row proposals, and voice transcription.
 *
 * This does not auto-send anything. It calls the configured AI endpoint
 * and writes results back into INBOX only when explicitly invoked.
 */

const TL_AI_COST = {
  MODEL_NAME: "Gemini 2.5 Flash",
  EXPECTED_ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  TRACKER_SHEET: "AI_Cost_Tracker",
  INPUT_USD_PER_TOKEN: 0.30 / 1000000,
  OUTPUT_USD_PER_TOKEN: 2.50 / 1000000,
  USD_ILS: 3.65
};

function TL_AI_getConfig_() {
  const endpoint = String(TLW_getSetting_("API END POINT") || "").trim();
  const token = String(TLW_getSetting_("API TOKEN") || "").trim();
  const language = String(TLW_getSetting_("AI_DEFAULT_LANGUAGE") || "Hebrew").trim();
  const replyLanguagePolicy = String(TLW_getSetting_("REPLY_LANGUAGE_POLICY") || "match_incoming").trim().toLowerCase();
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "Boss").trim();

  if (!endpoint) throw new Error("Missing SETTINGS value: API END POINT");
  if (!token) throw new Error("Missing SETTINGS value: API TOKEN");
  if (endpoint !== TL_AI_COST.EXPECTED_ENDPOINT) {
    throw new Error("API END POINT must be set to " + TL_AI_COST.EXPECTED_ENDPOINT);
  }

  return {
    endpoint: endpoint,
    token: token,
    language: language,
    replyLanguagePolicy: replyLanguagePolicy === "boss_language" ? "boss_language" : "match_incoming",
    bossName: bossName,
    modelName: TL_AI_COST.MODEL_NAME
  };
}

function TL_AI_detectMessageLanguage_(inputText, fallbackLanguage) {
  const text = String(inputText || "");
  const fallback = String(fallbackLanguage || "Hebrew").trim() || "Hebrew";
  const hebrewCount = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  if (hebrewCount >= 3 && hebrewCount >= latinCount) return "Hebrew";
  if (latinCount >= 6 && latinCount > hebrewCount) return "English";
  return fallback;
}

function TL_AI_resolveReplyLanguage_(inputText, bossLanguage, replyLanguagePolicy) {
  const policy = String(replyLanguagePolicy || "match_incoming").trim().toLowerCase();
  const bossUiLanguage = String(bossLanguage || "Hebrew").trim() || "Hebrew";
  if (policy === "boss_language") return bossUiLanguage;
  return TL_AI_detectMessageLanguage_(inputText, bossUiLanguage);
}

function TL_AI_EnsureCostTrackerSheet() {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  return TL_AI_ensureCostTrackerSheet_(ss);
}

function TL_AI_ensureCostTrackerSheet_(ss) {
  if (!ss) throw new Error("Spreadsheet not available for AI cost tracker");
  let sh = ss.getSheetByName(TL_AI_COST.TRACKER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TL_AI_COST.TRACKER_SHEET);
  }
  const headers = ["Date","Model","Input_Tokens","Output_Tokens","Cost_ILS"];
  const range = sh.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0];
  const needs = existing.some(function(v, i) { return String(v || "") !== headers[i]; });
  if (needs) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function TL_AI_parseUsageMetadata_(bodyText) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(bodyText || "{}"));
  } catch (e) {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const usage = parsed && parsed.usageMetadata ? parsed.usageMetadata : {};
  return {
    inputTokens: Number(usage.promptTokenCount || 0),
    outputTokens: Number(usage.candidatesTokenCount || 0)
  };
}

function TL_AI_calculateCostIls_(inputTokens, outputTokens) {
  const usd = (Number(inputTokens || 0) * TL_AI_COST.INPUT_USD_PER_TOKEN) +
    (Number(outputTokens || 0) * TL_AI_COST.OUTPUT_USD_PER_TOKEN);
  return usd * TL_AI_COST.USD_ILS;
}

function TL_AI_trackCost_(usage) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = TL_AI_ensureCostTrackerSheet_(ss);
  const inputTokens = Number(usage && usage.inputTokens || 0);
  const outputTokens = Number(usage && usage.outputTokens || 0);
  const costIls = TL_AI_calculateCostIls_(inputTokens, outputTokens);
  sh.appendRow([
    new Date(),
    TL_AI_COST.MODEL_NAME,
    inputTokens,
    outputTokens,
    Number(costIls.toFixed(6))
  ]);
  return {
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    costIls: Number(costIls.toFixed(6))
  };
}

function TL_AI_BuildMonthToDateSpendReport_() {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = TL_AI_ensureCostTrackerSheet_(ss);
  const lastRow = sh.getLastRow();
  let total = 0;
  if (lastRow >= 2) {
    const values = sh.getRange(2, 1, lastRow - 1, 5).getValues();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    values.forEach(function(row) {
      const dateValue = row[0];
      const cost = Number(row[4] || 0);
      const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
      if (!isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month) {
        total += cost;
      }
    });
  }
  return [
    "*TaskLess AI Report*",
    "Model: " + TL_AI_COST.MODEL_NAME,
    "Month To Date Spend: ₪" + total.toFixed(2)
  ].join("\n");
}

function TL_AI_buildPrompt_(inputText, language, bossName, draftContextBrief, replyLanguage) {
  return [
    "You are TaskLess, a business communication assistant.",
    "Return strict JSON only.",
    "Boss UI language: " + String(language || "Hebrew"),
    "Draft reply language: " + String(replyLanguage || language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "Required JSON shape:",
    '{"summary":"...","proposal":"..."}',
    "Example JSON response:",
    '{"summary":"לקוח מבקש לקבוע פגישה מחר בבוקר.","proposal":"שלום, אפשר לקבוע מחר בבוקר. אשמח אם תאשר שעה שנוחה לך."}',
    "summary must be written in the Boss UI language.",
    "proposal must be written in the Draft reply language and should be a concise exact draft reply written on the Boss's behalf.",
    draftContextBrief ? draftContextBrief : "Draft context brief: none",
    "User message:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildTriagePrompt_(inputText, language, bossName, draftContextBrief, replyLanguage) {
  return [
    "You are Amanda, the TaskLess AI assistant for business communication triage.",
    "Analyze the incoming message and return strict JSON only.",
    "Boss UI language: " + String(language || "Hebrew"),
    "Draft reply language: " + String(replyLanguage || language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "The draft context brief contains a customer-specific topic registry. Use one exact existing topic if it fits; otherwise propose one new topic candidate only.",
    "Return exactly one JSON object with these keys only:",
    '{"priority_level":"low|medium|high","importance_level":"low|medium|high","urgency_flag":"true|false","needs_owner_now":"true|false","suggested_action":"reply_now|reply_later|call|schedule|follow_up|wait|ignore|review_manually","topic_id":"string","topic_candidate":"string","topic_summary":"string","topic_confidence":"0 to 1","summary":"string","proposal":"string"}',
    "Field definitions:",
    "priority_level: overall work priority for queue ordering. Use high sparingly.",
    "importance_level: business significance such as money, commitments, customer impact, legal/reputation risk.",
    "urgency_flag: true only when timing matters now or very soon.",
    "needs_owner_now: true only when the Boss personally should see or decide soon.",
    "topic_id: one exact existing topic from the provided topic registry. Leave blank if no existing topic fits well.",
    "topic_candidate: one new topic slug if no existing topic fits. Use lowercase snake_case with a topic_ prefix.",
    "topic_summary: short human-readable description of the chosen or proposed topic.",
    "topic_confidence: decimal confidence for the topic decision, between 0 and 1.",
    "suggested_action meanings:",
    "reply_now = immediate reply is best.",
    "reply_later = reply is needed but not immediately.",
    "call = a call is better than text.",
    "schedule = the main next step is setting/changing time.",
    "follow_up = continue an open loop or pending thread.",
    "wait = no reply now; monitor or wait for another party.",
    "ignore = no response/action needed.",
    "review_manually = needs human judgment before choosing next action.",
    "summary: 1-2 factual sentences in the Boss UI language, no fluff, no invented facts.",
    "proposal: exact next-step wording on the Boss's behalf in the Draft reply language. If a reply is appropriate, write the actual draft reply text. If no reply should be sent, explain the recommended action plainly.",
    "Validation rules:",
    "Always output all keys.",
    "Use only the allowed enum values.",
    "Use empty strings only if absolutely necessary; prefer a concrete short summary/proposal.",
    "Choose exactly one topic path: either set topic_id or set topic_candidate, never both.",
    "Do not wrap the JSON in markdown fences.",
    "Interpret urgency narrowly: only true when timing matters now or soon.",
    "Interpret importance as business relevance, money, reputation, commitment, or customer risk.",
    "Examples:",
    '{"priority_level":"high","importance_level":"high","urgency_flag":"true","needs_owner_now":"true","suggested_action":"reply_now","topic_id":"topic_meeting_followup","topic_candidate":"","topic_summary":"Meeting follow-up","topic_confidence":"0.96","summary":"לקוח מבקש תשובה דחופה לגבי פגישה להיום.","proposal":"שלום, קיבלתי. אני זמין היום בשעה 16:00. אם נוח לך, אשמח לאשר."}',
    '{"priority_level":"medium","importance_level":"medium","urgency_flag":"false","needs_owner_now":"false","suggested_action":"reply_later","topic_id":"","topic_candidate":"topic_quote_request","topic_summary":"Quote request","topic_confidence":"0.82","summary":"הלקוח מתעניין בהמשך שיחה על שיתוף פעולה בשבוע הבא.","proposal":"היי, תודה על ההודעה. אשמח לדבר בשבוע הבא. תגיד לי איזה יום ושעה נוחים לך."}',
    '{"priority_level":"low","importance_level":"low","urgency_flag":"false","needs_owner_now":"false","suggested_action":"ignore","topic_id":"topic_internal_note","topic_candidate":"","topic_summary":"Internal note","topic_confidence":"0.91","summary":"נשלחה הודעת בדיקה פנימית ללא בקשה לפעולה.","proposal":"אין צורך להשיב. אפשר לסגור את הפריט ללא שליחה."}',
    '{"priority_level":"medium","importance_level":"high","urgency_flag":"false","needs_owner_now":"true","suggested_action":"review_manually","topic_id":"","topic_candidate":"topic_sensitive_business_followup","topic_summary":"Sensitive business follow-up","topic_confidence":"0.64","summary":"לקוח קיים מעלה נושא מסחרי רגיש שדורש שיקול דעת לפני מענה.","proposal":"לא לשלוח עדיין. כדאי שהבוס יבדוק את ההקשר לפני ניסוח תשובה."}',
    draftContextBrief ? draftContextBrief : "Draft context brief: none",
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
    "The Boss's name is: " + String(bossName || "Boss"),
    "Required JSON shape:",
    '{"summary":"...","items":[{"kind":"reminder|task|journal|schedule|whatsapp|email","title":"...","summary":"...","proposal":"...","subject":"...","recipient_query":"...","search_queries":[{"type":"name|name_prefix|phone_fragment|email|relationship|org","value":"..."}],"task_due":"...","task_priority":"low|medium|high","approval_required":"true","notes":"..."}]}',
    "Example JSON response:",
    '{"summary":"הבוס נתן ארבע הנחיות: תזכורת, משימה, פגישה והודעת וואטסאפ.","items":[{"kind":"reminder","title":"לקחת תרופה בבוקר","summary":"תזכורת לקחת תרופה מחר בבוקר.","proposal":"לקחת תרופה בבוקר.","subject":"","recipient_query":"","search_queries":[],"task_due":"מחר בבוקר","task_priority":"high","approval_required":"true","notes":""},{"kind":"task","title":"להתקשר ליעקב","summary":"צריך להתקשר ליעקב.","proposal":"להתקשר ליעקב.","subject":"","recipient_query":"","search_queries":[],"task_due":"","task_priority":"medium","approval_required":"true","notes":""},{"kind":"schedule","title":"פגישה עם עצמי","summary":"לקבוע פגישה עם עצמי מחר ב-10:00 בבוקר.","proposal":"פגישה עם עצמי.","subject":"","recipient_query":"","search_queries":[],"task_due":"מחר ב-10:00 בבוקר","task_priority":"medium","approval_required":"true","notes":""},{"kind":"whatsapp","title":"להודיע לדוד שאגיע בעוד שעה","summary":"לשלוח לדוד הודעת וואטסאפ שאחזור בעוד שעה.","proposal":"אני אחזור בעוד שעה.","subject":"","recipient_query":"David","search_queries":[{"type":"name","value":"David"},{"type":"name","value":"דוד"},{"type":"name_prefix","value":"Dav"}],"task_due":"","task_priority":"medium","approval_required":"true","notes":""}]}',
    "Rules:",
    "Emit one item per distinct intent.",
    "Keep reminder and task items concrete and actionable.",
    "For reminder items, keep the reminder message/body in title and summary, and put timing details in task_due instead of repeating them inside the reminder text.",
    "Use schedule items for meetings, appointments, and calendar events that should be placed on the calendar.",
    "For schedule items, title must be the event subject only, not a verb phrase like 'create a task' or 'schedule a meeting'.",
    "For schedule items, proposal should be the exact event title/description the Boss is approving, not an instruction to create a task.",
    "Use whatsapp items for new outbound WhatsApp messages the Boss wants to send.",
    "Use email items for new outbound emails the Boss wants to send.",
    "For whatsapp and email items, recipient_query must be the person/contact the Boss mentioned.",
    "For whatsapp and email items, search_queries must be an ordered list of separate CONTACTS searches to try.",
    "Prefer including both Hebrew and English spellings when useful, plus a short prefix and any phone fragment.",
    "Do not combine name and phone into one search string. Return separate query objects.",
    "For email items, put the email subject in subject and the body text in proposal.",
    "For whatsapp items, subject should be empty.",
    "Keep journal items factual and non-actionable.",
    "Use empty strings when a field is unknown.",
    "Always set approval_required to true.",
    "Capture text:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildContactEnrichmentPrompt_(inputText, language, bossName) {
  return [
    "You are TaskLess.",
    "Extract one manual contact enrichment request from a Boss message.",
    "Return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "Required JSON shape:",
    '{"contact_query":"...","search_queries":[{"type":"name|name_prefix|phone_fragment|email|relationship|org","value":"..."}],"note_type":"personal_context|family_event|business_context|followup_context|preference|relationship_signal|general","note_text":"...","summary":"...","proposal":"..."}',
    "Rules:",
    "contact_query should be the person name, phone, or email mentioned by the Boss.",
    "search_queries should be an ordered list of separate CONTACTS searches to try.",
    "Prefer including both Hebrew and English spellings when useful, plus a short prefix and any phone fragment.",
    "Do not combine name and phone into one search string. Return separate query objects.",
    "Valid search query types are: name, name_prefix, phone_fragment, email, relationship, org.",
    "note_text should contain only the durable fact/context worth saving for future drafts.",
    "summary should be concise and mention the contact plus the saved context.",
    "proposal should be phrased as an approval sentence for adding contact memory/enrichment.",
    "If the Boss message does not clearly contain a contact enrichment request, return empty strings and note_type=general.",
    "Examples:",
    '{"contact_query":"David","search_queries":[{"type":"name","value":"David"},{"type":"name_prefix","value":"Dav"}],"note_type":"family_event","note_text":"I met David and his son has a wedding next week.","summary":"דוד: לבן שלו יש חתונה בשבוע הבא.","proposal":"להוסיף לדוד הערת קשר: לבן שלו יש חתונה בשבוע הבא."}',
    '{"contact_query":"Sarah","search_queries":[{"type":"name","value":"Sarah"},{"type":"name_prefix","value":"Sar"}],"note_type":"business_context","note_text":"Waiting on the quote sent last week.","summary":"שרה: ממתינה להצעת המחיר שנשלחה בשבוע שעבר.","proposal":"להוסיף לשרה הקשר עסקי: ממתינה להצעת המחיר שנשלחה בשבוע שעבר."}',
    '{"contact_query":"אופיר","search_queries":[{"type":"name","value":"אופיר"},{"type":"name","value":"Ofir"},{"type":"name_prefix","value":"אופ"},{"type":"phone_fragment","value":"963"}],"note_type":"general","note_text":"לחזור לאופיר לגבי הסיכום.","summary":"אופיר: לחזור לגבי הסיכום.","proposal":"להוסיף לאופיר תזכורת קשר: לחזור לגבי הסיכום."}',
    "Boss message:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildBossContactLookupPrompt_(inputText, language, bossName) {
  return [
    "You are TaskLess.",
    "Extract one contact lookup request from a Boss message.",
    "Return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "Required JSON shape:",
    '{"contact_query":"...","search_queries":[{"type":"name|name_prefix|phone_fragment|email|relationship|org","value":"..."}],"reply_preamble":"..."}',
    "Rules:",
    "contact_query should be the person name, phone, email, role, or relationship the Boss is asking about.",
    "search_queries should be an ordered list of separate CONTACTS searches to try.",
    "Prefer including both Hebrew and English spellings when useful, plus a short prefix and any phone fragment.",
    "Do not combine name and phone into one search string. Return separate query objects.",
    "Valid search query types are: name, name_prefix, phone_fragment, email, relationship, org.",
    "reply_preamble should be one short sentence in the Boss UI language describing that TaskLess is looking up the contact.",
    "Do not invent facts.",
    "Examples:",
    '{"contact_query":"David","search_queries":[{"type":"name","value":"David"},{"type":"name","value":"דוד"},{"type":"name_prefix","value":"Dav"}],"reply_preamble":"בודקת את איש הקשר דוד."}',
    '{"contact_query":"wife","search_queries":[{"type":"relationship","value":"wife"}],"reply_preamble":"בודקת את איש הקשר המתאים."}',
    '{"contact_query":"972506847373","search_queries":[{"type":"phone_fragment","value":"7373"}],"reply_preamble":"בודקת את איש הקשר לפי מספר הטלפון."}',
    "Boss message:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildBossContextLookupPrompt_(inputText, language, bossName) {
  return [
    "You are TaskLess.",
    "Extract one recent-context lookup request from a Boss message.",
    "Return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "Required JSON shape:",
    '{"contact_query":"...","search_queries":[{"type":"name|name_prefix|phone_fragment|email|relationship|org","value":"..."}],"topic_query":"...","topic_id":"...","reply_preamble":"..."}',
    "Rules:",
    "Use contact_query and search_queries when the Boss asks about a person or contact.",
    "Use topic_query and optional topic_id when the Boss asks about an issue/topic such as documents, approval, meeting, payment, etc.",
    "You may return both contact_query and topic_query when both are relevant.",
    "topic_id should be a concrete topic slug only when the message clearly implies one. Otherwise leave it empty and use topic_query.",
    "reply_preamble should be one short sentence in the Boss UI language describing that TaskLess is gathering recent context.",
    "Do not invent facts.",
    "Examples:",
    '{"contact_query":"Dana","search_queries":[{"type":"name","value":"Dana"},{"type":"name_prefix","value":"Dan"}],"topic_query":"","topic_id":"","reply_preamble":"אוספת את ההקשר האחרון עם דנה."}',
    '{"contact_query":"","search_queries":[],"topic_query":"missing documents","topic_id":"topic_documents_needed","reply_preamble":"אוספת את ההודעות האחרונות בנושא המסמכים."}',
    '{"contact_query":"David","search_queries":[{"type":"name","value":"David"},{"type":"name","value":"דוד"}],"topic_query":"bank approval","topic_id":"","reply_preamble":"אוספת את ההודעות האחרונות עם דוד על אישור הבנק."}',
    "Boss message:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildBossIntentPrompt_(inputText, language, bossName) {
  const capabilityBrief = typeof TL_Capabilities_BuildPromptBrief_ === "function"
    ? TL_Capabilities_BuildPromptBrief_()
    : "";
  return [
    "You are TaskLess's Boss intent router.",
    "Classify one Boss message into a single intent and return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "Supported intents:",
    "show_menu, help, show_capabilities, show_ai_cost, find_contact, find_context, list_reminders, list_tasks, list_approvals, list_pending, list_urgent, list_attention, list_next_steps, list_draft_replies, list_waiting_on_others, list_followups, list_open_tasks, list_blocked_tasks, list_topic_candidates, show_settings, show_verticals, create_reminder_relative, create_reminder_datetime, create_reminder_recurring, create_task_no_due, create_task_with_due, create_task_dependent, create_task_personal, create_task_business, create_log_health, create_log_habits, create_log_journal, create_log_note, create_schedule_business, create_schedule_family, create_schedule_reminder, create_contact_enrichment, out_of_scope, unknown",
    "Return exactly one JSON object with this shape:",
    '{"intent":"supported_intent_name","route":"menu|summary|capture|none","summary_kind":"pending|attention|approvals|next_steps|draft_replies|waiting_on_others|followups|open_tasks|blocked_tasks|topic_candidates|contact_lookup|context_lookup|menu|help|verticals|settings|reminders|tasks|ai_cost|none","capture_state":"TL_MENU_STATES value or empty string","menu_target":"main|capabilities|reminders|notes|schedule|tasks|manage_work|settings|verticals|help|none|","confidence":0.0,"needs_clarification":"true|false","reply":"string","parameters":{"query":"string","capture_kind":"string","capture_mode":"string","time_hint":"string","target":"string"}}',
    "Field definitions:",
    "intent: choose exactly one supported intent name.",
    "route: menu for explicit menu/help navigation, summary for status/list views, capture for create/log/remind/enrich flows, none for out_of_scope or unknown.",
    "summary_kind: required when route=summary, otherwise usually none.",
    "capture_state: required when route=capture and should match the best TL_MENU_STATES target; otherwise empty string.",
    "menu_target: use when route=menu to indicate which submenu should open; otherwise empty string.",
    "confidence: decimal between 0 and 1.",
    "needs_clarification: true only when the request is genuinely ambiguous and should not be assumed.",
    "reply: one short Hebrew sentence that tells the Boss what TaskLess is about to do.",
    "parameters.query: compact normalized restatement of the request.",
    "parameters.capture_kind / capture_mode / time_hint / target: fill only when helpful, otherwise empty strings.",
    "Routing rules:",
    "Use summary routes for list/status questions.",
    "Use capture routes for create/add/log/remind/schedule requests.",
    "Prefer a specific capture_state when the message clearly matches a menu capture path.",
    "Use out_of_scope when the message asks for weather, news, trivia, jokes, sports, or general chat outside TaskLess secretary capabilities.",
    "Return unknown only when the message is too ambiguous to classify and is not clearly out of scope.",
    "Validation rules:",
    "Always output all top-level keys and the full parameters object.",
    "Do not invent unsupported intents or summary kinds.",
    "Do not wrap the JSON in markdown fences.",
    "Examples:",
    '{"intent":"show_menu","route":"menu","summary_kind":"menu","capture_state":"","menu_target":"main","confidence":0.98,"needs_clarification":"false","reply":"פותח את התפריט הראשי.","parameters":{"query":"menu","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"show_capabilities","route":"menu","summary_kind":"none","capture_state":"","menu_target":"capabilities","confidence":0.98,"needs_clarification":"false","reply":"מראה לך מה אני יכולה לעשות.","parameters":{"query":"what can you do","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"find_contact","route":"summary","summary_kind":"contact_lookup","capture_state":"","menu_target":"","confidence":0.94,"needs_clarification":"false","reply":"בודקת את איש הקשר שביקשת.","parameters":{"query":"find Dana","capture_kind":"","capture_mode":"","time_hint":"","target":"Dana"}}',
    '{"intent":"find_context","route":"summary","summary_kind":"context_lookup","capture_state":"","menu_target":"","confidence":0.94,"needs_clarification":"false","reply":"אוספת את ההקשר האחרון שביקשת.","parameters":{"query":"show recent messages with Dana","capture_kind":"","capture_mode":"","time_hint":"","target":"Dana"}}',
    '{"intent":"list_reminders","route":"menu","summary_kind":"reminders","capture_state":"","menu_target":"reminders","confidence":0.97,"needs_clarification":"false","reply":"פותח את אפשרויות התזכורות.","parameters":{"query":"reminders","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"list_tasks","route":"menu","summary_kind":"tasks","capture_state":"","menu_target":"tasks","confidence":0.97,"needs_clarification":"false","reply":"פותח את אפשרויות המשימות.","parameters":{"query":"tasks","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"list_approvals","route":"summary","summary_kind":"approvals","capture_state":"","menu_target":"manage_work","confidence":0.98,"needs_clarification":"false","reply":"מראה לך את מה שממתין לאישור.","parameters":{"query":"approvals","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"list_pending","route":"summary","summary_kind":"pending","capture_state":"","menu_target":"manage_work","confidence":0.97,"needs_clarification":"false","reply":"מראה לך מה פתוח כרגע.","parameters":{"query":"clean my plate","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"list_attention","route":"summary","summary_kind":"attention","capture_state":"","menu_target":"manage_work","confidence":0.97,"needs_clarification":"false","reply":"מראה לך מה צריך תשומת לב.","parameters":{"query":"what needs attention","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"list_topic_candidates","route":"summary","summary_kind":"topic_candidates","capture_state":"","menu_target":"manage_work","confidence":0.96,"needs_clarification":"false","reply":"מראה לך מועמדי נושא לקידום.","parameters":{"query":"topic candidates","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"show_ai_cost","route":"summary","summary_kind":"ai_cost","capture_state":"","menu_target":"","confidence":0.98,"needs_clarification":"false","reply":"מראה לך את עלות ה-AI המצטברת.","parameters":{"query":"ai cost","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    '{"intent":"create_task_with_due","route":"capture","summary_kind":"none","capture_state":"CAPTURE_TASK_WITH_DUE","menu_target":"tasks","confidence":0.97,"needs_clarification":"false","reply":"קיבלתי, אכין משימה עם תאריך יעד.","parameters":{"query":"send proposal by Thursday","capture_kind":"task","capture_mode":"with_due","time_hint":"Thursday","target":""}}',
    '{"intent":"create_log_journal","route":"capture","summary_kind":"none","capture_state":"CAPTURE_LOG_JOURNAL","menu_target":"notes","confidence":0.96,"needs_clarification":"false","reply":"נרשם, אכין מזה פריט יומן.","parameters":{"query":"met with Dana","capture_kind":"journal","capture_mode":"journal","time_hint":"","target":""}}',
    '{"intent":"create_contact_enrichment","route":"capture","summary_kind":"none","capture_state":"CAPTURE_CONTACT_ENRICH","menu_target":"notes","confidence":0.96,"needs_clarification":"false","reply":"קיבלתי, אכין הצעת העשרה לאיש קשר.","parameters":{"query":"make note that I met David and his son has a wedding next week","capture_kind":"contact_enrichment","capture_mode":"contact_enrichment","time_hint":"","target":"David"}}',
    '{"intent":"out_of_scope","route":"none","summary_kind":"none","capture_state":"","menu_target":"","confidence":0.99,"needs_clarification":"false","reply":"מחוץ לתחום","parameters":{"query":"weather","capture_kind":"","capture_mode":"","time_hint":"","target":""}}',
    capabilityBrief ? capabilityBrief : "",
    "Message:",
    String(inputText || "")
  ].join("\n");
}

function TL_AI_buildBossReadOnlyTurnPrompt_(packet, language, bossName) {
  const packetBrief = typeof TL_BossTurn_BuildPromptBrief_ === "function"
    ? TL_BossTurn_BuildPromptBrief_(packet)
    : "";
  return [
    "You are TaskLess's read-only Boss turn analyst.",
    "You are analyzing one Boss message plus the current state packet.",
    "This pass is read-only. Do not propose execution, sending, or state mutation.",
    "Return strict JSON only.",
    "Language preference: " + String(language || "Hebrew"),
    "The Boss's name is: " + String(bossName || "Boss"),
    "Choose the best existing read-only summary surface and the most useful retrieval focus.",
    "Return exactly one JSON object with this shape:",
    '{"summary_kind":"pending|attention|approvals|next_steps|draft_replies|waiting_on_others|followups|open_tasks|blocked_tasks|topic_candidates|reminders|tasks|ai_cost|menu|help|verticals|settings|none","retrieval_focus":["pending_items|recent_records|recent_contacts|recent_threads|topic_candidates"],"reply_preamble":"string","confidence":0.0}',
    "Rules:",
    "summary_kind must be one supported value only.",
    "retrieval_focus may include up to two values and should reflect the packet's retrieval_budget_max policy.",
    "reply_preamble should be one short sentence in the Boss UI language describing what TaskLess is about to show.",
    "Prefer the smallest useful surface. Do not invent unsupported surfaces.",
    "Use topic_candidates only when the Boss is clearly asking about topic candidates or topic promotion review.",
    "Use approvals for things waiting on explicit approval.",
    "Use pending for general what's open / what's on my plate questions.",
    "Use attention for what needs attention now.",
    "Use next_steps for what should I do next questions.",
    "If the packet already strongly indicates the correct surface, align with it.",
    "Do not wrap the JSON in markdown fences.",
    "Examples:",
    '{"summary_kind":"approvals","retrieval_focus":["pending_items","recent_records"],"reply_preamble":"מראה לך מה ממתין לאישור.","confidence":0.97}',
    '{"summary_kind":"attention","retrieval_focus":["recent_records"],"reply_preamble":"מראה לך מה צריך תשומת לב עכשיו.","confidence":0.93}',
    '{"summary_kind":"topic_candidates","retrieval_focus":["topic_candidates"],"reply_preamble":"מראה לך מועמדי נושא פתוחים לסקירה.","confidence":0.96}',
    packetBrief ? packetBrief : "Current Boss turn packet: unavailable",
    "Message:",
    String(packet && packet.boss_turn && packet.boss_turn.message_text || "")
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

function TL_AI_parseBossIntentJson_(text) {
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

  return TL_AI_normalizeBossIntent_(parsed);
}

function TL_AI_parseBossReadOnlyTurnJson_(text) {
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

  return TL_AI_normalizeBossReadOnlyTurn_(parsed);
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

  const usage = TL_AI_parseUsageMetadata_(body);
  const tracked = TL_AI_trackCost_(usage);
  TLW_logInfo_("ai_cost_tracked", {
    model: cfg.modelName,
    input_tokens: tracked.inputTokens,
    output_tokens: tracked.outputTokens,
    cost_ils: tracked.costIls
  });

  return {
    status: status,
    body: body,
    usage: tracked
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

function TL_AI_RecognizeBossIntent_(inputText, options) {
  const cfg = TL_AI_getConfig_();
  const text = String(inputText || "").trim();
  if (!text) {
    return TL_AI_normalizeBossIntent_({
      intent: "unknown",
      route: "none",
      summary_kind: "none",
      capture_state: "",
      confidence: 0,
      needs_clarification: "false",
      reply: "",
      parameters: { query: "", capture_kind: "", capture_mode: "", time_hint: "", target: "" }
    });
  }

  let parsed = null;
  if (options && typeof options.intentFn === "function") {
    parsed = options.intentFn(text, options);
  } else {
    const prompt = TL_AI_buildBossIntentPrompt_(text, cfg.language, cfg.bossName);
    const result = TL_AI_callPrompt_(prompt);
    parsed = TL_AI_parseBossIntentJson_(result.raw_text);
  }

  return TL_AI_normalizeBossIntent_(parsed);
}

function TL_AI_AnalyzeBossReadOnlyTurn_(packet, options) {
  const opts = options || {};
  const safePacket = packet || {};
  if (opts && typeof opts.analysisFn === "function") {
    return TL_AI_normalizeBossReadOnlyTurn_(opts.analysisFn(safePacket, opts));
  }

  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildBossReadOnlyTurnPrompt_(safePacket, cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);
  const parsed = TL_AI_parseBossReadOnlyTurnJson_(result.raw_text);
  return Object.assign({}, parsed, {
    raw_text: result.raw_text,
    raw_json: parsed.raw,
    response_body: result.response_body,
    status: result.status
  });
}

function TL_AI_ExtractContactEnrichment_(inputText) {
  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildContactEnrichmentPrompt_(String(inputText || ""), cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);
  const raw = result.raw_json || {};
  const searchQueries = TL_AI_normalizeSearchQueries_(raw.search_queries);
  return {
    ok: true,
    status: result.status,
    contact_query: String(raw.contact_query || "").trim(),
    search_queries: searchQueries,
    name_hints: TL_AI_normalizeStringArray_(raw.name_hints),
    phone_hints: TL_AI_normalizeStringArray_(raw.phone_hints),
    email_hints: TL_AI_normalizeStringArray_(raw.email_hints),
    relationship_hints: TL_AI_normalizeStringArray_(raw.relationship_hints),
    org_hints: TL_AI_normalizeStringArray_(raw.org_hints),
    note_type: TL_AI_normalizeContactEnrichmentType_(raw.note_type),
    note_text: String(raw.note_text || result.summary || "").trim(),
    summary: String(raw.summary || result.summary || "").trim(),
    proposal: String(raw.proposal || result.proposal || "").trim(),
    raw_text: result.raw_text,
    raw_json: raw,
    response_body: result.response_body
  };
}

function TL_AI_ExtractBossContactLookup_(inputText, options) {
  const opts = options || {};
  if (opts && typeof opts.contactLookupFn === "function") {
    const raw = opts.contactLookupFn(String(inputText || ""), opts) || {};
    return {
      ok: true,
      status: 200,
      contact_query: String(raw.contact_query || "").trim(),
      search_queries: TL_AI_normalizeSearchQueries_(raw.search_queries),
      reply_preamble: String(raw.reply_preamble || "").trim(),
      raw_text: JSON.stringify(raw),
      raw_json: raw,
      response_body: ""
    };
  }

  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildBossContactLookupPrompt_(String(inputText || ""), cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);
  const raw = result.raw_json || {};
  return {
    ok: true,
    status: result.status,
    contact_query: String(raw.contact_query || "").trim(),
    search_queries: TL_AI_normalizeSearchQueries_(raw.search_queries),
    reply_preamble: String(raw.reply_preamble || "").trim(),
    raw_text: result.raw_text,
    raw_json: raw,
    response_body: result.response_body
  };
}

function TL_AI_ExtractBossContextLookup_(inputText, options) {
  const opts = options || {};
  if (opts && typeof opts.contextLookupFn === "function") {
    const raw = opts.contextLookupFn(String(inputText || ""), opts) || {};
    return {
      ok: true,
      status: 200,
      contact_query: String(raw.contact_query || "").trim(),
      search_queries: TL_AI_normalizeSearchQueries_(raw.search_queries),
      topic_query: String(raw.topic_query || "").trim(),
      topic_id: TL_AI_normalizeTopicSlug_(raw.topic_id || ""),
      reply_preamble: String(raw.reply_preamble || "").trim(),
      raw_text: JSON.stringify(raw),
      raw_json: raw,
      response_body: ""
    };
  }

  const cfg = TL_AI_getConfig_();
  const prompt = TL_AI_buildBossContextLookupPrompt_(String(inputText || ""), cfg.language, cfg.bossName);
  const result = TL_AI_callPrompt_(prompt);
  const raw = result.raw_json || {};
  return {
    ok: true,
    status: result.status,
    contact_query: String(raw.contact_query || "").trim(),
    search_queries: TL_AI_normalizeSearchQueries_(raw.search_queries),
    topic_query: String(raw.topic_query || "").trim(),
    topic_id: TL_AI_normalizeTopicSlug_(raw.topic_id || ""),
    reply_preamble: String(raw.reply_preamble || "").trim(),
    raw_text: result.raw_text,
    raw_json: raw,
    response_body: result.response_body
  };
}

function TL_AI_SmokeTest() {
  const cfg = TL_AI_getConfig_();
  const inputText = "לקוח כתב: האם אפשר לקבוע פגישה מחר ב-10:00?";
  const replyLanguage = TL_AI_resolveReplyLanguage_(inputText, cfg.language, cfg.replyLanguagePolicy);
  const prompt = TL_AI_buildPrompt_(
    inputText,
    cfg.language,
    cfg.bossName,
    "",
    replyLanguage
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
  const inputText = String(promptText || "");
  const replyLanguage = TL_AI_resolveReplyLanguage_(inputText, cfg.language, cfg.replyLanguagePolicy);
  const prompt = TL_AI_buildPrompt_(inputText, cfg.language, cfg.bossName, "", replyLanguage);
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
  const draftContext = typeof TL_DraftContext_BuildForInboxRowValues_ === "function"
    ? TL_DraftContext_BuildForInboxRowValues_(rowData)
    : null;
  const replyLanguage = TL_AI_resolveReplyLanguage_(inputText, cfg.language, cfg.replyLanguagePolicy);
  const prompt = TL_AI_buildPrompt_(inputText, cfg.language, cfg.bossName, draftContext && draftContext.promptBrief, replyLanguage);
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
  const draftContext = typeof TL_DraftContext_BuildForInboxRowValues_ === "function"
    ? TL_DraftContext_BuildForInboxRowValues_(rowData)
    : null;
  const replyLanguage = TL_AI_resolveReplyLanguage_(inputText, cfg.language, cfg.replyLanguagePolicy);
  const prompt = TL_AI_buildTriagePrompt_(inputText, cfg.language, cfg.bossName, draftContext && draftContext.promptBrief, replyLanguage);
  const result = TL_AI_callPrompt_(prompt);
  const topicWriteback = TL_AI_resolveTopicWriteback_(
    result.raw_json,
    draftContext,
    rowData,
    rowData[TLW_colIndex_("notes") - 1],
    {
      nowIso: new Date().toISOString(),
      sourceLabel: "whatsapp_triage",
      contact: draftContext && draftContext.contact ? draftContext.contact : null,
      contactId: String(rowData[TLW_colIndex_("contact_id") - 1] || "").trim(),
      contactName: String(draftContext && draftContext.contact && draftContext.contact.name || "").trim()
    }
  );

  const triage = {
    priority_level: TL_AI_normalizeLevel_(result.raw_json.priority_level),
    importance_level: TL_AI_normalizeLevel_(result.raw_json.importance_level),
    urgency_flag: TL_AI_normalizeBooleanString_(result.raw_json.urgency_flag),
    needs_owner_now: TL_AI_normalizeBooleanString_(result.raw_json.needs_owner_now),
    suggested_action: TL_AI_normalizeSuggestedAction_(result.raw_json.suggested_action),
    topic_id: String(topicWriteback.topic_id || "").trim(),
    topic_candidate: String(topicWriteback.topic_candidate || "").trim(),
    topic_summary: String(topicWriteback.topic_summary || "").trim(),
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
  loc.sh.getRange(loc.row, TLW_colIndex_("topic_id")).setValue(triage.topic_id);
  loc.sh.getRange(loc.row, TLW_colIndex_("topic_tagged_at")).setValue(String(topicWriteback.topic_tagged_at || "").trim());
  loc.sh.getRange(loc.row, TLW_colIndex_("notes")).setValue(String(topicWriteback.notes || "").trim());
  if (topicWriteback.registryWrite && typeof TL_AI_upsertTopicRegistry_ === "function") {
    TL_AI_upsertTopicRegistry_(topicWriteback.registryWrite);
  }
  TLW_applyVersionBump_(loc.row, "ai_triage");

  TLW_logInfo_("ai_triage_row", {
    row: loc.row,
    priority_level: triage.priority_level,
    importance_level: triage.importance_level,
    urgency_flag: triage.urgency_flag,
    needs_owner_now: triage.needs_owner_now,
    suggested_action: triage.suggested_action,
    topic_id: triage.topic_id,
    topic_candidate: triage.topic_candidate
  });

  Logger.log("TL_AI_TriageInboxRow_: %s", JSON.stringify({
    row: loc.row,
    input_text: inputText,
    draft_context: draftContext,
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

function TL_AI_normalizeTopicSlug_(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const cleaned = raw
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "";
  return cleaned.indexOf("topic_") === 0 ? cleaned : ("topic_" + cleaned);
}

function TL_AI_topicRegistryMap_(topics) {
  const out = {};
  (topics || []).forEach(function(topic) {
    const topicId = String(topic && (topic.topicId || topic.topic_id) || "").trim();
    if (!topicId) return;
    const normalized = TL_AI_normalizeTopicSlug_(topicId).toLowerCase();
    if (!normalized) return;
    out[normalized] = {
      topicId: topicId,
      topicSummary: String(topic && (topic.topicSummary || topic.topic_summary) || "").trim(),
      contactId: String(topic && (topic.contactId || topic.contact_id) || "").trim(),
      contactName: String(topic && (topic.contactName || topic.contact_name) || "").trim(),
      usageCount: Number(topic && (topic.usageCount || topic.usage_count) || 0),
      lastUsedAt: String(topic && (topic.lastUsedAt || topic.last_used_at) || "").trim(),
      recentExamplesJson: String(topic && (topic.recentExamplesJson || topic.recent_examples_json) || "").trim(),
      notes: String(topic && topic.notes || "").trim()
    };
  });
  return out;
}

function TL_AI_normalizeTopicDecision_(rawJson, topics) {
  const raw = rawJson && typeof rawJson === "object" ? rawJson : {};
  const registry = TL_AI_topicRegistryMap_(topics);
  const registryIds = Object.keys(registry);
  const exactTopicId = TL_AI_normalizeTopicSlug_(raw.topic_id);
  const exactCandidate = TL_AI_normalizeTopicSlug_(raw.topic_candidate);
  const topicSummary = String(raw.topic_summary || "").trim();
  let topicId = "";
  let topicCandidate = "";
  let selectedTopic = null;

  if (exactTopicId && registry[exactTopicId.toLowerCase()]) {
    selectedTopic = registry[exactTopicId.toLowerCase()];
  } else if (exactCandidate && registry[exactCandidate.toLowerCase()]) {
    selectedTopic = registry[exactCandidate.toLowerCase()];
  }

  if (selectedTopic) {
    topicId = String(selectedTopic.topicId || "").trim();
  } else if (exactTopicId) {
    topicCandidate = exactTopicId;
  } else if (exactCandidate) {
    topicCandidate = exactCandidate;
  }

  const confidenceRaw = Number(raw.topic_confidence);
  const confidence = isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : (topicId ? 1 : 0);
  const selectedSummary = topicSummary || String(selectedTopic && selectedTopic.topicSummary || "").trim();

  return {
    topic_id: topicId,
    topic_candidate: topicCandidate,
    topic_summary: selectedSummary,
    topic_confidence: confidence,
    is_new_topic: !!topicCandidate && !topicId,
    available_topic_ids: registryIds,
    raw: raw
  };
}

function TL_AI_topicRegistryExampleFromValues_(values, topicDecision, summaryText, sourceLabel) {
  const channel = String(typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "channel") : "").trim();
  const direction = String(typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "direction") : "").trim();
  const recordId = String(typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "record_id") : "").trim();
  const messageId = String(typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "message_id") : "").trim();
  const latestAt = String(
    (typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "latest_message_at") : "") ||
    (typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "timestamp") : "") ||
    ""
  ).trim();
  const text = String(
    summaryText ||
    (typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "ai_summary") : "") ||
    (typeof TL_Orchestrator_value_ === "function" ? TL_Orchestrator_value_(values, "text") : "") ||
    ""
  ).trim();
  return {
    topic_id: String(topicDecision && (topicDecision.topic_id || topicDecision.topic_candidate) || "").trim(),
    topic_summary: String(topicDecision && topicDecision.topic_summary || "").trim(),
    source: String(sourceLabel || "").trim(),
    record_id: recordId,
    message_id: messageId,
    channel: channel,
    direction: direction,
    latest_message_at: latestAt,
    summary: text.slice(0, 220)
  };
}

function TL_AI_mergeTopicExamples_(existingJson, example) {
  const out = [];
  try {
    const parsed = JSON.parse(String(existingJson || "[]"));
    if (Array.isArray(parsed)) {
      parsed.forEach(function(item) {
        if (item && typeof item === "object") out.push(item);
      });
    }
  } catch (e) {}

  if (example && typeof example === "object") {
    const key = TL_AI_normalizeTopicSlug_(String(example.record_id || "") + "|" + String(example.message_id || "") + "|" + String(example.channel || "") + "|" + String(example.direction || "")).toLowerCase();
    const filtered = out.filter(function(item) {
      const itemKey = TL_AI_normalizeTopicSlug_(String(item.record_id || "") + "|" + String(item.message_id || "") + "|" + String(item.channel || "") + "|" + String(item.direction || "")).toLowerCase();
      return itemKey !== key;
    });
    filtered.unshift(example);
    while (filtered.length > 3) filtered.pop();
    return JSON.stringify(filtered);
  }

  return JSON.stringify(out.slice(0, 3));
}

function TL_AI_setNoteKeyValue_(existing, key, value) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return String(existing || "").trim();
  const safeValue = String(value || "").trim();
  const lines = String(existing || "").split(/\r?\n/).map(function(line) {
    return String(line || "").trim();
  }).filter(Boolean);
  const prefix = safeKey + "=";
  let replaced = false;
  const next = [];
  lines.forEach(function(line) {
    if (line.toLowerCase().indexOf(prefix.toLowerCase()) === 0) {
      if (!replaced) {
        next.push(prefix + safeValue);
        replaced = true;
      }
      return;
    }
    next.push(line);
  });
  if (!replaced) next.push(prefix + safeValue);
  return next.filter(Boolean).join("\n");
}

function TL_AI_removeNoteKey_(existing, key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return String(existing || "").trim();
  const prefix = safeKey.toLowerCase() + "=";
  return String(existing || "")
    .split(/\r?\n/)
    .map(function(line) { return String(line || "").trim(); })
    .filter(function(line) {
      return line && line.toLowerCase().indexOf(prefix) !== 0;
    })
    .join("\n");
}

function TL_AI_buildTopicNotes_(existingNotes, topicDecision) {
  let notes = String(existingNotes || "").trim();
  if (!topicDecision) return notes;
  if (topicDecision.topic_candidate) {
    notes = TL_AI_setNoteKeyValue_(notes, "topic_candidate", topicDecision.topic_candidate);
    notes = TL_AI_setNoteKeyValue_(notes, "topic_candidate_summary", topicDecision.topic_summary || "");
  } else {
    notes = TL_AI_removeNoteKey_(notes, "topic_candidate");
    notes = TL_AI_removeNoteKey_(notes, "topic_candidate_summary");
  }
  return notes;
}

function TL_AI_upsertTopicRegistry_(options) {
  const opts = options || {};
  const topicDecision = opts.topicDecision || {};
  const values = opts.values || [];
  const recordContext = opts.recordContext || {};
  const topicId = String(topicDecision.topic_id || "").trim();
  if (!topicId) {
    return { ok: true, skipped: true, reason: "missing_registry_topic_id" };
  }

  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) return { ok: false, reason: "missing_sheet_id" };
  const ss = SpreadsheetApp.openById(sheetId);
  let sh = ss.getSheetByName("TOPICS");
  if (!sh) {
    sh = ss.insertSheet("TOPICS");
  }
  const headers = TL_SCHEMA && TL_SCHEMA.TOPICS_HEADERS ? TL_SCHEMA.TOPICS_HEADERS : ["topic_id","contact_id","contact_name","topic_summary","last_used_at","usage_count","recent_examples_json","notes"];
  const range = sh.getRange(1, 1, 1, headers.length);
  const existingHeaders = range.getValues()[0];
  const needsHeaders = existingHeaders.some(function(value, index) {
    return String(value || "") !== String(headers[index] || "");
  });
  if (needsHeaders) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }

  const normalizedKey = TL_AI_normalizeTopicSlug_(topicId).toLowerCase();
  const rowCount = sh.getLastRow();
  let rowNumber = 0;
  if (rowCount >= 2) {
    const valuesRange = sh.getRange(2, 1, rowCount - 1, headers.length).getValues();
    for (let i = 0; i < valuesRange.length; i++) {
      const rowTopicId = String(valuesRange[i][0] || "").trim();
      if (TL_AI_normalizeTopicSlug_(rowTopicId).toLowerCase() === normalizedKey) {
        rowNumber = i + 2;
        break;
      }
    }
  }

  const contact = recordContext.contact || {};
  const nowIso = String(opts.nowIso || new Date().toISOString()).trim() || new Date().toISOString();
  const example = TL_AI_topicRegistryExampleFromValues_(values, topicDecision, opts.summary || topicDecision.topic_summary || "", opts.sourceLabel || "");
  const existingRow = rowNumber ? sh.getRange(rowNumber, 1, 1, headers.length).getValues()[0] : [];
  const nextContactId = String(recordContext.contactId || contact.contactId || existingRow[1] || "").trim();
  const nextContactName = String(recordContext.contactName || contact.name || existingRow[2] || "").trim();
  const nextTopicSummary = String(topicDecision.topic_summary || existingRow[3] || "").trim();
  const prevUsage = Number(existingRow[5] || 0);
  const nextUsage = rowNumber ? (isFinite(prevUsage) && prevUsage > 0 ? prevUsage + 1 : 1) : 1;
  const prevExamplesJson = String(existingRow[6] || "[]").trim();
  const nextExamplesJson = TL_AI_mergeTopicExamples_(prevExamplesJson, example);
  const nextNotes = String(existingRow[7] || "").trim();
  const row = [
    topicId,
    nextContactId,
    nextContactName,
    nextTopicSummary,
    nowIso,
    nextUsage,
    nextExamplesJson,
    nextNotes
  ];

  if (rowNumber) {
    sh.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    return {
      ok: true,
      rowNumber: rowNumber,
      topic_id: topicId,
      updated: true,
      created: false,
      registrySize: rowCount - 1
    };
  }

  sh.appendRow(row);
  return {
    ok: true,
    rowNumber: sh.getLastRow(),
    topic_id: topicId,
    updated: false,
    created: true,
    registrySize: sh.getLastRow() - 1
  };
}

function TL_AI_resolveTopicWriteback_(rawJson, draftContext, values, existingNotes, recordContext) {
  const decision = TL_AI_normalizeTopicDecision_(rawJson, draftContext && draftContext.topics ? draftContext.topics : []);
  return {
    decision: decision,
    notes: TL_AI_buildTopicNotes_(existingNotes, decision),
    topic_id: decision.topic_id,
    topic_candidate: decision.topic_candidate,
    topic_summary: decision.topic_summary,
    topic_confidence: decision.topic_confidence,
    topic_tagged_at: decision.topic_id ? String((recordContext && recordContext.nowIso) || new Date().toISOString()) : "",
    registryWrite: decision.topic_id ? {
      topicDecision: decision,
      values: values,
      recordContext: recordContext || {},
      sourceLabel: String(recordContext && recordContext.sourceLabel || "").trim(),
      summary: String(rawJson && rawJson.summary || "").trim(),
      nowIso: String((recordContext && recordContext.nowIso) || new Date().toISOString())
    } : null
  };
}

function TL_AI_normalizeBossCaptureKind_(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "reminder") return "reminder";
  if (v === "task") return "task";
  if (v === "schedule" || v === "event" || v === "meeting" || v === "appointment" || v === "calendar") return "schedule";
  if (v === "whatsapp" || v === "wa" || v === "whatsapp_message" || v === "message") return "whatsapp";
  if (v === "email" || v === "mail" || v === "gmail") return "email";
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
  const subject = String(item.subject || "").trim();
  const recipientQuery = String(item.recipient_query || "").trim();
  const searchQueries = TL_AI_normalizeSearchQueries_(item.search_queries);
  return {
    kind: kind,
    title: title,
    summary: summary,
    proposal: proposal,
    subject: subject,
    recipient_query: recipientQuery,
    search_queries: searchQueries,
    task_due: taskDue,
    task_priority: taskPriority,
    approval_required: "true",
    notes: notes
  };
}

function TL_AI_normalizeBossIntent_(item) {
  const safe = item && typeof item === "object" ? item : {};
  const params = safe.parameters && typeof safe.parameters === "object" ? safe.parameters : {};
  const intent = TL_AI_normalizeBossIntentName_(safe.intent);
  const route = TL_AI_normalizeBossIntentRoute_(safe.route || TL_AI_bossRouteFromIntent_(intent));
  const summaryKind = TL_AI_normalizeBossSummaryKind_(safe.summary_kind || TL_AI_bossSummaryKindFromIntent_(intent));
  const captureState = TL_AI_normalizeBossCaptureState_(safe.capture_state || TL_AI_bossCaptureStateFromIntent_(intent));
  const menuTarget = TL_AI_normalizeBossMenuTarget_(safe.menu_target || TL_AI_bossMenuTargetFromIntent_(intent, summaryKind));
  const confidence = TL_AI_normalizeBossConfidence_(safe.confidence);
  const needsClarification = TL_AI_normalizeBooleanString_(safe.needs_clarification);
  return {
    intent: intent,
    route: route,
    summary_kind: summaryKind,
    capture_state: captureState,
    menu_target: menuTarget,
    confidence: confidence,
    needs_clarification: needsClarification,
    reply: String(safe.reply || "").trim(),
    parameters: {
      query: String(params.query || "").trim(),
      capture_kind: String(params.capture_kind || "").trim(),
      capture_mode: String(params.capture_mode || "").trim(),
      time_hint: String(params.time_hint || "").trim(),
      target: String(params.target || "").trim()
    },
    raw: safe
  };
}

function TL_AI_normalizeBossReadOnlyTurn_(item) {
  const safe = item && typeof item === "object" ? item : {};
  return {
    summary_kind: TL_AI_normalizeBossSummaryKind_(safe.summary_kind),
    retrieval_focus: TL_AI_normalizeBossRetrievalFocus_(safe.retrieval_focus),
    reply_preamble: String(safe.reply_preamble || "").trim(),
    confidence: TL_AI_normalizeBossConfidence_(safe.confidence),
    raw: safe
  };
}

function TL_AI_bossRouteFromIntent_(intent) {
  const v = String(intent || "").trim().toLowerCase();
  if (v === "show_menu" || v === "help" || v === "show_capabilities" || v === "show_settings" || v === "show_verticals") return "menu";
  if (v === "show_ai_cost" || v === "find_contact" || v === "find_context") return "summary";
  if (v.indexOf("list_") === 0) return "summary";
  if (v.indexOf("create_") === 0) return "capture";
  return "none";
}

function TL_AI_bossSummaryKindFromIntent_(intent) {
  const v = String(intent || "").trim().toLowerCase();
  const map = {
    show_capabilities: "none",
    find_contact: "contact_lookup",
    find_context: "context_lookup",
    list_reminders: "reminders",
    list_tasks: "tasks",
    list_approvals: "approvals",
    list_pending: "pending",
    list_urgent: "attention",
    list_attention: "attention",
    list_next_steps: "next_steps",
    list_topic_candidates: "topic_candidates",
    list_draft_replies: "draft_replies",
    list_waiting_on_others: "waiting_on_others",
    list_followups: "followups",
    list_open_tasks: "open_tasks",
    list_blocked_tasks: "blocked_tasks",
    show_ai_cost: "ai_cost",
    show_menu: "menu",
    help: "help",
    show_settings: "settings",
    show_verticals: "verticals"
  };
  return map[v] || "none";
}

function TL_AI_bossCaptureStateFromIntent_(intent) {
  const v = String(intent || "").trim().toLowerCase();
  const map = {
    create_reminder_relative: "CAPTURE_REMINDER_RELATIVE",
    create_reminder_datetime: "CAPTURE_REMINDER_DATETIME",
    create_reminder_recurring: "CAPTURE_REMINDER_RECURRING",
    create_task_no_due: "CAPTURE_TASK_NO_DUE",
    create_task_with_due: "CAPTURE_TASK_WITH_DUE",
    create_task_dependent: "CAPTURE_TASK_DEPENDENT",
    create_task_personal: "CAPTURE_TASK_PERSONAL",
    create_task_business: "CAPTURE_TASK_BUSINESS",
    create_log_health: "CAPTURE_LOG_HEALTH",
    create_log_habits: "CAPTURE_LOG_HABITS",
    create_log_journal: "CAPTURE_LOG_JOURNAL",
    create_log_note: "CAPTURE_LOG_NOTE",
    create_schedule_business: "CAPTURE_SCHEDULE_BUSINESS",
    create_schedule_family: "CAPTURE_SCHEDULE_FAMILY",
    create_schedule_reminder: "CAPTURE_SCHEDULE_REMINDER",
    create_contact_enrichment: "CAPTURE_CONTACT_ENRICH"
  };
  return map[v] || "";
}

function TL_AI_bossMenuTargetFromIntent_(intent, summaryKind) {
  const v = String(intent || "").trim().toLowerCase();
  const summary = String(summaryKind || "").trim().toLowerCase();
  if (v === "show_menu" || v === "help") return "main";
  if (v === "show_capabilities") return "capabilities";
  if (v === "show_settings") return "settings";
  if (v === "show_verticals") return "verticals";
  if (summary === "reminders") return "reminders";
  if (summary === "tasks" || summary === "open_tasks" || summary === "blocked_tasks") return "tasks";
  if (summary === "approvals" || summary === "pending" || summary === "attention" || summary === "next_steps" || summary === "topic_candidates" || summary === "draft_replies" || summary === "waiting_on_others" || summary === "followups") return "manage_work";
  return "";
}

function TL_AI_normalizeBossIntentName_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = [
    "show_menu","help","show_capabilities","show_ai_cost","find_contact","find_context","list_reminders","list_tasks","list_approvals","list_pending","list_urgent","list_attention","list_next_steps","list_topic_candidates",
    "list_draft_replies","list_waiting_on_others","list_followups","list_open_tasks","list_blocked_tasks",
    "show_settings","show_verticals",
    "create_reminder_relative","create_reminder_datetime","create_reminder_recurring",
    "create_task_no_due","create_task_with_due","create_task_dependent","create_task_personal","create_task_business",
    "create_log_health","create_log_habits","create_log_journal","create_log_note",
    "create_schedule_business","create_schedule_family","create_schedule_reminder","create_contact_enrichment",
    "out_of_scope",
    "unknown"
  ];
  return allowed.indexOf(v) !== -1 ? v : "unknown";
}

function TL_AI_normalizeBossIntentRoute_(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "summary" || v === "capture" || v === "menu" || v === "none") return v;
  return "none";
}

function TL_AI_normalizeBossSummaryKind_(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "urgent") return "attention";
  const allowed = ["pending","attention","approvals","next_steps","topic_candidates","contact_lookup","context_lookup","draft_replies","waiting_on_others","followups","open_tasks","blocked_tasks","menu","help","verticals","settings","reminders","tasks","ai_cost","none"];
  return allowed.indexOf(v) !== -1 ? v : "none";
}

function TL_AI_normalizeBossRetrievalFocus_(value) {
  const allowed = ["pending_items","recent_records","recent_contacts","recent_threads","topic_candidates"];
  const arr = Array.isArray(value) ? value : (value ? [value] : []);
  const seen = {};
  return arr.map(function(item) {
    return String(item || "").trim().toLowerCase();
  }).filter(function(item) {
    if (!item || allowed.indexOf(item) === -1 || seen[item]) return false;
    seen[item] = true;
    return true;
  }).slice(0, 2);
}

function TL_AI_normalizeBossMenuTarget_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["main","capabilities","reminders","notes","schedule","tasks","manage_work","settings","verticals","help","none",""];
  return allowed.indexOf(v) !== -1 ? v : "";
}

function TL_AI_normalizeBossCaptureState_(value) {
  const v = String(value || "").trim();
  const allowed = [
    "CAPTURE_REMINDER_RELATIVE","CAPTURE_REMINDER_DATETIME","CAPTURE_REMINDER_RECURRING",
    "CAPTURE_TASK_NO_DUE","CAPTURE_TASK_WITH_DUE","CAPTURE_TASK_DEPENDENT","CAPTURE_TASK_PERSONAL","CAPTURE_TASK_BUSINESS",
    "CAPTURE_LOG_HEALTH","CAPTURE_LOG_HABITS","CAPTURE_LOG_JOURNAL","CAPTURE_LOG_NOTE",
    "CAPTURE_SCHEDULE_BUSINESS","CAPTURE_SCHEDULE_FAMILY","CAPTURE_SCHEDULE_REMINDER","CAPTURE_CONTACT_ENRICH"
  ];
  return allowed.indexOf(v) !== -1 ? v : "";
}

function TL_AI_normalizeContactEnrichmentType_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = [
    "personal_context",
    "family_event",
    "business_context",
    "followup_context",
    "preference",
    "relationship_signal",
    "general"
  ];
  return allowed.indexOf(v) !== -1 ? v : "general";
}

function TL_AI_normalizeStringArray_(value) {
  const raw = Array.isArray(value) ? value : [value];
  const out = [];
  raw.forEach(function(item) {
    const text = String(item || "").trim();
    if (!text) return;
    if (out.indexOf(text) === -1) out.push(text);
  });
  return out.slice(0, 8);
}

function TL_AI_normalizeSearchQueryType_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["name", "name_prefix", "phone_fragment", "email", "relationship", "org"];
  return allowed.indexOf(v) !== -1 ? v : "name";
}

function TL_AI_normalizeSearchQueries_(value) {
  const out = [];
  const raw = Array.isArray(value) ? value : [];
  raw.forEach(function(item) {
    const query = item && typeof item === "object" ? item : {};
    const normalized = {
      type: TL_AI_normalizeSearchQueryType_(query.type),
      value: String(query.value || "").trim()
    };
    if (!normalized.value) return;
    const signature = normalized.type + "::" + normalized.value.toLowerCase();
    if (out.some(function(existing) {
      return (existing.type + "::" + String(existing.value || "").toLowerCase()) === signature;
    })) return;
    out.push(normalized);
  });
  return out.slice(0, 12);
}

function TL_AI_normalizeBossConfidence_(value) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 1000) / 1000;
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
