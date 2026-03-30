/**
 * TL_Menu_Handler - Boss menu flow (Hebrew).
 *
 * Flow:
 * - Boss sends "תפריט"/"menu"/"עזרה"/"help" -> return menu/help.
 * - Boss navigates numbered menus and submenus.
 * - Creation flows capture free-form text/voice and route them into the
 *   Boss-capture pipeline for AI proposal + approval.
 * - Retrieval flows return short summaries directly.
 * - When the secretary sends a decision packet, Boss replies with numbered
 *   confirmation modes that always preserve final approval control.
 *
 * State is stored per boss wa_id in ScriptProperties (lightweight).
 */

const TL_MENU = {
  TRIGGERS: ["תפריט","menu","/menu","בית","home","/home","עזרה","help","מה אפשר לעשות","מה את יכולה לעשות","מה אתה יכול לעשות","what can i do","what can you do","what can i say"],
  HELP_TRIGGERS: ["עזרה","help","מה אפשר לעשות","what can i do","what can i say"],
  BACK_TRIGGERS: ["back","go back","חזרה","חזור","חזרי","חזרה אחורה","back please"],
  CAPABILITY_TRIGGERS: ["מה את יכולה לעשות","מה אתה יכול לעשות","מה אפשר לעשות","what can you do","what can i do"],
  RESUME_TRIGGERS: ["continue","resume","continue previous","resume previous","continue previous lookup","back to previous","המשך","להמשיך","תמשיכי","תמשיך","חזרי לקודם","חזור לקודם","חזרי לבדיקה הקודמת","חזור לבדיקה הקודמת"],
  PAUSED_ITEMS_TRIGGERS: ["show paused items","show paused work","what did we leave open","show parked items","show paused","פריטים מושהים","מה הושהה","מה השארנו פתוח","מה פתוח בהשהיה","הראה פריטים מושהים"],
  COST_TRIGGERS: ["עלות","cost","ai cost","עלות ai","עלות ה-ai","עלות של ai"],
  END_TRIGGERS: ["end","סיום","סיים","סיימנו","end chat"],
  EXIT_TRIGGERS: ["יציאה","איפוס","בטל","cancel","exit","reset","stop"],
  STATE_KEY_PREFIX: "MENU_STATE_", // + wa_id
  STATE_META_KEY_PREFIX: "MENU_STATE_META_", // + wa_id
  PACKET_KEY_PREFIX: "MENU_PACKET_", // + wa_id
  LAST_INTERACTION_KEY_PREFIX: "MENU_LAST_INTERACTION_", // + wa_id
  PREPARED_REPLY_PACKET_KEY: "MENU_PREPARED_REPLY_PACKET",
  PREPARED_APPROVALS_PACKET_KEY: "MENU_PREPARED_APPROVALS_PACKET",
  PREPARED_OPPORTUNITIES_PACKET_KEY: "MENU_PREPARED_OPPORTUNITIES_PACKET",
  ONBOARDED_KEY_PREFIX: "MENU_ONBOARDED_", // + wa_id
  MAX_PENDING_SUMMARY: 5
};

var TL_MENU_RUNTIME_WAID = "";
const TL_MENU_SESSION_VERSION = "dw_menu_runtime_2026_03_28_01";

const TL_MENU_STATES = {
  ROOT: "root",
  APPROVALS_HOME: "approvals_home",
  CAPABILITIES: "capabilities",
  REMINDERS: "reminders",
  TASK_NEW: "task_new",
  LOG: "log",
  SCHEDULE: "schedule",
  MANAGE_WORK: "manage_work",
  SETTINGS: "settings",
  SETTINGS_SECRETARY: "settings_secretary",
  SETTINGS_LANGUAGE: "settings_language",
  HELP: "help",
  VERTICALS: "verticals",
  CAPTURE_BRAIN_DUMP: "capture_brain_dump",
  CAPTURE_REMINDER_RELATIVE: "capture_reminder_relative",
  CAPTURE_REMINDER_DATETIME: "capture_reminder_datetime",
  CAPTURE_REMINDER_RECURRING: "capture_reminder_recurring",
  CAPTURE_TASK_NO_DUE: "capture_task_no_due",
  CAPTURE_TASK_WITH_DUE: "capture_task_with_due",
  CAPTURE_TASK_DEPENDENT: "capture_task_dependent",
  CAPTURE_TASK_PERSONAL: "capture_task_personal",
  CAPTURE_TASK_BUSINESS: "capture_task_business",
  CAPTURE_LOG_HEALTH: "capture_log_health",
  CAPTURE_LOG_HABITS: "capture_log_habits",
  CAPTURE_LOG_JOURNAL: "capture_log_journal",
  CAPTURE_LOG_NOTE: "capture_log_note",
  CAPTURE_CONTACT_ENRICH: "capture_contact_enrich",
  CAPTURE_SCHEDULE_BUSINESS: "capture_schedule_business",
  CAPTURE_SCHEDULE_FAMILY: "capture_schedule_family",
  CAPTURE_SCHEDULE_REMINDER: "capture_schedule_reminder",
  SETTINGS_UPDATE_CADENCE: "settings_update_cadence",
  SETTINGS_DECISION_CADENCE: "settings_decision_cadence",
  SETTINGS_BATCH_SIZE: "settings_batch_size",
  SETTINGS_MENU_CUSTOMIZATION: "settings_menu_customization",
  VERTICAL_THERAPIST: "vertical_therapist",
  VERTICAL_SESSION_SUMMARIES: "vertical_session_summaries",
  VERTICAL_REPORTS: "vertical_reports"
};

function TL_Menu_BossLanguage_(waId) {
  return TL_Language_BossUiLanguage_();
}

function TL_Menu_IsEnglishUi_() {
  return !TL_Language_IsHebrew_(TL_Menu_BossLanguage_());
}

function TL_Menu_T_(hebrewText, englishText) {
  const targetLanguage = TL_Menu_BossLanguage_(TL_MENU_RUNTIME_WAID);
  if (!TL_Language_IsHebrew_(targetLanguage) && String(englishText || "").trim()) {
    return String(englishText || "").trim();
  }
  return TL_Language_UiText_(String(hebrewText || englishText || ""), targetLanguage);
}

function TL_Menu_StaticText_(hebrewText, englishText) {
  return TL_Menu_IsEnglishUi_() && String(englishText || "").trim()
    ? String(englishText || "").trim()
    : String(hebrewText || englishText || "").trim();
}

function TL_Menu_StaticBlock_(lines) {
  return (lines || []).filter(function(line) {
    return line !== null && line !== undefined;
  }).join("\n");
}

function TL_Menu_HebrewBlock_(lines) {
  return TL_Menu_T_((lines || []).filter(function(line) {
    return line !== null && line !== undefined;
  }).join("\n"));
}

function TL_Menu_HandleBossMessage_(ev, inboxRow, options) {
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const from = String(ev.from || "").trim();
  const normalizedFrom = TLW_normalizePhone_(from);
  const bossWaId = from;
  if (bossPhone && normalizedFrom !== bossPhone) return null; // if boss phone set, enforce; otherwise allow anyone

  const rawText = String(ev.text || "").trim();
  const text = rawText.toLowerCase();
  TL_MENU_RUNTIME_WAID = bossWaId;
  try {
    if (!text) {
      TL_Menu_CleanupStaleFlow_(bossWaId);
      const firstUse = TL_Menu_IsFirstUse_(bossWaId);
      TL_Menu_MarkOnboarded_(bossWaId);
      return firstUse ? TL_Menu_BuildWelcomeMenuReply_() : TL_Menu_BuildMenuReply_();
    }

    if (TL_Menu_IsMenuCommand_(rawText)) {
      TL_Menu_PrepareRootMenuCommand_(bossWaId);
      return TL_Menu_BuildMenuReply_();
    }

    if (TL_Menu_IsEndCommand_(rawText)) {
      TL_Menu_MarkOnboarded_(bossWaId);
      TL_Menu_ResetSession_(bossWaId);
      TL_Menu_SetIdleSession_(bossWaId);
      return TL_Menu_T_(
        "שיחת הבוס הסתיימה. אני במצב המתנה. אפשר להתחיל צ׳אט חדש בכל רגע על ידי שליחת כל תו.",
        "Boss AI chat ended. I am now on standby. You can start a new chat at any time by sending any character."
      );
    }

    if (TL_Menu_IsExitCommand_(rawText)) {
      TL_Menu_MarkOnboarded_(bossWaId);
      TL_Menu_ResetSession_(bossWaId);
      return TL_Menu_T_(
        "איפסתי את הזרימה הנוכחית. חזרנו למצב נקי. אם תרצה, כתוב \"תפריט\" כדי להתחיל מחדש.",
        "I reset the current flow. We are back to a clean state. If you want, type \"menu\" to start again."
      );
    }

    if (TL_Menu_IsBackCommand_(rawText)) {
      TL_Menu_MarkOnboarded_(bossWaId);
      return TL_Menu_HandleBackCommand_(bossWaId);
    }

    if (TL_Menu_IsHelpCommand_(rawText)) {
      TL_Menu_MarkOnboarded_(bossWaId);
      return TL_Menu_BuildContextualHelp_(bossWaId);
    }

    TL_Menu_CleanupStaleFlow_(bossWaId);
    const firstUse = TL_Menu_IsFirstUse_(bossWaId);

    if (TL_Menu_IsIdleSession_(bossWaId)) {
      TL_Menu_MarkOnboarded_(bossWaId);
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT, { source: "idle_wake" });
      return firstUse ? TL_Menu_BuildWelcomeMenuReply_() : TL_Menu_BuildMenuReply_();
    }

    if (TL_Menu_ShouldDefaultToMenuOnStaleInteraction_(bossWaId, rawText)) {
      TL_Menu_ResetSession_(bossWaId);
      TL_Menu_MarkOnboarded_(bossWaId);
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT, { source: "stale_restart" });
      return TL_Menu_BuildMenuReply_();
    }

    if (firstUse && !TL_Menu_HasActiveFlow_(bossWaId)) {
      TL_Menu_MarkOnboarded_(bossWaId);
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
      return TL_Menu_BuildWelcomeMenuReply_();
    }

    const menuIntent = TL_Menu_RecognizeMenuIntent_(bossWaId, rawText, options);
    if (menuIntent) {
      TL_Menu_MarkOnboarded_(bossWaId);
      TL_Menu_PauseForMenuCommand_(bossWaId);
      return TL_Menu_OpenMenuTarget_(bossWaId, menuIntent) || TL_Menu_BuildMenuReply_();
    }

    const existingPacket = TL_Menu_GetDecisionPacket_(bossWaId);
    const state = TL_Menu_GetState_(bossWaId);
    if (existingPacket && TL_Menu_IsNumericChoice_(text)) {
      const packetReplyFirst = TL_Menu_HandleDecisionPacketReply_(bossWaId, text);
      if (packetReplyFirst) return packetReplyFirst;
    }
    if (TL_Menu_IsNumericChoice_(text) && TL_Menu_IsFreshRootMenuChoiceWindow_(bossWaId, state)) {
      const armedReply = TL_Menu_HandleMenuChoice_(bossWaId, TL_MENU_STATES.ROOT, text);
      if (armedReply) return armedReply;
    }

    if (existingPacket && TL_Menu_IsResumePausedCommand_(rawText)) {
      return TL_Menu_ResumePacketFlow_(bossWaId, existingPacket);
    }
    if (TL_Menu_IsResumePausedCommand_(rawText)) {
      const resumed = TL_Menu_TryResumePausedItem_(bossWaId, rawText, options);
      if (resumed) return resumed;
    }
    let recognizedIntent = null;
    if (existingPacket && !TL_Menu_IsNumericChoice_(text)) {
      recognizedIntent = TL_Menu_PopCachedIntent_(bossWaId, rawText) || TL_Menu_RecognizeBossIntent_(rawText, options);
      const activeContinuation = TL_Menu_TryContinueActiveItem_(bossWaId, rawText, recognizedIntent, options);
      if (activeContinuation) return activeContinuation;
    }
    const shouldTreatAsPacketReply = !!existingPacket;
    if (shouldTreatAsPacketReply) {
      const packetReply = TL_Menu_HandleDecisionPacketReply_(bossWaId, text);
      if (packetReply) return packetReply;
    }

    if (TL_MENU.COST_TRIGGERS.some(function(t) { return text === t; }) || TL_Menu_IsAiCostQuery_(rawText)) {
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
      return TL_AI_BuildMonthToDateSpendReport_();
    }

    if (TL_Menu_IsPausedItemsQuery_(rawText)) {
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
      return TL_Menu_BuildPausedItemsSummary_(bossWaId);
    }

    if (TL_Menu_IsWaitingOnMeNowQuery_(rawText)) {
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
      return TL_Menu_BuildWaitingOnMeNowSummary_(bossWaId);
    }

    // Check triggers
    if (TL_MENU.TRIGGERS.some(t => text === t)) {
      const targetState = TL_MENU.CAPABILITY_TRIGGERS.some(t => text === t)
        ? TL_MENU_STATES.CAPABILITIES
        : (TL_MENU.HELP_TRIGGERS.some(t => text === t) ? TL_MENU_STATES.HELP : TL_MENU_STATES.ROOT);
      TL_Menu_SetState_(bossWaId, targetState);
      return TL_Menu_BuildMenuForState_(targetState);
    }

    if (state === TL_MENU_STATES.CAPTURE_BRAIN_DUMP && (text === "דוגמה" || text === "example")) {
      return TL_Menu_BuildBrainDumpExampleReply_();
    }

    if (TL_Menu_IsNumericChoice_(text) && !TL_Menu_ShouldPreferActiveItemNumericReply_(bossWaId, text)) {
      const reply = TL_Menu_HandleMenuChoice_(bossWaId, state, text);
      if (reply) return reply;
    }

    if (TL_Menu_IsCaptureState_(state)) {
      if (state === TL_MENU_STATES.CAPTURE_CONTACT_ENRICH) {
        TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
        const enrichCapture = TL_Menu_RunImmediateContactEnrichmentCapture_(bossWaId, inboxRow);
        if (enrichCapture && enrichCapture.sent) return "";
        return enrichCapture && enrichCapture.reply
          ? enrichCapture.reply
          : TL_Menu_T_("לא הצלחתי להכין כרגע הצעת העשרה לאיש קשר. נסה לכתוב שם ברור וההערה שחשוב לשמור.", "I couldn't prepare the CRM enrichment proposal right now. Try sending a clearer name and the detail that should be saved.");
      }
      TL_Menu_AnnotateBossCapture_(inboxRow, state);
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
      const immediateCapture = TL_Menu_RunImmediateCapture_(inboxRow);
      if (immediateCapture && immediateCapture.sent) return "";
      return [
        TL_Menu_T_("קיבלתי.", "Got it."),
        TL_Menu_T_("אבנה מזה הצעת פעולה מסודרת לאישור שלך לפני ביצוע.", "I will turn this into a structured proposal for your approval before anything is done."),
        TL_Menu_T_("אם צריך, אחזור אליך עם כרטיס אישור או שאלת הבהרה.", "If needed, I will come back with an approval card or a clarification question.")
      ].join("\n");
    }

    const intent = recognizedIntent || TL_Menu_PopCachedIntent_(bossWaId, rawText) || TL_Menu_RecognizeBossIntent_(rawText, options);
    const continued = TL_Menu_TryContinueActiveItem_(bossWaId, rawText, intent, options);
    if (continued) return continued;
    TL_Menu_PauseActiveItemForNewIntent_(bossWaId, intent);
    const routed = TL_Menu_HandleBossIntent_(ev, inboxRow, intent, options);
    if (routed) return routed;

    // On a clean start, truly unknown text falls back to the main menu.
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    if (!existingPacket && String(intent && intent.intent || "").trim().toLowerCase() === "unknown") {
      return TL_Menu_BuildMenuReply_();
    }
    return null;
  } finally {
    TL_Menu_TouchLastInteraction_(bossWaId, rawText);
    TL_MENU_RUNTIME_WAID = "";
  }
}

function TL_Menu_BuildMenuReply_() {
  return TL_Menu_BuildStaticMenuReply_();
}

function TL_Menu_BuildStaticMenuReply_() {
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "").trim();
  return TL_Menu_StaticBlock_([
    bossName
      ? TL_Menu_StaticText_("שלום " + bossName + ",", "Hello " + bossName + ",")
      : TL_Menu_StaticText_("שלום,", "Hello,"),
    TL_Menu_StaticText_("בחר אפשרות:", "Choose an option:"),
    "",
    "1. 💬 Messages That Need Your Reply",
    "2. 👤 Update Contact Info",
    "3. 🎯 Next Steps To Close Deals",
    "4. ❓ Help",
    "",
    TL_Menu_StaticText_("*שלח את מספר הבחירה שלך (למשל 1 ו-Send).*", "*Send the number of your choice (e.g. 1 and Send).*"),
    "",
    "",
    TL_Menu_StaticText_("פקודות גלובליות: menu | back | end | help", "Global commands: menu | back | end | help"),
  ]);
}

function TL_Menu_BuildWelcomeMenuReply_() {
  return TL_Menu_BuildStaticWelcomeMenuReply_();
}

function TL_Menu_BuildStaticWelcomeMenuReply_() {
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "").trim();
  return TL_Menu_StaticBlock_([
    bossName
      ? TL_Menu_StaticText_("שלום " + bossName + ",", "Hello " + bossName + ",")
      : TL_Menu_StaticText_("שלום,", "Hello,"),
    TL_Menu_StaticText_("אני העוזר שלך לניהול תקשורת ו-CRM.", "I'm your communication and CRM assistant."),
    "",
    TL_Menu_BuildStaticMenuReply_()
  ]);
}

function TL_Menu_UpdateSessionLanguage_(waId, rawText) {
  return TL_Language_BossUiLanguage_();
}

function TL_Menu_GetSessionLanguage_(waId) {
  return TL_Language_BossUiLanguage_();
}

function TL_Menu_DetectUiLanguage_(rawText, waId) {
  return TL_Language_BossUiLanguage_();
}

function TL_Menu_RecognizeMenuIntent_(waId, rawText, options) {
  const text = String(rawText || "").trim();
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ");
  if (!normalizedText) return null;

  const directTargets = [
    { target: "capabilities", phrases: ["what can you do", "what can i do", "מה אפשר לעשות", "מה את יכולה לעשות", "מה אתה יכול לעשות"] },
    { target: "help", phrases: ["help", "עזרה"] },
    { target: "reply", phrases: ["reply", "replies", "reply mode", "תשובה", "תשובות", "מענה", "תור תשובות"] },
    { target: "opportunities", phrases: ["opportunities", "opportunity", "show opportunities", "show me opportunities", "מה ההזדמנויות", "הזדמנויות", "איפה ההזדמנויות"] },
    { target: "enrich_crm", phrases: ["enrich crm", "crm", "enrich", "update crm", "עדכן crm", "העשר crm", "העשרת crm", "crm enrichment"] },
    { target: "main", phrases: ["main menu", "menu", "תפריט", "back to menu", "return to menu"] }
  ];

  for (let i = 0; i < directTargets.length; i++) {
    const candidate = directTargets[i];
    if (candidate.phrases.some(function(phrase) { return normalizedText === phrase; })) {
      return { menu_target: candidate.target };
    }
  }

  const recognizeIntentFn = options && typeof options.intentFn === "function"
    ? options.intentFn
    : TL_Menu_RecognizeBossIntent_;
  if (typeof recognizeIntentFn !== "function" || TL_Menu_IsNumericChoice_(normalizedText)) return null;
  const recognized = TL_AI_normalizeBossIntent_(recognizeIntentFn(text, options) || {});
  if (!recognized) return null;
  if (String(recognized.route || "").trim().toLowerCase() === "menu" || String(recognized.intent || "").trim().toLowerCase() === "show_menu") {
    return recognized;
  }
  if (String(recognized.intent || "").trim().toLowerCase() === "help") {
    return { menu_target: "help" };
  }
  return null;
}

function TL_Menu_SetState_(waId, state, metaExtras) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return;
  const props = PropertiesService.getScriptProperties();
  props.setProperty(TL_MENU.STATE_KEY_PREFIX + safeWaId, state);
  const baseMeta = {
    state: String(state || TL_MENU_STATES.ROOT),
    updated_at: new Date().toISOString(),
    session_version: TL_Menu_SessionRuntimeVersion_()
  };
  const extras = metaExtras && typeof metaExtras === "object" ? metaExtras : {};
  props.setProperty(TL_MENU.STATE_META_KEY_PREFIX + safeWaId, JSON.stringify(Object.assign(baseMeta, extras)));
}

function TL_Menu_GetState_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return TL_MENU_STATES.ROOT;
  const props = PropertiesService.getScriptProperties();
  const value = String(props.getProperty(TL_MENU.STATE_KEY_PREFIX + safeWaId) || TL_MENU_STATES.ROOT);
  const meta = TL_Menu_GetStateMeta_(safeWaId, props);
  if (value !== TL_MENU_STATES.ROOT && !TL_Menu_IsStateMetaValid_(meta)) {
    TL_Menu_ClearState_(safeWaId);
    return TL_MENU_STATES.ROOT;
  }
  return value === "idle" ? TL_MENU_STATES.ROOT : value;
}

function TL_Menu_GetStoredStateValue_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return TL_MENU_STATES.ROOT;
  return String(PropertiesService.getScriptProperties().getProperty(TL_MENU.STATE_KEY_PREFIX + safeWaId) || TL_MENU_STATES.ROOT).trim();
}

function TL_Menu_IsIdleSession_(waId) {
  return TL_Menu_GetStoredStateValue_(waId) === "idle";
}

function TL_Menu_ClearState_(waId) {
  try {
    const safeWaId = String(waId || "").trim();
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.STATE_KEY_PREFIX + safeWaId);
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.STATE_META_KEY_PREFIX + safeWaId);
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_ResetSession_(waId) {
  TL_Menu_ClearDecisionPacket_(waId);
  TL_Menu_ClearState_(waId);
  if (typeof TL_ActiveItem_Clear_ === "function") TL_ActiveItem_Clear_(waId);
  if (typeof TL_ActiveItem_ClearPaused_ === "function") TL_ActiveItem_ClearPaused_(waId);
  return true;
}

function TL_Menu_SetIdleSession_(waId) {
  TL_Menu_SetState_(waId, "idle", { source: "end_command" });
  return true;
}

function TL_Menu_IsNumericChoice_(text) {
  return !!TL_Menu_ParseChoice_(text);
}

function TL_Menu_IsFreshRootMenuChoiceWindow_(waId, state) {
  if (String(state || "").trim() !== TL_MENU_STATES.ROOT) return false;
  const meta = TL_Menu_GetStateMeta_(waId);
  if (!meta) return false;
  if (String(meta.source || "").trim().toLowerCase() !== "menu_command") return false;
  return TL_Menu_IsRecentIso_(String(meta.updated_at || "").trim(), 3);
}

function TL_Menu_BossContextRestartMinutes_() {
  const raw = Number(TLW_getSetting_("BOSS_CONTEXT_RESTART_MINUTES") || 15);
  return isFinite(raw) && raw > 0 ? raw : 15;
}

function TL_Menu_GetLastInteractionMeta_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return null;
  try {
    const raw = String(PropertiesService.getScriptProperties().getProperty(TL_MENU.LAST_INTERACTION_KEY_PREFIX + safeWaId) || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    return null;
  }
}

function TL_Menu_TouchLastInteraction_(waId, rawText) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return false;
  try {
    PropertiesService.getScriptProperties().setProperty(TL_MENU.LAST_INTERACTION_KEY_PREFIX + safeWaId, JSON.stringify({
      at: new Date().toISOString(),
      text: String(rawText || "").trim().slice(0, 80),
      session_version: TL_Menu_SessionRuntimeVersion_()
    }));
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_IsStaleInteraction_(waId, nowMs) {
  const meta = TL_Menu_GetLastInteractionMeta_(waId);
  if (!meta) return false;
  return !TL_Menu_IsFlowRecordValid_(
    String(meta.at || "").trim(),
    String(meta.session_version || "").trim(),
    TL_Menu_BossContextRestartMinutes_(),
    nowMs || Date.now()
  );
}

function TL_Menu_ShouldDefaultToMenuOnStaleInteraction_(waId, rawText, nowMs) {
  const text = String(rawText || "").trim();
  if (!text) return false;
  if (TL_Menu_IsMenuCommand_(text) || TL_Menu_IsHelpCommand_(text) || TL_Menu_IsBackCommand_(text) || TL_Menu_IsEndCommand_(text) || TL_Menu_IsExitCommand_(text) || TL_Menu_IsResumePausedCommand_(text)) {
    return false;
  }
  return TL_Menu_IsStaleInteraction_(waId, nowMs);
}

function TL_Menu_IsMenuCommand_(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return ["תפריט", "menu", "/menu", "בית", "home", "/home"].some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  });
}

function TL_Menu_IsHelpCommand_(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (TL_MENU.CAPABILITY_TRIGGERS.some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  })) return false;
  return TL_MENU.HELP_TRIGGERS.some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  });
}

function TL_Menu_IsBackCommand_(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  return TL_MENU.BACK_TRIGGERS.some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  });
}

function TL_Menu_IsEndCommand_(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  return TL_MENU.END_TRIGGERS.some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  });
}

function TL_Menu_IsWaitingOnMeNowQuery_(rawText) {
  const text = String(rawText || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  return [
    "what's waiting on me now",
    "what is waiting on me now",
    "show me what's waiting on me now",
    "show me what is waiting on me now",
    "what needs me now",
    "show me what needs me now",
    "מה מחכה לי עכשיו",
    "מה ממתין לי עכשיו",
    "מה צריך אותי עכשיו"
  ].indexOf(text) !== -1;
}

function TL_Menu_ParseChoice_(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{1,2})(?:\s|[).,:-]|$)/);
  if (match && match[1]) return String(match[1]).trim();
  return /^\d+$/.test(normalized) ? normalized : "";
}

function TL_Menu_IsExitCommand_(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  if (TL_Menu_ParseChoice_(normalized) === "0") return true;
  return TL_MENU.EXIT_TRIGGERS.some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  });
}

function TL_Menu_IsCaptureState_(state) {
  return String(state || "").indexOf("capture_") === 0;
}

function TL_Menu_HandleMenuChoice_(waId, state, choice) {
  const current = String(state || TL_MENU_STATES.ROOT);
  const value = TL_Menu_ParseChoice_(choice);
  if (!value) return null;
  switch (current) {
    case TL_MENU_STATES.ROOT: return TL_Menu_HandleRootChoice_(waId, value);
    case TL_MENU_STATES.APPROVALS_HOME: return TL_Menu_HandleApprovalsHomeChoice_(waId, value);
    case TL_MENU_STATES.CAPABILITIES: return TL_Menu_HandleCapabilitiesChoice_(waId, value);
    case TL_MENU_STATES.REMINDERS: return TL_Menu_HandleRemindersChoice_(waId, value);
    case TL_MENU_STATES.TASK_NEW: return TL_Menu_HandleTaskChoice_(waId, value);
    case TL_MENU_STATES.LOG: return TL_Menu_HandleLogChoice_(waId, value);
    case TL_MENU_STATES.SCHEDULE: return TL_Menu_HandleScheduleChoice_(waId, value);
    case TL_MENU_STATES.MANAGE_WORK: return TL_Menu_HandleManageWorkChoice_(waId, value);
    case TL_MENU_STATES.SETTINGS: return TL_Menu_HandleSettingsChoice_(waId, value);
    case TL_MENU_STATES.SETTINGS_SECRETARY: return TL_Menu_HandleSettingsSecretaryChoice_(waId, value);
    case TL_MENU_STATES.SETTINGS_LANGUAGE: return TL_Menu_HandleSettingsLanguageChoice_(waId, value);
    case TL_MENU_STATES.HELP: return TL_Menu_HandleHelpChoice_(waId, value);
    case TL_MENU_STATES.VERTICALS: return TL_Menu_HandleVerticalsChoice_(waId, value);
    default: return null;
  }
}

function TL_Menu_HandleRootChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenReplyHome_(waId);
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, TL_Menu_T_(
    "כתבו או הקליטו מה חשוב לשמור על איש הקשר, וגם כל רמז שיעזור לי לזהות אותו: שם, כינוי, תפקיד, קרבה, ספרות מהטלפון, אימייל או דומיין. לדוגמה: תוסיפי שהקבלן מירושלים רגיש למחיר, או שלדוד מ-gmail יש בת שהתחתנה.",
    "Write or record what is important to save about the contact, plus any hint that can help me identify them: name, nickname, role, relationship, phone digits, email, or domain. Example: add that the contractor from Jerusalem is price sensitive, or that David from gmail has a daughter who got married."
  ));
  if (choice === "3") return TL_Menu_OpenOpportunities_(waId);
  if (choice === "4") return TL_Menu_BuildHelpMenu_();
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_OpenReplyHome_(waId) {
  const prepared = TL_Menu_GetPreparedReplyPacket_();
  const items = prepared && Array.isArray(prepared.items) ? prepared.items.slice() : TL_Menu_CollectApprovalPacketItems_("reply");
  if (!items.length) {
    TL_Menu_SetState_(waId, TL_MENU_STATES.ROOT);
    TL_Menu_ClearDecisionPacket_(waId);
    return [
      TL_Menu_T_("אין כרגע פריטי תשובה פתוחים.", "There are no open reply items right now."),
      "",
      TL_Menu_BuildMenuReply_()
    ].join("\n");
  }
  let packet = null;
  if (prepared && Array.isArray(prepared.items) && prepared.items.length) {
    packet = {
      kind: "decision",
      stage: "one_by_one",
      cursor: 0,
      created_at: new Date().toISOString(),
      session_version: typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : TL_MENU_SESSION_VERSION,
      source: "prepared_reply_queue",
      items: prepared.items.slice()
    };
    TL_Menu_SetDecisionPacket_(waId, packet);
  } else {
    TL_Menu_StoreDecisionPacket_(waId, "decision", items);
    packet = TL_Menu_GetDecisionPacket_(waId);
    if (packet) {
      packet.stage = "one_by_one";
      packet.cursor = 0;
      TL_Menu_SetDecisionPacket_(waId, packet);
    }
  }
  TL_Menu_SetState_(waId, TL_MENU_STATES.ROOT, { source: "decision_packet" });
  return [
    TL_Menu_T_("פותח את תור התשובות.", "Opening the reply queue."),
    TL_Menu_T_("ממתינות לתשובה: ", "Reply items waiting: ") + items.length,
    "",
    packet ? TL_Menu_BuildDecisionPacketOneByOneReply_(packet) : TL_Menu_T_("לא הצלחתי לפתוח את תור התשובות.", "I couldn't open the reply queue.")
  ].join("\n");
}

function TL_Menu_ReplyPrepTtlMinutes_() {
  const raw = Number(TLW_getSetting_("REPLY_PREP_TTL_MINUTES") || 10);
  if (!isFinite(raw) || raw <= 0) return 10;
  return Math.min(Math.floor(raw), 60);
}

function TL_Menu_BossSnapshotTtlMinutes_() {
  const raw = Number(TLW_getSetting_("BOSS_SNAPSHOT_TTL_MINUTES") || TL_Menu_ReplyPrepTtlMinutes_());
  if (!isFinite(raw) || raw <= 0) return TL_Menu_ReplyPrepTtlMinutes_();
  return Math.min(Math.floor(raw), 60);
}

function TL_Menu_ClearPreparedReplyPacket_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.PREPARED_REPLY_PACKET_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_SetPreparedReplyPacket_(items, meta) {
  const payload = {
    prepared_at: new Date().toISOString(),
    session_version: typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : TL_MENU_SESSION_VERSION,
    item_count: Array.isArray(items) ? items.length : 0,
    source: String(meta && meta.source || "background").trim(),
    items: Array.isArray(items) ? items.slice(0, 25) : []
  };
  try {
    PropertiesService.getScriptProperties().setProperty(TL_MENU.PREPARED_REPLY_PACKET_KEY, JSON.stringify(payload));
    return payload;
  } catch (e) {
    return null;
  }
}

function TL_Menu_GetPreparedReplyPacket_() {
  try {
    const raw = String(PropertiesService.getScriptProperties().getProperty(TL_MENU.PREPARED_REPLY_PACKET_KEY) || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    const version = typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : TL_MENU_SESSION_VERSION;
    if (String(parsed.session_version || "").trim() !== String(version || "").trim()) {
      TL_Menu_ClearPreparedReplyPacket_();
      return null;
    }
    if (!TL_Menu_IsRecentIso_(String(parsed.prepared_at || "").trim(), TL_Menu_ReplyPrepTtlMinutes_())) {
      TL_Menu_ClearPreparedReplyPacket_();
      return null;
    }
    return parsed;
  } catch (e) {
    TL_Menu_ClearPreparedReplyPacket_();
    return null;
  }
}

function TL_Menu_PrepareReplyPacketCache_() {
  const startedAt = Date.now();
  const items = TL_Menu_CollectApprovalPacketItems_("reply");
  const payload = TL_Menu_SetPreparedReplyPacket_(items, { source: "orchestrator" });
  return {
    ok: true,
    item_count: Array.isArray(items) ? items.length : 0,
    cached: !!payload,
    elapsed_ms: Date.now() - startedAt
  };
}

function TL_Menu_ClearPreparedApprovalsPacket_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.PREPARED_APPROVALS_PACKET_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_SetPreparedApprovalsPacket_(items, meta) {
  const payload = {
    prepared_at: new Date().toISOString(),
    session_version: typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : TL_MENU_SESSION_VERSION,
    item_count: Array.isArray(items) ? items.length : 0,
    source: String(meta && meta.source || "background").trim(),
    items: Array.isArray(items) ? items.slice(0, 50) : []
  };
  try {
    PropertiesService.getScriptProperties().setProperty(TL_MENU.PREPARED_APPROVALS_PACKET_KEY, JSON.stringify(payload));
    return payload;
  } catch (e) {
    return null;
  }
}

function TL_Menu_GetPreparedApprovalsPacket_() {
  try {
    const raw = String(PropertiesService.getScriptProperties().getProperty(TL_MENU.PREPARED_APPROVALS_PACKET_KEY) || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    const version = typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : TL_MENU_SESSION_VERSION;
    if (String(parsed.session_version || "").trim() !== String(version || "").trim()) {
      TL_Menu_ClearPreparedApprovalsPacket_();
      return null;
    }
    if (!TL_Menu_IsRecentIso_(String(parsed.prepared_at || "").trim(), TL_Menu_BossSnapshotTtlMinutes_())) {
      TL_Menu_ClearPreparedApprovalsPacket_();
      return null;
    }
    return parsed;
  } catch (e) {
    TL_Menu_ClearPreparedApprovalsPacket_();
    return null;
  }
}

function TL_Menu_ClearPreparedOpportunitiesPacket_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.PREPARED_OPPORTUNITIES_PACKET_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_SetPreparedOpportunitiesPacket_(packetItems, meta) {
  const payload = {
    prepared_at: new Date().toISOString(),
    session_version: typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : TL_MENU_SESSION_VERSION,
    item_count: Array.isArray(packetItems) ? packetItems.length : 0,
    source: String(meta && meta.source || "background").trim(),
    items: Array.isArray(packetItems) ? packetItems.slice(0, 10) : []
  };
  try {
    PropertiesService.getScriptProperties().setProperty(TL_MENU.PREPARED_OPPORTUNITIES_PACKET_KEY, JSON.stringify(payload));
    return payload;
  } catch (e) {
    return null;
  }
}

function TL_Menu_GetPreparedOpportunitiesPacket_() {
  try {
    const raw = String(PropertiesService.getScriptProperties().getProperty(TL_MENU.PREPARED_OPPORTUNITIES_PACKET_KEY) || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    const version = typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : TL_MENU_SESSION_VERSION;
    if (String(parsed.session_version || "").trim() !== String(version || "").trim()) {
      TL_Menu_ClearPreparedOpportunitiesPacket_();
      return null;
    }
    if (!TL_Menu_IsRecentIso_(String(parsed.prepared_at || "").trim(), TL_Menu_BossSnapshotTtlMinutes_())) {
      TL_Menu_ClearPreparedOpportunitiesPacket_();
      return null;
    }
    return parsed;
  } catch (e) {
    TL_Menu_ClearPreparedOpportunitiesPacket_();
    return null;
  }
}

function TL_Menu_ClearPreparedBossSnapshots_() {
  return {
    reply: TL_Menu_ClearPreparedReplyPacket_(),
    approvals: TL_Menu_ClearPreparedApprovalsPacket_(),
    opportunities: TL_Menu_ClearPreparedOpportunitiesPacket_()
  };
}

function TL_Menu_PrepareBossSnapshots_() {
  const startedAt = Date.now();
  const allItems = TL_Menu_CollectApprovalPacketItems_("all");
  const replyItems = (allItems || []).filter(function(item) {
    return TL_Menu_MatchesApprovalCategory_(item, "reply");
  });
  const opportunities = TL_Menu_BuildOpportunityPacketItems_(TL_Menu_ListOpportunityCandidates_(3));
  const replyPayload = TL_Menu_SetPreparedReplyPacket_(replyItems, { source: "orchestrator" });
  const approvalsPayload = TL_Menu_SetPreparedApprovalsPacket_(allItems, { source: "orchestrator" });
  const opportunitiesPayload = TL_Menu_SetPreparedOpportunitiesPacket_(opportunities, { source: "orchestrator" });
  return {
    ok: true,
    reply_count: replyItems.length,
    approvals_count: allItems.length,
    opportunities_count: opportunities.length,
    cached_reply: !!replyPayload,
    cached_approvals: !!approvalsPayload,
    cached_opportunities: !!opportunitiesPayload,
    elapsed_ms: Date.now() - startedAt
  };
}

function TL_Menu_OpenOpportunities_(waId) {
  TL_Menu_SetState_(waId, TL_MENU_STATES.ROOT);
  const prepared = TL_Menu_GetPreparedOpportunitiesPacket_();
  const packetItems = prepared && Array.isArray(prepared.items)
    ? prepared.items.slice()
    : TL_Menu_BuildOpportunityPacketItems_(TL_Menu_ListOpportunityCandidates_(3));
  if (!packetItems.length) {
    return [
      TL_Menu_T_("הזדמנויות", "Opportunities"),
      TL_Menu_T_(
        "אין כרגע הזדמנויות בולטות. ברגע שיצטברו יותר זיכרון CRM ופעולות המשך, אדרג כאן על מי כדאי לעבוד עכשיו.",
        "There are no strong opportunities right now. As more CRM memory and next actions accumulate, I will rank who is best to work on here."
      )
    ].join("\n\n");
  }
  TL_Menu_SetDecisionPacket_(waId, {
    kind: "opportunity",
    stage: "one_by_one",
    cursor: 0,
    created_at: new Date().toISOString(),
    items: packetItems
  });
  const packet = TL_Menu_GetDecisionPacket_(waId);
  return [
    TL_Menu_T_("הזדמנויות", "Opportunities"),
    TL_Menu_T_(
      "במצב הזה אני מציגה הזדמנות אחת בכל פעם. העתיקו את הנוסח, שלחו ידנית מהערוץ העסקי שלכם, ואז עברו להזדמנות הבאה.",
      "In this mode I show one opportunity at a time. Copy the draft, send it manually from your business channel, then move to the next opportunity."
    ),
    packet ? TL_Menu_BuildDecisionPacketOneByOneReply_(packet) : TL_Menu_T_("לא הצלחתי לפתוח את ההזדמנויות כרגע.", "I couldn't open opportunities right now.")
  ].filter(Boolean).join("\n\n");
}

function TL_Menu_OpenApprovalsHome_(waId) {
  const prepared = TL_Menu_GetPreparedApprovalsPacket_();
  const items = prepared && Array.isArray(prepared.items) ? prepared.items.slice() : TL_Menu_CollectApprovalPacketItems_("all");
  if (!items.length) {
    TL_Menu_SetState_(waId, TL_MENU_STATES.ROOT);
    TL_Menu_ClearDecisionPacket_(waId);
    return [
      TL_Menu_T_("אין כרגע טיפולים מוצעים שמחכים לאישור."),
      "",
      TL_Menu_BuildMenuReply_()
    ].join("\n");
  }
  TL_Menu_SetState_(waId, TL_MENU_STATES.APPROVALS_HOME);
  return TL_Menu_BuildApprovalsHomeMenu_(waId, items);
}

function TL_Menu_HandleApprovalsHomeChoice_(waId, choice) {
  const category = ({
    "1": "email",
    "2": "whatsapp",
    "3": "reminders",
    "4": "tasks",
    "5": "all"
  })[String(choice || "").trim()];
  if (!category) return TL_Menu_BuildApprovalsHomeMenu_(waId);

  const prepared = TL_Menu_GetPreparedApprovalsPacket_();
  const preparedItems = prepared && Array.isArray(prepared.items) ? prepared.items.slice() : null;
  const items = preparedItems
    ? preparedItems.filter(function(item) { return TL_Menu_MatchesApprovalCategory_(item, category); })
    : TL_Menu_CollectApprovalPacketItems_(category);
  if (!items.length) {
    return [
      TL_Menu_BuildApprovalCategoryEmptyText_(category),
      "",
      TL_Menu_BuildApprovalsHomeMenu_(waId)
    ].join("\n");
  }

  TL_Menu_StoreDecisionPacket_(waId, "decision", items);
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (packet) {
    packet.stage = "one_by_one";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
  }
  TL_Menu_SetState_(waId, TL_MENU_STATES.ROOT);
  return [
    TL_Menu_BuildApprovalCategoryIntro_(category, items.length),
    "",
    packet ? TL_Menu_BuildDecisionPacketOneByOneReply_(packet) : TL_Menu_T_("לא הצלחתי לפתוח את הפריטים לסקירה.")
  ].join("\n");
}

function TL_Menu_HandleRemindersChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_REMINDER_RELATIVE, TL_Menu_T_(
    "כתוב/אמור את התזכורת. לדוגמה: \"תזכירי לי בעוד שעתיים להתקשר ליעקב\".",
    "Write or say the reminder. Example: \"Remind me in two hours to call Yaakov.\""
  ));
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_REMINDER_DATETIME, TL_Menu_T_(
    "כתוב/אמור את התזכורת עם תאריך ושעה. לדוגמה: \"תזכירי לי מחר ב-08:00 לקחת תרופה\".",
    "Write or say the reminder with date and time. Example: \"Remind me tomorrow at 08:00 to take my medicine.\""
  ));
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_REMINDER_RECURRING, TL_Menu_T_(
    "כתוב/אמור את התזכורת החוזרת. לדוגמה: \"תזכירי לי כל יום ב-22:00 לקחת כדור\".",
    "Write or say the recurring reminder. Example: \"Remind me every day at 22:00 to take a pill.\""
  ));
  if (choice === "4") return TL_Menu_BuildRemindersSummary_();
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "6") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildRemindersMenu_();
}

function TL_Menu_HandleTaskChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_NO_DUE, TL_Menu_T_("כתוב/אמור את פרטי המשימה בלי תאריך יעד.", "Write or say the task details without a due date."));
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_WITH_DUE, TL_Menu_T_(
    "כתוב/אמור את המשימה עם תאריך יעד. לדוגמה: \"תפתחי לי משימה לשלוח הצעת מחיר עד יום חמישי\".",
    "Write or say the task with a due date. Example: \"Create a task to send the price quote by Thursday.\""
  ));
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_DEPENDENT, TL_Menu_T_(
    "כתוב/אמור את המשימה והתלות. לדוגמה: \"תפתחי משימה להתקשר ליעקב אחרי שדני שולח מחירים\".",
    "Write or say the task and its dependency. Example: \"Create a task to call Yaakov after Danny sends the prices.\""
  ));
  if (choice === "4") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_PERSONAL, TL_Menu_T_("כתוב/אמור את המשימה האישית.", "Write or say the personal task."));
  if (choice === "5") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_BUSINESS, TL_Menu_T_("כתוב/אמור את המשימה העסקית.", "Write or say the business task."));
  if (choice === "6") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "7") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildTaskMenu_();
}

function TL_Menu_HandleLogChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_HEALTH, TL_Menu_T_("כתוב/אמור מה לרשום בבריאות / תרופות.", "Write or say what to log for health / medication."));
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_HABITS, TL_Menu_T_("כתוב/אמור מה לרשום בספורט / הרגלים.", "Write or say what to log for sports / habits."));
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_JOURNAL, TL_Menu_T_("כתוב/אמור מה לרשום ביומן האישי.", "Write or say what to log in the personal journal."));
  if (choice === "4") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_NOTE, TL_Menu_T_("כתוב/אמור את ההערה הכללית.", "Write or say the general note."));
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "6") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildLogMenu_();
}

function TL_Menu_HandleScheduleChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_SCHEDULE_BUSINESS, TL_Menu_T_(
    "כתוב/אמור את פרטי הפגישה העסקית. לדוגמה: \"תקבעי לי פגישה עם רותי ביום חמישי ב-15:00\".",
    "Write or say the business meeting details. Example: \"Schedule a meeting with Ruti on Thursday at 15:00.\""
  ));
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_SCHEDULE_FAMILY, TL_Menu_T_("כתוב/אמור את פרטי האירוע המשפחתי.", "Write or say the family event details."));
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_SCHEDULE_REMINDER, TL_Menu_T_("כתוב/אמור תזכורת עם זמן.", "Write or say a timed reminder."));
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_(
    TL_Menu_T_("מה יש לי ביומן", "What's on my calendar"),
    TL_Menu_T_("תצוגת יומן מלאה תתחבר למסלול היומן. כרגע הסיידקאר קיים אבל לא מחובר עדיין לתשובת תפריט.", "A full calendar view will connect to the calendar flow. The sidecar exists, but it is not yet wired into the menu reply.")
  );
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "6") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildScheduleMenu_();
}

function TL_Menu_HandleManageWorkChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_BuildPendingSummary_();
  if (choice === "2") return TL_Menu_BuildUrgentSummary_();
  if (choice === "3") return TL_Menu_BuildAwaitingApprovalSummary_(waId);
  if (choice === "4") return TL_Menu_BuildSuggestedNextSteps_();
  if (choice === "5") return TL_Menu_BuildTopicCandidatesSummary_(waId);
  if (choice === "6") return TL_Menu_BuildPausedItemsSummary_(waId);
  if (choice === "7") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "8") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildManageWorkMenu_();
}

function TL_Menu_HandleSettingsChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS_SECRETARY);
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("תדירות עדכונים", "Update cadence"), TL_Menu_T_("עריכת תדירות העדכונים דרך התפריט עוד לא חוברה. כרגע זה נשלט מ-SETTINGS דרך BOSS_UPDATE_INTERVAL_MINUTES.", "Changing update cadence through the menu is not wired yet. Right now it is controlled from SETTINGS via BOSS_UPDATE_INTERVAL_MINUTES."));
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("תדירות בקשות החלטה", "Decision request cadence"), TL_Menu_T_("עריכת תדירות בקשות החלטה דרך התפריט עוד לא חוברה. כרגע זה נשלט מ-SETTINGS דרך BOSS_DECISION_REQUEST_INTERVAL_MINUTES.", "Changing decision request cadence through the menu is not wired yet. Right now it is controlled from SETTINGS via BOSS_DECISION_REQUEST_INTERVAL_MINUTES."));
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("גודל אצווה להחלטות", "Decision batch size"), TL_Menu_T_("עריכת גודל אצווה דרך התפריט עוד לא חוברה. כרגע זה נשלט מ-SETTINGS דרך BOSS_DECISION_BATCH_SIZE ו-BOSS_MAX_ITEMS_PER_DIGEST.", "Changing batch size through the menu is not wired yet. Right now it is controlled from SETTINGS via BOSS_DECISION_BATCH_SIZE and BOSS_MAX_ITEMS_PER_DIGEST."));
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS_LANGUAGE);
  if (choice === "6") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("התאמה אישית של התפריט", "Menu customization"), TL_Menu_T_("התאמה אישית של התפריט עוד לא חוברה, אבל המבנה כבר מוגדר כרודמאפ.", "Menu customization is not wired yet, but the structure is already defined in the roadmap."));
  if (choice === "7") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "8") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildSettingsMenu_();
}

function TL_Menu_HandleSettingsSecretaryChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("הפעל / כבה דחוף בלבד", "Urgent-only mode"), TL_Menu_T_("שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.", "Changing this through the menu is not wired yet. Right now the value is controlled from SETTINGS."));
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("רמת התערבות", "Intervention level"), TL_Menu_T_("שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.", "Changing this through the menu is not wired yet. Right now the value is controlled from SETTINGS."));
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("דחופים תמיד ראשונים", "Urgent always first"), TL_Menu_T_("שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.", "Changing this through the menu is not wired yet. Right now the value is controlled from SETTINGS."));
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("FYI בעדכון", "Include FYI in updates"), TL_Menu_T_("שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.", "Changing this through the menu is not wired yet. Right now the value is controlled from SETTINGS."));
  if (choice === "5") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("נא לא להפריע", "Do not disturb"), TL_Menu_T_("שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.", "Changing this through the menu is not wired yet. Right now the value is controlled from SETTINGS."));
  if (choice === "6") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS);
  if (choice === "7") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildSettingsSecretaryMenu_();
}

function TL_Menu_HandleSettingsLanguageChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("עברית להכל", "Hebrew for everything"), TL_Menu_T_("ברירת המחדל כרגע היא עברית. שינוי מלא דרך התפריט עוד לא חובר.", "The default is currently Hebrew. Full change through the menu is not wired yet."));
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("שפת תפריט", "Menu language"), TL_Menu_T_("שפת תפריט נרשמה כדרישת המשך, אבל שינוי דרך התפריט עוד לא חובר.", "Menu language is noted as a follow-up requirement, but changing it through the menu is not wired yet."));
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("שפת AI", "AI language"), TL_Menu_T_("שפת AI נרשמה כדרישת המשך, אבל שינוי דרך התפריט עוד לא חובר.", "AI language is noted as a follow-up requirement, but changing it through the menu is not wired yet."));
  if (choice === "4") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS);
  if (choice === "5") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildSettingsLanguageMenu_();
}

function TL_Menu_HandleHelpChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenReplyHome_(waId);
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, TL_Menu_T_(
    "כתוב או הקלט מה חשוב לשמור על איש הקשר.",
    "Write or record what is important to save about the contact."
  ));
  if (choice === "3") return TL_Menu_OpenOpportunities_(waId);
  if (choice === "4") return TL_Menu_BuildContextualHelp_(waId);
  if (choice === "5") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildHelpMenu_();
}

function TL_Menu_HandleVerticalsChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("מטפלת / מטופלים", "Therapist / clients"), TL_Menu_T_("המסלול הייעודי הזה עוד לא מומש, אבל הוא על הרודמאפ כמודול ורטיקלי.", "This dedicated flow is not implemented yet, but it is on the roadmap as a vertical module."));
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("סיכומי מפגשים", "Session summaries"), TL_Menu_T_("המסלול הזה עוד לא מומש, אבל הוא שמור כיכולות עתידיות.", "This flow is not implemented yet, but it is reserved as future capability."));
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_(TL_Menu_T_("דוחות תקופתיים", "Periodic reports"), TL_Menu_T_("המסלול הזה עוד לא מומש, אבל הוא שמור כיכולות עתידיות.", "This flow is not implemented yet, but it is reserved as future capability."));
  if (choice === "4") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "5") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildVerticalsMenu_();
}

function TL_Menu_HandleCapabilitiesChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenReplyHome_(waId);
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, TL_Menu_T_(
    "כתוב או הקלט מה חשוב לשמור על איש הקשר. לדוגמה: פגשתי את דוד והוא אמר שהבת שלו התחתנה.",
    "Write or record what is important to save about the contact. Example: I met David and he said his daughter got married."
  ));
  if (choice === "3") return TL_Menu_OpenOpportunities_(waId);
  if (choice === "4") return TL_Menu_BuildContextualHelp_(waId);
  if (choice === "5") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildCapabilitiesMenu_();
}

function TL_Menu_OpenSubmenu_(waId, state) {
  TL_Menu_SetState_(waId, state);
  return TL_Menu_BuildMenuForState_(state);
}

function TL_Menu_OpenCapture_(waId, state, prompt) {
  TL_Menu_SetState_(waId, state);
  return String(prompt || TL_Menu_T_("כתוב/אמור את הפרטים.", "Write or say the details."));
}

function TL_Menu_BuildMenuForState_(state) {
  switch (String(state || TL_MENU_STATES.ROOT)) {
    case TL_MENU_STATES.APPROVALS_HOME: return TL_Menu_BuildApprovalsHomeMenu_();
    case TL_MENU_STATES.CAPABILITIES: return TL_Menu_BuildCapabilitiesMenu_();
    case TL_MENU_STATES.REMINDERS: return TL_Menu_BuildRemindersMenu_();
    case TL_MENU_STATES.TASK_NEW: return TL_Menu_BuildTaskMenu_();
    case TL_MENU_STATES.LOG: return TL_Menu_BuildLogMenu_();
    case TL_MENU_STATES.SCHEDULE: return TL_Menu_BuildScheduleMenu_();
    case TL_MENU_STATES.MANAGE_WORK: return TL_Menu_BuildManageWorkMenu_();
    case TL_MENU_STATES.SETTINGS: return TL_Menu_BuildSettingsMenu_();
    case TL_MENU_STATES.SETTINGS_SECRETARY: return TL_Menu_BuildSettingsSecretaryMenu_();
    case TL_MENU_STATES.SETTINGS_LANGUAGE: return TL_Menu_BuildSettingsLanguageMenu_();
    case TL_MENU_STATES.HELP: return TL_Menu_BuildHelpMenu_();
    case TL_MENU_STATES.VERTICALS: return TL_Menu_BuildVerticalsMenu_();
    default: return TL_Menu_BuildMenuReply_();
  }
}

function TL_Menu_BuildRemindersMenu_() {
  return TL_Menu_HebrewBlock_([
    "תזכורות",
    "1. בעוד זמן מסוים",
    "2. בתאריך ושעה",
    "3. כל יום / כל שבוע",
    "4. רשימת תזכורות",
    "5. חזרה לתפריט קודם",
    "6. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildTaskMenu_() {
  return TL_Menu_HebrewBlock_([
    "משימה חדשה",
    "1. בלי תאריך",
    "2. עם תאריך",
    "3. תלויה במשהו אחר",
    "4. משימה אישית",
    "5. משימה עסקית",
    "6. חזרה לתפריט קודם",
    "7. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildLogMenu_() {
  return TL_Menu_HebrewBlock_([
    "רישום",
    "1. בריאות / תרופות",
    "2. ספורט / הרגלים",
    "3. יומן אישי",
    "4. הערה כללית",
    "5. חזרה לתפריט קודם",
    "6. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildScheduleMenu_() {
  return TL_Menu_HebrewBlock_([
    "יומן ותיאום",
    "1. פגישה עסקית",
    "2. אירוע משפחתי",
    "3. תזכורת עם זמן",
    "4. מה יש לי ביומן",
    "5. חזרה לתפריט קודם",
    "6. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildManageWorkMenu_() {
  return TL_Menu_HebrewBlock_([
    "ניהול העבודה",
    "1. מה על הצלחת שלי עכשיו",
    "2. מה צריך תשומת לב",
    "3. ממתין לאישורים",
    "4. הצע לי צעדים הבאים",
    "5. מועמדי נושא לקידום",
    "6. פריטים מושהים",
    "7. חזרה לתפריט קודם",
    "8. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildSettingsMenu_() {
  return TL_Menu_HebrewBlock_([
    "הגדרות",
    "1. הגדרות המזכירה",
    "2. תדירות עדכונים",
    "3. תדירות בקשות החלטה",
    "4. גודל אצווה להחלטות",
    "5. שפה",
    "6. התאמה אישית של התפריט",
    "7. חזרה לתפריט קודם",
    "8. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildSettingsSecretaryMenu_() {
  return TL_Menu_HebrewBlock_([
    "הגדרות המזכירה",
    "1. הפעל / כבה דחוף בלבד",
    "2. רמת התערבות",
    "3. דחופים תמיד ראשונים",
    "4. לכלול FYI בעדכון",
    "5. נא לא להפריע",
    "6. חזרה לתפריט קודם",
    "7. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildSettingsLanguageMenu_() {
  return TL_Menu_HebrewBlock_([
    "שפה",
    "1. עברית להכל",
    "2. שפת תפריט",
    "3. שפת AI",
    "4. חזרה לתפריט קודם",
    "5. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildHelpMenu_() {
  return TL_Menu_BuildStaticHelpMenu_();
}

function TL_Menu_BuildStaticHelpMenu_() {
  return TL_Menu_StaticBlock_([
    TL_Menu_StaticText_("עזרה", "Help"),
    TL_Menu_StaticText_("1. פתח את תור התשובות", "1. Open the reply queue"),
    TL_Menu_StaticText_("2. הוסף זיכרון CRM לאיש קשר", "2. Update contact memory"),
    TL_Menu_StaticText_("3. הצג הזדמנויות עם נוסח מוכן להעתקה", "3. Show next deal steps"),
    TL_Menu_StaticText_("4. הסבר על הפקודות הקיימות", "4. Explain the available commands"),
    "",
    TL_Menu_StaticText_("דוגמאות:", "Examples:"),
    TL_Menu_StaticText_("Messages That Need Your Reply: מה מחכה לי למענה?", "Messages That Need Your Reply: what needs my reply?"),
    TL_Menu_StaticText_("Update Contact Info: תוסיפי שדוד רגיש למחיר", "Update Contact Info: add that David is price sensitive"),
    TL_Menu_StaticText_("Next Steps To Close Deals: על מי כדאי לי לעבוד עכשיו?", "Next Steps To Close Deals: who should I move forward with now?"),
    "",
    TL_Menu_StaticText_("פקודות גלובליות:", "Global commands:"),
    "menu = main menu",
    "back = one step back",
    "end = end boss chat and switch to standby",
    "resume = continue paused flow",
    "help = contextual help",
    "",
    TL_Menu_StaticText_("5. חזרה לתפריט הראשי", "5. Back to the main menu"),
    TL_Menu_StaticText_("שלח את מספר האפשרות שתבחר", "Send the number of your choice")
  ]);
}

function TL_Menu_BuildVerticalsMenu_() {
  return TL_Menu_HebrewBlock_([
    "כלים ייעודיים",
    "1. מטפלת / מטופלים",
    "2. סיכומי מפגשים",
    "3. דוחות תקופתיים",
    "4. חזרה לתפריט קודם",
    "5. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildCapabilitiesMenu_() {
  if (typeof TL_Capabilities_BuildBossFacingSummary_ === "function") {
    return TL_Capabilities_BuildBossFacingSummary_();
  }
  return TL_Menu_BuildHelpMenu_();
}

function TL_Menu_BuildBrainDumpPrompt_() {
  return [
    TL_Menu_T_("🧠 העברת כל המשימות לעוזר האישי"),
    "",
    TL_Menu_T_("ניתן להקליט או לכתוב בפסקה אחת את כל המשימות, והעוזר האישי יפריד אותן לפריטים מסודרים ויעבור עליהן איתך לאישור."),
    "",
    TL_Menu_T_("לעזרה כתוב: דוגמה")
  ].join("\n");
}

function TL_Menu_BuildBrainDumpExampleReply_() {
  return [
    TL_Menu_T_("דוגמה להודעה אחת שאפשר לשלוח:"),
    TL_Menu_T_("מחר להזכיר לי להתקשר לדני, לפתוח משימה לשלוח הצעה ללקוח, ולהכין הודעת ווטסאפ לרותי על הפגישה של יום חמישי."),
    "",
    TL_Menu_T_("אפשר לכתוב חופשי. אני אפרק את זה לפריטים ואעבור איתך אחד-אחד.")
  ].join("\n");
}

function TL_Menu_BuildPlaceholderReply_(title, body) {
  return [
    String(title || "בקרוב"),
    String(body || "המסלול הזה עוד לא חובר במלואו."),
    TL_Menu_T_("חזור לתפריט הראשי עם \"תפריט\" או בחר אפשרות אחרת.", "Go back to the main menu with \"menu\" or choose another option.")
  ].join("\n");
}

function TL_Menu_BuildOutOfScopeReply_() {
  return [
    TL_Menu_T_(
      "מצטערת, כאן אני מטפלת רק במענה להודעות, העשרת CRM והזדמנויות לקידום עסקה.",
      "Sorry, here I only handle message replies, CRM enrichment, and deal opportunities."
    ),
    TL_Menu_T_(
      "מה תרצה לעשות?",
      "What would you like to do?"
    ),
    "",
    TL_Menu_BuildMenuReply_()
  ].join("\n");
}

function TL_Menu_AnnotateBossCapture_(inboxRow, state, extraNote) {
  const rowNumber = inboxRow && inboxRow.row ? Number(inboxRow.row) : 0;
  if (!rowNumber || typeof TL_Orchestrator_updateRowFields_ !== "function") return false;
  const marker = TL_Menu_StateToCaptureMarker_(state);
  if (!marker) return false;
  const loc = TL_AI_getInboxRow_(rowNumber);
  if (!loc) return false;
  let notes = TL_Capture_appendNote_(loc.values, marker);
  const captureText = typeof TL_Capture_getInputText_ === "function" ? TL_Capture_getInputText_(loc.values) : "";
  const captureLanguage = typeof TL_Capture_resolveLanguage_ === "function"
    ? TL_Capture_resolveLanguage_(loc.values, captureText, TL_Menu_BossLanguage_())
    : "";
  if (extraNote) {
    const extra = String(extraNote || "").trim();
    if (extra && String(notes || "").indexOf(extra) === -1) {
      notes = String(notes || "") ? (String(notes || "") + "\n" + extra) : extra;
    }
  }
  TL_Orchestrator_updateRowFields_(rowNumber, {
    notes: notes,
    task_status: "captured",
    capture_language: captureLanguage
  }, "menu_capture");
  return true;
}

function TL_Menu_RunImmediateCapture_(inboxRow) {
  try {
    if (typeof TL_Capture_Run !== "function") return null;
    const rowNumber = inboxRow && inboxRow.row ? Number(inboxRow.row) : 0;
    if (!rowNumber || typeof TL_AI_getInboxRow_ !== "function") return null;
    const loc = TL_AI_getInboxRow_(rowNumber);
    if (!loc || !loc.values) return null;
    return TL_Capture_Run(1, {
      rows: [{
        rowNumber: rowNumber,
        values: loc.values
      }]
    });
  } catch (e) {
    return null;
  }
}

function TL_Menu_RunImmediateContactEnrichmentCapture_(bossWaId, inboxRow) {
  try {
    const rowNumber = inboxRow && inboxRow.row ? Number(inboxRow.row) : 0;
    if (!rowNumber || typeof TL_AI_getInboxRow_ !== "function") return { sent: false, reply: "" };
    const loc = TL_AI_getInboxRow_(rowNumber);
    if (!loc || !loc.values) return { sent: false, reply: "" };

    const captureText = String(TL_Capture_getInputText_(loc.values) || "").trim();
    if (!captureText) {
      return { sent: false, reply: TL_Menu_T_("לא קיבלתי טקסט ברור להעשרת איש קשר. נסה לכתוב שם והקשר שחשוב לזכור.") };
    }

    const extraction = typeof TL_AI_ExtractContactEnrichment_ === "function"
      ? TL_AI_ExtractContactEnrichment_(captureText)
      : {
          contact_query: "",
          note_type: "general",
          note_text: captureText,
          summary: captureText,
          proposal: captureText
        };

    const resolved = TL_Menu_ResolveContactForEnrichment_(captureText, extraction);
    if (!resolved.contact) {
      const candidates = resolved.candidates || [];
      TL_Menu_SetContactEnrichmentLookupActive_(bossWaId, rowNumber, captureText, extraction, resolved);
      if (candidates.length) {
        return {
          sent: false,
          reply: TL_Menu_BuildContactEnrichmentLookupReply_(candidates)
        };
      }
      return {
        sent: false,
        reply: TL_Menu_BuildContactEnrichmentLookupReply_([], true)
      };
    }

    TL_Menu_AnnotateBossCapture_(inboxRow, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, "contact_enrichment_candidate=" + resolved.contact.contactId);

    return TL_Menu_CreateContactEnrichmentProposal_(bossWaId, rowNumber, loc.values, captureText, extraction, resolved.contact);
  } catch (err) {
    try {
      TLW_logInfo_("contact_enrichment_capture_error", {
        error: String(err && err.message ? err.message : err)
      });
    } catch (e) {}
    return {
      sent: false,
      reply: TL_Menu_T_("היתה תקלה בהכנת העשרת איש הקשר. נסה שוב בעוד רגע.")
    };
  }
}

function TL_Menu_BuildContactEnrichmentItem_(captureText, extraction, contact) {
  const noteText = String((extraction && extraction.note_text) || captureText || "").trim();
  const noteType = String((extraction && extraction.note_type) || "general").trim().toLowerCase() || "general";
  const contactName = String(contact && contact.name || "").trim();
  const contactPhone = String(contact && (contact.phone1 || contact.phone2 || "") || "").trim();
  const summary = String((extraction && extraction.summary) || "").trim() || (contactName ? (contactName + ": " + noteText) : noteText);
  const proposal = String((extraction && extraction.proposal) || "").trim() || (
    TL_Menu_T_("להוסיף לאיש הקשר ") + (contactName || contact.contactId) +
    (contactPhone ? (" (" + contactPhone + ")") : "") +
    TL_Menu_T_(" את ההקשר: ") + noteText
  );
  return {
    kind: "contact_enrichment",
    title: contactName || String((extraction && extraction.contact_query) || "").trim(),
    summary: TL_Menu_BuildContactEnrichmentSummary_(contact, noteText),
    proposal: proposal,
    task_due: "",
    task_priority: "low",
    approval_required: true,
    notes: [
      "contact_enrichment_note_type=" + noteType,
      "contact_enrichment_note_text=" + noteText.replace(/\n+/g, " ").replace(/[;]+/g, ","),
      "contact_enrichment_contact_id=" + String(contact && contact.contactId || ""),
      "contact_enrichment_contact_name=" + contactName.replace(/\n+/g, " ").replace(/[;]+/g, ",")
    ].join(";")
  };
}

function TL_Menu_BuildContactEnrichmentSummary_(contact, noteText) {
  const contactName = String(contact && contact.name || "").trim();
  const phone = String(contact && (contact.phone1 || contact.phone2 || "") || "").trim();
  const email = String(contact && contact.email || "").trim();
  return [
    contactName ? (TL_Menu_T_("איש קשר: ") + contactName) : "",
    phone ? (TL_Menu_T_("טלפון: ") + phone) : "",
    email ? (TL_Menu_T_("אימייל: ") + email) : "",
    TL_Menu_T_("הקשר לשמירה: ") + String(noteText || "").trim()
  ].filter(Boolean).join(" | ");
}

function TL_Menu_BuildContactEnrichmentProposalRow_(sourceValues, sourceRowNumber, item, cfg, now) {
  const childRow = TL_Capture_buildChildRow_(sourceValues, sourceRowNumber, item, 0, cfg || {}, now || new Date());
  childRow.contact_id = TL_Menu_ExtractNoteValue_(item.notes, "contact_enrichment_contact_id");
  childRow.ai_summary = String(item.summary || "").trim();
  childRow.ai_proposal = String(item.proposal || "").trim();
  childRow.text = String(item.proposal || item.summary || "").trim();
  childRow.notes = String(childRow.notes || "") + ";" + String(item.notes || "");
  childRow.execution_status = "proposal_ready";
  childRow.task_status = "proposal_ready";
  childRow.priority_level = "";
  childRow.importance_level = "";
  childRow.urgency_flag = "false";
  childRow.needs_owner_now = "false";
  childRow.suggested_action = "review_manually";
  return childRow;
}

function TL_Menu_ResolveContactForEnrichment_(captureText, extraction) {
  if (typeof TL_Contacts_ResolveRequest_ !== "function") {
    return { contact: null, candidates: [] };
  }
  const result = TL_Contacts_ResolveRequest_({
    rawText: String(captureText || "").trim(),
    extraction: extraction || {}
  }, { channel: "" });
  return {
    contact: result.contact || null,
    candidates: Array.isArray(result.candidates) ? result.candidates : [],
    queries: Array.isArray(result.queries) ? result.queries : [],
    status: String(result.status || "").trim().toLowerCase()
  };
}

function TL_Menu_SetContactEnrichmentLookupActive_(waId, rowNumber, captureText, extraction, resolved) {
  if (!waId || typeof TL_ActiveItem_Set_ !== "function") return false;
  const data = extraction || {};
  const result = resolved || {};
  return TL_ActiveItem_Set_(waId, {
    kind: "contact_lookup",
    capture_kind: "contact_enrichment",
    status: "active",
    row_number: Number(rowNumber || 0),
    source_text: String(captureText || "").trim(),
    contact_query: String(data.contact_query || captureText || "").trim(),
    search_queries: Array.isArray(result.queries) && result.queries.length
      ? result.queries.slice(0, 8)
      : (Array.isArray(data.search_queries) ? data.search_queries.slice(0, 8) : []),
    candidate_contacts: Array.isArray(result.candidates) ? result.candidates.slice(0, 5) : [],
    enrichment_note_type: String(data.note_type || "general").trim().toLowerCase(),
    enrichment_note_text: String(data.note_text || captureText || "").trim(),
    enrichment_summary: String(data.summary || "").trim(),
    enrichment_proposal: String(data.proposal || "").trim()
  });
}

function TL_Menu_BuildContactEnrichmentLookupReply_(candidates, isMissing) {
  const list = Array.isArray(candidates) ? candidates.slice(0, 5) : [];
  const lead = isMissing
    ? TL_Menu_T_("עדיין לא מצאתי איש קשר ברור.")
    : TL_Menu_T_("מצאתי כמה אנשי קשר אפשריים, אבל אני צריכה שתבחר או תדייק:");
  const body = list.length
    ? list.map(function(item, idx) {
        return String(idx + 1) + ". " + TL_Menu_DescribeContactCandidate_(item);
      }).join("\n")
    : "";
  return [
    lead,
    body,
    TL_Menu_T_("השב עם מספר לבחירה, או שלחו רמז נוסף: ספרות מהטלפון, חלק מהאימייל, הדומיין, תפקיד, קרבה או תיאור קצר.")
  ].filter(Boolean).join("\n");
}

function TL_Menu_CreateContactEnrichmentProposal_(bossWaId, rowNumber, sourceValues, captureText, extraction, contact) {
  const cfg = typeof TL_BossPolicy_getConfig_ === "function" ? TL_BossPolicy_getConfig_({ persistState: false }) : { bossPhone: bossWaId, now: new Date(), sendFn: TLW_sendText_ };
  const item = TL_Menu_BuildContactEnrichmentItem_(captureText, extraction, contact);
  const childRow = TL_Menu_BuildContactEnrichmentProposalRow_(sourceValues, rowNumber, item, cfg, cfg.now || new Date());
  const childResult = TL_Capture_upsertChildRow_(childRow);
  if (!childResult || !childResult.rowNumber) {
    return { sent: false, reply: TL_Menu_T_("לא הצלחתי ליצור כרגע כרטיס אישור להעשרת איש קשר.") };
  }

  const packetItem = TL_Capture_buildPacketItem_(childRow, childResult.rowNumber);
  const stored = TL_Menu_StoreDecisionPacket_(bossWaId, "capture", [packetItem]);
  const phoneNumberId = String(TL_Orchestrator_value_(sourceValues, "phone_number_id") || "").trim();
  const packetText = TL_Capture_buildPacketText_(item.summary, [packetItem], cfg, cfg.now || new Date());

  if (typeof TL_ActiveItem_Clear_ === "function") {
    TL_ActiveItem_Clear_(bossWaId);
  }

  if (stored && phoneNumberId && cfg.sendFn) {
    cfg.sendFn(phoneNumberId, bossWaId, packetText, {
      kind: "contact_enrichment",
      items: [packetItem]
    });
    return { sent: true, rowNumber: childResult.rowNumber };
  }

  return { sent: false, reply: packetText };
}

function TL_Menu_ReadContacts_() {
  return typeof TL_Contacts_readSearchContacts_ === "function" ? TL_Contacts_readSearchContacts_() : [];
}

function TL_Menu_FindContactCandidatesByName_(query, contacts) {
  if (typeof TL_Contacts_ResolveRequest_ !== "function") return [];
  const result = TL_Contacts_ResolveRequest_({
    query: String(query || "").trim(),
    name_hints: [String(query || "").trim()]
  }, { channel: "" }, contacts || []);
  return result && result.candidates ? result.candidates : [];
}

function TL_Menu_NormalizeContactSearchText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/["'׳״.,;:()_\-\/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function TL_Menu_DescribeContactCandidate_(contact) {
  const bits = [String(contact && contact.name || "").trim()];
  const phone = String(contact && (contact.phone1 || contact.phone2 || "") || "").trim();
  const email = String(contact && contact.email || "").trim();
  if (phone) bits.push(phone);
  if (email) bits.push(email);
  return bits.filter(Boolean).join(" | ");
}

function TL_Menu_IsOutboundCommunicationItem_(item) {
  const captureKind = String(item && item.captureKind || "").trim().toLowerCase();
  return captureKind === "whatsapp" || captureKind === "email";
}

function TL_Menu_ItemNeedsRecipientResolution_(item) {
  if (!TL_Menu_IsOutboundCommunicationItem_(item)) return false;
  return String(item && item.resolutionStatus || "").trim().toLowerCase() !== "resolved";
}

function TL_Menu_OutboundChannelLabel_(item) {
  const captureKind = String(item && item.captureKind || item && item.channel || "").trim().toLowerCase();
  return captureKind === "email" ? "Email" : "WhatsApp";
}

function TL_Menu_OutboundDestinationLabel_(item) {
  const name = String(item && item.recipientName || "").trim();
  const destination = String(item && item.recipientDestination || "").trim();
  if (name && destination) return name + " | " + destination;
  return name || destination || String(item && item.recipientQuery || "").trim();
}

function TL_Menu_ExtractNoteValue_(notes, key) {
  const text = String(notes || "");
  const escaped = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp("(?:^|[;\\n])" + escaped + "=([^;\\n]+)", "i"));
  return match ? String(match[1] || "").trim() : "";
}

function TL_Menu_StateToCaptureMarker_(state) {
  const value = String(state || "");
  const mapping = {};
  mapping[TL_MENU_STATES.CAPTURE_REMINDER_RELATIVE] = "menu_route=reminder_relative";
  mapping[TL_MENU_STATES.CAPTURE_REMINDER_DATETIME] = "menu_route=reminder_datetime";
  mapping[TL_MENU_STATES.CAPTURE_REMINDER_RECURRING] = "menu_route=reminder_recurring";
  mapping[TL_MENU_STATES.CAPTURE_TASK_NO_DUE] = "menu_route=task_no_due";
  mapping[TL_MENU_STATES.CAPTURE_TASK_WITH_DUE] = "menu_route=task_with_due";
  mapping[TL_MENU_STATES.CAPTURE_TASK_DEPENDENT] = "menu_route=task_dependent";
  mapping[TL_MENU_STATES.CAPTURE_TASK_PERSONAL] = "menu_route=task_personal";
  mapping[TL_MENU_STATES.CAPTURE_TASK_BUSINESS] = "menu_route=task_business";
  mapping[TL_MENU_STATES.CAPTURE_LOG_HEALTH] = "menu_route=log_health";
  mapping[TL_MENU_STATES.CAPTURE_LOG_HABITS] = "menu_route=log_habits";
  mapping[TL_MENU_STATES.CAPTURE_LOG_JOURNAL] = "menu_route=log_journal";
  mapping[TL_MENU_STATES.CAPTURE_LOG_NOTE] = "menu_route=log_note";
  mapping[TL_MENU_STATES.CAPTURE_CONTACT_ENRICH] = "menu_route=contact_enrich";
  mapping[TL_MENU_STATES.CAPTURE_SCHEDULE_BUSINESS] = "menu_route=schedule_business";
  mapping[TL_MENU_STATES.CAPTURE_SCHEDULE_FAMILY] = "menu_route=schedule_family";
  mapping[TL_MENU_STATES.CAPTURE_SCHEDULE_REMINDER] = "menu_route=schedule_reminder";
  return mapping[value] || "";
}

function TL_Menu_ShouldHandleText_(waId, text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  if (bossPhone && TLW_normalizePhone_(waId || "") !== bossPhone) return false;
  const state = TL_Menu_GetState_(waId);
  if (TL_Menu_IsMenuCommand_(normalized)) return true;
  if (TL_Menu_IsHelpCommand_(normalized)) return true;
  if (TL_Menu_IsBackCommand_(normalized)) return true;
  if (TL_Menu_IsEndCommand_(normalized)) return true;
  if (TL_Menu_IsExitCommand_(normalized)) return true;
  if (TL_Menu_IsNumericChoice_(normalized) && TL_Menu_IsFreshRootMenuChoiceWindow_(waId, state)) return true;
  if (TL_MENU.COST_TRIGGERS.some(function(t) { return normalized === String(t || "").trim().toLowerCase(); })) return true;
  if (TL_Menu_IsAiCostQuery_(normalized)) return true;
  if (TL_Menu_IsFirstUse_(waId)) return true;
  if (TL_Menu_IsIdleSession_(waId)) return true;
  return TL_Menu_HasActiveFlow_(waId);
}

function TL_Menu_RecognizeBossIntent_(text, options) {
  try {
    return TL_AI_RecognizeBossIntent_(String(text || ""), options);
  } catch (e) {
    return {
      intent: "unknown",
      route: "none",
      summary_kind: "none",
      capture_state: "",
      confidence: 0,
      needs_clarification: "false",
      reply: "",
      parameters: {
        query: String(text || "").trim(),
        capture_kind: "",
        capture_mode: "",
        time_hint: "",
        target: ""
      },
      raw: {}
    };
  }
}

function TL_Menu_PutCachedIntent_(waId, text, intent) {
  const key = TL_Menu_BossIntentCacheKey_(waId, text);
  if (!key) return false;
  try {
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(intent || {}));
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_PopCachedIntent_(waId, text) {
  const key = TL_Menu_BossIntentCacheKey_(waId, text);
  if (!key) return null;
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(key);
    if (!raw) return null;
    props.deleteProperty(key);
    return TL_AI_normalizeBossIntent_(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

function TL_Menu_BossIntentCacheKey_(waId, text) {
  const bossWaId = String(waId || "").trim();
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!bossWaId || !normalized) return "";
  return "MENU_INTENT_" + bossWaId + "_" + normalized.slice(0, 120);
}

function TL_Menu_HandleBossIntent_(ev, inboxRow, intent, options) {
  const bossWaId = String(ev && ev.from ? ev.from : "").trim();
  const normalized = TL_AI_normalizeBossIntent_(intent || {});
  if (!normalized || normalized.intent === "unknown") return null;

  if (normalized.intent === "out_of_scope") {
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    return TL_Menu_BuildOutOfScopeReply_();
  }

  if (normalized.route === "menu" || normalized.intent === "show_menu" || normalized.intent === "help") {
    const menuReply = TL_Menu_OpenMenuTarget_(bossWaId, normalized);
    if (menuReply) return menuReply;
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    if (normalized.intent === "help") return TL_Menu_BuildHelpMenu_();
    return TL_Menu_BuildMenuReply_();
  }

  if (normalized.route === "summary") {
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    return TL_Menu_HandleSummaryIntent_(normalized, bossWaId, ev, options);
  }

  if (normalized.route === "capture") {
    const captureState = TL_Menu_CaptureStateForIntent_(normalized.intent, normalized.capture_state);
    if (!captureState || captureState !== TL_MENU_STATES.CAPTURE_CONTACT_ENRICH) {
      TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
      return TL_Menu_BuildOutOfScopeReply_();
    }
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    if (inboxRow) {
      TL_Menu_AnnotateBossCapture_(inboxRow, captureState, "boss_intent=" + normalized.intent);
      const immediateCapture = TL_Menu_RunImmediateCapture_(inboxRow);
      if (immediateCapture && immediateCapture.sent) return "";
    }
    return TL_Menu_BuildCaptureAck_(normalized);
  }

  return null;
}

function TL_Menu_OpenMenuTarget_(waId, intent) {
  const target = String(intent && intent.menu_target || "").trim().toLowerCase();
  if (!target || target === "none") return null;
  if (target === "main") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.ROOT);
    return TL_Menu_BuildMenuReply_();
  }
  if (target === "reply") {
    return TL_Menu_OpenReplyHome_(waId);
  }
  if (target === "opportunities") {
    return TL_Menu_OpenOpportunities_(waId);
  }
  if (target === "enrich_crm") {
    return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, TL_Menu_T_(
      "כתבו או הקליטו מה חשוב לשמור על איש הקשר, וגם כל רמז שיעזור לי לזהות אותו: שם, כינוי, תפקיד, קרבה, ספרות מהטלפון, אימייל או דומיין.",
      "Write or record what is important to save about the contact, plus any hint that can help me identify them: name, nickname, role, relationship, phone digits, email, or domain."
    ));
  }
  if (target === "capabilities") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.CAPABILITIES);
    return TL_Menu_BuildCapabilitiesMenu_();
  }
  if (target === "help") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.HELP);
    return TL_Menu_BuildHelpMenu_();
  }
  if (target === "manage_work") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.MANAGE_WORK);
    return TL_Menu_BuildManageWorkMenu_();
  }
  return null;
}

function TL_Menu_HandleSummaryIntent_(intent, waId, ev, options) {
  const analysis = TL_Menu_AnalyzeReadOnlySummaryIntent_(intent, waId, ev, options);
  const summaryKind = String(analysis && analysis.summary_kind || intent && intent.summary_kind || "").trim().toLowerCase();
  if (summaryKind === "contact_lookup") {
    return TL_Menu_BuildContactLookupSummary_(intent, ev, analysis, options);
  }
  if (summaryKind === "context_lookup") {
    return TL_Menu_BuildContextLookupSummary_(intent, ev, analysis, options);
  }
  if (summaryKind === "similar_replies") {
    return TL_Menu_BuildSimilarRepliesSummary_(intent, ev, analysis, options);
  }
  const rendered = TL_Menu_RenderSummaryKind_(summaryKind, waId);
  const preamble = String(analysis && analysis.reply_preamble || "").trim();
  if (preamble && rendered) return [preamble, "", rendered].join("\n\n");
  return rendered;
}

function TL_Menu_TryContinueActiveItem_(waId, rawText, intent, options) {
  if (typeof TL_ActiveItem_Get_ !== "function") return null;
  const active = TL_ActiveItem_Get_(waId);
  if (!active || !active.item_id) return null;
  const normalizedIntent = typeof TL_AI_normalizeBossIntent_ === "function"
    ? TL_AI_normalizeBossIntent_(intent || {})
    : { intent: "unknown", route: "none" };
  const intentName = String(normalizedIntent && normalizedIntent.intent || "").trim().toLowerCase();
  if (intentName && intentName !== "unknown" && intentName !== "out_of_scope") return null;
  const kind = String(active.kind || "").trim().toLowerCase();
  if (kind === "outbound_draft") {
    return TL_Menu_ContinueOutboundDraft_(waId, rawText, options);
  }
  if (kind === "capture_item") {
    return TL_Menu_ContinueCaptureItem_(waId, rawText, options);
  }
  if (kind === "contact_lookup" && String(active.capture_kind || "").trim().toLowerCase() === "contact_enrichment") {
    return TL_Menu_ContinueContactEnrichmentLookup_(waId, active, rawText, options);
  }
  if (kind !== "contact_lookup" && kind !== "context_lookup" && kind !== "similar_replies_lookup") return null;

  const continuedSummaryKind = kind === "similar_replies_lookup" ? "similar_replies" : "context_lookup";

  const continueIntent = {
    intent: continuedSummaryKind === "similar_replies" ? "find_similar_replies" : "find_context",
    route: "summary",
    summary_kind: continuedSummaryKind,
    parameters: {
      query: String(rawText || "").trim()
    }
  };
  const continueEv = {
    from: String(waId || "").trim(),
    text: String(rawText || "").trim()
  };
  const continueAnalysis = {
    summary_kind: continuedSummaryKind,
    reply_preamble: TL_Menu_T_("ממשיכה את הבדיקה הקודמת.", "Continuing the previous lookup.")
  };
  const continueOptions = Object.assign({}, options || {}, {
    activeItem: active
  });
  return continuedSummaryKind === "similar_replies"
    ? TL_Menu_BuildSimilarRepliesSummary_(continueIntent, continueEv, continueAnalysis, continueOptions)
    : TL_Menu_BuildContextLookupSummary_(continueIntent, continueEv, continueAnalysis, continueOptions);
}

function TL_Menu_ContinueContactEnrichmentLookup_(waId, active, rawText, options) {
  const text = String(rawText || "").trim();
  if (!text) {
    return TL_Menu_BuildContactEnrichmentLookupReply_(active && active.candidate_contacts || [], !(active && active.candidate_contacts && active.candidate_contacts.length));
  }

  const numeric = /^\d+$/.test(text) ? Number(text) : 0;
  if (numeric > 0) {
    const chosen = TL_Menu_ContactEnrichmentCandidateByIndex_(active, numeric);
    if (!chosen) {
      return TL_Menu_BuildContactEnrichmentLookupReply_(active && active.candidate_contacts || [], false);
    }
    return TL_Menu_FinalizeContactEnrichmentLookup_(waId, active, chosen, options);
  }

  const lookup = typeof TL_AI_ExtractBossContactLookup_ === "function"
    ? TL_AI_ExtractBossContactLookup_(text, {
        contactLookupFn: options && options.contactLookupFn
      })
    : {
        contact_query: text,
        search_queries: []
      };
  const mergedQueries = TL_Menu_MergeContactLookupQueries_(
    Array.isArray(active && active.search_queries) ? active.search_queries : [],
    Array.isArray(lookup && lookup.search_queries) ? lookup.search_queries : []
  );
  const resolveFn = options && typeof options.resolveContactFn === "function"
    ? options.resolveContactFn
    : TL_Contacts_ResolveRequest_;
  if (typeof resolveFn !== "function") {
    return TL_Menu_T_("חיפוש אנשי קשר לא זמין כרגע.");
  }

  const resolved = resolveFn({
    rawText: text,
    query: String(lookup && (lookup.contact_query || lookup.query) || active.contact_query || active.source_text || text).trim(),
    contact_query: String(lookup && lookup.contact_query || active.contact_query || "").trim(),
    search_queries: mergedQueries
  }, { channel: "" });

  const candidates = Array.isArray(resolved && resolved.candidates) ? resolved.candidates.slice(0, 5) : [];
  TL_ActiveItem_Set_(waId, Object.assign({}, active || {}, {
    contact_query: String(lookup && lookup.contact_query || active.contact_query || "").trim(),
    search_queries: Array.isArray(resolved && resolved.queries) && resolved.queries.length ? resolved.queries.slice(0, 8) : mergedQueries,
    candidate_contacts: candidates
  }));

  if (resolved && resolved.contact) {
    return TL_Menu_FinalizeContactEnrichmentLookup_(waId, Object.assign({}, active || {}), resolved.contact, options);
  }

  return TL_Menu_BuildContactEnrichmentLookupReply_(candidates, !candidates.length);
}

function TL_Menu_ContactEnrichmentCandidateByIndex_(active, index) {
  const list = Array.isArray(active && active.candidate_contacts) ? active.candidate_contacts : [];
  const safeIndex = Number(index || 0);
  if (!safeIndex || safeIndex < 1 || safeIndex > list.length) return null;
  const chosen = list[safeIndex - 1];
  return chosen && typeof chosen === "object" ? chosen : null;
}

function TL_Menu_FinalizeContactEnrichmentLookup_(waId, active, chosenContact, options) {
  const rowNumber = Number(active && active.row_number || 0);
  const getInboxRowFn = options && typeof options.getInboxRowFn === "function"
    ? options.getInboxRowFn
    : TL_AI_getInboxRow_;
  const annotateFn = options && typeof options.annotateCaptureFn === "function"
    ? options.annotateCaptureFn
    : TL_Menu_AnnotateBossCapture_;
  const createProposalFn = options && typeof options.createContactEnrichmentProposalFn === "function"
    ? options.createContactEnrichmentProposalFn
    : TL_Menu_CreateContactEnrichmentProposal_;
  if (!rowNumber || typeof getInboxRowFn !== "function") {
    return TL_Menu_T_("לא הצלחתי לשחזר את הודעת המקור להעשרת ה-CRM.");
  }
  const loc = getInboxRowFn(rowNumber);
  if (!loc || !loc.values) {
    return TL_Menu_T_("לא הצלחתי לשחזר את הודעת המקור להעשרת ה-CRM.");
  }
  if (typeof annotateFn === "function") {
    annotateFn({ row: rowNumber }, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, "contact_enrichment_candidate=" + String(chosenContact.contactId || chosenContact.crmId || "").trim());
  }
  const extraction = {
    contact_query: String(active && active.contact_query || "").trim(),
    note_type: String(active && active.enrichment_note_type || "general").trim().toLowerCase(),
    note_text: String(active && active.enrichment_note_text || active && active.source_text || "").trim(),
    summary: String(active && active.enrichment_summary || "").trim(),
    proposal: String(active && active.enrichment_proposal || "").trim()
  };
  const result = createProposalFn(
    waId,
    rowNumber,
    loc.values,
    String(active && active.source_text || "").trim(),
    extraction,
    chosenContact
  );
  if (result && result.sent) return "";
  return result && result.reply ? result.reply : TL_Menu_T_("לא הצלחתי להכין כרגע כרטיס אישור להעשרת איש קשר.");
}

function TL_Menu_MergeContactLookupQueries_(baseQueries, extraQueries) {
  const merged = [];
  const seen = {};
  [baseQueries || [], extraQueries || []].forEach(function(list) {
    (Array.isArray(list) ? list : []).forEach(function(query) {
      const item = query && typeof query === "object" ? query : {};
      const type = String(item.type || "").trim().toLowerCase();
      const value = String(item.value || "").trim();
      const key = type + "|" + value.toLowerCase();
      if (!type || !value || seen[key]) return;
      seen[key] = true;
      merged.push({ type: type, value: value });
    });
  });
  return merged.slice(0, 8);
}

function TL_Menu_ShouldPreferActiveItemNumericReply_(waId, text) {
  if (!TL_Menu_IsNumericChoice_(text) || typeof TL_ActiveItem_Get_ !== "function") return false;
  const active = TL_ActiveItem_Get_(waId);
  if (!active || !active.item_id) return false;
  const kind = String(active.kind || "").trim().toLowerCase();
  const captureKind = String(active.capture_kind || "").trim().toLowerCase();
  return kind === "contact_lookup" && captureKind === "contact_enrichment";
}

function TL_Menu_ContinueOutboundDraft_(waId, rawText, options) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (!packet || String(packet.stage || "").trim() !== "one_by_one") return null;
  const current = packet.items[packet.cursor || 0];
  if (!current || !TL_Menu_IsOutboundCommunicationItem_(current)) return null;
  if (TL_Menu_IsDiscardCommand_(text)) {
    return TL_Menu_DiscardCurrentDecisionItem_(waId, current, options);
  }
  if (TL_Menu_IsLaterCommand_(text)) {
    return TL_Menu_ParkCurrentDecisionItem_(waId, packet, current, "boss_later");
  }
  if (TL_Menu_ItemNeedsRecipientResolution_(current)) {
    return TL_Menu_TryContinueOutboundRecipientResolution_(waId, packet, current, text, options);
  }
  if (TL_Menu_IsApproveAndSendCommand_(text)) {
    const approveAndSendFn = options && typeof options.approveAndSendFn === "function"
      ? options.approveAndSendFn
      : TL_Menu_HandleDecisionPacketOneByOneReply_;
    return approveAndSendFn(waId, packet, "1");
  }
  const styleCommand = TL_Menu_ParseDraftStyleCommand_(text);
  if (styleCommand) {
    const refined = TL_Menu_RefineOutboundDraftStyle_(current, styleCommand, options);
    const revisedText = String(refined && refined.proposal || "").trim();
    if (revisedText) {
      const revised = TL_Menu_ReviseDecisionRow_(current.rowNumber, revisedText);
      current.summary = revised.summary;
      current.proposal = revised.proposal;
      if (String(current.channel || "").trim().toLowerCase() === "email" && refined && refined.subject) {
        current.subject = String(refined.subject || current.subject || "").trim();
      }
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_DraftStyleAppliedMessage_(styleCommand));
    }
  }
  const revised = TL_Menu_ReviseDecisionRow_(current.rowNumber, text);
  current.summary = revised.summary;
  current.proposal = revised.proposal;
  TL_Menu_SetDecisionPacket_(waId, packet);
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("עדכנתי את הנוסח. אפשר לאשר או לערוך שוב."));
}

function TL_Menu_IsApproveAndSendCommand_(rawText) {
  return false;
}

function TL_Menu_IsLaterCommand_(rawText) {
  const text = String(rawText || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  return [
    "later",
    "for later",
    "leave for later",
    "remind me later",
    "park this",
    "אח\"כ",
    "אחר כך",
    "אחרי זה",
    "נשאיר לאחר כך",
    "שמור לאחר כך",
    "תזכיר לי אחר כך"
  ].indexOf(text) !== -1;
}

function TL_Menu_IsDiscardCommand_(rawText) {
  const text = String(rawText || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  return [
    "discard",
    "discard this",
    "cancel this",
    "cancel it",
    "drop this",
    "בטל",
    "בטלי",
    "בטל את זה",
    "תבטל",
    "תבטלי",
    "זרוק את זה"
  ].indexOf(text) !== -1;
}

function TL_Menu_ParseDraftStyleCommand_(rawText) {
  const text = String(rawText || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return "";
  if ([
    "shorter",
    "make it shorter",
    "make this shorter",
    "shorten",
    "קצר יותר",
    "תקצר",
    "לקצר",
    "תעשה קצר יותר",
    "תעשי קצר יותר"
  ].indexOf(text) !== -1) return "shorter";
  if ([
    "warmer",
    "make it warmer",
    "make this warmer",
    "more warm",
    "יותר חם",
    "יותר אישי",
    "תעשה יותר אישי",
    "תעשי יותר אישי",
    "תחמם"
  ].indexOf(text) !== -1) return "warmer";
  if ([
    "more formal",
    "formal",
    "make it more formal",
    "make this more formal",
    "יותר פורמלי",
    "פורמלי יותר",
    "תעשה יותר פורמלי",
    "תעשי יותר פורמלי"
  ].indexOf(text) !== -1) return "formal";
  if ([
    "rewrite",
    "rewrite it",
    "rewrite this",
    "rephrase",
    "נסח מחדש",
    "תנסח מחדש",
    "ניסוח מחדש",
    "תכתוב מחדש",
    "תכתבי מחדש"
  ].indexOf(text) !== -1) return "rewrite";
  if ([
    "clearer",
    "make it clearer",
    "make this clearer",
    "more clear",
    "יותר ברור",
    "ברור יותר",
    "תבהיר",
    "תבהירי",
    "ניסוח ברור יותר"
  ].indexOf(text) !== -1) return "clearer";
  return "";
}

function TL_Menu_RefineOutboundDraftStyle_(current, styleCommand, options) {
  const item = current && typeof current === "object" ? current : {};
  const refineFn = options && typeof options.refineOutboundFn === "function"
    ? options.refineOutboundFn
    : (typeof TL_AI_RefineOutboundDraft_ === "function" ? TL_AI_RefineOutboundDraft_ : null);
  if (typeof refineFn !== "function") {
    return {
      proposal: String(item.proposal || item.summary || "").trim(),
      subject: String(item.subject || "").trim()
    };
  }
  const instruction = TL_Menu_DraftStyleInstruction_(styleCommand);
  const similarReplies = Array.isArray(item.similarReplies) ? item.similarReplies.slice(0, 3) : [];
  const result = refineFn(instruction, String(item.proposal || item.summary || "").trim(), {
    channel: String(item.channel || item.captureKind || "").trim(),
    recipientName: String(item.recipientName || item.senderLabel || "").trim(),
    subject: String(item.subject || "").trim(),
    similarReplies: similarReplies
  }) || {};
  return {
    proposal: String(result.proposal || item.proposal || item.summary || "").trim(),
    subject: String(result.subject || item.subject || "").trim()
  };
}

function TL_Menu_DraftStyleInstruction_(styleCommand) {
  const key = String(styleCommand || "").trim().toLowerCase();
  if (key === "shorter") {
    return "Rewrite this draft to be shorter while keeping the same intent and meaning.";
  }
  if (key === "warmer") {
    return "Rewrite this draft to sound warmer and a bit more personal while keeping the same intent.";
  }
  if (key === "formal") {
    return "Rewrite this draft to sound more formal and professional while keeping the same intent.";
  }
  return "Rewrite this draft while keeping the same intent and core meaning.";
}

function TL_Menu_DraftStyleAppliedMessage_(styleCommand) {
  const key = String(styleCommand || "").trim().toLowerCase();
  if (key === "shorter") {
    return TL_Menu_T_("קיצרתי את הנוסח. אפשר לאשר או לערוך שוב.", "I made the draft shorter. You can approve it or revise it again.");
  }
  if (key === "warmer") {
    return TL_Menu_T_("עדכנתי את הנוסח לטון חם יותר. אפשר לאשר או לערוך שוב.", "I made the draft warmer. You can approve it or revise it again.");
  }
  if (key === "formal") {
    return TL_Menu_T_("עדכנתי את הנוסח לטון פורמלי יותר. אפשר לאשר או לערוך שוב.", "I made the draft more formal. You can approve it or revise it again.");
  }
  return TL_Menu_T_("ניסחתי מחדש את הטיוטה. אפשר לאשר או לערוך שוב.", "I rewrote the draft. You can approve it or revise it again.");
}

function TL_Menu_ContinueCaptureItem_(waId, rawText, options) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (!packet || String(packet.stage || "").trim() !== "one_by_one") return null;
  const current = packet.items[packet.cursor || 0];
  if (!current || !TL_Menu_IsContinuableCaptureItem_(current)) return null;
  if (TL_Menu_IsDiscardCommand_(text)) {
    return TL_Menu_DiscardCurrentDecisionItem_(waId, current, options);
  }
  if (TL_Menu_IsLaterCommand_(text)) {
    return TL_Menu_ParkCurrentDecisionItem_(waId, packet, current, "boss_later");
  }

  const dueUpdate = TL_Menu_TryUpdateCaptureItemDue_(current, text);
  if (dueUpdate.updated) {
    packet.items[packet.cursor || 0] = dueUpdate.item;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("עדכנתי את הזמן לפריט הנוכחי."));
  }

  const styleCommand = TL_Menu_ParseDraftStyleCommand_(text);
  if (styleCommand) {
    const refined = TL_Menu_RefineCaptureItemStyle_(current, styleCommand, options);
    const revisedText = String(refined && refined.proposal || "").trim();
    if (revisedText) {
      const revised = TL_Menu_ReviseDecisionRow_(current.rowNumber, revisedText);
      current.summary = revised.summary;
      current.proposal = revised.proposal;
      if (String(current.captureKind || "").trim().toLowerCase() === "reminder") {
        current.reminderMessage = revised.summary;
      }
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_CaptureStyleAppliedMessage_(styleCommand));
    }
  }

  const revised = TL_Menu_ReviseDecisionRow_(current.rowNumber, text);
  current.summary = revised.summary;
  current.proposal = revised.proposal;
  if (String(current.captureKind || "").trim().toLowerCase() === "reminder") {
    current.reminderMessage = revised.summary;
  }
  TL_Menu_SetDecisionPacket_(waId, packet);
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("עדכנתי את הנוסח. אפשר לאשר או לערוך שוב."));
}

function TL_Menu_ParkCurrentDecisionItem_(waId, packet, current, reason) {
  if (!waId || !packet || !current) return null;
  const paused = typeof TL_ActiveItem_PauseCurrent_ === "function"
    ? TL_ActiveItem_PauseCurrent_(waId, String(reason || "boss_later").trim() || "boss_later")
    : { paused: false };
  TL_Menu_ClearDecisionPacket_(waId);
  const itemLabel = TL_Menu_IsOutboundCommunicationItem_(current)
    ? TL_Menu_T_("השארתי את הטיוטה לאחר כך.", "I left the draft for later.")
    : TL_Menu_T_("השארתי את הפריט לאחר כך.", "I left the item for later.");
  const resumeLabel = TL_Menu_T_(
    "כדי לחזור לזה, אפשר לכתוב: המשך או הצג פריטים מושהים.",
    "To return to it, you can write: continue or show paused items."
  );
  if (paused && paused.paused) {
    return [itemLabel, resumeLabel].join("\n");
  }
  return itemLabel;
}

function TL_Menu_DiscardCurrentDecisionItem_(waId, current, options) {
  if (!waId || !current) return null;
  const archiveFn = options && typeof options.archiveDecisionRowFn === "function"
    ? options.archiveDecisionRowFn
    : TL_Menu_ArchiveDecisionRow_;
  const archived = typeof archiveFn === "function"
    ? archiveFn(current.rowNumber)
    : { ok: false, receiptText: "" };
  TL_Menu_ClearDecisionPacket_(waId);
  if (archived && archived.ok) {
    return TL_Menu_IsOutboundCommunicationItem_(current)
      ? TL_Menu_T_("ביטלתי את הטיוטה הנוכחית והיא לא תישלח.", "I discarded the current draft and it will not be sent.")
      : TL_Menu_T_("ביטלתי את הפריט הנוכחי והוא לא יישאר פתוח.", "I discarded the current item and it will not stay open.");
  }
  return String(archived && archived.receiptText || TL_Menu_T_("לא הצלחתי לבטל את הפריט הנוכחי.", "I couldn't discard the current item.")).trim();
}

function TL_Menu_RefineCaptureItemStyle_(current, styleCommand, options) {
  const item = current && typeof current === "object" ? current : {};
  const refineFn = options && typeof options.refineOutboundFn === "function"
    ? options.refineOutboundFn
    : (typeof TL_AI_RefineOutboundDraft_ === "function" ? TL_AI_RefineOutboundDraft_ : null);
  if (typeof refineFn !== "function") {
    return {
      proposal: String(item.proposal || item.summary || item.reminderMessage || "").trim()
    };
  }
  const instruction = TL_Menu_CaptureStyleInstruction_(styleCommand, item);
  const result = refineFn(
    instruction,
    String(item.proposal || item.summary || item.reminderMessage || "").trim(),
    {
      channel: String(item.captureKind || "").trim(),
      recipientName: "",
      subject: "",
      similarReplies: []
    }
  ) || {};
  return {
    proposal: String(result.proposal || item.proposal || item.summary || item.reminderMessage || "").trim()
  };
}

function TL_Menu_CaptureStyleInstruction_(styleCommand, item) {
  const kind = String(item && item.captureKind || "").trim().toLowerCase();
  const noun = kind === "reminder" ? "reminder text" : "task wording";
  const key = String(styleCommand || "").trim().toLowerCase();
  if (key === "shorter") {
    return "Rewrite this " + noun + " to be shorter while keeping the same intent and details.";
  }
  if (key === "clearer") {
    return "Rewrite this " + noun + " to be clearer and easier to understand while keeping the same intent.";
  }
  return "Rewrite this " + noun + " while keeping the same intent and core meaning.";
}

function TL_Menu_CaptureStyleAppliedMessage_(styleCommand) {
  const key = String(styleCommand || "").trim().toLowerCase();
  if (key === "shorter") {
    return TL_Menu_T_("קיצרתי את הנוסח של הפריט. אפשר לאשר או לערוך שוב.", "I made the item wording shorter. You can approve it or revise it again.");
  }
  if (key === "clearer") {
    return TL_Menu_T_("הבהרתי את הנוסח של הפריט. אפשר לאשר או לערוך שוב.", "I made the item wording clearer. You can approve it or revise it again.");
  }
  return TL_Menu_T_("ניסחתי מחדש את הפריט. אפשר לאשר או לערוך שוב.", "I rewrote the item wording. You can approve it or revise it again.");
}

function TL_Menu_TryContinueOutboundRecipientResolution_(waId, packet, current, rawText, options) {
  const opts = options || {};
  const resolveFn = opts.resolveContactFn || TL_Contacts_ResolveRequest_;
  if (typeof resolveFn !== "function") {
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }
  const captureKind = String(current.captureKind || current.channel || "").trim().toLowerCase();
  const baseSearchQueries = Array.isArray(current.searchQueries) ? current.searchQueries.slice(0, 12) : [];
  const combinedQueries = TL_AI_normalizeSearchQueries_(
    baseSearchQueries.concat([{ type: "name", value: String(rawText || "").trim() }])
  );
  const resolution = resolveFn({
    rawText: String(rawText || "").trim(),
    query: String(rawText || current.recipientQuery || "").trim(),
    recipient_query: String(current.recipientQuery || "").trim(),
    search_queries: combinedQueries
  }, { channel: captureKind }, null);

  const status = String(resolution && resolution.status || "").trim().toLowerCase();
  if (status === "resolved" && resolution.contact) {
    const applied = TL_Menu_ApplyPacketRecipientChoice_(current, resolution.contact);
    applied.searchQueries = Array.isArray(resolution.queries) ? resolution.queries.slice(0, 12) : applied.searchQueries;
    packet.items[packet.cursor || 0] = applied;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("בחרתי את איש הקשר המתאים."));
  }

  current.searchQueries = Array.isArray(resolution && resolution.queries) ? resolution.queries.slice(0, 12) : current.searchQueries;
  current.recipientCandidates = Array.isArray(resolution && resolution.candidates) ? resolution.candidates.slice(0, 5).map(function(contact) {
    return TL_Capture_simplifyContactCandidate_(contact, captureKind);
  }) : [];
  current.resolutionStatus = status || "missing";
  packet.items[packet.cursor || 0] = current;
  TL_Menu_SetDecisionPacket_(waId, packet);

  if (current.resolutionStatus === "ambiguous") {
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("מצאתי כמה התאמות אפשריות. בחר את איש הקשר המתאים."));
  }
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("עדיין לא מצאתי איש קשר ברור. אפשר לנסות שם או מספר אחר."));
}

function TL_Menu_IsContinuableCaptureItem_(item) {
  const kind = String(item && item.captureKind || "").trim().toLowerCase();
  return kind === "task" || kind === "reminder";
}

function TL_Menu_TryUpdateCaptureItemDue_(item, rawText) {
  const current = item && typeof item === "object" ? item : {};
  const text = String(rawText || "").trim();
  if (!text || typeof TL_Reminder_parseDueAt_ !== "function" || typeof TL_Capture_buildDueInfo_ !== "function") {
    return { updated: false, item: current };
  }
  const kind = String(current.captureKind || "").trim().toLowerCase();
  if (kind !== "task" && kind !== "reminder") {
    return { updated: false, item: current };
  }
  const parsed = TL_Reminder_parseDueAt_(text, new Date());
  if (!parsed) {
    return { updated: false, item: current };
  }
  const rowNumber = Number(current.rowNumber || 0);
  if (rowNumber && typeof TL_Orchestrator_updateRowFields_ === "function") {
    TL_Orchestrator_updateRowFields_(rowNumber, {
      task_due: text
    }, "boss_revise_due");
  }
  const dueInfo = TL_Capture_buildDueInfo_(text, new Date());
  return {
    updated: true,
    item: Object.assign({}, current, {
      duePreview: String(dueInfo.preview || "").trim(),
      dueLabel: String(dueInfo.label || "").trim()
    })
  };
}

function TL_Menu_PauseActiveItemForNewIntent_(waId, intent) {
  if (!waId || typeof TL_ActiveItem_Get_ !== "function" || typeof TL_ActiveItem_PauseCurrent_ !== "function") return null;
  const active = TL_ActiveItem_Get_(waId);
  if (!active || !active.item_id) return null;
  const normalizedIntent = typeof TL_AI_normalizeBossIntent_ === "function"
    ? TL_AI_normalizeBossIntent_(intent || {})
    : { intent: "unknown", route: "none", summary_kind: "none" };
  const intentName = String(normalizedIntent && normalizedIntent.intent || "").trim().toLowerCase();
  if (!intentName || intentName === "unknown" || intentName === "out_of_scope") return null;
  return TL_ActiveItem_PauseCurrent_(waId, "new_intent:" + intentName);
}

function TL_Menu_TryResumePausedItem_(waId, rawText, options) {
  if (!TL_Menu_IsResumePausedCommand_(rawText)) return null;
  const resumeIndex = TL_Menu_ParseResumePausedIndex_(rawText);
  if (resumeIndex > 0 && typeof TL_ActiveItem_ResumeByIndex_ !== "function") return null;
  if (resumeIndex <= 0 && typeof TL_ActiveItem_ResumeLatest_ !== "function") return null;
  const active = typeof TL_ActiveItem_Get_ === "function" ? TL_ActiveItem_Get_(waId) : null;
  if (active && active.item_id) {
    return TL_Menu_T_(
      "יש כבר בדיקה פתוחה. אפשר להמשיך אותה או לאפס קודם.",
      "There is already an open lookup. You can continue it or reset first."
    );
  }
  const resumed = resumeIndex > 0
    ? TL_ActiveItem_ResumeByIndex_(waId, resumeIndex)
    : TL_ActiveItem_ResumeLatest_(waId);
  if (!resumed || !resumed.resumed || !resumed.item) {
    return TL_Menu_T_(
      "אין כרגע פריט מושהה להמשיך ממנו.",
      "There is no paused item to resume right now."
    );
  }
  const item = resumed.item;
  const preamble = TL_Menu_T_("חוזרת למה שהשארנו פתוח.", "Returning to what we left open.");
  const baseOptions = Object.assign({}, options || {}, { activeItem: item });
  if (String(item.kind || "").trim().toLowerCase() === "contact_lookup") {
    return TL_Menu_BuildContactLookupSummary_({
      intent: "find_contact",
      route: "summary",
      summary_kind: "contact_lookup",
      parameters: {
        query: String(item.contact_query || item.resolved_contact_name || "").trim()
      }
    }, {
      from: String(waId || "").trim(),
      text: String(item.contact_query || item.resolved_contact_name || "").trim()
    }, {
      summary_kind: "contact_lookup",
      reply_preamble: preamble
    }, baseOptions);
  }
  return TL_Menu_BuildContextLookupSummary_({
    intent: "find_context",
    route: "summary",
    summary_kind: "context_lookup",
    parameters: {
      query: String(item.source_text || item.contact_query || item.topic_query || "").trim()
    }
  }, {
    from: String(waId || "").trim(),
    text: String(item.source_text || item.contact_query || item.topic_query || "").trim()
  }, {
    summary_kind: "context_lookup",
    reply_preamble: preamble
  }, baseOptions);
}

function TL_Menu_IsResumePausedCommand_(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (/^(?:resume|continue|המשך|להמשיך|תמשיך|תמשיכי)\s+\d{1,2}$/.test(normalized)) return true;
  return TL_MENU.RESUME_TRIGGERS.some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  });
}

function TL_Menu_ParseResumePausedIndex_(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  const match = normalized.match(/^(?:resume|continue|המשך|להמשיך|תמשיך|תמשיכי)\s+(\d{1,2})$/);
  return match && match[1] ? Number(match[1]) : 0;
}

function TL_Menu_IsPausedItemsQuery_(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  return TL_MENU.PAUSED_ITEMS_TRIGGERS.some(function(trigger) {
    return normalized === String(trigger || "").trim().toLowerCase();
  });
}

function TL_Menu_HasActiveFlow_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return false;
  TL_Menu_CleanupStaleFlow_(safeWaId);
  if (TL_Menu_HasDecisionPacket_(safeWaId)) return true;
  if (TL_Menu_GetState_(safeWaId) !== TL_MENU_STATES.ROOT) return true;
  if (typeof TL_ActiveItem_Get_ !== "function") return false;
  const active = TL_ActiveItem_Get_(safeWaId);
  return !!(active && active.item_id);
}

function TL_Menu_IsColdStart_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return false;
  return !TL_Menu_HasActiveFlow_(safeWaId);
}

function TL_Menu_CleanupStaleFlow_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return false;
  const ttlMinutes = TL_Menu_ActiveFlowTtlMinutes_();
  const nowMs = Date.now();
  let changed = false;

  const packet = TL_Menu_GetDecisionPacket_(safeWaId);
  const packetFresh = packet ? TL_Menu_IsFlowRecordValid_(packet.created_at, packet.session_version, ttlMinutes, nowMs) : false;
  if (packet && !packetFresh) {
    TL_Menu_ClearDecisionPacket_(safeWaId);
    changed = true;
  }

  const active = typeof TL_ActiveItem_Get_ === "function" ? TL_ActiveItem_Get_(safeWaId) : null;
  const activeFresh = active ? TL_Menu_IsFlowRecordValid_(active.updated_at || active.opened_at, active.session_version, ttlMinutes, nowMs) : false;
  if (active && !activeFresh && typeof TL_ActiveItem_Clear_ === "function") {
    TL_ActiveItem_Clear_(safeWaId);
    changed = true;
  }

  const state = TL_Menu_GetState_(safeWaId);
  const stateMeta = TL_Menu_GetStateMeta_(safeWaId);
  const stateFresh = state !== TL_MENU_STATES.ROOT && TL_Menu_IsStateMetaValid_(stateMeta, nowMs);
  if (state !== TL_MENU_STATES.ROOT && !packetFresh && !activeFresh) {
    if (!stateFresh) {
      TL_Menu_ClearState_(safeWaId);
      changed = true;
    }
  }

  if (state !== TL_MENU_STATES.ROOT && !stateFresh) {
    TL_Menu_ClearState_(safeWaId);
    changed = true;
  }

  return changed;
}

function TL_Menu_ActiveFlowTtlMinutes_() {
  const raw = Number(TLW_getSetting_("BOSS_FLOW_TTL_MINUTES") || 90);
  return isFinite(raw) && raw > 0 ? raw : 90;
}

function TL_Menu_SessionRuntimeVersion_() {
  return TL_MENU_SESSION_VERSION;
}

function TL_Menu_IsFlowRecordValid_(timestampIso, sessionVersion, ttlMinutes, nowMs) {
  return String(sessionVersion || "") === TL_Menu_SessionRuntimeVersion_() &&
    TL_Menu_IsRecentIso_(timestampIso, ttlMinutes, nowMs);
}

function TL_Menu_IsRecentIso_(value, ttlMinutes, nowMs) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const ts = Date.parse(raw);
  if (!isFinite(ts)) return false;
  const currentMs = isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return (currentMs - ts) <= (Number(ttlMinutes || 0) * 60 * 1000);
}

function TL_Menu_GetStateMeta_(waId, props) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return null;
  try {
    const store = props || PropertiesService.getScriptProperties();
    const raw = String(store.getProperty(TL_MENU.STATE_META_KEY_PREFIX + safeWaId) || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    return null;
  }
}

function TL_Menu_IsStateMetaValid_(meta, nowMs) {
  if (!meta || typeof meta !== "object") return false;
  return TL_Menu_IsFlowRecordValid_(
    meta.updated_at || meta.opened_at,
    meta.session_version,
    TL_Menu_ActiveFlowTtlMinutes_(),
    nowMs || Date.now()
  );
}

function TL_Menu_IsFirstUse_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return false;
  return String(PropertiesService.getScriptProperties().getProperty(TL_MENU.ONBOARDED_KEY_PREFIX + safeWaId) || "").trim() !== "true";
}

function TL_Menu_MarkOnboarded_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return false;
  PropertiesService.getScriptProperties().setProperty(TL_MENU.ONBOARDED_KEY_PREFIX + safeWaId, "true");
  return true;
}

function TL_Menu_PauseForMenuCommand_(waId) {
  if (!waId) return { ok: true, paused: false, packet_cleared: false };
  const activePaused = typeof TL_ActiveItem_PauseCurrent_ === "function"
    ? TL_ActiveItem_PauseCurrent_(waId, "menu_command")
    : { ok: true, paused: false };
  TL_Menu_ClearDecisionPacket_(waId);
  return {
    ok: true,
    paused: !!(activePaused && activePaused.paused),
    packet_cleared: true
  };
}

function TL_Menu_PrepareRootMenuCommand_(waId) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return { ok: false };

  const props = PropertiesService.getScriptProperties();
  const activeKey = typeof TL_ActiveItem_key_ === "function" ? TL_ActiveItem_key_(safeWaId) : "";
  const hasActiveItem = !!String(activeKey ? (props.getProperty(activeKey) || "") : "").trim();

  if (hasActiveItem) {
    TL_Menu_PauseForMenuCommand_(safeWaId);
  } else {
    props.deleteProperty(TL_MENU.PACKET_KEY_PREFIX + safeWaId);
  }

  const nextMeta = {
    state: TL_MENU_STATES.ROOT,
    updated_at: new Date().toISOString(),
    session_version: TL_Menu_SessionRuntimeVersion_(),
    source: "menu_command"
  };
  const nextProps = {};
  nextProps[TL_MENU.ONBOARDED_KEY_PREFIX + safeWaId] = "true";
  nextProps[TL_MENU.STATE_KEY_PREFIX + safeWaId] = TL_MENU_STATES.ROOT;
  nextProps[TL_MENU.STATE_META_KEY_PREFIX + safeWaId] = JSON.stringify(nextMeta);
  props.setProperties(nextProps, false);

  return {
    ok: true,
    had_active_item: hasActiveItem
  };
}

function TL_Menu_BuildStaticEndReply_() {
  return TL_Menu_StaticText_(
    "שיחת הבוס הסתיימה. אני במצב המתנה. אפשר להתחיל צ׳אט חדש בכל רגע על ידי שליחת כל תו.",
    "Boss AI chat ended. I am now on standby. You can start a new chat at any time by sending any character."
  );
}

function TL_Menu_BuildStaticExitReply_() {
  return TL_Menu_StaticText_(
    "איפסתי את הזרימה הנוכחית. חזרנו למצב נקי. אם תרצה, כתוב \"menu\" כדי להתחיל מחדש.",
    "I reset the current flow. We are back to a clean state. If you want, type \"menu\" to start again."
  );
}

function TL_Menu_HandleHardCommandFast_(waId, rawText) {
  const safeWaId = String(waId || "").trim();
  const text = String(rawText || "").trim();
  if (!safeWaId || !text) return null;

  if (TL_Menu_IsMenuCommand_(text)) {
    TL_Menu_PrepareRootMenuCommand_(safeWaId);
    return {
      command: "menu",
      reply_text: TL_Menu_BuildStaticMenuReply_(),
      should_warm: true
    };
  }

  if (TL_Menu_IsEndCommand_(text)) {
    TL_Menu_MarkOnboarded_(safeWaId);
    TL_Menu_ResetSession_(safeWaId);
    TL_Menu_SetIdleSession_(safeWaId);
    return {
      command: "end",
      reply_text: TL_Menu_BuildStaticEndReply_(),
      should_warm: false
    };
  }

  if (TL_Menu_IsExitCommand_(text)) {
    TL_Menu_MarkOnboarded_(safeWaId);
    TL_Menu_ResetSession_(safeWaId);
    return {
      command: "exit",
      reply_text: TL_Menu_BuildStaticExitReply_(),
      should_warm: false
    };
  }

  if (TL_Menu_IsHelpCommand_(text)) {
    TL_Menu_MarkOnboarded_(safeWaId);
    return {
      command: "help",
      reply_text: TL_Menu_BuildStaticHelpMenu_(),
      should_warm: true
    };
  }

  if (TL_Menu_IsBackCommand_(text)) {
    TL_Menu_MarkOnboarded_(safeWaId);
    return {
      command: "back",
      reply_text: TL_Menu_HandleBackCommand_(safeWaId),
      should_warm: true
    };
  }

  return null;
}

function TL_Menu_HandlePassiveWakeFast_(waId, rawText) {
  const safeWaId = String(waId || "").trim();
  const text = String(rawText || "").trim();
  if (!safeWaId || !text) return null;
  if (TL_Menu_IsMenuCommand_(text) || TL_Menu_IsHelpCommand_(text) || TL_Menu_IsBackCommand_(text) || TL_Menu_IsEndCommand_(text) || TL_Menu_IsExitCommand_(text)) {
    return null;
  }

  if (TL_Menu_IsIdleSession_(safeWaId)) {
    TL_Menu_MarkOnboarded_(safeWaId);
    TL_Menu_SetState_(safeWaId, TL_MENU_STATES.ROOT, { source: "idle_wake_fast" });
    return {
      command: "idle_wake",
      reply_text: TL_Menu_BuildStaticMenuReply_(),
      should_warm: true
    };
  }

  if (TL_Menu_ShouldDefaultToMenuOnStaleInteraction_(safeWaId, text)) {
    TL_Menu_ResetSession_(safeWaId);
    TL_Menu_MarkOnboarded_(safeWaId);
    TL_Menu_SetState_(safeWaId, TL_MENU_STATES.ROOT, { source: "stale_restart_fast" });
    return {
      command: "stale_restart",
      reply_text: TL_Menu_BuildStaticMenuReply_(),
      should_warm: true
    };
  }

  return null;
}

function TL_Menu_TryWarmLikelyNextSteps_(waId, context) {
  const safeWaId = String(waId || "").trim();
  if (!safeWaId) return { ok: false, reason: "missing_wa_id" };
  const startedAt = Date.now();
  try {
    const snapshots = TL_Menu_PrepareBossSnapshots_();
    return {
      ok: true,
      source: String(context && context.source || "menu_fast_lane").trim() || "menu_fast_lane",
      command: String(context && context.command || "").trim(),
      elapsed_ms: Date.now() - startedAt,
      snapshots: snapshots
    };
  } catch (e) {
    return {
      ok: false,
      source: String(context && context.source || "menu_fast_lane").trim() || "menu_fast_lane",
      command: String(context && context.command || "").trim(),
      elapsed_ms: Date.now() - startedAt,
      error: String(e && e.stack ? e.stack : e)
    };
  }
}

function TL_Menu_HandleBackCommand_(waId) {
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (packet) {
    const stage = String(packet.stage || "").trim();
    if (stage === "edit") {
      packet.stage = "one_by_one";
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("חזרתי צעד אחד אחורה."));
    }
    if (stage === "few" || stage === "smart") {
      packet.stage = "root";
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_BuildDecisionPacketReply_(packet);
    }
    return TL_Menu_BuildMenuReply_();
  }

  const state = TL_Menu_GetState_(waId);
  const parent = TL_Menu_ParentState_(state);
  TL_Menu_SetState_(waId, parent);
  return TL_Menu_BuildMenuForState_(parent);
}

function TL_Menu_ParentState_(state) {
  const current = String(state || TL_MENU_STATES.ROOT);
  const mapping = {};
  mapping[TL_MENU_STATES.APPROVALS_HOME] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.CAPABILITIES] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.REMINDERS] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.TASK_NEW] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.LOG] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.SCHEDULE] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.MANAGE_WORK] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.SETTINGS] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.SETTINGS_SECRETARY] = TL_MENU_STATES.SETTINGS;
  mapping[TL_MENU_STATES.SETTINGS_LANGUAGE] = TL_MENU_STATES.SETTINGS;
  mapping[TL_MENU_STATES.HELP] = TL_MENU_STATES.ROOT;
  mapping[TL_MENU_STATES.VERTICALS] = TL_MENU_STATES.ROOT;
  return mapping[current] || TL_MENU_STATES.ROOT;
}

function TL_Menu_BuildContextualHelp_(waId) {
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (packet) {
    const stage = String(packet.stage || "").trim();
    if (stage === "edit") {
      return [
        TL_Menu_T_("עזרה לעריכה"),
        TL_Menu_T_("עכשיו אפשר לכתוב את הנוסח החדש."),
        TL_Menu_T_("1 מבטל עריכה."),
        TL_Menu_T_("2 חוזר לתפריט הראשי."),
        TL_Menu_T_("פקודות גלובליות: menu | back | end | help")
      ].join("\n");
    }
    return [
      TL_Menu_T_("עזרה לסקירת תשובות"),
      TL_Menu_T_("השתמש במספרים שעל המסך כדי לאשר, לערוך, לדחות או לדלג."),
      TL_Menu_T_("כדי לכתוב נוסח חדש, בחר קודם באפשרות העריכה ורק אז שלח טקסט חופשי."),
      TL_Menu_T_("פקודות גלובליות: menu | back | end | resume | help")
    ].join("\n");
  }

  const state = TL_Menu_GetState_(waId);
  if (TL_Menu_IsCaptureState_(state)) {
    return [
      TL_Menu_T_("עזרה להזנת תוכן"),
      TL_Menu_T_("במסך הזה אפשר לכתוב או להקליט את התוכן שביקשתי."),
      TL_Menu_T_("פקודות גלובליות: menu | back | end | help")
    ].join("\n");
  }

  if (state !== TL_MENU_STATES.ROOT) {
    return [
      TL_Menu_T_("עזרה לניווט"),
      TL_Menu_T_("במסך הזה השתמש במספרי האפשרויות."),
      TL_Menu_T_("פקודות גלובליות: menu | back | end | resume | help")
    ].join("\n");
  }

  return [
    TL_Menu_T_("עזרה"),
    TL_Menu_T_("התפריט מיועד לבוס בלבד."),
    TL_Menu_T_("במצב התחלה או המתנה המערכת תפתח את התפריט הראשי."),
    TL_Menu_T_("פקודות גלובליות: menu | back | end | resume | help")
  ].join("\n");
}

function TL_Menu_ResumePacketFlow_(waId, packet) {
  const currentPacket = packet || TL_Menu_GetDecisionPacket_(waId);
  if (!currentPacket) return TL_Menu_T_("אין כרגע זרימה פתוחה להמשך.");
  const stage = String(currentPacket.stage || "").trim();
  const preface = TL_Menu_T_("חוזרת לזרימה הפתוחה.", "Returning to the open flow.");
  if (stage === "edit") {
    return [preface, TL_Menu_BuildDecisionPacketEditReply_(currentPacket)].join("\n\n");
  }
  if (stage === "few") {
    return [preface, TL_Menu_BuildDecisionPacketFewReply_(currentPacket)].join("\n\n");
  }
  if (stage === "smart") {
    return [preface, TL_Menu_BuildDecisionPacketSmartReply_(currentPacket)].join("\n\n");
  }
  if (stage === "root") {
    return [preface, TL_Menu_BuildDecisionPacketReply_(currentPacket)].join("\n\n");
  }
  return TL_Menu_BuildDecisionPacketOneByOneReply_(currentPacket, preface);
}

function TL_Menu_RenderSummaryKind_(summaryKind, waId) {
  switch (summaryKind) {
    case "ai_cost": return TL_AI_BuildMonthToDateSpendReport_();
    case "pending": return TL_Menu_BuildPendingSummary_();
    case "urgent":
    case "attention": return TL_Menu_BuildUrgentSummary_();
    case "approvals": return TL_Menu_BuildAwaitingApprovalSummary_(waId);
    case "next_steps": return TL_Menu_BuildSuggestedNextSteps_();
    case "paused_items": return TL_Menu_BuildPausedItemsSummary_(waId);
    case "menu": return TL_Menu_BuildMenuReply_();
    case "help": return TL_Menu_BuildHelpMenu_();
    default: return TL_Menu_BuildPendingSummary_();
  }
}

function TL_Menu_AnalyzeReadOnlySummaryIntent_(intent, waId, ev, options) {
  const opts = options || {};
  const fallbackSummaryKind = String(intent && intent.summary_kind || "pending").trim().toLowerCase() || "pending";
  const fallback = {
    summary_kind: fallbackSummaryKind,
    retrieval_focus: [],
    reply_preamble: "",
    confidence: Number(intent && intent.confidence || 0)
  };

  if (typeof TL_BossTurn_BuildPacket_ !== "function" || typeof TL_AI_AnalyzeBossReadOnlyTurn_ !== "function") {
    return fallback;
  }

  try {
    const packet = (opts.packetFn || TL_BossTurn_BuildPacket_)({
      wa_id: String(waId || "").trim(),
      message_text: String(ev && ev.text || intent && intent.parameters && intent.parameters.query || "").trim(),
      timestamp: new Date().toISOString()
    }, opts.packetOptions || {});
    const analyzed = TL_AI_AnalyzeBossReadOnlyTurn_(packet, {
      analysisFn: opts.analysisFn
    });
    const summaryKind = fallback.summary_kind;
    const normalized = {
      summary_kind: summaryKind,
      retrieval_focus: Array.isArray(analyzed && analyzed.retrieval_focus) ? analyzed.retrieval_focus.slice() : [],
      reply_preamble: String(analyzed && analyzed.reply_preamble || "").trim(),
      confidence: Number(analyzed && analyzed.confidence || 0),
      packet: packet
    };
    if (typeof TLW_logInfo_ === "function") {
      TLW_logInfo_("boss_turn_read_only_analysis", {
        wa_id: String(waId || "").trim(),
        input_summary_kind: fallback.summary_kind,
        output_summary_kind: normalized.summary_kind,
        retrieval_focus: normalized.retrieval_focus.join(","),
        confidence: normalized.confidence
      });
    }
    return normalized;
  } catch (e) {
    if (typeof TLW_logWarn_ === "function") {
      TLW_logWarn_("boss_turn_read_only_analysis_failed", {
        wa_id: String(waId || "").trim(),
        error: String(e && e.message || e)
      });
    }
    return fallback;
  }
}

function TL_Menu_BuildContactLookupSummary_(intent, ev, analysis, options) {
  const opts = options || {};
  const sourceText = String(ev && ev.text || intent && intent.parameters && intent.parameters.query || "").trim();
  const lookup = typeof TL_AI_ExtractBossContactLookup_ === "function"
    ? TL_AI_ExtractBossContactLookup_(sourceText, {
        contactLookupFn: opts.contactLookupFn
      })
    : {
        contact_query: sourceText,
        search_queries: []
      };
  const resolveFn = opts.resolveContactFn || TL_Contacts_ResolveRequest_;
  if (typeof resolveFn !== "function") {
    return TL_Menu_T_(
      "חיפוש אנשי קשר לא זמין כרגע.",
      "Contact lookup is not available right now."
    );
  }

  const resolved = resolveFn({
    rawText: sourceText,
    query: String(lookup.contact_query || sourceText).trim(),
    contact_query: String(lookup.contact_query || "").trim(),
    search_queries: Array.isArray(lookup.search_queries) ? lookup.search_queries.slice() : []
  }, { channel: "" }, opts.contacts || null);

  const preamble = String(
    lookup.reply_preamble ||
    analysis && analysis.reply_preamble ||
    TL_Menu_T_("בודקת את איש הקשר שביקשת.", "Checking the contact you asked for.")
  ).trim();
  const status = String(resolved && resolved.status || "").trim().toLowerCase();
  const candidates = Array.isArray(resolved && resolved.candidates) ? resolved.candidates : [];
  const queries = Array.isArray(resolved && resolved.queries) ? resolved.queries : [];
  const waId = String(ev && ev.from || "").trim();

  if (status === "resolved" && resolved.contact) {
    const contact = resolved.contact;
    if (waId && typeof TL_ActiveItem_Set_ === "function") {
      TL_ActiveItem_Set_(waId, {
        kind: "contact_lookup",
        status: "active",
        source_text: sourceText,
        contact_query: String(lookup.contact_query || sourceText).trim(),
        search_queries: Array.isArray(lookup.search_queries) ? lookup.search_queries.slice() : [],
        reply_preamble: preamble,
        resolved_contact_id: String(contact.contactId || contact.contact_id || "").trim(),
        resolved_contact_name: String(contact.name || "").trim()
      });
    }
    const bits = [
      String(contact.name || "").trim(),
      String(contact.org || "").trim(),
      String(contact.role || "").trim(),
      String(contact.phone1 || contact.phone2 || "").trim(),
      String(contact.email || "").trim()
    ].filter(Boolean);
    return [
      preamble,
      "",
      TL_Menu_T_("מצאתי התאמה אחת:", "I found one match:"),
      bits.join(" | ")
    ].join("\n");
  }

  if (status === "ambiguous" && candidates.length) {
    if (waId && typeof TL_ActiveItem_Set_ === "function") {
      TL_ActiveItem_Set_(waId, {
        kind: "contact_lookup",
        status: "active",
        source_text: sourceText,
        contact_query: String(lookup.contact_query || sourceText).trim(),
        search_queries: Array.isArray(lookup.search_queries) ? lookup.search_queries.slice() : [],
        reply_preamble: preamble
      });
    }
    return [
      preamble,
      "",
      TL_Menu_T_("מצאתי כמה התאמות אפשריות:", "I found a few possible matches:"),
      candidates.slice(0, 3).map(function(item, index) {
        return (index + 1) + ". " + TL_Menu_DescribeContactCandidate_(item);
      }).join("\n")
    ].join("\n");
  }

  if (waId && typeof TL_ActiveItem_Set_ === "function") {
    TL_ActiveItem_Set_(waId, {
      kind: "contact_lookup",
      status: "active",
      source_text: sourceText,
      contact_query: String(lookup.contact_query || sourceText).trim(),
      search_queries: Array.isArray(lookup.search_queries) ? lookup.search_queries.slice() : [],
      reply_preamble: preamble
    });
  }
  return [
    preamble,
    "",
    TL_Menu_T_("לא מצאתי התאמה ברורה לאיש הקשר הזה.", "I couldn't find a clear match for that contact."),
    queries.length ? (TL_Menu_T_("ניסיתי לחפש לפי: ", "I searched using: ") + queries.map(function(item) {
      return String(item.type || "") + "=" + String(item.value || "");
    }).join(", ")) : ""
  ].filter(Boolean).join("\n");
}

function TL_Menu_BuildContextLookupSummary_(intent, ev, analysis, options) {
  const opts = options || {};
  const sourceText = String(ev && ev.text || intent && intent.parameters && intent.parameters.query || "").trim();
  const active = opts.activeItem && typeof opts.activeItem === "object" ? opts.activeItem : null;
  const lookup = typeof TL_AI_ExtractBossContextLookup_ === "function"
    ? TL_AI_ExtractBossContextLookup_(sourceText, {
        contextLookupFn: opts.contextLookupFn
      })
    : {
        contact_query: sourceText,
        search_queries: [],
        topic_query: "",
        topic_id: "",
        reply_preamble: ""
      };
  const mergedLookup = {
    contact_query: String(lookup.contact_query || active && active.contact_query || "").trim(),
    search_queries: Array.isArray(lookup.search_queries) && lookup.search_queries.length
      ? lookup.search_queries.slice()
      : (Array.isArray(active && active.search_queries) ? active.search_queries.slice() : []),
    topic_query: String(
      lookup.topic_query ||
      active && active.topic_query ||
      ((active && String(active.kind || "").trim().toLowerCase() === "contact_lookup" && sourceText && !lookup.contact_query && !lookup.topic_query && !lookup.topic_id)
        ? sourceText
        : "")
    ).trim(),
    topic_id: String(lookup.topic_id || active && active.topic_id || "").trim(),
    reply_preamble: String(lookup.reply_preamble || "").trim()
  };

  const resolveFn = opts.resolveContactFn || TL_Contacts_ResolveRequest_;
  const contactResult = (mergedLookup.contact_query || (mergedLookup.search_queries && mergedLookup.search_queries.length)) && typeof resolveFn === "function"
    ? resolveFn({
        rawText: sourceText,
        query: String(mergedLookup.contact_query || sourceText).trim(),
        contact_query: String(mergedLookup.contact_query || "").trim(),
        search_queries: Array.isArray(mergedLookup.search_queries) ? mergedLookup.search_queries.slice() : []
      }, { channel: "" }, opts.contacts || null)
    : { status: "missing", contact: null, candidates: [], queries: [] };

  const topicResult = TL_Menu_ResolveTopicLookup_({
    topic_id: mergedLookup.topic_id,
    topic_query: mergedLookup.topic_query
  }, opts);

  const rows = TL_Menu_FindRecentContextRows_(contactResult, topicResult, opts);
  const preamble = String(
    mergedLookup.reply_preamble ||
    analysis && analysis.reply_preamble ||
    TL_Menu_T_("אוספת את ההקשר האחרון שביקשת.", "Gathering the recent context you asked for.")
  ).trim();

  const scopeBits = [];
  if (contactResult && contactResult.contact) {
    scopeBits.push(String(contactResult.contact.name || contactResult.contact.email || contactResult.contact.phone1 || "").trim());
  }
  if (topicResult && topicResult.topicId) {
    scopeBits.push(String(topicResult.topicSummary || topicResult.topicId || "").trim());
  }
  const title = scopeBits.length
    ? (TL_Menu_T_("הקשר אחרון עבור: ", "Recent context for: ") + scopeBits.join(" | "))
    : TL_Menu_T_("הקשר אחרון", "Recent context");
  const waId = String(ev && ev.from || "").trim();

  if (waId && typeof TL_ActiveItem_Set_ === "function") {
    TL_ActiveItem_Set_(waId, {
      item_id: active && active.item_id || "",
      kind: "context_lookup",
      status: "active",
      source_text: sourceText,
      contact_query: mergedLookup.contact_query,
      search_queries: mergedLookup.search_queries,
      topic_query: mergedLookup.topic_query,
      topic_id: String(topicResult && topicResult.topicId || mergedLookup.topic_id || "").trim(),
      reply_preamble: preamble,
      resolved_contact_id: String(contactResult && contactResult.contact && (contactResult.contact.contactId || contactResult.contact.contact_id) || active && active.resolved_contact_id || "").trim(),
      resolved_contact_name: String(contactResult && contactResult.contact && contactResult.contact.name || active && active.resolved_contact_name || "").trim(),
      resolved_topic_summary: String(topicResult && topicResult.topicSummary || active && active.resolved_topic_summary || "").trim()
    });
  }

  if (!rows.length) {
    return [
      preamble,
      "",
      title,
      TL_Menu_T_("לא מצאתי עדיין פריטים מתאימים בהיסטוריה המקומית.", "I couldn't find matching items in the local history yet.")
    ].join("\n");
  }

  return [
    preamble,
    "",
    TL_Menu_BuildSummaryBlock_(title, rows, "")
  ].join("\n");
}

function TL_Menu_BuildSimilarRepliesSummary_(intent, ev, analysis, options) {
  const opts = options || {};
  const sourceText = String(ev && ev.text || intent && intent.parameters && intent.parameters.query || "").trim();
  const active = opts.activeItem && typeof opts.activeItem === "object" ? opts.activeItem : null;
  const lookup = typeof TL_AI_ExtractBossContextLookup_ === "function"
    ? TL_AI_ExtractBossContextLookup_(sourceText, {
        contextLookupFn: opts.contextLookupFn
      })
    : {
        contact_query: sourceText,
        search_queries: [],
        topic_query: "",
        topic_id: "",
        reply_preamble: ""
      };
  const mergedLookup = {
    contact_query: String(lookup.contact_query || active && active.contact_query || "").trim(),
    search_queries: Array.isArray(lookup.search_queries) && lookup.search_queries.length
      ? lookup.search_queries.slice()
      : (Array.isArray(active && active.search_queries) ? active.search_queries.slice() : []),
    topic_query: String(lookup.topic_query || active && active.topic_query || "").trim(),
    topic_id: String(lookup.topic_id || active && active.topic_id || "").trim(),
    reply_preamble: String(lookup.reply_preamble || "").trim()
  };

  const resolveFn = opts.resolveContactFn || TL_Contacts_ResolveRequest_;
  const contactResult = (mergedLookup.contact_query || (mergedLookup.search_queries && mergedLookup.search_queries.length)) && typeof resolveFn === "function"
    ? resolveFn({
        rawText: sourceText,
        query: String(mergedLookup.contact_query || sourceText).trim(),
        contact_query: String(mergedLookup.contact_query || "").trim(),
        search_queries: Array.isArray(mergedLookup.search_queries) ? mergedLookup.search_queries.slice() : []
      }, { channel: "" }, opts.contacts || null)
    : { status: "missing", contact: null, candidates: [], queries: [] };

  const topicResult = TL_Menu_ResolveTopicLookup_({
    topic_id: mergedLookup.topic_id,
    topic_query: mergedLookup.topic_query
  }, opts);
  const rows = TL_Menu_FindSimilarReplyRows_(contactResult, topicResult, opts);
  const preamble = String(
    mergedLookup.reply_preamble ||
    analysis && analysis.reply_preamble ||
    TL_Menu_T_("אוספת כמה תשובות דומות מהעבר.", "Gathering a few similar past replies.")
  ).trim();

  const scopeBits = [];
  if (contactResult && contactResult.contact) {
    scopeBits.push(String(contactResult.contact.name || contactResult.contact.email || contactResult.contact.phone1 || "").trim());
  }
  if (topicResult && topicResult.topicId) {
    scopeBits.push(String(topicResult.topicSummary || topicResult.topicId || "").trim());
  }
  const title = scopeBits.length
    ? (TL_Menu_T_("תשובות דומות עבור: ", "Similar replies for: ") + scopeBits.join(" | "))
    : TL_Menu_T_("תשובות דומות", "Similar replies");
  const waId = String(ev && ev.from || "").trim();

  if (waId && typeof TL_ActiveItem_Set_ === "function") {
    TL_ActiveItem_Set_(waId, {
      item_id: active && active.item_id || "",
      kind: "similar_replies_lookup",
      status: "active",
      source_text: sourceText,
      contact_query: mergedLookup.contact_query,
      search_queries: mergedLookup.search_queries,
      topic_query: mergedLookup.topic_query,
      topic_id: String(topicResult && topicResult.topicId || mergedLookup.topic_id || "").trim(),
      reply_preamble: preamble,
      resolved_contact_id: String(contactResult && contactResult.contact && (contactResult.contact.contactId || contactResult.contact.contact_id) || active && active.resolved_contact_id || "").trim(),
      resolved_contact_name: String(contactResult && contactResult.contact && contactResult.contact.name || active && active.resolved_contact_name || "").trim(),
      resolved_topic_summary: String(topicResult && topicResult.topicSummary || active && active.resolved_topic_summary || "").trim()
    });
  }

  if (!rows.length) {
    return [
      preamble,
      "",
      title,
      TL_Menu_T_("לא מצאתי עדיין תשובות דומות בהיסטוריה המקומית.", "I couldn't find similar replies in the local history yet.")
    ].join("\n");
  }

  return [
    preamble,
    "",
    TL_Menu_BuildSummaryBlock_(title, rows, "")
  ].join("\n");
}

function TL_Menu_ResolveTopicLookup_(lookup, options) {
  const data = lookup || {};
  const exactTopicId = String(data.topic_id || "").trim();
  const query = String(data.topic_query || "").trim().toLowerCase();
  const topics = typeof TL_DraftContext_fetchTopics_ === "function"
    ? TL_DraftContext_fetchTopics_(null, { topicLimit: Number(options && options.topicLimit || 50) })
    : [];
  const candidates = (topics || []).map(function(item) {
    return {
      topicId: String(item && item.topicId || item && item.topic_id || "").trim(),
      topicSummary: String(item && item.topicSummary || item && item.topic_summary || "").trim()
    };
  }).filter(function(item) {
    return !!item.topicId;
  });

  if (exactTopicId) {
    for (let i = 0; i < candidates.length; i++) {
      if (String(candidates[i].topicId || "").trim().toLowerCase() === exactTopicId.toLowerCase()) {
        return {
          status: "resolved",
          topicId: candidates[i].topicId,
          topicSummary: candidates[i].topicSummary
        };
      }
    }
  }

  if (query) {
    for (let j = 0; j < candidates.length; j++) {
      const topicId = String(candidates[j].topicId || "").trim().toLowerCase();
      const summary = String(candidates[j].topicSummary || "").trim().toLowerCase();
      if (topicId.indexOf(query) !== -1 || summary.indexOf(query) !== -1 || query.indexOf(topicId.replace(/^topic_/, "")) !== -1) {
        return {
          status: "resolved",
          topicId: candidates[j].topicId,
          topicSummary: candidates[j].topicSummary
        };
      }
    }
  }

  return {
    status: exactTopicId || query ? "missing" : "none",
    topicId: "",
    topicSummary: ""
  };
}

function TL_Menu_FindRecentContextRows_(contactResult, topicResult, options) {
  const limit = Number(options && options.contextLimit || TL_MENU.MAX_PENDING_SUMMARY);
  const resolvedContact = contactResult && contactResult.contact ? contactResult.contact : null;
  const resolvedContactId = String(resolvedContact && (resolvedContact.contactId || resolvedContact.contact_id) || "").trim();
  const resolvedTopicId = String(topicResult && topicResult.topicId || "").trim();

  return TL_Menu_FilterRecentRows_(function(item) {
    const values = item && item.values ? item.values : [];
    const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
    if (recordClass === "status") return false;

    const rowContactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
    const rowTopicId = String(TL_Orchestrator_value_(values, "topic_id") || "").trim();

    if (resolvedContactId && rowContactId !== resolvedContactId) return false;
    if (resolvedTopicId && rowTopicId !== resolvedTopicId) return false;
    if (!resolvedContactId && !resolvedTopicId) return false;
    return true;
  }, limit);
}

function TL_Menu_FindSimilarReplyRows_(contactResult, topicResult, options) {
  const limit = Number(options && options.similarReplyLimit || 3);
  const resolvedContact = contactResult && contactResult.contact ? contactResult.contact : null;
  const resolvedContactId = String(resolvedContact && (resolvedContact.contactId || resolvedContact.contact_id) || "").trim();
  const resolvedTopicId = String(topicResult && topicResult.topicId || "").trim();

  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item && item.values ? item.values : [];
    if (String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase() !== "communication") return false;
    if (String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase() !== "outgoing") return false;

    const rowContactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
    const rowTopicId = String(TL_Orchestrator_value_(values, "topic_id") || "").trim();
    if (resolvedContactId && rowContactId !== resolvedContactId) return false;
    if (resolvedTopicId && rowTopicId !== resolvedTopicId) return false;
    if (!resolvedContactId && !resolvedTopicId) return false;

    const hasReplyText = !!String(
      TL_Orchestrator_value_(values, "ai_proposal") ||
      TL_Orchestrator_value_(values, "text") ||
      ""
    ).trim();
    return hasReplyText;
  }, Math.max(limit * 4, 12));

  return (rows || []).map(function(item) {
    const values = item && item.values ? item.values : [];
    const approvalStatus = String(TL_Orchestrator_value_(values, "approval_status") || "").trim().toLowerCase();
    const executionStatus = String(TL_Orchestrator_value_(values, "execution_status") || "").trim().toLowerCase();
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const strongCompleted = executionStatus === "sent" ||
      executionStatus === "delivered" ||
      executionStatus === "read" ||
      executionStatus === "completed" ||
      executionStatus === "approved";
    const approvedDraft = approvalStatus === "approved" || approvalStatus === "awaiting_approval";
    const score = (strongCompleted ? 4 : 0) + (approvedDraft ? 2 : 0) + (channel === "whatsapp" ? 1 : 0);
    return {
      row: item,
      score: score
    };
  }).sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return Number(b.row && b.row.rowNumber || 0) - Number(a.row && a.row.rowNumber || 0);
  }).slice(0, limit > 0 ? limit : 3).map(function(entry) {
    const values = entry.row && entry.row.values ? entry.row.values : [];
    return {
      label: [
        String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase(),
        TL_Menu_PreviewText_(TL_Orchestrator_value_(values, "ai_proposal") || TL_Orchestrator_value_(values, "text") || "", 140)
      ].filter(Boolean).join(" | "),
      rowNumber: Number(entry.row && entry.row.rowNumber || 0),
      channel: String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase(),
      approvalStatus: String(TL_Orchestrator_value_(values, "approval_status") || "").trim().toLowerCase(),
      executionStatus: String(TL_Orchestrator_value_(values, "execution_status") || "").trim().toLowerCase()
    };
  });
}

function TL_Menu_PreviewText_(text, maxLen) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const limit = Number(maxLen || 140);
  if (!raw || raw.length <= limit) return raw;
  return raw.slice(0, Math.max(limit - 1, 1)).trim() + "…";
}

function TL_Menu_IsAiCostQuery_(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (normalized === "עלות") return true;
  if (normalized.indexOf("cost") !== -1 && normalized.indexOf("ai") !== -1) return true;
  if (normalized.indexOf("עלות") !== -1 && (normalized.indexOf("ai") !== -1 || normalized.indexOf("בינה") !== -1 || normalized.indexOf("מודל") !== -1)) return true;
  if (normalized.indexOf("כמה") !== -1 && normalized.indexOf("עלה") !== -1 && (normalized.indexOf("ai") !== -1 || normalized.indexOf("בינה") !== -1)) return true;
  return false;
}

function TL_Menu_CaptureStateForIntent_(intentName, explicitState) {
  const state = String(explicitState || "").trim();
  if (state) {
    return state === TL_MENU_STATES.CAPTURE_CONTACT_ENRICH ? state : "";
  }
  const map = {};
  map.create_contact_enrichment = TL_MENU_STATES.CAPTURE_CONTACT_ENRICH;
  return map[String(intentName || "").trim().toLowerCase()] || "";
}

function TL_Menu_BuildCaptureAck_(intent) {
  const intentName = String(intent && intent.intent || "").trim();
  const reply = String(intent && intent.reply || "").trim();
  if (reply) return reply;
  if (intentName.indexOf("create_") === 0) {
    return [
      TL_Menu_T_("קיבלתי.", "Got it."),
      TL_Menu_T_("רשמתי את זה כפריט עבודה חדש.", "I logged this as a new work item."),
      TL_Menu_T_("אבנה מזה הצעה לאישור לפני ביצוע.", "I’ll turn this into a proposal for your approval before execution.")
    ].join("\n");
  }
  return TL_Menu_T_("קיבלתי.", "Got it.");
}

function TL_Menu_HasDecisionPacket_(waId) {
  return !!TL_Menu_GetDecisionPacket_(waId);
}

function TL_Menu_GetDecisionPacket_(waId) {
  try {
    const safeWaId = String(waId || "").trim();
    const raw = PropertiesService.getScriptProperties().getProperty(TL_MENU.PACKET_KEY_PREFIX + safeWaId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.items || !parsed.items.length) return null;
    if (!TL_Menu_IsFlowRecordValid_(parsed.created_at, parsed.session_version, TL_Menu_ActiveFlowTtlMinutes_(), Date.now())) {
      TL_Menu_ClearDecisionPacket_(safeWaId);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function TL_Menu_SetDecisionPacket_(waId, packet) {
  const normalizedWaId = String(waId || "").trim();
  if (!normalizedWaId) return false;
  if (!packet || !packet.items || !packet.items.length) {
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.PACKET_KEY_PREFIX + normalizedWaId);
    return true;
  }
  const safe = {
    kind: String(packet.kind || "decision"),
    stage: String(packet.stage || "root"),
    cursor: Number(packet.cursor || 0),
    created_at: String(packet.created_at || new Date().toISOString()),
    session_version: String(packet.session_version || TL_Menu_SessionRuntimeVersion_()),
    items: (packet.items || []).map(function(item) {
      return {
        key: String(item.key || ""),
        rowNumber: Number(item.rowNumber || 0),
        recordId: String(item.recordId || ""),
        rootId: String(item.rootId || ""),
        recordClass: String(item.recordClass || ""),
        summary: String(item.summary || ""),
        proposal: String(item.proposal || ""),
        proposalOptions: Array.isArray(item.proposalOptions) ? item.proposalOptions.slice(0, 3).map(function(option) {
          return String(option || "").trim();
        }).filter(Boolean) : [],
        rawSnippet: String(item.rawSnippet || ""),
        sender: String(item.sender || ""),
        senderLabel: String(item.senderLabel || ""),
        receiver: String(item.receiver || ""),
        channel: String(item.channel || ""),
        channelLabel: String(item.channelLabel || ""),
        messageType: String(item.messageType || ""),
        subject: String(item.subject || ""),
        suggestedAction: String(item.suggestedAction || ""),
        recipientQuery: String(item.recipientQuery || ""),
        recipientName: String(item.recipientName || ""),
        recipientDestination: String(item.recipientDestination || ""),
        recipientCandidates: Array.isArray(item.recipientCandidates) ? item.recipientCandidates.slice(0, 5).map(function(candidate) {
          return {
            contactId: String(candidate && candidate.contactId || ""),
            name: String(candidate && candidate.name || ""),
            phone1: String(candidate && candidate.phone1 || ""),
            phone2: String(candidate && candidate.phone2 || ""),
            email: String(candidate && candidate.email || ""),
            preferredDestination: String(candidate && candidate.preferredDestination || ""),
            matchScore: Number(candidate && candidate.matchScore || 0)
          };
        }) : [],
        resolutionStatus: String(item.resolutionStatus || ""),
        searchQueries: Array.isArray(item.searchQueries) ? item.searchQueries.slice(0, 12) : [],
        contactId: String(item.contactId || ""),
        approvalStatus: String(item.approvalStatus || ""),
        executionStatus: String(item.executionStatus || ""),
        taskStatus: String(item.taskStatus || ""),
        captureKind: String(item.captureKind || ""),
        captureTitle: String(item.captureTitle || ""),
        topicCandidate: String(item.topicCandidate || ""),
        topicSummary: String(item.topicSummary || ""),
        topicLatestAt: String(item.topicLatestAt || ""),
        topicExistingId: String(item.topicExistingId || ""),
        topicCandidateCount: Number(item.topicCandidateCount || 0),
        topicSamples: Array.isArray(item.topicSamples) ? item.topicSamples.slice(0, 3) : [],
        duePreview: String(item.duePreview || ""),
        dueLabel: String(item.dueLabel || ""),
        currentChannel: String(item.currentChannel || ""),
        opportunityReason: String(item.opportunityReason || ""),
        opportunityDraftWhatsApp: String(item.opportunityDraftWhatsApp || ""),
        opportunityDraftEmail: String(item.opportunityDraftEmail || ""),
        opportunityPhoneOptions: Array.isArray(item.opportunityPhoneOptions) ? item.opportunityPhoneOptions.slice(0, 5) : [],
        opportunityEmailOptions: Array.isArray(item.opportunityEmailOptions) ? item.opportunityEmailOptions.slice(0, 5) : [],
        isUrgent: !!item.isUrgent,
        isHigh: !!item.isHigh
      };
    }).filter(function(item) {
      return !!item.rowNumber || String(packet.kind || "").trim().toLowerCase() === "opportunity";
    })
  };
  PropertiesService.getScriptProperties().setProperty(TL_MENU.PACKET_KEY_PREFIX + normalizedWaId, JSON.stringify(safe));
  return true;
}

function TL_Menu_ClearDecisionPacket_(waId) {
  PropertiesService.getScriptProperties().deleteProperty(TL_MENU.PACKET_KEY_PREFIX + String(waId || "").trim());
  TL_Menu_ClearOutboundDraftActiveItem_(waId);
  TL_Menu_ClearCaptureItemActiveItem_(waId);
}

function TL_Menu_StoreDecisionPacket_(waId, kind, items) {
  const packetItems = (items || []).map(function(item) {
    return {
      key: item.key,
      rowNumber: item.rowNumber,
      recordId: item.recordId,
      rootId: item.rootId,
      recordClass: item.recordClass,
      summary: item.summary,
      proposal: item.proposal,
      proposalOptions: Array.isArray(item.proposalOptions) ? item.proposalOptions.slice(0, 3) : [],
      rawSnippet: item.rawSnippet,
      sender: item.sender,
      senderLabel: item.senderLabel,
      receiver: item.receiver,
      channel: item.channel,
      channelLabel: item.channelLabel,
      messageType: item.messageType,
      subject: item.subject,
      suggestedAction: item.suggestedAction,
      recipientQuery: item.recipientQuery,
      recipientName: item.recipientName,
      recipientDestination: item.recipientDestination,
      recipientCandidates: item.recipientCandidates,
      resolutionStatus: item.resolutionStatus,
      searchQueries: item.searchQueries,
      contactId: item.contactId,
      approvalStatus: item.approvalStatus,
      executionStatus: item.executionStatus,
      taskStatus: item.taskStatus,
      captureKind: item.captureKind,
      captureTitle: item.captureTitle,
      topicCandidate: item.topicCandidate,
      topicSummary: item.topicSummary,
      topicLatestAt: item.topicLatestAt,
      topicExistingId: item.topicExistingId,
      topicCandidateCount: item.topicCandidateCount,
      topicSamples: item.topicSamples,
      duePreview: item.duePreview,
      dueLabel: item.dueLabel,
      isUrgent: item.isUrgent,
      isHigh: item.isHigh
    };
  }).filter(function(item) {
    return !!item.rowNumber;
  });
  if (!packetItems.length) return false;
  const initialStage = String(kind || "decision") === "capture" && (
    packetItems.length === 1 ||
    packetItems.some(function(item) {
      return TL_Menu_IsOutboundCommunicationItem_(item);
    })
  ) ? "one_by_one" : "root";
  return TL_Menu_SetDecisionPacket_(waId, {
    kind: kind || "decision",
    stage: initialStage,
    cursor: 0,
    created_at: new Date().toISOString(),
    items: packetItems
  });
}

function TL_Menu_HandleDecisionPacketReply_(waId, text) {
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (!packet) return null;

  const choice = TL_Menu_ParseChoice_(text) || String(text || "").trim();
  if (!choice) {
    if (packet.stage === "edit") return TL_Menu_BuildDecisionPacketEditReply_(packet);
    return TL_Menu_BuildDecisionPacketReply_(packet);
  }

  if (packet.stage === "root") {
    return TL_Menu_HandleDecisionPacketRootReply_(waId, packet, choice);
  }
  if (packet.stage === "few") {
    return TL_Menu_HandleDecisionPacketFewReply_(waId, packet, choice);
  }
  if (packet.stage === "smart") {
    return TL_Menu_HandleDecisionPacketSmartReply_(waId, packet, choice);
  }
  if (packet.stage === "one_by_one") {
    return TL_Menu_HandleDecisionPacketOneByOneReply_(waId, packet, choice);
  }
  if (packet.stage === "edit") {
    return TL_Menu_HandleDecisionPacketEditReply_(waId, packet, text);
  }

  TL_Menu_ClearDecisionPacket_(waId);
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_HandleDecisionPacketRootReply_(waId, packet, choice) {
  if (choice === "1") {
    const approved = TL_Menu_ApprovePacketItems_(packet.items);
    TL_Menu_ClearDecisionPacket_(waId);
    return [
      TL_Menu_T_("אישרתי את כל הפריטים בחבילה."),
      TL_Menu_T_("סה\"כ אושרו: ") + approved.approved,
      approved.failed ? (TL_Menu_T_("נכשלו: ") + approved.failed) : "",
      TL_Menu_T_("המערכת תמשיך לעיבוד/שליחה לפי הזרימה הרגילה.")
    ].filter(Boolean).join("\n");
  }
  if (choice === "2") {
    packet.stage = "few";
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketFewReply_(packet);
  }
  if (choice === "3") {
    packet.stage = "one_by_one";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }
  if (choice === "4") {
    packet.stage = "smart";
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketSmartReply_(packet);
  }
  if (choice === "5") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("בסדר. לא בוצע דבר כרגע.");
  }
  if (choice === "6") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  }
  return TL_Menu_BuildDecisionPacketReply_(packet);
}

function TL_Menu_HandleDecisionPacketFewReply_(waId, packet, choice) {
  if (choice === "1") {
    const subset = packet.items.slice(0, Math.min(3, packet.items.length));
    const approved = TL_Menu_ApprovePacketItems_(subset);
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("אישרתי חלק מהחבילה. אושרו ") + approved.approved + TL_Menu_T_(" פריטים ראשונים.");
  }
  if (choice === "2") {
    const urgentOnly = packet.items.filter(function(item) { return item.isUrgent; });
    const approved = TL_Menu_ApprovePacketItems_(urgentOnly);
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("אישרתי רק את הפריטים הדחופים. אושרו ") + approved.approved + TL_Menu_T_(" פריטים.");
  }
  if (choice === "3") {
    const topOne = packet.items.slice(0, 1);
    const approved = TL_Menu_ApprovePacketItems_(topOne);
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("אישרתי רק את הפריט הראשון. אושרו ") + approved.approved + TL_Menu_T_(" פריטים.");
  }
  if (choice === "4") {
    packet.stage = "root";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketReply_(packet);
  }
  if (choice === "5") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  }
  return TL_Menu_BuildDecisionPacketFewReply_(packet);
}

function TL_Menu_HandleDecisionPacketSmartReply_(waId, packet, choice) {
  if (choice === "1") {
    const smartSubset = packet.items.filter(function(item) {
      return item.isUrgent || item.isHigh;
    });
    const approved = TL_Menu_ApprovePacketItems_(smartSubset);
    const remaining = Math.max(packet.items.length - approved.approved, 0);
    TL_Menu_ClearDecisionPacket_(waId);
    return [
      TL_Menu_T_("אישרתי את הדחופים/החשובים בלבד."),
      TL_Menu_T_("אושרו: ") + approved.approved,
      TL_Menu_T_("נשארו ללא אישור: ") + remaining
    ].join("\n");
  }
  if (choice === "2") {
    const exceptions = packet.items.filter(function(item) {
      return !(item.isUrgent || item.isHigh);
    });
    if (!exceptions.length) {
      packet.stage = "root";
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_T_("אין כרגע חריגים. כל הפריטים נראים דחופים/חשובים.");
    }
    packet.stage = "one_by_one";
    packet.cursor = 0;
    packet.items = exceptions;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }
  if (choice === "3") {
    packet.stage = "root";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketReply_(packet);
  }
  if (choice === "4") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  }
  return TL_Menu_BuildDecisionPacketSmartReply_(packet);
}

function TL_Menu_HandleDecisionPacketOneByOneReply_(waId, packet, choice) {
  const current = packet.items[packet.cursor || 0];
  if (!current) {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("סיימנו את הסקירה אחד-אחד.");
  }
  if (String(packet && packet.kind || "").trim().toLowerCase() === "opportunity") {
    return TL_Menu_HandleOpportunityPacketReply_(waId, packet, choice, current);
  }

  const actionSpec = TL_Menu_GetDecisionPacketActionSpec_(current);
  const multiReplyOptions = TL_Menu_GetDecisionPacketReplyOptions_(current);

  if (TL_Menu_ItemNeedsRecipientResolution_(current)) {
    return TL_Menu_HandleDecisionPacketRecipientReply_(waId, packet, choice);
  }

  if (multiReplyOptions.length) {
    const editChoice = String(multiReplyOptions.length + 1);
    const laterChoice = String(multiReplyOptions.length + 2);
    const archiveChoice = String(multiReplyOptions.length + 3);
    const selectedIndex = Number(choice) - 1;
    if (selectedIndex >= 0 && selectedIndex < multiReplyOptions.length) {
      const selectedText = String(multiReplyOptions[selectedIndex] || "").trim();
      TL_Menu_ApplyDecisionProposalChoice_(current.rowNumber, selectedText);
      current.proposal = selectedText;
      const approvalMulti = TL_Menu_ApproveDecisionRow_(current.rowNumber);
      packet.cursor = Number(packet.cursor || 0) + 1;
      const selectedReceipt = TL_Menu_BuildDecisionPacketReceipt_(current, approvalMulti);
      if (!packet.items[packet.cursor || 0]) {
        TL_Menu_ClearDecisionPacket_(waId);
        return [
          selectedReceipt,
          TL_Menu_T_("אין כרגע עוד פריטים שממתינים להחלטה.")
        ].filter(Boolean).join("\n\n");
      }
      TL_Menu_SetDecisionPacket_(waId, packet);
      return [
        selectedReceipt,
        TL_Menu_BuildDecisionPacketOneByOneReply_(packet)
      ].filter(Boolean).join("\n\n");
    } else if (choice === editChoice) {
      packet.stage = "edit";
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_BuildDecisionPacketEditReply_(packet);
    } else if (choice === laterChoice) {
      packet.cursor = Number(packet.cursor || 0) + 1;
    } else if (choice === archiveChoice) {
      const archivedMulti = TL_Menu_ArchiveDecisionRow_(current.rowNumber);
      packet.cursor = Number(packet.cursor || 0) + 1;
      const archivedReceipt = archivedMulti && archivedMulti.receiptText ? archivedMulti.receiptText : TL_Menu_T_("הפריט הועבר לארכיון.");
      if (!packet.items[packet.cursor || 0]) {
        TL_Menu_ClearDecisionPacket_(waId);
        return [
          archivedReceipt,
          TL_Menu_T_("אין כרגע עוד פריטים שממתינים להחלטה.")
        ].filter(Boolean).join("\n\n");
      }
      TL_Menu_SetDecisionPacket_(waId, packet);
      return [
        archivedReceipt,
        TL_Menu_BuildDecisionPacketOneByOneReply_(packet)
      ].filter(Boolean).join("\n\n");
    } else {
      return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
    }

    if (!packet.items[packet.cursor || 0]) {
      TL_Menu_ClearDecisionPacket_(waId);
      return TL_Menu_T_("סיימנו את הסקירה. אין עוד פריטים בחבילה.");
    }

    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }

  if (choice === "1") {
    const approval = TL_Menu_ApproveDecisionRow_(current.rowNumber);
    packet.cursor = Number(packet.cursor || 0) + 1;
    const receiptText = TL_Menu_BuildDecisionPacketReceipt_(current, approval);
    if (!packet.items[packet.cursor || 0]) {
      TL_Menu_ClearDecisionPacket_(waId);
      return [
        receiptText,
        TL_Menu_T_("אין כרגע עוד פריטים שממתינים להחלטה.")
      ].filter(Boolean).join("\n\n");
    }
    TL_Menu_SetDecisionPacket_(waId, packet);
    return [
      receiptText,
      TL_Menu_BuildDecisionPacketOneByOneReply_(packet)
    ].filter(Boolean).join("\n\n");
  } else if (choice === "2") {
    packet.stage = "edit";
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketEditReply_(packet);
  } else if (choice === "3") {
    packet.cursor = Number(packet.cursor || 0) + 1;
  } else if (choice === "4") {
    const archived = TL_Menu_ArchiveDecisionRow_(current.rowNumber);
    packet.cursor = Number(packet.cursor || 0) + 1;
    const receiptText = archived && archived.receiptText ? archived.receiptText : TL_Menu_T_("הפריט הועבר לארכיון.");
    if (!packet.items[packet.cursor || 0]) {
      TL_Menu_ClearDecisionPacket_(waId);
      return [
        receiptText,
        TL_Menu_T_("אין כרגע עוד פריטים שממתינים להחלטה.")
      ].filter(Boolean).join("\n\n");
    }
    TL_Menu_SetDecisionPacket_(waId, packet);
    return [
      receiptText,
      TL_Menu_BuildDecisionPacketOneByOneReply_(packet)
    ].filter(Boolean).join("\n\n");
  } else {
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }

  if (!packet.items[packet.cursor || 0]) {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("סיימנו את הסקירה. אין עוד פריטים בחבילה.");
  }

  TL_Menu_SetDecisionPacket_(waId, packet);
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
}

function TL_Menu_HandleDecisionPacketRecipientReply_(waId, packet, choice) {
  const current = packet.items[packet.cursor || 0];
  if (!current) {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("אין כרגע פריט פתוח.");
  }

  const resolutionStatus = String(current.resolutionStatus || "").trim().toLowerCase();
  const candidates = Array.isArray(current.recipientCandidates) ? current.recipientCandidates : [];

  if (resolutionStatus === "missing") {
    if (choice === "1") {
      packet.cursor = Number(packet.cursor || 0) + 1;
    } else if (choice === "2") {
      TL_Menu_ClearDecisionPacket_(waId);
      return TL_Menu_T_("עצרתי את הסקירה אחד-אחד.");
    } else if (choice === "3") {
      TL_Menu_ClearDecisionPacket_(waId);
      return TL_Menu_BuildMenuReply_();
    } else {
      return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
    }
  } else {
    const selectedIndex = Number(choice) - 1;
    if (selectedIndex >= 0 && selectedIndex < candidates.length) {
      const applied = TL_Menu_ApplyPacketRecipientChoice_(current, candidates[selectedIndex]);
      packet.items[packet.cursor || 0] = applied;
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("בחרתי את איש הקשר המתאים."));
    }
    if (choice === "8") {
      packet.cursor = Number(packet.cursor || 0) + 1;
    } else if (choice === "9") {
      TL_Menu_ClearDecisionPacket_(waId);
      return TL_Menu_T_("עצרתי את הסקירה אחד-אחד.");
    } else {
      return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
    }
  }

  if (!packet.items[packet.cursor || 0]) {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("סיימנו את הסקירה. אין עוד פריטים בחבילה.");
  }

  TL_Menu_SetDecisionPacket_(waId, packet);
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
}

function TL_Menu_HandleDecisionPacketEditReply_(waId, packet, text) {
  const current = packet.items[packet.cursor || 0];
  if (!current) {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("אין כרגע פריט לעריכה.");
  }

  const choice = String(text || "").trim();
  if (!choice) return TL_Menu_BuildDecisionPacketEditReply_(packet);
  if (choice === "1") {
    packet.stage = "one_by_one";
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("ביטלתי את העריכה."));
  }
  if (choice === "2") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  }

  const revised = TL_Menu_ReviseDecisionRow_(current.rowNumber, choice);
  current.summary = revised.summary;
  current.proposal = revised.proposal;
  packet.stage = "one_by_one";
  TL_Menu_SetDecisionPacket_(waId, packet);
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("עדכנתי את הנוסח. אשר אם זה נכון, או ערוך שוב."));
}

function TL_Menu_ApprovePacketItems_(items) {
  const unique = {};
  const result = { approved: 0, failed: 0 };
  (items || []).forEach(function(item) {
    if (!item || !item.rowNumber || unique[item.rowNumber]) return;
    unique[item.rowNumber] = true;
    const approval = TL_Menu_ApproveDecisionRow_(item.rowNumber);
    if (approval && approval.ok !== false) result.approved++;
    else result.failed++;
  });
  return result;
}

function TL_Menu_ApproveDecisionRow_(rowNumber) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_INBOX.SHEET);
    if (!sh || !rowNumber) return { ok: false, reason: "missing_sheet_or_row" };

    const values = sh.getRange(rowNumber, 1, 1, TL_INBOX.HEADERS.length).getValues()[0];
    const approvalRequired = String(values[TLW_colIndex_("approval_required") - 1] || "").trim().toLowerCase() === "true";
    const approvalStatus = String(values[TLW_colIndex_("approval_status") - 1] || "").trim().toLowerCase();
    const executionStatus = String(values[TLW_colIndex_("execution_status") - 1] || "").trim().toLowerCase();
    const taskStatus = String(values[TLW_colIndex_("task_status") - 1] || "").trim().toLowerCase();
    const channel = String(values[TLW_colIndex_("channel") - 1] || "").trim().toLowerCase();
    const messageType = String(values[TLW_colIndex_("message_type") - 1] || "").trim().toLowerCase();
    const notes = String(values[TLW_colIndex_("notes") - 1] || "");
    const captureKind = typeof TL_Orchestrator_captureKindFromNotes_ === "function"
      ? TL_Orchestrator_captureKindFromNotes_(notes)
      : "";
    const captureTitle = typeof TL_Orchestrator_captureTitleForKind_ === "function"
      ? TL_Orchestrator_captureTitleForKind_(captureKind, values, notes)
      : (typeof TL_Orchestrator_captureTitleFromNotes_ === "function" ? TL_Orchestrator_captureTitleFromNotes_(notes) : "");
    const dueText = String(values[TLW_colIndex_("task_due") - 1] || "").trim();
    const baseAt = values[0] instanceof Date ? values[0] : new Date();
    const dueLabel = dueText && typeof TL_Capture_buildDueInfo_ === "function"
      ? TL_Capture_buildDueInfo_(dueText, baseAt).label
      : dueText;
    const updates = {
      approval_required: approvalRequired ? "true" : String(values[TLW_colIndex_("approval_required") - 1] || ""),
      approval_status: "approved"
    };

    if (executionStatus !== "sent" && executionStatus !== "executed") {
      updates.execution_status = "approved";
    }
    if (taskStatus === "pending" || taskStatus === "proposal_ready" || taskStatus === "awaiting_approval") {
      updates.task_status = "approved";
    }

    if (channel === "email" && messageType === "email_thread" && typeof TL_Email_inboxValuesToSnapshot_ === "function" && typeof TL_Email_appendInboxVersion_ === "function") {
      const snapshot = TL_Email_inboxValuesToSnapshot_(values, rowNumber);
      const payload = snapshot.payload || {};
      const approval = payload.approvalSnapshot || {};
      const triage = approval.triage || payload.triage || {};
      const suggestedAction = String(triage.suggested_action || values[TLW_colIndex_("suggested_action") - 1] || "").trim().toLowerCase();
      if (suggestedAction === "ignore" || suggestedAction === "wait") {
        const closedAtIso = new Date().toISOString();
        const closedPayload = TL_Email_mergePayload_(payload, {
          approvalStatus: "approved",
          sendStatus: "skipped",
          executedAt: closedAtIso,
          lastAction: "EMAIL_REVIEW_CLOSED",
          lastActionAt: closedAtIso,
          approvalSnapshot: {
            to: String(approval.to || "").trim(),
            subject: String(approval.subject || "").trim(),
            body: String(approval.body || "").trim(),
            cc: String(approval.cc || "").trim(),
            bcc: String(approval.bcc || "").trim(),
            replyTo: String(approval.replyTo || "").trim(),
            threadId: String(approval.threadId || snapshot.threadId || "").trim(),
            latestMsgId: String(approval.latestMsgId || snapshot.chunkId || "").trim(),
            approvalStatus: "approved",
            sendStatus: "skipped",
            summary: String(approval.summary || payload.subject || "").trim(),
            triage: triage,
            historyDepth: Number(approval.historyDepth || 0),
            historyUsed: approval.historyUsed || []
          }
        });
        TL_Email_appendInboxVersion_(rowNumber, {
          approval_required: "false",
          approval_status: "approved",
          execution_status: "closed_no_send",
          task_status: "closed",
          raw_payload_ref: closedPayload,
          notes: TL_Email_appendNote_(notes, "boss_closed_no_send")
        }, "boss_close_no_send");
        return {
          ok: true,
          actionKind: "close_no_send",
          receiptText: TL_Menu_T_("סגרתי את ההודעה ללא שליחת תגובה.")
        };
      }
      const merged = TL_Email_mergePayload_(payload, {
        approvalStatus: "approved",
        approvalSnapshot: {
          to: String(approval.to || "").trim(),
          subject: String(approval.subject || "").trim(),
          body: String(approval.body || "").trim(),
          cc: String(approval.cc || "").trim(),
          bcc: String(approval.bcc || "").trim(),
          replyTo: String(approval.replyTo || "").trim(),
          threadId: String(approval.threadId || snapshot.threadId || "").trim(),
          latestMsgId: String(approval.latestMsgId || snapshot.chunkId || "").trim(),
          approvalStatus: "approved",
          sendStatus: String(payload.sendStatus || approval.sendStatus || "pending").trim() || "pending",
          summary: String(approval.summary || payload.subject || "").trim(),
          triage: approval.triage || {},
          historyDepth: Number(approval.historyDepth || 0),
          historyUsed: approval.historyUsed || []
        }
      });
      TL_Email_appendInboxVersion_(rowNumber, {
        approval_required: "true",
        approval_status: "approved",
        execution_status: "approved",
        raw_payload_ref: merged,
        notes: TL_Email_appendNote_(notes, "boss_approved")
      }, "boss_confirm");
      if (typeof TL_Orchestrator_FinalizeCaptureApproval_ === "function") {
        TL_Orchestrator_FinalizeCaptureApproval_(rowNumber);
      }
      return {
        ok: true,
        actionKind: "approve_email",
        receiptText: TL_Menu_T_("טיוטת האימייל אושרה. היא לא תישלח בלי פעולה מפורשת נוספת.")
      };
    }

    if (typeof TL_Orchestrator_updateRowFields_ === "function") {
      TL_Orchestrator_updateRowFields_(rowNumber, updates, "boss_confirm");
    } else {
      Object.keys(updates).forEach(function(key) {
        sh.getRange(rowNumber, TL_colIndex_(key)).setValue(updates[key]);
      });
      TLW_applyVersionBump_(rowNumber, "boss_confirm");
    }
    if (typeof TL_Orchestrator_FinalizeCaptureApproval_ === "function") {
      const finalized = TL_Orchestrator_FinalizeCaptureApproval_(rowNumber);
      if (finalized && typeof finalized === "object") {
        return finalized;
      }
    }
    if (channel === "whatsapp" && String(captureKind || "").trim().toLowerCase() !== "reminder" &&
        String(captureKind || "").trim().toLowerCase() !== "task" &&
        String(captureKind || "").trim().toLowerCase() !== "journal" &&
        String(captureKind || "").trim().toLowerCase() !== "contact_enrichment" &&
        String(captureKind || "").trim().toLowerCase() !== "schedule") {
      return {
        ok: true,
        kind: captureKind,
        title: captureTitle,
        dueLabel: dueLabel,
        receiptText: TL_Menu_T_("טיוטת ה-WhatsApp אושרה. היא לא תישלח בלי פעולה מפורשת נוספת.")
      };
    }
    if (!approvalRequired && approvalStatus === "approved") {
      return {
        ok: true,
        actionKind: "already_approved",
        receiptText: TL_Menu_T_("הפריט כבר היה מאושר.")
      };
    }
    return {
      ok: true,
      kind: captureKind,
      title: captureTitle,
      dueLabel: dueLabel,
      receiptText: TL_Menu_BuildCaptureApprovalReceipt_(captureKind, captureTitle, dueLabel, String(values[TLW_colIndex_("ai_summary") - 1] || "").trim())
    };
  } catch (e) {
    return {
      ok: false,
      reason: String((e && e.message) || e || "approve_failed")
    };
  }
}

function TL_Menu_ArchiveDecisionRow_(rowNumber) {
  try {
    if (!rowNumber || typeof TL_Orchestrator_updateRowFields_ !== "function") {
      return { ok: false, reason: "missing_row_or_update_fn" };
    }
    const loc = typeof TL_AI_getInboxRow_ === "function" ? TL_AI_getInboxRow_(rowNumber) : null;
    if (!loc || !loc.values) return { ok: false, reason: "row_not_found" };
    const values = loc.values;
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    const captureKind = typeof TL_Orchestrator_captureKindFromNotes_ === "function"
      ? TL_Orchestrator_captureKindFromNotes_(notes)
      : "";
    const captureTitle = typeof TL_Orchestrator_captureTitleForKind_ === "function"
      ? TL_Orchestrator_captureTitleForKind_(captureKind, values, notes)
      : String(TL_Orchestrator_value_(values, "ai_summary") || TL_Orchestrator_value_(values, "text") || "").trim();
    const updates = {
      approval_required: "false",
      approval_status: "archived",
      execution_status: "archived",
      task_status: "archived",
      notes: TL_Capture_appendNote_(values, "boss_archived")
    };
    TL_Orchestrator_updateRowFields_(rowNumber, updates, "boss_archive");
    return {
      ok: true,
      kind: captureKind,
      title: captureTitle,
      receiptText: TL_Menu_T_("הפריט הועבר לארכיון ולא יוצג יותר כפריט פתוח.")
    };
  } catch (e) {
    return {
      ok: false,
      reason: String((e && e.message) || e || "archive_failed"),
      receiptText: TL_Menu_T_("לא הצלחתי להעביר את הפריט לארכיון.")
    };
  }
}

function TL_Menu_ApplyPacketRecipientChoice_(item, candidate) {
  const current = item && typeof item === "object" ? item : {};
  const contact = candidate && typeof candidate === "object" ? candidate : {};
  const captureKind = String(current.captureKind || "").trim().toLowerCase();
  const destination = captureKind === "email"
    ? String(contact.email || contact.preferredDestination || "").trim()
    : String(contact.phone1 || contact.phone2 || contact.preferredDestination || "").trim();
  const recipientName = String(contact.name || "").trim();
  const recipientContactId = String(contact.contactId || "").trim();
  const rowNumber = Number(current.rowNumber || 0);
  const loc = rowNumber ? TL_AI_getInboxRow_(rowNumber) : null;
  const values = loc && loc.values ? loc.values : null;
  const existingNotes = values ? String(values[TL_colIndex_("notes") - 1] || "") : "";
  const existingPayload = values && String(current.channel || "").trim().toLowerCase() === "email"
    ? TL_Email_parseInboxPayload_(String(values[TL_colIndex_("raw_payload_ref") - 1] || ""))
    : {};
  const subject = String(current.subject || "").trim();
  const body = String(current.proposal || "").trim();
  const sender = String(current.sender || "").trim();
  const nextNotes = [
    existingNotes,
    "boss_capture_contact_id=" + recipientContactId,
    "boss_capture_contact_name=" + recipientName.replace(/\n+/g, " ").replace(/[;]+/g, ","),
    "boss_capture_destination=" + destination.replace(/\n+/g, " ").replace(/[;]+/g, ","),
    "boss_capture_resolution_status=resolved"
  ].filter(Boolean).join("\n");

  const updates = {
    receiver: destination,
    contact_id: recipientContactId,
    notes: nextNotes
  };

  if (captureKind === "email") {
    const payload = TL_Email_mergePayload_(existingPayload, {
      subject: subject,
      to: destination,
      ownerEmail: sender,
      senderEmail: sender,
      approvalSnapshot: {
        to: destination,
        subject: subject,
        body: body,
        cc: "",
        bcc: "",
        replyTo: "",
        threadId: String(current.recordId || current.key || "").trim(),
        latestMsgId: String(current.recordId || current.key || "").trim(),
        approvalStatus: "awaiting_approval",
        sendStatus: "pending",
        summary: String(current.summary || body || "").trim(),
        triage: { suggested_action: "reply_now" },
        historyDepth: 0,
        historyUsed: []
      },
      proposal: {
        to: destination,
        subject: subject,
        body: body,
        cc: "",
        bcc: "",
        replyTo: "",
        threadId: String(current.recordId || current.key || "").trim(),
        latestMsgId: String(current.recordId || current.key || "").trim(),
        summary: String(current.summary || body || "").trim(),
        approvalStatus: "awaiting_approval",
        sendStatus: "pending"
      },
      approvalStatus: "awaiting_approval",
      sendStatus: "pending"
    });
    updates.raw_payload_ref = TL_Email_jsonStringify_(payload);
    updates.thread_subject = subject;
    updates.participants_json = TL_Email_jsonStringify_([sender, destination].filter(Boolean));
  }

  if (rowNumber && typeof TL_Orchestrator_updateRowFields_ === "function") {
    TL_Orchestrator_updateRowFields_(rowNumber, updates, "boss_pick_contact");
  }

  return Object.assign({}, current, {
    receiver: destination,
    contactId: recipientContactId,
    recipientName: recipientName,
    recipientDestination: destination,
    recipientCandidates: [TL_Capture_simplifyContactCandidate_(contact, captureKind)],
    resolutionStatus: "resolved"
  });
}

function TL_Menu_SendApprovedEmailNow_(rowNumber) {
  const loc = TL_AI_getInboxRow_(rowNumber);
  if (!loc || !loc.values) return { ok: false, reason: "missing_row" };
  if (typeof TL_Emergency_ApprovalOutboundEnabled_ === "function" && !TL_Emergency_ApprovalOutboundEnabled_()) {
    return { ok: false, blocked: true, reason: "approval_outbound_disabled" };
  }
  const values = loc.values;
  const snapshot = TL_Email_inboxValuesToSnapshot_(values, rowNumber);
  const payload = snapshot.payload || {};
  const approval = payload.approvalSnapshot || {};
  const to = TL_Email_normEmail_(approval.to || payload.to || "");
  const subject = String(approval.subject || payload.subject || "").trim();
  const body = String(approval.body || payload.body || "").trim();
  if (!to || !subject || !body) return { ok: false, reason: "missing_email_fields" };

  try {
    GmailApp.sendEmail(to, subject, body, {
      cc: String(approval.cc || "").trim(),
      bcc: String(approval.bcc || "").trim(),
      replyTo: String(approval.replyTo || "").trim()
    });
  } catch (err) {
    const failedPayload = TL_Email_mergePayload_(payload, {
      sendStatus: "failed",
      lastError: String(err && err.stack ? err.stack : err)
    });
    TL_Email_appendInboxVersion_(rowNumber, {
      execution_status: "send_failed",
      raw_payload_ref: failedPayload,
      notes: TL_Email_appendNote_(TL_Orchestrator_value_(values, "notes"), "email_send_failed")
    }, "email_send_failed");
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }

  const sentAtIso = new Date().toISOString();
  const sentPayload = TL_Email_mergePayload_(payload, {
    sendStatus: "sent",
    sendReceipt: {
      sentAt: sentAtIso,
      transport: "GmailApp.sendEmail",
      to: to,
      subject: subject,
      body: body
    },
    executedAt: sentAtIso,
    lastAction: "EMAIL_SEND",
    lastActionAt: sentAtIso
  });
  TL_Email_appendInboxVersion_(rowNumber, {
    execution_status: "sent",
    raw_payload_ref: sentPayload,
    notes: TL_Email_appendNote_(TL_Orchestrator_value_(values, "notes"), "email_sent")
  }, "email_send");
  if (typeof TL_Contacts_ApplyOutboundWriteback_ === "function") {
    TL_Contacts_ApplyOutboundWriteback_(String(payload.contactId || snapshot.contactId || to).trim(), {
      display_name: String(payload.contactName || "").trim(),
      email: to,
      summary: String(approval.summary || payload.subject || subject).trim(),
      outbound_text: body,
      last_contact_at: sentAtIso
    });
  }
  return { ok: true, to: to, subject: subject };
}

function TL_Menu_SendApprovedWhatsAppNow_(rowNumber) {
  const loc = TL_AI_getInboxRow_(rowNumber);
  if (!loc || !loc.values) return { ok: false, reason: "missing_row" };
  if (typeof TL_Emergency_ApprovalOutboundEnabled_ === "function" && !TL_Emergency_ApprovalOutboundEnabled_()) {
    return { ok: false, blocked: true, reason: "approval_outbound_disabled" };
  }
  const values = loc.values;
  const phoneNumberId = String(TL_Orchestrator_value_(values, "phone_number_id") || "").trim();
  const toWaId = String(TL_Orchestrator_resolveSendTarget_(values) || "").trim();
  const proposal = String(TL_Orchestrator_value_(values, "ai_proposal") || TL_Orchestrator_value_(values, "text") || "").trim();
  if (!phoneNumberId || !toWaId || !proposal) return { ok: false, reason: "missing_whatsapp_fields" };

  const sendResult = TLW_sendText_(phoneNumberId, toWaId, proposal, { rowNumber: rowNumber });
  if (sendResult && sendResult.ok) {
    TL_Orchestrator_updateRowFields_(rowNumber, {
      execution_status: "sent"
    }, "approved_send");
    if (typeof TL_Contacts_ApplyOutboundWriteback_ === "function") {
      TL_Contacts_ApplyOutboundWriteback_(String(TL_Orchestrator_value_(values, "contact_id") || toWaId).trim(), {
        display_name: String(TL_Orchestrator_value_(values, "sender") || TL_Orchestrator_value_(values, "receiver") || "").trim(),
        phone: toWaId,
        summary: String(TL_Orchestrator_value_(values, "ai_summary") || "").trim(),
        outbound_text: proposal,
        last_contact_at: new Date().toISOString()
      });
    }
    return { ok: true, to: toWaId };
  }
  TL_Orchestrator_updateRowFields_(rowNumber, {
    execution_status: "send_failed"
  }, "send_failed");
  return { ok: false, reason: String(sendResult && sendResult.body || "send_failed") };
}

function TL_Menu_ReviseDecisionRow_(rowNumber, revisedText) {
  const cleaned = String(revisedText || "").trim().replace(/\s+/g, " ");
  if (!rowNumber || !cleaned) {
    return {
      summary: cleaned,
      proposal: cleaned
    };
  }
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_INBOX.SHEET);
    if (!sh) {
      return {
        summary: cleaned,
        proposal: cleaned
      };
    }
    const values = sh.getRange(rowNumber, 1, 1, TL_INBOX.HEADERS.length).getValues()[0];
    const channel = String(values[TL_colIndex_("channel") - 1] || "").trim().toLowerCase();
    const messageType = String(values[TL_colIndex_("message_type") - 1] || "").trim().toLowerCase();
    const existingNotes = String(values[TL_colIndex_("notes") - 1] || "");
    const nextNotes = TL_Capture_appendNote_(values, "boss_revision_text=" + cleaned);
    if (channel === "email" && messageType === "email_thread" && typeof TL_Email_inboxValuesToSnapshot_ === "function" && typeof TL_Email_appendInboxVersion_ === "function") {
      const snapshot = TL_Email_inboxValuesToSnapshot_(values, rowNumber);
      const payload = snapshot.payload || {};
      const approval = payload.approvalSnapshot || {};
      const proposal = payload.proposal || {};
      const currentSummary = String(values[TL_colIndex_("ai_summary") - 1] || approval.summary || payload.subject || "").trim();
      const merged = TL_Email_mergePayload_(payload, {
        proposal: {
          to: String(proposal.to || approval.to || snapshot.senderEmail || "").trim(),
          subject: String(proposal.subject || approval.subject || snapshot.title || "").trim(),
          body: cleaned,
          cc: String(proposal.cc || approval.cc || "").trim(),
          bcc: String(proposal.bcc || approval.bcc || "").trim(),
          replyTo: String(proposal.replyTo || approval.replyTo || "").trim(),
          threadId: String(proposal.threadId || approval.threadId || snapshot.threadId || "").trim(),
          latestMsgId: String(proposal.latestMsgId || approval.latestMsgId || snapshot.chunkId || "").trim(),
          summary: currentSummary,
          approvalStatus: "draft",
          sendStatus: "pending"
        },
        approvalStatus: "awaiting_approval",
        sendStatus: "pending",
        approvalSnapshot: {
          to: String(approval.to || proposal.to || snapshot.senderEmail || "").trim(),
          subject: String(approval.subject || proposal.subject || snapshot.title || "").trim(),
          body: cleaned,
          cc: String(approval.cc || proposal.cc || "").trim(),
          bcc: String(approval.bcc || proposal.bcc || "").trim(),
          replyTo: String(approval.replyTo || proposal.replyTo || "").trim(),
          threadId: String(approval.threadId || proposal.threadId || snapshot.threadId || "").trim(),
          latestMsgId: String(approval.latestMsgId || proposal.latestMsgId || snapshot.chunkId || "").trim(),
          approvalStatus: "awaiting_approval",
          sendStatus: "pending",
          summary: currentSummary,
          triage: approval.triage || {},
          historyDepth: Number(approval.historyDepth || 0),
          historyUsed: approval.historyUsed || []
        }
      });
      TL_Email_appendInboxVersion_(rowNumber, {
        ai_summary: currentSummary || cleaned,
        ai_proposal: cleaned,
        approval_required: "true",
        approval_status: "awaiting_approval",
        execution_status: "awaiting_approval",
        raw_payload_ref: merged,
        notes: nextNotes || existingNotes
      }, "boss_revise");
      return {
        summary: currentSummary || cleaned,
        proposal: cleaned
      };
    }
    const updates = {
      text: cleaned,
      ai_summary: cleaned,
      ai_proposal: cleaned,
      approval_required: "true",
      approval_status: "awaiting_approval",
      execution_status: "proposal_ready",
      task_status: "proposal_ready",
      notes: nextNotes || existingNotes
    };
    if (typeof TL_Orchestrator_updateRowFields_ === "function") {
      TL_Orchestrator_updateRowFields_(rowNumber, updates, "boss_revise");
    } else {
      Object.keys(updates).forEach(function(key) {
        sh.getRange(rowNumber, TL_colIndex_(key)).setValue(updates[key]);
      });
      TLW_applyVersionBump_(rowNumber, "boss_revise");
    }
  } catch (e) {
    // Keep the interaction flowing even if the row update fails.
  }
  return {
    summary: cleaned,
    proposal: cleaned
  };
}

function TL_Menu_ApplyDecisionProposalChoice_(rowNumber, chosenText) {
  const cleaned = String(chosenText || "").trim().replace(/\s+/g, " ");
  if (!rowNumber || !cleaned) return { ok: false, reason: "missing_choice" };
  try {
    const loc = typeof TL_AI_getInboxRow_ === "function" ? TL_AI_getInboxRow_(rowNumber) : null;
    if (!loc || !loc.values) return { ok: false, reason: "row_not_found" };
    const values = loc.values;
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const messageType = String(TL_Orchestrator_value_(values, "message_type") || "").trim().toLowerCase();
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    if (channel === "email" && messageType === "email_thread" && typeof TL_Email_inboxValuesToSnapshot_ === "function" && typeof TL_Email_appendInboxVersion_ === "function") {
      const snapshot = TL_Email_inboxValuesToSnapshot_(values, rowNumber);
      const payload = snapshot.payload || {};
      const approval = payload.approvalSnapshot || {};
      const merged = TL_Email_mergePayload_(payload, {
        proposal: Object.assign({}, payload.proposal || {}, { body: cleaned }),
        approvalSnapshot: Object.assign({}, approval, { body: cleaned })
      });
      TL_Email_appendInboxVersion_(rowNumber, {
        ai_proposal: cleaned,
        raw_payload_ref: merged,
        approval_required: "true",
        approval_status: "awaiting_approval",
        execution_status: "awaiting_approval",
        notes: TL_Email_appendNote_(notes, "boss_selected_proposal_option")
      }, "boss_select_proposal_option");
      return { ok: true, proposal: cleaned };
    }
    let nextPayload = String(TL_Orchestrator_value_(values, "raw_payload_ref") || "").trim();
    if (nextPayload) {
      try {
        const parsed = JSON.parse(nextPayload);
        parsed.selected_proposal = cleaned;
        nextPayload = TLW_safeStringify_(parsed, 8000);
      } catch (e) {}
    }
    TL_Orchestrator_updateRowFields_(rowNumber, {
      ai_proposal: cleaned,
      raw_payload_ref: nextPayload,
      approval_required: "true",
      approval_status: "awaiting_approval",
      execution_status: "proposal_ready",
      task_status: "proposal_ready",
      notes: TL_Capture_appendNote_(values, "boss_selected_proposal_option")
    }, "boss_select_proposal_option");
    return { ok: true, proposal: cleaned };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e || "proposal_choice_failed") };
  }
}

function TL_Menu_BuildDecisionPacketReply_(packet) {
  return TL_Menu_HebrewBlock_([
    TL_Menu_BuildDecisionPacketHeader_(packet),
    "1. כן, אשר הכל",
    "2. רק חלק",
    "3. תן לי אחד אחד",
    "4. קבץ לי בצורה חכמה",
    "5. דחה לעכשיו",
    "6. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildDecisionPacketFewReply_(packet) {
  return TL_Menu_HebrewBlock_([
    "אישור חלקי",
    "1. אשר את 3 הראשונים",
    "2. אשר רק דחופים",
    "3. אשר רק את הראשון",
    "4. חזרה לתפריט קודם",
    "5. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildDecisionPacketSmartReply_(packet) {
  const urgentCount = packet.items.filter(function(item) { return item.isUrgent || item.isHigh; }).length;
  const exceptionCount = Math.max(packet.items.length - urgentCount, 0);
  return TL_Menu_HebrewBlock_([
    "חלוקה חכמה",
    "דחופים/חשובים: " + urgentCount,
    "חריגים: " + exceptionCount,
    "1. אשר רק דחופים/חשובים",
    "2. עבור על החריגים אחד אחד",
    "3. חזרה לתפריט קודם",
    "4. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ]);
}

function TL_Menu_BuildDecisionPacketOneByOneReply_(packet) {
  const current = packet.items[packet.cursor || 0];
  if (!current) return "אין עוד פריטים בחבילה.";
  if (String(packet && packet.kind || "").trim().toLowerCase() === "opportunity") {
    return TL_Menu_BuildOpportunityPacketReply_(packet, current, arguments.length > 1 ? arguments[1] : "");
  }
  if (TL_Menu_IsOutboundCommunicationItem_(current)) {
    TL_Menu_SyncOutboundDraftActiveItem_(packet, current);
  } else if (TL_Menu_IsContinuableCaptureItem_(current)) {
    TL_Menu_SyncCaptureItemActiveItem_(packet, current);
  } else {
    const packetWaId = TL_Menu_FindDecisionPacketOwnerWaId_(packet);
    TL_Menu_ClearOutboundDraftActiveItem_(packetWaId);
    TL_Menu_ClearCaptureItemActiveItem_(packetWaId);
  }
  const index = Number(packet.cursor || 0) + 1;
  const total = packet.items.length;
  if (TL_Menu_ItemNeedsRecipientResolution_(current)) {
    return TL_Menu_BuildDecisionPacketRecipientReply_(packet, current, index, total, arguments.length > 1 ? arguments[1] : "");
  }
  const actionSpec = TL_Menu_GetDecisionPacketActionSpec_(current);
  const summary = TL_Menu_Preview_(current.summary || current.proposal || current.taskStatus || "", 220);
  const proposalBody = TL_Menu_BuildDecisionPacketProposalBody_(current, actionSpec);
  const multiReplyOptions = TL_Menu_GetDecisionPacketReplyOptions_(current);
  const rawSnippet = TL_Menu_Preview_(String(current.rawSnippet || "").trim(), 220);
  const senderLabel = String(current.senderLabel || current.sender || "").trim();
  const channelLabel = String(current.channelLabel || current.channel || "").trim();
  const subjectLabel = TL_Menu_Preview_(String(current.subject || "").trim(), 160);
  const duePreview = String(current.duePreview || "").trim();
  const dueLabel = String(current.dueLabel || "").trim();
  const reminderMessage = TL_Menu_Preview_(current.reminderMessage || summary, 220);
  const isReminder = String(current.captureKind || "").trim().toLowerCase() === "reminder";
  const isSchedule = String(current.captureKind || "").trim().toLowerCase() === "schedule";
  const option1Label = String(actionSpec.primaryLabel || TL_Menu_T_("אשר")).trim();
  const option2Label = String(actionSpec.option2Label || TL_Menu_T_("ערוך")).trim();
  const option3Label = String(actionSpec.option3Label || TL_Menu_T_("אחר כך", "Later")).trim();
  const option4Label = String(actionSpec.option4Label || TL_Menu_T_("ארכב")).trim();
  const editOptionNumber = multiReplyOptions.length ? (multiReplyOptions.length + 1) : 2;
  const laterOptionNumber = multiReplyOptions.length ? (multiReplyOptions.length + 2) : 3;
  const archiveOptionNumber = multiReplyOptions.length ? (multiReplyOptions.length + 3) : 4;
  const styleShortcutLine = TL_Menu_IsOutboundCommunicationItem_(current) && !TL_Menu_ItemNeedsRecipientResolution_(current)
    ? TL_Menu_T_("קיצורי ניסוח/פעולה: קצר יותר | יותר אישי | יותר פורמלי | נסח מחדש | אחר כך | בטל", "Shortcuts: shorter | warmer | more formal | rewrite | later | discard")
    : (TL_Menu_IsContinuableCaptureItem_(current)
      ? TL_Menu_T_("קיצורי ניסוח/פעולה: קצר יותר | יותר ברור | נסח מחדש | אחר כך | בטל", "Shortcuts: shorter | clearer | rewrite | later | discard")
      : "")
    ;
  const meta = [];
  if (current.isUrgent) meta.push("דחוף");
  else if (current.isHigh) meta.push("חשוב");
  const label = meta.length ? ("[" + meta.join(" · ") + "]") : "";
  const lines = [
    TL_Menu_T_("סקירת תשובה ") + index + "/" + total,
    label ? label : "",
    senderLabel ? (TL_Menu_T_("מאת: ") + senderLabel) : "",
    channelLabel ? (TL_Menu_T_("ערוץ: ") + channelLabel) : "",
    subjectLabel ? (TL_Menu_T_("נושא: ") + subjectLabel) : "",
    rawSnippet ? (TL_Menu_T_("קטע מההודעה:") + "\n" + rawSnippet) : "",
    "",
    TL_Menu_T_("הבנתי כך:"),
    isReminder ? (TL_Menu_T_("הודעה: ") + reminderMessage) : summary,
    multiReplyOptions.length
      ? (TL_Menu_T_("בחר אחת מהתשובות המוצעות לשליחה:", "Choose one of the suggested replies to send:") + "\n" +
        multiReplyOptions.map(function(value, idx) { return String(idx + 1) + ". " + String(value || "").trim(); }).join("\n"))
      : (proposalBody ? (actionSpec.proposalHeading + "\n" + proposalBody) : ""),
    isReminder && dueLabel ? (TL_Menu_T_("זמן הפעלת תזכורת: ") + dueLabel) : (isSchedule && dueLabel ? (TL_Menu_T_("זמן האירוע: ") + dueLabel) : (duePreview ? (TL_Menu_T_("יעד: ") + duePreview) : "")),
    "",
    multiReplyOptions.length ? (String(editOptionNumber) + ". " + TL_Menu_T_("ערוך", "Edit")) : ("1. " + option1Label),
    multiReplyOptions.length ? (String(laterOptionNumber) + ". " + TL_Menu_T_("אחר כך", "Later")) : (option2Label ? ("2. " + option2Label) : ""),
    multiReplyOptions.length ? (String(archiveOptionNumber) + ". " + TL_Menu_T_("ארכב", "Archive")) : (option3Label ? ("3. " + option3Label) : ""),
    multiReplyOptions.length ? "" : (option4Label ? ("4. " + option4Label) : ""),
    styleShortcutLine ? "" : "",
    styleShortcutLine ? styleShortcutLine : "",
    TL_Menu_T_("שלח את הספרה של בחירתך")
  ];
  if (arguments.length > 1 && arguments[1]) {
    lines.unshift(String(arguments[1]));
  }
  return lines.filter(Boolean).join("\n");
}

function TL_Menu_SyncOutboundDraftActiveItem_(packet, current) {
  if (typeof TL_ActiveItem_Set_ !== "function") return false;
  if (!current || !TL_Menu_IsOutboundCommunicationItem_(current)) return false;
  const activeWaId = TL_Menu_FindDecisionPacketOwnerWaId_(packet);
  if (!activeWaId) return false;
  TL_ActiveItem_Set_(activeWaId, {
    item_id: "OUTBOUND_" + String(current.rowNumber || current.key || "").trim(),
    kind: "outbound_draft",
    status: "active",
    row_number: Number(current.rowNumber || 0),
    capture_kind: String(current.captureKind || current.channel || "").trim().toLowerCase(),
    source_text: String(current.proposal || current.summary || "").trim(),
    contact_query: String(current.recipientQuery || current.recipientName || "").trim(),
    search_queries: Array.isArray(current.searchQueries) ? current.searchQueries.slice(0, 12) : [],
    resolved_contact_id: String(current.contactId || "").trim(),
    resolved_contact_name: String(current.recipientName || "").trim(),
    subject: String(current.subject || "").trim(),
    recipient_destination: String(current.recipientDestination || "").trim(),
    resolution_status: String(current.resolutionStatus || "").trim().toLowerCase()
  });
  return true;
}

function TL_Menu_FindDecisionPacketOwnerWaId_(packet) {
  const target = packet && packet.items && packet.items.length ? packet : null;
  if (!target) return "";
  const props = PropertiesService.getScriptProperties().getProperties();
  const prefix = TL_MENU.PACKET_KEY_PREFIX;
  const rawTarget = JSON.stringify(target);
  const keys = Object.keys(props || {});
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i] || "");
    if (key.indexOf(prefix) !== 0) continue;
    if (String(props[key] || "") !== rawTarget) continue;
    return key.slice(prefix.length);
  }
  return "";
}

function TL_Menu_ClearOutboundDraftActiveItem_(waId) {
  if (!waId || typeof TL_ActiveItem_Get_ !== "function" || typeof TL_ActiveItem_Clear_ !== "function") return false;
  const active = TL_ActiveItem_Get_(waId);
  if (!active || String(active.kind || "").trim().toLowerCase() !== "outbound_draft") return false;
  TL_ActiveItem_Clear_(waId);
  return true;
}

function TL_Menu_SyncCaptureItemActiveItem_(packet, current) {
  if (typeof TL_ActiveItem_Set_ !== "function") return false;
  if (!current || !TL_Menu_IsContinuableCaptureItem_(current)) return false;
  const activeWaId = TL_Menu_FindDecisionPacketOwnerWaId_(packet);
  if (!activeWaId) return false;
  TL_ActiveItem_Set_(activeWaId, {
    item_id: "CAPTURE_" + String(current.rowNumber || current.key || "").trim(),
    kind: "capture_item",
    status: "active",
    row_number: Number(current.rowNumber || 0),
    capture_kind: String(current.captureKind || "").trim().toLowerCase(),
    source_text: String(current.proposal || current.summary || "").trim(),
    task_due: String(current.duePreview || "").trim(),
    due_label: String(current.dueLabel || "").trim()
  });
  return true;
}

function TL_Menu_ClearCaptureItemActiveItem_(waId) {
  if (!waId || typeof TL_ActiveItem_Get_ !== "function" || typeof TL_ActiveItem_Clear_ !== "function") return false;
  const active = TL_ActiveItem_Get_(waId);
  if (!active || String(active.kind || "").trim().toLowerCase() !== "capture_item") return false;
  TL_ActiveItem_Clear_(waId);
  return true;
}

function TL_Menu_BuildDecisionPacketRecipientReply_(packet, current, index, total, preface) {
  const channelLabel = TL_Menu_OutboundChannelLabel_(current);
  const recipientQuery = String(current.recipientQuery || current.recipientName || "").trim() || TL_Menu_T_("ללא שם");
  const resolutionStatus = String(current.resolutionStatus || "").trim().toLowerCase();
  const lines = [
    preface ? String(preface) : "",
    TL_Menu_T_("סקירה אחד-אחד ") + index + "/" + total
  ];

  if (resolutionStatus === "missing") {
    return lines.concat([
      TL_Menu_T_("לא מצאתי איש קשר ברור עבור ") + channelLabel + " " + TL_Menu_T_("ל-") + recipientQuery + ".",
      "1. " + TL_Menu_T_("דלג"),
      "2. " + TL_Menu_T_("עצור"),
      "3. " + TL_Menu_T_("חזרה לתפריט ראשי"),
      TL_Menu_T_("שלח את מספר האפשרות שתבחר")
    ]).filter(Boolean).join("\n");
  }

  const candidates = Array.isArray(current.recipientCandidates) ? current.recipientCandidates : [];
  return lines.concat([
    TL_Menu_T_("לפני שאכין את ה-") + channelLabel + ", " + TL_Menu_T_("את מי התכוונת לומר?"),
    candidates.slice(0, 5).map(function(candidate, idx) {
      return String(idx + 1) + ". " + TL_Menu_DescribeContactCandidate_(candidate);
    }).join("\n"),
    "8. " + TL_Menu_T_("דלג"),
    "9. " + TL_Menu_T_("עצור"),
    TL_Menu_T_("שלח את מספר איש הקשר.")
  ]).filter(Boolean).join("\n");
}

function TL_Menu_BuildDecisionPacketEditReply_(packet) {
  const current = packet.items[packet.cursor || 0];
  if (!current) return TL_Menu_T_("אין כרגע פריט לעריכה.");
  const summary = TL_Menu_Preview_(current.summary || current.proposal || current.taskStatus || "", 220);
  return [
    TL_Menu_T_("עריכת פריט"),
    TL_Menu_T_("הנוסח הנוכחי:"),
    summary,
    "",
    TL_Menu_T_("ניתן לכתוב או לומר עכשיו את הנוסח החדש שתרצה שאציע לאישור."),
    "1. " + TL_Menu_T_("ביטול עריכה"),
    "2. " + TL_Menu_T_("חזרה לתפריט ראשי")
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketHeader_(packet) {
  const total = packet.items.length;
  const urgent = packet.items.filter(function(item) { return item.isUrgent; }).length;
  if (total === 1) {
    return [
      TL_Menu_T_("יש פריט אחד שמחכה לאישור שלך."),
      TL_Menu_T_("אפשר לאשר, לערוך, לשמור לאחר כך או לארכב.")
    ].join("\n");
  }
  return [
    TL_Menu_T_("האם לאשר את הפריטים הבאים?"),
    TL_Menu_T_("סה\"כ פריטים: ") + total,
    TL_Menu_T_("דחופים: ") + urgent
  ].join("\n");
}

function TL_Menu_Preview_(text, limit) {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  const max = Number(limit || 140);
  if (!raw) return "";
  return raw.length > max ? (raw.slice(0, max) + "...") : raw;
}

function TL_Menu_LogNote_(ev, inboxRow, taskStatus) {
  // reuse existing inbox row; enrich fields
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_INBOX.SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  // record_class = instruction, task_status = logged
  sh.getRange(r, TL_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TL_colIndex_("task_status")).setValue(taskStatus || "logged");
  TLW_applyVersionBump_(r, "menu_note");
}

function TL_Menu_LogMeetingRequest_(ev, inboxRow) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_INBOX.SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  sh.getRange(r, TL_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TL_colIndex_("task_status")).setValue("pending");
  TLW_applyVersionBump_(r, "menu_meeting");
  // naive parse: leave task_due blank for now; future: parse date/time
}

function TL_Menu_ReadRecentInboxRows_() {
  return TL_Orchestrator_readRecentRows_(100);
}

function TL_Menu_FilterRecentRows_(predicate, limit) {
  const rows = TL_Menu_ReadRecentInboxRows_();
  const out = [];
  for (let i = rows.length - 1; i >= 0 && out.length < Number(limit || TL_MENU.MAX_PENDING_SUMMARY); i--) {
    if (!predicate || predicate(rows[i])) out.push(rows[i]);
  }
  return out;
}

function TL_Menu_FormatRowSummary_(item) {
  const values = item.values;
  const text = TL_Orchestrator_value_(values, "text") || TL_Orchestrator_value_(values, "ai_summary") || TL_Orchestrator_value_(values, "ai_proposal") || "";
  const preview = TL_Menu_Preview_(text, 100);
  const status = TL_Orchestrator_value_(values, "task_status") || TL_Orchestrator_value_(values, "approval_status") || TL_Orchestrator_value_(values, "execution_status") || "";
  const due = TL_Orchestrator_value_(values, "task_due");
  const rootId = TL_Orchestrator_value_(values, "root_id");
  const prefix = status ? ("[" + status + "] ") : "";
  const duePart = due ? (" | " + TL_Menu_T_("יעד: ") + due) : "";
  return "- " + prefix + preview + duePart + (rootId ? (" (root " + rootId + ")") : "");
}

function TL_Menu_BuildSummaryBlock_(title, rows, emptyText) {
  if (!rows || !rows.length) return TL_Menu_T_(String(emptyText || "אין כרגע פריטים."));
  return [TL_Menu_T_(String(title || ""))].concat(rows.map(TL_Menu_FormatRowSummary_)).join("\n");
}

function TL_Menu_BuildPendingSummary_() {
  if (typeof TL_Session_BuildSurface_ === "function") {
    return TL_Session_BuildSurface_("plate_now");
  }
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const taskStatus = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    const executionStatus = TL_Orchestrator_value_(values, "execution_status").toLowerCase();
    return taskStatus === "captured" || taskStatus === "pending" || taskStatus === "proposal_ready" ||
      approvalStatus === "draft" || approvalStatus === "awaiting_approval" ||
      executionStatus === "proposal_ready" || executionStatus === "approved";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("מה על הצלחת שלי עכשיו", rows, "אין כרגע פריטים בוערים על הצלחת.");
}

function TL_Menu_BuildUrgentSummary_() {
  if (typeof TL_Session_BuildSurface_ === "function") {
    return TL_Session_BuildSurface_("attention");
  }
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    return TL_Orchestrator_value_(values, "urgency_flag").toLowerCase() === "true" ||
      TL_Orchestrator_value_(values, "needs_owner_now").toLowerCase() === "true";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("מה צריך תשומת לב", rows, "אין כרגע פריטים בולטים שצריכים תשומת לב.");
}

function TL_Menu_BuildWaitingOnMeNowSummary_(waId) {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const taskStatus = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    const executionStatus = TL_Orchestrator_value_(values, "execution_status").toLowerCase();
    const urgency = TL_Orchestrator_value_(values, "urgency_flag").toLowerCase() === "true";
    const ownerNow = TL_Orchestrator_value_(values, "needs_owner_now").toLowerCase() === "true";
    return ownerNow ||
      urgency ||
      approvalStatus === "draft" ||
      approvalStatus === "awaiting_approval" ||
      executionStatus === "proposal_ready" ||
      taskStatus === "proposal_ready";
  }, Math.max(5, Math.min(TL_MENU.MAX_PENDING_SUMMARY, 7)));
  const block = TL_Menu_BuildSummaryBlock_("מה מחכה לי עכשיו", rows, "אין כרגע פריטים שמחכים להחלטה שלך עכשיו.");
  return TL_Menu_AttachActiveItemContext_(waId, block);
}

function TL_Menu_AttachActiveItemContext_(waId, summaryText) {
  const text = String(summaryText || "").trim();
  const active = typeof TL_ActiveItem_Get_ === "function" ? TL_ActiveItem_Get_(waId) : null;
  if (!active || !active.item_id) return text;
  const line = TL_Menu_BuildActiveItemContextLine_(active);
  if (!line) return text;
  return [line, "", text].filter(Boolean).join("\n");
}

function TL_Menu_BuildActiveItemContextLine_(active) {
  const item = active && typeof active === "object" ? active : {};
  const kind = String(item.kind || "").trim().toLowerCase();
  const contact = String(item.resolved_contact_name || item.contact_query || "").trim();
  if (kind === "outbound_draft") {
    return contact
      ? (TL_Menu_T_("פתוח כרגע: טיוטה פעילה עבור", "Open now: active draft for") + " " + contact)
      : TL_Menu_T_("פתוח כרגע: טיוטה פעילה.", "Open now: active draft.");
  }
  if (kind === "capture_item") {
    return TL_Menu_T_("פתוח כרגע: פריט פעולה פעיל.", "Open now: active action item.");
  }
  if (kind === "contact_lookup" || kind === "context_lookup" || kind === "similar_replies_lookup") {
    return TL_Menu_T_("פתוחה כרגע גם בדיקה פעילה.", "There is also an active lookup open now.");
  }
  return TL_Menu_T_("פתוח כרגע גם פריט פעיל.", "There is also an active item open now.");
}

function TL_Menu_BuildAwaitingApprovalSummary_(waId) {
  if (typeof TL_Session_BuildSurface_ === "function") {
    const text = TL_Session_BuildSurface_("approvals");
    return TL_Menu_attachApprovalPacketHint_(waId, text, "approvals");
  }
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    return approvalStatus === "draft" || approvalStatus === "awaiting_approval";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_attachApprovalPacketHint_(waId, TL_Menu_BuildSummaryBlock_("ממתין לאישורים", rows, "אין כרגע פריטים שממתינים לאישור."), "approvals");
}

function TL_Menu_BuildSuggestedNextSteps_() {
  return TL_Menu_BuildOpportunitiesSurface_();
}

function TL_Menu_BuildOpportunitiesSurface_() {
  const candidates = TL_Menu_ListOpportunityCandidates_(3);
  if (!candidates.length) {
    return TL_Menu_T_(
      "אין כרגע הזדמנויות בולטות. ברגע שיצטברו יותר זיכרון CRM ופעולות המשך, אדרג כאן על מי כדאי לעבוד עכשיו.",
      "There are no strong opportunities right now. As more CRM memory and next actions accumulate, I will rank who is best to work on here."
    );
  }
  const lines = [
    TL_Menu_T_("הזדמנויות מובילות כרגע", "Top opportunities right now")
  ];
  candidates.forEach(function(candidate, idx) {
    const card = TL_Menu_BuildOpportunityCard_(candidate, idx + 1);
    if (card) lines.push(card);
  });
  return lines.join("\n\n");
}

function TL_Menu_ListOpportunityCandidates_(limit) {
  const contacts = typeof TL_Contacts_readSearchContacts_ === "function"
    ? TL_Contacts_readSearchContacts_()
    : [];
  const maxItems = Math.max(Number(limit || 3), 1);
  const scored = [];
  (contacts || []).forEach(function(contact) {
    const score = TL_Menu_ScoreOpportunity_(contact);
    if (score.score <= 0) return;
    scored.push({
      contact: contact,
      score: score.score,
      reason: score.reason,
      daysSinceContact: score.daysSinceContact,
      scoreFlags: score.flags || []
    });
  });
  scored.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.contact && a.contact.name || "").localeCompare(String(b.contact && b.contact.name || ""));
  });

  return scored.slice(0, maxItems).map(function(item) {
    const contact = item.contact || {};
    const context = TL_Menu_BuildOpportunityContext_(contact);
    const channel = TL_Menu_PickOpportunityChannel_(contact, context);
    const replyLanguage = TL_Menu_DetectOpportunityReplyLanguage_(contact, context);
    const draft = TL_Menu_BuildOpportunityDraft_(contact, context, channel, replyLanguage);
    return {
      contact: contact,
      score: item.score,
      reason: item.reason,
      daysSinceContact: item.daysSinceContact,
      scoreFlags: item.scoreFlags,
      channel: channel,
      replyLanguage: replyLanguage,
      context: context,
      draft: draft
    };
  });
}

function TL_Menu_ScoreOpportunity_(contact, now) {
  const safe = contact && typeof contact === "object" ? contact : {};
  const currentState = String(safe.currentState || "").trim();
  const nextAction = String(safe.nextAction || "").trim();
  const businessSummary = String(safe.businessSummary || "").trim();
  const lastContactAt = TL_Menu_safeDate_(safe.lastContactAt || safe.last_contact_at || "", now || new Date());
  const daysSince = lastContactAt ? Math.floor(Math.max(0, ((now || new Date()).getTime() - lastContactAt.getTime()) / 86400000)) : 999;
  const text = [currentState, nextAction, businessSummary].join(" ").toLowerCase();
  const flags = [];
  let score = 0;

  if (nextAction) {
    score += 45;
    flags.push("has_next_action");
  }
  if (currentState) {
    score += 20;
    flags.push("has_current_state");
  }
  if (businessSummary) {
    score += 10;
    flags.push("has_business_summary");
  }
  if (daysSince >= 3 && daysSince < 999) {
    score += Math.min(30, daysSince * 3);
    flags.push("stale_followup");
  }
  if (daysSince >= 14 && daysSince < 999) {
    score += 15;
    flags.push("very_stale");
  }
  if (/(interested|waiting|quote|pricing|price|proposal|follow up|follow-up|meeting|invoice|contract|installation|deal|opportunity|מעונ|ממתינ|הצעת מחיר|מחיר|פגישה|חוזה|עסקה|מעקב|התקנה)/i.test(text)) {
    score += 25;
    flags.push("commercial_signal");
  }
  if (/(wait|no action|ignore|להמתין|אין פעולה|לא לפעול)/i.test(nextAction)) {
    score -= 20;
    flags.push("wait_signal");
  }
  if (!String(safe.phone1 || safe.email || "").trim()) {
    score -= 15;
    flags.push("missing_channel");
  }

  const reasonBits = [];
  if (nextAction) reasonBits.push(TL_Menu_T_("יש פעולה מומלצת ב-CRM.", "There is a recommended next action in the CRM."));
  if (daysSince < 999) reasonBits.push(TL_Menu_T_("עברו ") + daysSince + TL_Menu_T_(" ימים מאז הקשר האחרון.", " days since the last contact."));
  if (flags.indexOf("commercial_signal") !== -1) {
    reasonBits.push(TL_Menu_T_("יש סימן מסחרי ברור בשדה המצב/הסיכום.", "There is a clear commercial signal in the state/summary."));
  }

  return {
    score: Math.max(0, score),
    daysSinceContact: daysSince,
    flags: flags,
    reason: reasonBits.join(" ")
  };
}

function TL_Menu_BuildOpportunityContext_(contact) {
  const safe = contact && typeof contact === "object" ? contact : {};
  const identity = {
    contactId: String(safe.contactId || safe.crmId || "").trim(),
    phone: String(safe.phone1 || "").trim(),
    email: String(safe.email || "").trim()
  };
  if (typeof TL_DraftContext_build_ !== "function") {
    return { contact: identity, enrichments: [], emails: [], whatsapps: [], incomingSignal: null };
  }
  const built = TL_DraftContext_build_(identity, {
    enrichmentLimit: 3,
    emailLimit: 3,
    whatsAppLimit: 3,
    topicLimit: 0,
    topicExampleLimit: 0
  });
  built.incomingSignal = TL_Menu_FindLatestIncomingLanguageSignal_(identity);
  return built;
}

function TL_Menu_FindLatestIncomingLanguageSignal_(identity) {
  if (typeof TL_Orchestrator_readRecentRows_ !== "function") return null;
  const targetContactId = String(identity && identity.contactId || "").trim();
  const targetPhone = typeof TL_Contacts_normalizePhoneField_ === "function"
    ? TL_Contacts_normalizePhoneField_(identity && identity.phone || "")
    : String(identity && identity.phone || "").trim();
  const targetEmail = typeof TL_Contacts_normalizeEmail_ === "function"
    ? TL_Contacts_normalizeEmail_(identity && identity.email || "")
    : String(identity && identity.email || "").trim().toLowerCase();
  const rows = TL_Orchestrator_readRecentRows_(120);
  for (let i = rows.length - 1; i >= 0; i--) {
    const values = rows[i].values;
    if (String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase() !== "communication") continue;
    if (String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase() !== "incoming") continue;
    const rowContactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const senderPhone = typeof TL_Contacts_normalizePhoneField_ === "function"
      ? TL_Contacts_normalizePhoneField_(TL_Orchestrator_value_(values, "sender") || "")
      : String(TL_Orchestrator_value_(values, "sender") || "").trim();
    const senderEmail = typeof TL_Contacts_normalizeEmail_ === "function"
      ? TL_Contacts_normalizeEmail_(TL_Orchestrator_value_(values, "sender") || "")
      : String(TL_Orchestrator_value_(values, "sender") || "").trim().toLowerCase();
    const hit = (targetContactId && rowContactId === targetContactId) ||
      (channel === "whatsapp" && targetPhone && senderPhone === targetPhone) ||
      (channel === "email" && targetEmail && senderEmail === targetEmail);
    if (!hit) continue;
    const sample = String(
      TL_Orchestrator_value_(values, "text") ||
      TL_Orchestrator_value_(values, "thread_subject") ||
      TL_Orchestrator_value_(values, "ai_summary") ||
      ""
    ).trim();
    const explicitLanguage = String(TL_Orchestrator_value_(values, "capture_language") || "").trim();
    const language = explicitLanguage || (typeof TL_AI_detectMessageLanguage_ === "function"
      ? TL_AI_detectMessageLanguage_(sample, TL_Menu_BossLanguage_())
      : TL_Menu_BossLanguage_());
    return {
      channel: channel,
      language: language,
      sample: sample
    };
  }
  return null;
}

function TL_Menu_PickOpportunityChannel_(contact, context) {
  const signal = context && context.incomingSignal ? String(context.incomingSignal.channel || "").trim().toLowerCase() : "";
  if (signal === "whatsapp" || signal === "email") return signal;
  if (String(contact && contact.phone1 || "").trim()) return "whatsapp";
  if (String(contact && contact.email || "").trim()) return "email";
  return "whatsapp";
}

function TL_Menu_DetectOpportunityReplyLanguage_(contact, context) {
  const signal = context && context.incomingSignal ? context.incomingSignal : null;
  if (signal && signal.language) return String(signal.language || "").trim();
  const sample = signal && signal.sample ? String(signal.sample || "").trim() : "";
  if (sample && typeof TL_AI_resolveReplyLanguage_ === "function") {
    return TL_AI_resolveReplyLanguage_(sample, TL_Menu_BossLanguage_(), String(TLW_getSetting_("REPLY_LANGUAGE_POLICY") || "match_incoming").trim().toLowerCase());
  }
  return TL_Menu_BossLanguage_();
}

function TL_Menu_BuildOpportunityDraft_(contact, context, channel, replyLanguage) {
  const safe = contact && typeof contact === "object" ? contact : {};
  const language = String(replyLanguage || TL_Menu_BossLanguage_()).trim() || TL_Menu_BossLanguage_();
  const name = String(safe.name || safe.displayName || "").trim();
  const topic = TL_Menu_OpportunityTopic_(safe, language);
  if (String(channel || "").trim().toLowerCase() === "email") {
    const subject = TL_Menu_OpportunityEmailSubject_(name, topic, language);
    const body = TL_Menu_OpportunityEmailBody_(name, topic, language);
    return "Subject: " + subject + "\n\n" + body;
  }
  return TL_Menu_OpportunityWhatsAppDraft_(name, topic, language);
}

function TL_Menu_OpportunityTopic_(contact, language) {
  const safe = contact && typeof contact === "object" ? contact : {};
  const source = String(safe.nextAction || safe.currentState || safe.businessSummary || "").trim();
  const compact = source.replace(/\s+/g, " ").trim();
  if (!compact) {
    return TL_Contacts_internalText_("המשך השיחה האחרונה", "your last conversation", language);
  }
  const hasHebrew = /[\u0590-\u05FF]/.test(compact);
  const wantsHebrew = typeof TL_Language_IsHebrew_ === "function"
    ? TL_Language_IsHebrew_(language)
    : /^he/i.test(String(language || ""));
  if (hasHebrew !== wantsHebrew) {
    return TL_Contacts_internalText_("המשך השיחה האחרונה", "your last conversation", language);
  }
  return TL_Contacts_excerpt_(compact, 72);
}

function TL_Menu_OpportunityWhatsAppDraft_(name, topic, language) {
  const safeName = String(name || "").trim();
  if (typeof TL_Language_IsHebrew_ === "function" ? TL_Language_IsHebrew_(language) : /^he/i.test(String(language || ""))) {
    return [
      "היי " + (safeName || ""),
      "רק בודק איתך לגבי " + topic + ".",
      "אם זה עדיין רלוונטי, אפשר לקדם את זה יחד."
    ].join(" ").replace(/\s+/g, " ").trim();
  }
  return [
    "Hi" + (safeName ? " " + safeName : ""),
    "just checking in about " + topic + ".",
    "If it is still relevant, I can help move it forward."
  ].join(" ").replace(/\s+/g, " ").trim();
}

function TL_Menu_OpportunityEmailSubject_(name, topic, language) {
  if (typeof TL_Language_IsHebrew_ === "function" ? TL_Language_IsHebrew_(language) : /^he/i.test(String(language || ""))) {
    return "המשך לגבי " + topic;
  }
  return "Following up about " + topic;
}

function TL_Menu_OpportunityEmailBody_(name, topic, language) {
  const safeName = String(name || "").trim();
  if (typeof TL_Language_IsHebrew_ === "function" ? TL_Language_IsHebrew_(language) : /^he/i.test(String(language || ""))) {
    return [
      "היי " + (safeName || ""),
      "",
      "רק רציתי לבדוק איתך לגבי " + topic + ".",
      "אם זה עדיין רלוונטי, אפשר לקדם את זה יחד.",
      "",
      "תודה"
    ].join("\n").trim();
  }
  return [
    "Hi" + (safeName ? " " + safeName : "") + ",",
    "",
    "Just checking in about " + topic + ".",
    "If it is still relevant, I can help move it forward.",
    "",
    "Thanks"
  ].join("\n").trim();
}

function TL_Menu_BuildOpportunityCard_(candidate, index) {
  const safe = candidate && typeof candidate === "object" ? candidate : {};
  const contact = safe.contact || {};
  const channel = String(safe.channel || "whatsapp").trim().toLowerCase();
  const destination = channel === "email"
    ? String(contact.email || "").trim()
    : String(contact.phone1 || contact.phone2 || "").trim();
  const whyNow = String(safe.reason || "").trim() || TL_Menu_T_("יש כאן סימן שכדאי לפעול עליו עכשיו.", "There is a signal here worth acting on now.");
  const currentState = String(contact.currentState || "").trim();
  const nextAction = String(contact.nextAction || "").trim();
  const contactLabel = String(contact.name || contact.displayName || contact.contactId || "").trim();
  const copyInstruction = TL_Menu_T_(
    "להלן הנוסח עבור " + contactLabel + (destination ? (" | " + destination) : "") + ": העתיקו והדביקו אותו ישירות ושלחו ידנית מהמספר העסקי שלכם.",
    "Below is the reply for " + contactLabel + (destination ? (" | " + destination) : "") + ": copy paste it directly and reply manually from your business number."
  );
  const draftLabel = channel === "email"
    ? TL_Menu_T_("להעתקה ושליחה ידנית באימייל:", "Copy and send manually by email:")
    : TL_Menu_T_("להעתקה ושליחה ידנית ב-WhatsApp העסקי:", "Copy and send manually in business WhatsApp:");
  return [
    String(index || 1) + ". " + contactLabel,
    destination ? (TL_Menu_T_("ערוץ: ") + (channel === "email" ? "Email" : "WhatsApp") + " | " + destination) : (TL_Menu_T_("ערוץ: ") + (channel === "email" ? "Email" : "WhatsApp")),
    TL_Menu_T_("למה עכשיו: ") + whyNow,
    currentState ? (TL_Menu_T_("מצב נוכחי: ") + currentState) : "",
    nextAction ? (TL_Menu_T_("פעולה מומלצת: ") + nextAction) : "",
    copyInstruction,
    draftLabel,
    String(safe.draft || "").trim()
  ].filter(Boolean).join("\n");
}

function TL_Menu_BuildOpportunityPacketItems_(candidates) {
  return (candidates || []).map(function(candidate, idx) {
    const contact = candidate.contact || {};
    const phoneOptions = TL_Contacts_mergeMultiValueLists_([[contact.phone1, contact.phone2], contact.phones]).filter(Boolean);
    const emailOptions = TL_Contacts_mergeMultiValueLists_([[contact.email], contact.emails]).filter(Boolean);
    const currentChannel = String(candidate.channel || "whatsapp").trim().toLowerCase();
    const currentDestination = currentChannel === "email"
      ? String(emailOptions[0] || "").trim()
      : String(phoneOptions[0] || "").trim();
    return {
      key: "opportunity:" + String(contact.contactId || contact.crmId || idx + 1),
      rowNumber: idx + 1,
      recordId: "opportunity_" + String(contact.contactId || contact.crmId || idx + 1),
      rootId: "opportunity_packet",
      recordClass: "opportunity",
      summary: String(candidate.reason || "").trim(),
      proposal: String(candidate.draft || "").trim(),
      rawSnippet: [
        contact.currentState ? (TL_Menu_T_("מצב נוכחי: ") + contact.currentState) : "",
        contact.nextAction ? (TL_Menu_T_("פעולה מומלצת: ") + contact.nextAction) : ""
      ].filter(Boolean).join("\n"),
      sender: "",
      senderLabel: "",
      receiver: "",
      channel: currentChannel,
      channelLabel: currentChannel === "email" ? "Email" : "WhatsApp",
      messageType: "opportunity",
      subject: "",
      suggestedAction: "manual_send",
      recipientQuery: String(contact.name || contact.displayName || "").trim(),
      recipientName: String(contact.name || contact.displayName || "").trim(),
      recipientDestination: currentDestination,
      recipientCandidates: [{
        contactId: String(contact.contactId || "").trim(),
        name: String(contact.name || "").trim(),
        phone1: phoneOptions[0] || "",
        phone2: phoneOptions[1] || "",
        email: emailOptions[0] || "",
        preferredDestination: currentDestination,
        matchScore: Number(candidate.score || 0)
      }],
      resolutionStatus: "resolved",
      searchQueries: [],
      contactId: String(contact.contactId || "").trim(),
      approvalStatus: "manual_send",
      executionStatus: "manual_send",
      taskStatus: "manual_send",
      captureKind: "opportunity",
      captureTitle: String(contact.name || contact.displayName || "").trim(),
      duePreview: "",
      dueLabel: "",
      currentChannel: currentChannel,
      opportunityReason: String(candidate.reason || "").trim(),
      opportunityDraftWhatsApp: TL_Menu_BuildOpportunityDraft_(contact, candidate.context || {}, "whatsapp", candidate.replyLanguage),
      opportunityDraftEmail: TL_Menu_BuildOpportunityDraft_(contact, candidate.context || {}, "email", candidate.replyLanguage),
      opportunityPhoneOptions: phoneOptions,
      opportunityEmailOptions: emailOptions,
      isUrgent: false,
      isHigh: idx === 0
    };
  });
}

function TL_Menu_BuildOpportunityPacketReply_(packet, current, preface) {
  const index = Number(packet.cursor || 0) + 1;
  const total = packet.items.length;
  const contactLabel = String(current.recipientName || current.captureTitle || current.contactId || "").trim();
  const channel = String(current.currentChannel || current.channel || "whatsapp").trim().toLowerCase();
  const draft = channel === "email"
    ? String(current.opportunityDraftEmail || "").trim()
    : String(current.opportunityDraftWhatsApp || "").trim();
  const destination = TL_Menu_OpportunityDestinationForChannel_(current, channel);
  const hasOtherChannel = TL_Menu_OpportunityHasOtherChannel_(current, channel);
  const hasMultipleDetails = TL_Menu_OpportunityHasMultipleDetails_(current, channel);
  const lines = [
    preface ? String(preface) : "",
    TL_Menu_T_("הזדמנות ") + index + "/" + total,
    contactLabel,
    TL_Menu_T_("ערוץ מוצג: ") + (channel === "email" ? "Email" : "WhatsApp") + (destination ? (" | " + destination) : ""),
    TL_Menu_T_("למה עכשיו: ") + String(current.opportunityReason || current.summary || "").trim(),
    String(current.rawSnippet || "").trim(),
    TL_Menu_T_(
      "להלן הנוסח עבור " + contactLabel + (destination ? (" | " + destination) : "") + ": העתיקו והדביקו אותו ישירות ושלחו ידנית מהחשבון העסקי שלכם.",
      "Below is the reply for " + contactLabel + (destination ? (" | " + destination) : "") + ": copy paste it directly and send it manually from your business account."
    ),
    "",
    draft,
    "",
    "1. " + TL_Menu_T_("הבא", "Next"),
    hasOtherChannel ? ("2. " + (channel === "email" ? TL_Menu_T_("גרסת WhatsApp", "WhatsApp version") : TL_Menu_T_("גרסת אימייל", "Email version"))) : "",
    hasMultipleDetails ? ((hasOtherChannel ? "3. " : "2. ") + TL_Menu_T_("פרטי קשר נוספים", "Other contact details")) : "",
    TL_Menu_T_("אפשר גם לכתוב בדיוק: next | email | whatsapp", "You can also write exactly: next | email | whatsapp")
  ];
  return lines.filter(Boolean).join("\n");
}

function TL_Menu_HandleOpportunityPacketReply_(waId, packet, choice, current) {
  const normalized = String(choice || "").trim().toLowerCase();
  if (normalized === "1" || normalized === "next" || normalized === "הבא") {
    packet.cursor = Number(packet.cursor || 0) + 1;
    if (!packet.items[packet.cursor || 0]) {
      TL_Menu_ClearDecisionPacket_(waId);
      return TL_Menu_T_("סיימנו את ההזדמנויות הפתוחות כרגע.", "We finished the open opportunities for now.");
    }
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildOpportunityPacketReply_(packet, packet.items[packet.cursor || 0]);
  }

  if (normalized === "2" || normalized === "email" || normalized === "whatsapp" || normalized === "אימייל" || normalized === "וואטסאפ" || normalized === "ווטסאפ") {
    const switched = TL_Menu_OpportunitySwitchChannel_(current, normalized === "email" || normalized === "אימייל" ? "email" : ((normalized === "whatsapp" || normalized === "וואטסאפ" || normalized === "ווטסאפ") ? "whatsapp" : ""));
    if (switched.changed) {
      packet.items[packet.cursor || 0] = switched.item;
      TL_Menu_SetDecisionPacket_(waId, packet);
      return TL_Menu_BuildOpportunityPacketReply_(packet, switched.item, TL_Menu_T_("החלפתי את הערוץ המוצג.", "I switched the displayed channel."));
    }
    const detailReply = TL_Menu_BuildOpportunityDetailPicker_(current);
    if (detailReply && normalized === "2") return detailReply;
  }

  if (normalized === "3") {
    const detailReply = TL_Menu_BuildOpportunityDetailPicker_(current);
    if (detailReply) return detailReply;
  }

  if (TL_Menu_HandleOpportunityDetailChoice_(packet, normalized)) {
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildOpportunityPacketReply_(packet, packet.items[packet.cursor || 0], TL_Menu_T_("עדכנתי את פרטי הקשר המוצגים.", "I updated the displayed contact details."));
  }

  return TL_Menu_BuildOpportunityPacketReply_(packet, current);
}

function TL_Menu_OpportunitySwitchChannel_(item, explicitChannel) {
  const current = Object.assign({}, item || {});
  const currentChannel = String(current.currentChannel || current.channel || "whatsapp").trim().toLowerCase();
  const phoneOptions = Array.isArray(current.opportunityPhoneOptions) ? current.opportunityPhoneOptions : [];
  const emailOptions = Array.isArray(current.opportunityEmailOptions) ? current.opportunityEmailOptions : [];
  let target = String(explicitChannel || "").trim().toLowerCase();
  if (!target) {
    if (currentChannel === "whatsapp" && emailOptions.length) target = "email";
    else if (currentChannel === "email" && phoneOptions.length) target = "whatsapp";
  }
  if (target !== "email" && target !== "whatsapp") return { changed: false, item: current };
  if (target === "email" && !emailOptions.length) return { changed: false, item: current };
  if (target === "whatsapp" && !phoneOptions.length) return { changed: false, item: current };
  current.currentChannel = target;
  current.channel = target;
  current.channelLabel = target === "email" ? "Email" : "WhatsApp";
  current.recipientDestination = target === "email" ? String(emailOptions[0] || "").trim() : String(phoneOptions[0] || "").trim();
  current.proposal = target === "email" ? String(current.opportunityDraftEmail || "").trim() : String(current.opportunityDraftWhatsApp || "").trim();
  return { changed: target !== currentChannel, item: current };
}

function TL_Menu_OpportunityDestinationForChannel_(item, channel) {
  const target = String(channel || "").trim().toLowerCase();
  if (target === "email") {
    return String(item && (item.recipientDestination || (item.opportunityEmailOptions && item.opportunityEmailOptions[0])) || "").trim();
  }
  return String(item && (item.recipientDestination || (item.opportunityPhoneOptions && item.opportunityPhoneOptions[0])) || "").trim();
}

function TL_Menu_OpportunityHasOtherChannel_(item, currentChannel) {
  const phoneOptions = Array.isArray(item && item.opportunityPhoneOptions) ? item.opportunityPhoneOptions : [];
  const emailOptions = Array.isArray(item && item.opportunityEmailOptions) ? item.opportunityEmailOptions : [];
  if (currentChannel === "email") return phoneOptions.length > 0;
  return emailOptions.length > 0;
}

function TL_Menu_OpportunityHasMultipleDetails_(item, currentChannel) {
  const targetChannel = String(currentChannel || item && item.currentChannel || "").trim().toLowerCase();
  if (targetChannel === "email") {
    return Array.isArray(item && item.opportunityEmailOptions) && item.opportunityEmailOptions.length > 1;
  }
  return Array.isArray(item && item.opportunityPhoneOptions) && item.opportunityPhoneOptions.length > 1;
}

function TL_Menu_BuildOpportunityDetailPicker_(current) {
  const channel = String(current && current.currentChannel || current && current.channel || "whatsapp").trim().toLowerCase();
  const options = channel === "email"
    ? (Array.isArray(current && current.opportunityEmailOptions) ? current.opportunityEmailOptions : [])
    : (Array.isArray(current && current.opportunityPhoneOptions) ? current.opportunityPhoneOptions : []);
  if (options.length <= 1) return "";
  return [
    TL_Menu_T_("בחרו את פרטי הקשר שתרצו להשתמש בהם:", "Choose which contact details to use:"),
    options.map(function(value, idx) { return String(idx + 4) + ". " + String(value || "").trim(); }).join("\n"),
    TL_Menu_T_("שלחו את המספר המתאים.", "Send the matching number.")
  ].filter(Boolean).join("\n");
}

function TL_Menu_HandleOpportunityDetailChoice_(packet, normalizedChoice) {
  const choiceNum = Number(normalizedChoice || 0);
  if (!choiceNum || choiceNum < 4) return false;
  const item = Object.assign({}, packet.items[packet.cursor || 0] || {});
  const channel = String(item.currentChannel || item.channel || "whatsapp").trim().toLowerCase();
  const options = channel === "email"
    ? (Array.isArray(item.opportunityEmailOptions) ? item.opportunityEmailOptions : [])
    : (Array.isArray(item.opportunityPhoneOptions) ? item.opportunityPhoneOptions : []);
  const idx = choiceNum - 4;
  if (idx < 0 || idx >= options.length) return false;
  item.recipientDestination = String(options[idx] || "").trim();
  packet.items[packet.cursor || 0] = item;
  return true;
}

function TL_Menu_safeDate_(value, fallback) {
  const raw = value instanceof Date ? value : new Date(value || "");
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  const fallbackDate = fallback instanceof Date ? fallback : new Date();
  return fallbackDate instanceof Date && !isNaN(fallbackDate.getTime()) ? fallbackDate : new Date();
}

function TL_Menu_BuildDraftRepliesSummary_(waId) {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    const aiProposal = String(TL_Orchestrator_value_(values, "ai_proposal") || "").trim();
    const isDraftClass = typeof TL_Orchestrator_isReplyDraftRecordClass_ === "function"
      ? TL_Orchestrator_isReplyDraftRecordClass_(recordClass)
      : recordClass === "proposal";
    return (isDraftClass || !!aiProposal) &&
      (approvalStatus === "draft" || approvalStatus === "awaiting_approval" || isDraftClass);
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_attachApprovalPacketHint_(waId, TL_Menu_BuildSummaryBlock_("טיוטות לתגובה", rows, "אין כרגע טיוטות תגובה פתוחות."), "drafts");
}

function TL_Menu_BuildPausedItemsSummary_(waId) {
  const paused = typeof TL_ActiveItem_GetPaused_ === "function"
    ? TL_ActiveItem_GetPaused_(waId)
    : [];
  if (!paused.length) {
    return TL_Menu_T_(
      "אין כרגע פריטים מושהים.",
      "There are no paused items right now."
    );
  }
  const lines = [
    TL_Menu_T_("פריטים מושהים", "Paused items")
  ];
  paused.slice(0, 5).forEach(function(item, idx) {
    lines.push(String(idx + 1) + ". " + TL_Menu_BuildPausedItemLabel_(item));
  });
  lines.push("");
  const suggestedIndex = paused.length >= 2 ? 2 : 1;
  lines.push(TL_Menu_T_(
    "כדי לחזור לאחד מהם, שלח: המשך " + suggestedIndex + " או resume " + suggestedIndex,
    "To resume one, send: resume " + suggestedIndex
  ));
  return lines.join("\n");
}

function TL_Menu_BuildPausedItemLabel_(item) {
  const kind = String(item && item.kind || "").trim().toLowerCase();
  const contact = String(item && (item.resolved_contact_name || item.contact_query) || "").trim();
  const topic = String(item && (item.resolved_topic_summary || item.topic_id || item.topic_query) || "").trim();
  const draft = String(item && item.source_text || "").trim();
  if (kind === "outbound_draft") {
    return [contact || TL_Menu_T_("טיוטה", "Draft"), TL_Menu_T_("טיוטת שליחה", "Outbound draft")].filter(Boolean).join(" | ");
  }
  if (kind === "capture_item") {
    const captureKind = String(item && item.capture_kind || "").trim().toLowerCase();
    const due = String(item && (item.due_label || item.task_due) || "").trim();
    return [
      captureKind === "reminder" ? TL_Menu_T_("תזכורת", "Reminder") : TL_Menu_T_("משימה", "Task"),
      draft || contact,
      due
    ].filter(Boolean).join(" | ");
  }
  return [
    contact,
    topic,
    draft
  ].filter(Boolean).join(" | ") || TL_Menu_T_("פריט מושהה", "Paused item");
}

function TL_Menu_attachApprovalPacketHint_(waId, text, mode) {
  const base = String(text || "").trim();
  if (!waId) return base;
  const items = TL_Menu_CollectApprovalPacketItems_(mode);
  if (!items.length) {
    TL_Menu_ClearDecisionPacket_(waId);
    return base;
  }
  TL_Menu_StoreDecisionPacket_(waId, "decision", items);
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (packet) {
    packet.stage = "one_by_one";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
  }
  const livePacket = packet || TL_Menu_GetDecisionPacket_(waId);
  const reviewIntro = items.length === 1
    ? TL_Menu_T_("פותח עכשיו את הפריט היחיד שממתין להחלטה.")
    : (TL_Menu_T_("פותח עכשיו פריט 1 מתוך ") + items.length + ".");
  const digest = TL_Menu_BuildApprovalDigest_(items, mode, base);
  return [
    digest,
    "",
    reviewIntro,
    livePacket ? TL_Menu_BuildDecisionPacketOneByOneReply_(livePacket) : TL_Menu_T_("לא הצלחתי לפתוח את הפריט לסקירה.")
  ].join("\n\n");
}

function TL_Menu_BuildApprovalsHomeMenu_(waId, items) {
  const list = Array.isArray(items) ? items : TL_Menu_CollectApprovalPacketItems_("all");
  const emailCount = TL_Menu_CountApprovalItemsByCategory_(list, "email");
  const whatsappCount = TL_Menu_CountApprovalItemsByCategory_(list, "whatsapp");
  const reminderCount = TL_Menu_CountApprovalItemsByCategory_(list, "reminders");
  const taskCount = TL_Menu_CountApprovalItemsByCategory_(list, "tasks");
  return TL_Menu_HebrewBlock_([
    "✅ אישור טיפול מוצע",
    "",
    "ממתין לאישור:",
    "",
    "1. 📧 אימיילים [" + emailCount + "]",
    "2. 💬 ווטסאפ [" + whatsappCount + "]",
    "3. ⏰ תזכורות [" + reminderCount + "]",
    "4. ✅ משימות [" + taskCount + "]",
    "5. 🔄 הכל אחד-אחד",
    "",
    "שלח את הספרה של הקטגוריה שבה תרצה לטפל קודם"
  ]);
}

function TL_Menu_CountApprovalItemsByCategory_(items, category) {
  return (items || []).filter(function(item) {
    return TL_Menu_MatchesApprovalCategory_(item, category);
  }).length;
}

function TL_Menu_MatchesApprovalCategory_(item, category) {
  const normalized = String(category || "all").trim().toLowerCase();
  const channel = String(item && item.channel || "").trim().toLowerCase();
  const captureKind = String(item && item.captureKind || "").trim().toLowerCase();
  if (normalized === "all" || !normalized) return true;
  if (normalized === "reply") return TL_Menu_IsReplyPacketItem_(item);
  if (normalized === "email") return channel === "email" || captureKind === "email";
  if (normalized === "whatsapp") return channel === "whatsapp" || captureKind === "whatsapp";
  if (normalized === "reminders") return captureKind === "reminder";
  if (normalized === "tasks") return captureKind === "task";
  return true;
}

function TL_Menu_IsReplyPacketItem_(item) {
  const channel = String(item && item.channel || "").trim().toLowerCase();
  const captureKind = String(item && item.captureKind || "").trim().toLowerCase();
  if (channel !== "whatsapp" && channel !== "email") return false;
  if (captureKind === "reminder" || captureKind === "task" || captureKind === "journal" ||
      captureKind === "contact_enrichment" || captureKind === "schedule") {
    return false;
  }
  // Boss-created outbound drafts should stay out of the inbound reply queue.
  if ((channel === "whatsapp" || channel === "email") && captureKind === channel) return false;
  return true;
}

function TL_Menu_ReplyPriorityScore_(item) {
  const safe = item || {};
  return (safe.isUrgent ? 100 : 0) +
    (safe.isHigh ? 50 : 0) +
    (String(safe.contactId || "").trim() ? 10 : 0) +
    (String(safe.channel || "").trim().toLowerCase() === "whatsapp" ? 2 : 0);
}

function TL_Menu_BuildApprovalCategoryIntro_(category, count) {
  const amount = Number(count || 0);
  if (category === "email") return TL_Menu_T_("פותח עכשיו אישורי אימיילים") + " [" + amount + "]";
  if (category === "whatsapp") return TL_Menu_T_("פותח עכשיו אישורי ווטסאפ") + " [" + amount + "]";
  if (category === "reminders") return TL_Menu_T_("פותח עכשיו אישורי תזכורות") + " [" + amount + "]";
  if (category === "tasks") return TL_Menu_T_("פותח עכשיו אישורי משימות") + " [" + amount + "]";
  return TL_Menu_T_("פותח עכשיו את כל הפריטים אחד-אחד") + " [" + amount + "]";
}

function TL_Menu_BuildApprovalCategoryEmptyText_(category) {
  if (category === "email") return TL_Menu_T_("אין כרגע אישורי אימיילים פתוחים.");
  if (category === "whatsapp") return TL_Menu_T_("אין כרגע אישורי ווטסאפ פתוחים.");
  if (category === "reminders") return TL_Menu_T_("אין כרגע אישורי תזכורות פתוחים.");
  if (category === "tasks") return TL_Menu_T_("אין כרגע אישורי משימות פתוחות.");
  return TL_Menu_T_("אין כרגע פריטים פתוחים בקטגוריה הזו.");
}

function TL_Menu_CollectApprovalPacketItems_(mode) {
  const normalizedMode = String(mode || "all").trim().toLowerCase();
  if (typeof TL_Orchestrator_readRecentRows_ !== "function") return [];
  const latest = {};
  const latestWhatsAppThreadRow = {};
  const contactsIndex = typeof TL_Session_getContactsIndex_ === "function" ? TL_Session_getContactsIndex_() : null;
  const topicSummaryMap = TL_Menu_TopicSummaryMap_();
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const rows = TL_Orchestrator_readRecentRows_(160);
  (rows || []).forEach(function(item) {
    if (!item || !item.values) return;
    const values = item.values;
    const key = String(
      TL_Orchestrator_value_(values, "record_id") ||
      TL_Orchestrator_value_(values, "event_id") ||
      ("row_" + item.rowNumber)
    ).trim();
    const current = latest[key];
    const currentVersion = current ? Number(TL_Orchestrator_value_(current.values, "record_version") || 0) : -1;
    const nextVersion = Number(TL_Orchestrator_value_(values, "record_version") || 0);
    if (!current || nextVersion > currentVersion || (nextVersion === currentVersion && Number(item.rowNumber || 0) > Number(current.rowNumber || 0))) {
      latest[key] = item;
    }
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
    if (channel === "whatsapp" && recordClass !== "interface") {
      const threadKey = TL_Menu_WhatsAppThreadKey_(values);
      if (threadKey && (!latestWhatsAppThreadRow[threadKey] || Number(item.rowNumber || 0) > Number(latestWhatsAppThreadRow[threadKey] || 0))) {
        latestWhatsAppThreadRow[threadKey] = Number(item.rowNumber || 0);
      }
    }
  });
  const items = [];
  Object.keys(latest).forEach(function(key) {
    const item = latest[key];
    const values = item.values;
    const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
    const direction = String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase();
    const senderPhone = TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender") || "");
    if (recordClass === "interface") return;
    if (bossPhone && direction === "incoming" && senderPhone === bossPhone) return;
    const approvalStatus = String(TL_Orchestrator_value_(values, "approval_status") || "").toLowerCase();
    if (approvalStatus !== "draft" && approvalStatus !== "awaiting_approval") return;
    if (normalizedMode === "reply" && direction !== "incoming") return;
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").toLowerCase();
    const sender = String(TL_Orchestrator_value_(values, "sender") || "").trim();
    const receiver = String(TL_Orchestrator_value_(values, "receiver") || "").trim();
    const displayPhoneNumber = String(TL_Orchestrator_value_(values, "display_phone_number") || "").trim();
    const messageType = String(TL_Orchestrator_value_(values, "message_type") || "").trim();
    const threadSubject = String(TL_Orchestrator_value_(values, "thread_subject") || "").trim();
    const textValue = String(TL_Orchestrator_value_(values, "text") || "").trim();
    const contactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
    const threadKey = channel === "whatsapp" ? TL_Menu_WhatsAppThreadKey_(values) : "";
    const topicId = String(TL_Orchestrator_value_(values, "topic_id") || "").trim();
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    const payload = channel === "email" && typeof TL_Email_parseInboxPayload_ === "function"
      ? TL_Email_parseInboxPayload_(String(TL_Orchestrator_value_(values, "raw_payload_ref") || ""))
      : {};
    const approval = payload && payload.approvalSnapshot ? payload.approvalSnapshot : {};
    const captureKind = typeof TL_Orchestrator_captureKindFromNotes_ === "function"
      ? TL_Orchestrator_captureKindFromNotes_(notes)
      : "";
    const captureTitle = typeof TL_Orchestrator_captureTitleForKind_ === "function"
      ? TL_Orchestrator_captureTitleForKind_(captureKind, values, notes)
      : (typeof TL_Orchestrator_captureTitleFromNotes_ === "function" ? TL_Orchestrator_captureTitleFromNotes_(notes) : "");
    const dueText = String(TL_Orchestrator_value_(values, "task_due") || "").trim();
    const dueInfo = dueText && typeof TL_Capture_buildDueInfo_ === "function"
      ? TL_Capture_buildDueInfo_(dueText, values[0] instanceof Date ? values[0] : new Date())
      : { preview: dueText, label: dueText };
    const senderProfile = typeof TL_Session_classifyEmailSender_ === "function" && channel === "email"
      ? TL_Session_classifyEmailSender_(sender, contactId, { contactsIndex: contactsIndex })
      : null;
    if (normalizedMode !== "drafts" && senderProfile && !senderProfile.isKnownContact && (senderProfile.kind === "no_reply" || senderProfile.kind === "system")) {
      const priority = String(TL_Orchestrator_value_(values, "priority_level") || "").toLowerCase();
      const importance = String(TL_Orchestrator_value_(values, "importance_level") || "").toLowerCase();
      const suggested = String(TL_Orchestrator_value_(values, "suggested_action") || "").toLowerCase();
      if (priority !== "high" && importance !== "high" && suggested !== "reply_now" && suggested !== "follow_up") return;
    }
    if (normalizedMode === "drafts" && !String(TL_Orchestrator_value_(values, "ai_proposal") || "").trim()) return;
    if (normalizedMode === "reply" &&
        channel === "whatsapp" &&
        recordClass === "grouped_inbound" &&
        threadKey &&
        Number(latestWhatsAppThreadRow[threadKey] || 0) > Number(item.rowNumber || 0)) {
      return;
    }
    const packetItem = {
      key: key,
      rowNumber: item.rowNumber,
      recordId: String(TL_Orchestrator_value_(values, "record_id") || "").trim(),
      rootId: String(TL_Orchestrator_value_(values, "root_id") || "").trim(),
      recordClass: recordClass,
      direction: direction,
      summary: String(TL_Orchestrator_value_(values, "ai_summary") || threadSubject || textValue || "").trim(),
      proposal: String(TL_Orchestrator_value_(values, "ai_proposal") || "").trim(),
      proposalOptions: TL_Menu_ExtractProposalOptions_(channel, values, payload, String(TL_Orchestrator_value_(values, "ai_proposal") || "").trim()),
      sender: sender,
      senderLabel: TL_Menu_BuildPacketSenderLabel_(senderProfile, sender, receiver, contactId, channel, direction, displayPhoneNumber, contactsIndex, notes),
      receiver: receiver,
      channel: channel,
      channelLabel: TL_Menu_BuildPacketChannelLabel_(channel, messageType),
      messageType: messageType,
      subject: threadSubject,
      topicId: topicId,
      topicSummary: String(topicSummaryMap[topicId] || approval.topicSummary || "").trim(),
      rawSnippet: TL_Menu_BuildPacketSnippet_(channel, messageType, textValue),
      suggestedAction: String(TL_Orchestrator_value_(values, "suggested_action") || "").trim(),
      captureKind: captureKind,
      captureTitle: captureTitle,
      contactId: contactId,
      approvalStatus: approvalStatus,
      executionStatus: String(TL_Orchestrator_value_(values, "execution_status") || "").trim(),
      taskStatus: String(TL_Orchestrator_value_(values, "task_status") || "").trim(),
      similarRepliesUsed: Number(approval.similarRepliesUsed || TL_Menu_GetNoteKeyValue_(notes, "similar_replies_used") || 0),
      historyDepth: Number(approval.historyDepth || 0),
      duePreview: String(dueInfo.preview || "").trim(),
      dueLabel: String(dueInfo.label || "").trim(),
      isUrgent: false,
      isHigh: false
    };
    if (normalizedMode === "reply" && channel === "whatsapp" && recordClass === "grouped_inbound") {
      const refreshedPacketItem = TL_Menu_RefreshWhatsAppReplyPacketItem_(packetItem, values, rows, contactsIndex);
      if (!refreshedPacketItem) return;
      packetItem.summary = refreshedPacketItem.summary;
      packetItem.proposal = refreshedPacketItem.proposal;
      packetItem.sender = refreshedPacketItem.sender;
      packetItem.senderLabel = refreshedPacketItem.senderLabel;
      packetItem.rawSnippet = refreshedPacketItem.rawSnippet;
    }
    const classified = typeof TL_BossPolicy_classifyItem_ === "function" ? TL_BossPolicy_classifyItem_(packetItem, {}) : null;
    packetItem.isUrgent = classified ? !!classified.isUrgent : false;
    packetItem.isHigh = classified ? !!classified.isHigh : false;
    packetItem.actionKind = TL_Menu_GetDecisionPacketActionSpec_(packetItem).actionKind;
    if (!TL_Menu_MatchesApprovalCategory_(packetItem, normalizedMode === "drafts" ? "all" : normalizedMode)) return;
    items.push(packetItem);
  });
  items.sort(function(a, b) {
    if (normalizedMode === "reply") {
      const aReplyScore = TL_Menu_ReplyPriorityScore_(a);
      const bReplyScore = TL_Menu_ReplyPriorityScore_(b);
      if (bReplyScore !== aReplyScore) return bReplyScore - aReplyScore;
      return Number(b.rowNumber || 0) - Number(a.rowNumber || 0);
    }
    const aRank = (a.contactId ? 2 : 0) + (a.channel === "email" ? 1 : 0) - (/noreply|no-reply|no_reply|donotreply|postmaster|mailer-daemon/i.test(String(a.sender || "")) ? 2 : 0);
    const bRank = (b.contactId ? 2 : 0) + (b.channel === "email" ? 1 : 0) - (/noreply|no-reply|no_reply|donotreply|postmaster|mailer-daemon/i.test(String(b.sender || "")) ? 2 : 0);
    if (bRank !== aRank) return bRank - aRank;
    return Number(b.rowNumber || 0) - Number(a.rowNumber || 0);
  });
  return items;
}

function TL_Menu_TopicSummaryMap_() {
  const out = {};
  const topics = typeof TL_DraftContext_fetchTopics_ === "function"
    ? TL_DraftContext_fetchTopics_(null, { topicLimit: 80 })
    : [];
  (topics || []).forEach(function(item) {
    const topicId = String(item && (item.topicId || item.topic_id) || "").trim();
    if (!topicId) return;
    out[topicId] = String(item && (item.topicSummary || item.topic_summary) || "").trim();
  });
  return out;
}

function TL_Menu_GetNoteKeyValue_(notes, key) {
  const safeKey = String(key || "").trim().toLowerCase();
  if (!safeKey) return "";
  const parts = String(notes || "").split(/[;\n]/);
  for (let i = 0; i < parts.length; i++) {
    const line = String(parts[i] || "").trim();
    if (!line) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    if (line.slice(0, idx).trim().toLowerCase() === safeKey) {
      return line.slice(idx + 1).trim();
    }
  }
  return "";
}

function TL_Menu_BuildPacketSenderLabel_(senderProfile, sender, receiver, contactId) {
  const channel = arguments.length > 4 ? String(arguments[4] || "").trim().toLowerCase() : "";
  const direction = arguments.length > 5 ? String(arguments[5] || "").trim().toLowerCase() : "";
  const displayPhoneNumber = arguments.length > 6 ? TLW_normalizePhone_(arguments[6] || "") : "";
  const contactsIndex = arguments.length > 7 && arguments[7] ? arguments[7] : null;
  const notes = arguments.length > 8 ? String(arguments[8] || "") : "";
  const contactPhone = TL_Menu_ContactPhoneFromContactId_(contactId);
  const senderPhone = TLW_normalizePhone_(sender || "");
  const receiverPhone = TLW_normalizePhone_(receiver || "");
  if (channel === "whatsapp" && direction === "incoming") {
    const contactRecord = contactsIndex && contactsIndex.byContactId ? contactsIndex.byContactId[String(contactId || "").trim()] : null;
    if (contactRecord && String(contactRecord.display_name || contactRecord.name || "").trim()) {
      return String(contactRecord.display_name || contactRecord.name || "").trim();
    }
    const waContactName = String(TL_Menu_GetNoteKeyValue_(notes, "wa_contact_name") || "").trim();
    if (waContactName) {
      return waContactName;
    }
    if (contactPhone && senderPhone === displayPhoneNumber) return contactPhone;
    if (contactPhone) return contactPhone;
    if (senderPhone && senderPhone !== displayPhoneNumber) return senderPhone;
    if (receiverPhone && receiverPhone !== displayPhoneNumber) return receiverPhone;
  }
  if (senderProfile && senderProfile.displayName) {
    return String(senderProfile.displayName).trim();
  }
  if (contactId && sender) return String(sender).trim();
  if (sender && receiver) return String(sender).trim();
  return String(sender || receiver || "").trim();
}

function TL_Menu_ExtractProposalOptions_(channel, values, payload, fallbackProposal) {
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const approval = safePayload.approvalSnapshot && typeof safePayload.approvalSnapshot === "object"
    ? safePayload.approvalSnapshot
    : {};
  let rawOptions = [];
  if (normalizedChannel === "email") {
    rawOptions = approval.proposalOptions || safePayload.proposalOptions || [];
  } else if (normalizedChannel === "whatsapp") {
    const raw = String(TL_Orchestrator_value_(values, "raw_payload_ref") || "").trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        rawOptions = parsed.proposal_options || parsed.proposalOptions || [];
      } catch (e) {}
    }
  }
  return typeof TL_AI_normalizeProposalOptions_ === "function"
    ? TL_AI_normalizeProposalOptions_(rawOptions, fallbackProposal)
    : (fallbackProposal ? [String(fallbackProposal).trim()] : []);
}

function TL_Menu_GetDecisionPacketReplyOptions_(item) {
  const safe = item && typeof item === "object" ? item : {};
  if (!TL_Menu_IsReplyPacketItem_(safe)) return [];
  const options = Array.isArray(safe.proposalOptions) ? safe.proposalOptions : [];
  return options.map(function(value) { return String(value || "").trim(); }).filter(Boolean).slice(0, 3);
}

function TL_Menu_RefreshWhatsAppReplyPacketItem_(packetItem, values, recentRows, contactsIndex) {
  const safeItem = packetItem && typeof packetItem === "object" ? packetItem : null;
  const safeValues = Array.isArray(values) ? values : [];
  if (!safeItem) return null;
  const threadKey = TL_Menu_WhatsAppThreadKey_(safeValues);
  if (!threadKey) return safeItem;
  const threadRows = TL_Menu_CollectWhatsAppCommunicationRowsForThread_(threadKey, recentRows);
  if (!threadRows.length) return safeItem;
  if (typeof TL_Orchestrator_resolveBurstParticipants_ !== "function" || typeof TL_Orchestrator_buildConversationFocus_ !== "function") {
    return safeItem;
  }
  const participants = TL_Orchestrator_resolveBurstParticipants_(threadRows, safeValues);
  const focus = TL_Orchestrator_buildConversationFocus_(threadRows, participants);
  if (!focus || focus.closureHint || !focus.hasOpenInbound) return null;

  const latestRow = threadRows[threadRows.length - 1];
  const latestDirection = String(TL_Orchestrator_value_(latestRow && latestRow.values || [], "direction") || "").trim().toLowerCase();
  if (latestDirection !== "incoming") return null;

  const safeContactsIndex = contactsIndex && contactsIndex.byContactId ? contactsIndex.byContactId : null;
  const contactRecord = safeContactsIndex ? safeContactsIndex[String(safeItem.contactId || "").trim()] : null;
  const senderLabel = String(
    (contactRecord && (contactRecord.display_name || contactRecord.name)) ||
    participants.contactDisplayName ||
    participants.externalPhone ||
    safeItem.senderLabel ||
    safeItem.sender ||
    ""
  ).trim();
  const senderPhone = String(participants.externalPhone || safeItem.sender || "").trim();
  const rawSnippet = TL_Menu_BuildPacketSnippet_("whatsapp", "grouped_inbound", String(focus.focusText || "").trim());
  return Object.assign({}, safeItem, {
    sender: senderPhone || safeItem.sender,
    senderLabel: senderLabel || safeItem.senderLabel,
    rawSnippet: rawSnippet || safeItem.rawSnippet
  });
}

function TL_Menu_CollectWhatsAppCommunicationRowsForThread_(threadKey, recentRows) {
  const safeThreadKey = String(threadKey || "").trim();
  if (!safeThreadKey) return [];
  return (recentRows || []).filter(function(item) {
    if (!item || !item.values) return false;
    const values = item.values;
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
    if (channel !== "whatsapp") return false;
    if (recordClass !== "communication") return false;
    return TL_Menu_WhatsAppThreadKey_(values) === safeThreadKey;
  }).sort(function(a, b) {
    return Number(a.rowNumber || 0) - Number(b.rowNumber || 0);
  });
}

function TL_Menu_ContactPhoneFromContactId_(contactId) {
  const safe = String(contactId || "").trim();
  if (!safe) return "";
  const match = safe.match(/_(\d{6,})$/);
  return match ? TLW_normalizePhone_(match[1]) : "";
}

function TL_Menu_WhatsAppThreadKey_(values) {
  const contactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
  if (contactId) return "contact:" + contactId;
  const displayPhoneNumber = TLW_normalizePhone_(TL_Orchestrator_value_(values, "display_phone_number") || "");
  const sender = TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender") || "");
  const receiver = TLW_normalizePhone_(TL_Orchestrator_value_(values, "receiver") || "");
  if (sender && sender !== displayPhoneNumber) return "phone:" + sender;
  if (receiver && receiver !== displayPhoneNumber) return "phone:" + receiver;
  return "";
}

function TL_Menu_BuildPacketChannelLabel_(channel, messageType) {
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  const normalizedType = String(messageType || "").trim().toLowerCase();
  if (normalizedChannel === "email") return normalizedType === "email_thread" ? "email" : "email";
  if (normalizedChannel === "whatsapp") return normalizedType ? ("whatsapp / " + normalizedType) : "whatsapp";
  return String(channel || "").trim();
}

function TL_Menu_BuildPacketSnippet_(channel, messageType, textValue) {
  const text = String(textValue || "").trim();
  if (!text) return "";
  if (String(channel || "").toLowerCase() === "email" && String(messageType || "").toLowerCase() === "email_thread") {
    const cleaned = text
      .replace(/^---\s*$/gm, "")
      .replace(/^DATE:.*$/gm, "")
      .replace(/^FROM:.*$/gm, "")
      .replace(/^TO:.*$/gm, "")
      .replace(/^CC:.*$/gm, "")
      .replace(/^BCC:.*$/gm, "")
      .replace(/^SUBJECT:.*$/gm, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
    return cleaned;
  }
  return text;
}

function TL_Menu_BuildApprovalDigest_(items, mode, fallbackText) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  if (!total) return TL_Menu_T_(String(fallbackText || "").trim());
  const emailCount = list.filter(function(item) { return item.channel === "email"; }).length;
  const whatsappCount = list.filter(function(item) { return item.channel === "whatsapp"; }).length;
  const urgentCount = list.filter(function(item) { return !!item.isUrgent || !!item.isHigh; }).length;
  const sendableCount = list.filter(function(item) { return item.actionKind !== "close_no_send"; }).length;
  const closableCount = list.filter(function(item) { return item.actionKind === "close_no_send"; }).length;
  const title = mode === "drafts" ? TL_Menu_T_("טיוטות לבדיקה") : TL_Menu_T_("ממתין להחלטתך");
  return [
    title,
    TL_Menu_T_("פתוחים עכשיו: ") + total,
    TL_Menu_T_("דורשים החלטה: ") + total + (urgentCount ? (" | " + TL_Menu_T_("דחוף/חשוב: ") + urgentCount) : ""),
    sendableCount ? (TL_Menu_T_("מוכנים לשליחה/ביצוע: ") + sendableCount) : "",
    closableCount ? (TL_Menu_T_("מוכנים לסגירה: ") + closableCount) : "",
    TL_Menu_T_("ערוצים: ") + "email " + emailCount + (whatsappCount ? (" | whatsapp " + whatsappCount) : "")
  ].filter(Boolean).join("\n");
}

function TL_Menu_GetDecisionPacketActionSpec_(item) {
  const channel = String(item && item.channel || "").trim().toLowerCase();
  const captureKind = String(item && item.captureKind || "").trim().toLowerCase();
  const suggested = String(item && item.suggestedAction || "").trim().toLowerCase();
  if (captureKind === "whatsapp") {
    return {
      actionKind: "send_whatsapp",
      primaryLabel: TL_Menu_T_("אשר את טיוטת ה-WhatsApp"),
      editLabel: TL_Menu_T_("ערוך את ההודעה"),
      proposalHeading: TL_Menu_T_("תשובה מוצעת:")
    };
  }
  if (captureKind === "email") {
    return {
      actionKind: "send_email",
      primaryLabel: TL_Menu_T_("אשר את טיוטת האימייל"),
      editLabel: TL_Menu_T_("ערוך את האימייל"),
      proposalHeading: TL_Menu_T_("תשובה מוצעת:")
    };
  }
  if (captureKind === "schedule") {
    return {
      actionKind: "approve_schedule",
      primaryLabel: TL_Menu_T_("אשר את האירוע"),
      editLabel: TL_Menu_T_("ערוך את פרטי האירוע"),
      proposalHeading: TL_Menu_T_("פרטי האירוע לאישור:")
    };
  }
  if (captureKind === "reminder") {
    return {
      actionKind: "approve_reminder",
      primaryLabel: TL_Menu_T_("אשר את התזכורת"),
      editLabel: TL_Menu_T_("ערוך את התזכורת"),
      proposalHeading: TL_Menu_T_("פרטי התזכורת לאישור:")
    };
  }
  if (captureKind === "task") {
    return {
      actionKind: "approve_task",
      primaryLabel: TL_Menu_T_("אשר את המשימה"),
      editLabel: TL_Menu_T_("ערוך את המשימה"),
      proposalHeading: TL_Menu_T_("פרטי המשימה לאישור:")
    };
  }
  if (captureKind === "journal") {
    return {
      actionKind: "save_journal",
      primaryLabel: TL_Menu_T_("שמור את הרישום"),
      editLabel: TL_Menu_T_("ערוך את הרישום"),
      proposalHeading: TL_Menu_T_("הרישום המוצע:")
    };
  }
  if (captureKind === "contact_enrichment") {
    return {
      actionKind: "save_contact_enrichment",
      primaryLabel: TL_Menu_T_("שמור את הערת הקשר"),
      editLabel: TL_Menu_T_("ערוך את הערת הקשר"),
      proposalHeading: TL_Menu_T_("הערת הקשר לאישור:")
    };
  }
  if (channel === "email") {
    if (suggested === "ignore" || suggested === "wait") {
      return {
        actionKind: "close_no_send",
        primaryLabel: TL_Menu_T_("סגור בלי לשלוח"),
        editLabel: TL_Menu_T_("ערוך את ההחלטה/הנוסח"),
        proposalHeading: TL_Menu_T_("הפעולה המוצעת:")
      };
    }
    return {
      actionKind: "send_email",
      primaryLabel: TL_Menu_T_("אשר את הטיוטה"),
      editLabel: TL_Menu_T_("ערוך את הטיוטה"),
      proposalHeading: TL_Menu_T_("תשובה מוצעת:")
    };
  }
  return {
    actionKind: "generic_approve",
    primaryLabel: TL_Menu_T_("אשר את הפעולה"),
    editLabel: TL_Menu_T_("ערוך את הפעולה"),
    proposalHeading: TL_Menu_T_("הפעולה המוצעת:")
  };
}

function TL_Menu_BuildDecisionPacketProposalBody_(item, actionSpec) {
  const captureKind = String(item && item.captureKind || "").trim().toLowerCase();
  const proposal = String(item && item.proposal || "").trim();
  const captureTitle = String(item && item.captureTitle || "").trim();
  const recipientLabel = TL_Menu_OutboundDestinationLabel_(item);
  const subject = String(item && item.subject || "").trim();
  if (captureKind === "whatsapp") {
    return [
      TL_Menu_T_("טיוטת WhatsApp אל") + " " + recipientLabel + ': "' + proposal + '"',
      TL_Menu_BuildDraftWhyBlock_(item)
    ].filter(Boolean).join("\n");
  }
  if (captureKind === "email") {
    return [
      TL_Menu_T_("טיוטת אימייל אל") + " " + recipientLabel + ': "' + proposal + '"',
      subject ? (TL_Menu_T_("נושא:") + " " + subject) : "",
      TL_Menu_BuildDraftWhyBlock_(item)
    ].filter(Boolean).join("\n");
  }
  if (captureKind === "schedule") {
    return captureTitle || proposal;
  }
  if ((captureKind === "task" || captureKind === "journal" || captureKind === "contact_enrichment") && captureTitle) {
    return captureTitle || proposal;
  }
  if (proposal) return proposal;
  if (actionSpec && actionSpec.actionKind === "close_no_send") {
    return TL_Menu_T_("הפריט ייסגר ללא שליחת תגובה.");
  }
  return "";
}

function TL_Menu_BuildDraftWhyBlock_(item) {
  const safe = item && typeof item === "object" ? item : {};
  const lines = [];
  const topic = String(safe.topicSummary || safe.topicId || "").trim();
  const historyDepth = Number(safe.historyDepth || 0);
  const similarRepliesUsed = Number(safe.similarRepliesUsed || 0);
  if (topic) lines.push(TL_Menu_T_("נושא: ") + topic);
  if (historyDepth > 0) lines.push(TL_Menu_T_("היסטוריה שנבדקה: ") + historyDepth);
  if (similarRepliesUsed > 0) lines.push(TL_Menu_T_("תשובות דומות שנלקחו בחשבון: ") + similarRepliesUsed);
  if (!lines.length) return "";
  return [
    TL_Menu_T_("למה הטיוטה נראית כך:"),
    lines.join("\n")
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketReceipt_(item, approval) {
  const result = approval && typeof approval === "object" ? approval : { ok: !!approval };
  if (result.receiptText) return String(result.receiptText).trim();
  if (result.ok === false) {
    return TL_Menu_T_("לא הצלחתי להשלים את הפעולה.");
  }
  const captureKind = String(result.kind || item && item.captureKind || "").trim().toLowerCase();
  const captureTitle = String(result.title || item && item.captureTitle || item && item.proposal || item && item.summary || "").trim();
  const dueLabel = String(result.dueLabel || item && item.dueLabel || "").trim();
  return TL_Menu_BuildCaptureApprovalReceipt_(captureKind, captureTitle, dueLabel, String(item && item.summary || "").trim());
}

function TL_Menu_BuildCaptureApprovalReceipt_(kind, title, dueLabel, summary) {
  const safeKind = String(kind || "").trim().toLowerCase();
  const safeTitle = String(title || summary || TL_Menu_T_("ללא תיאור")).trim();
  if (safeKind === "whatsapp") {
    return TL_Menu_T_("טיוטת ה-WhatsApp \"") + safeTitle + TL_Menu_T_("\" אושרה.");
  }
  if (safeKind === "email") {
    return TL_Menu_T_("טיוטת האימייל \"") + safeTitle + TL_Menu_T_("\" אושרה.");
  }
  if (safeKind === "schedule") {
    return TL_Menu_T_("האירוע \"") + safeTitle + TL_Menu_T_("\" נקבע") + (dueLabel ? (TL_Menu_T_(" ל-") + dueLabel) : "") + ".";
  }
  if (safeKind === "reminder") {
    return TL_Menu_T_("התזכורת \"") + safeTitle + TL_Menu_T_("\" נקבעה") + (dueLabel ? (TL_Menu_T_(" ל-") + dueLabel) : "") + ".";
  }
  if (safeKind === "task") {
    return TL_Menu_T_("המשימה \"") + safeTitle + TL_Menu_T_("\" נפתחה") + (dueLabel ? (TL_Menu_T_(" עם יעד ") + dueLabel) : "") + ".";
  }
  if (safeKind === "journal") {
    return TL_Menu_T_("הרישום \"") + safeTitle + TL_Menu_T_("\" נשמר.");
  }
  if (safeKind === "contact_enrichment") {
    return TL_Menu_T_("הערת הקשר \"") + safeTitle + TL_Menu_T_("\" נשמרה.");
  }
  return TL_Menu_T_("אישרתי את הפעולה.");
}

function TL_Menu_BuildWaitingOnOthersSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    return TL_Orchestrator_value_(values, "suggested_action").toLowerCase() === "wait";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("ממתין לאחרים", rows, "אין כרגע פריטים שממתינים לאחרים.");
}

function TL_Menu_BuildFollowupsSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const action = TL_Orchestrator_value_(values, "suggested_action").toLowerCase();
    const status = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    return action === "follow_up" || status === "follow_up";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("מעקבים", rows, "אין כרגע מעקבים פתוחים.");
}

function TL_Menu_BuildOpenTasksSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const status = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    return status === "pending" || status === "approved" || status === "captured";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("משימות פתוחות", rows, "אין כרגע משימות פתוחות.");
}

function TL_Menu_BuildRemindersSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const taskStatus = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    const executionStatus = TL_Orchestrator_value_(values, "execution_status").toLowerCase();
    const notes = TL_Orchestrator_value_(values, "notes").toLowerCase();
    return notes.indexOf("boss_capture_kind=reminder") !== -1 ||
      notes.indexOf("menu_route=reminder_") !== -1 ||
      taskStatus === "reminder_pending" ||
      taskStatus === "reminder_approved" ||
      approvalStatus === "awaiting_approval" && notes.indexOf("boss_capture_kind=reminder") !== -1 ||
      executionStatus === "reminder_pending" ||
      executionStatus === "awaiting_approval" && notes.indexOf("boss_capture_kind=reminder") !== -1;
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("רשימת תזכורות", rows, "אין כרגע תזכורות פתוחות.");
}

function TL_Menu_BuildBlockedTasksSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const status = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    const notes = TL_Orchestrator_value_(values, "notes").toLowerCase();
    return status === "blocked" || notes.indexOf("depends_on") !== -1 || notes.indexOf("dependency") !== -1;
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("משימות חסומות", rows, "אין כרגע משימות חסומות.");
}
