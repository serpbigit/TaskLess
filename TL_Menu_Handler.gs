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
  TRIGGERS: ["תפריט","menu","/menu","עזרה","help","מה אפשר לעשות","מה את יכולה לעשות","מה אתה יכול לעשות","what can i do","what can you do","what can i say"],
  HELP_TRIGGERS: ["עזרה","help","מה אפשר לעשות","what can i do","what can i say"],
  CAPABILITY_TRIGGERS: ["מה את יכולה לעשות","מה אתה יכול לעשות","מה אפשר לעשות","what can you do","what can i do"],
  RESUME_TRIGGERS: ["continue","resume","continue previous","resume previous","continue previous lookup","back to previous","המשך","להמשיך","תמשיכי","תמשיך","חזרי לקודם","חזור לקודם","חזרי לבדיקה הקודמת","חזור לבדיקה הקודמת"],
  PAUSED_ITEMS_TRIGGERS: ["show paused items","show paused work","what did we leave open","show parked items","show paused","פריטים מושהים","מה הושהה","מה השארנו פתוח","מה פתוח בהשהיה","הראה פריטים מושהים"],
  COST_TRIGGERS: ["עלות","cost","ai cost","עלות ai","עלות ה-ai","עלות של ai"],
  EXIT_TRIGGERS: ["יציאה","איפוס","בטל","cancel","exit","reset","stop"],
  STATE_KEY_PREFIX: "MENU_STATE_", // + wa_id
  PACKET_KEY_PREFIX: "MENU_PACKET_", // + wa_id
  MAX_PENDING_SUMMARY: 5
};

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

function TL_Menu_BossLanguage_() {
  return TL_Language_BossUiLanguage_();
}

function TL_Menu_IsEnglishUi_() {
  return !TL_Language_IsHebrew_(TL_Menu_BossLanguage_());
}

function TL_Menu_T_(hebrewText, englishText) {
  return TL_Language_UiText_(String(hebrewText || englishText || ""), TL_Menu_BossLanguage_());
}

function TL_Menu_HebrewBlock_(lines) {
  return TL_Menu_T_((lines || []).filter(function(line) {
    return line !== null && line !== undefined && line !== "";
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
  if (!text) return TL_Menu_BuildMenuReply_();

  if (TL_Menu_IsExitCommand_(rawText)) {
    TL_Menu_ResetSession_(bossWaId);
    return TL_Menu_T_(
      "איפסתי את הזרימה הנוכחית. חזרנו למצב נקי. אם תרצה, כתוב \"תפריט\" כדי להתחיל מחדש.",
      "I reset the current flow. We are back to a clean state. If you want, type \"menu\" to start again."
    );
  }

  const existingPacket = TL_Menu_GetDecisionPacket_(bossWaId);
  const shouldTreatAsPacketReply = !!existingPacket && (
    TL_Menu_IsNumericChoice_(text) ||
    existingPacket.stage === "edit" ||
    !text
  );
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

  // Check triggers
  if (TL_MENU.TRIGGERS.some(t => text === t)) {
    const targetState = TL_MENU.CAPABILITY_TRIGGERS.some(t => text === t)
      ? TL_MENU_STATES.CAPABILITIES
      : (TL_MENU.HELP_TRIGGERS.some(t => text === t) ? TL_MENU_STATES.HELP : TL_MENU_STATES.ROOT);
    TL_Menu_SetState_(bossWaId, targetState);
    return TL_Menu_BuildMenuForState_(targetState);
  }

  const state = TL_Menu_GetState_(bossWaId);

  if (state === TL_MENU_STATES.CAPTURE_BRAIN_DUMP && (text === "דוגמה" || text === "example")) {
    return TL_Menu_BuildBrainDumpExampleReply_();
  }

  if (TL_Menu_IsNumericChoice_(text)) {
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
        : TL_Menu_T_("לא הצלחתי להכין כרגע הצעת העשרה לאיש קשר. נסה לכתוב שם ברור וההערה שחשוב לשמור.");
    }
    TL_Menu_AnnotateBossCapture_(inboxRow, state);
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    const immediateCapture = TL_Menu_RunImmediateCapture_(inboxRow);
    if (immediateCapture && immediateCapture.sent) return "";
    return [
      TL_Menu_T_("קיבלתי."),
      TL_Menu_T_("אבנה מזה הצעת פעולה מסודרת לאישור שלך לפני ביצוע."),
      TL_Menu_T_("אם צריך, אחזור אליך עם כרטיס אישור או שאלת הבהרה.")
    ].join("\n");
  }

  const resumed = TL_Menu_TryResumePausedItem_(bossWaId, rawText, options);
  if (resumed) return resumed;

  const intent = TL_Menu_PopCachedIntent_(bossWaId, rawText) || TL_Menu_RecognizeBossIntent_(rawText, options);
  const continued = TL_Menu_TryContinueActiveItem_(bossWaId, rawText, intent, options);
  if (continued) return continued;
  TL_Menu_PauseActiveItemForNewIntent_(bossWaId, intent);
  const routed = TL_Menu_HandleBossIntent_(ev, inboxRow, intent, options);
  if (routed) return routed;

  // Unknown free-form text falls through without a forced menu reply.
  TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
  return null;
}

function TL_Menu_BuildMenuReply_() {
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "").trim();
  return TL_Menu_HebrewBlock_([
    bossName ? ("שלום " + bossName + ",") : "שלום,",
    "אפשר לכתוב חופשי מה שצריך, או לבחור אפשרות:",
    "",
    "1. 🧠 העברת כל המשימות לעוזר האישי",
    "2. ✅ אישור טיפול מוצע",
    "3. ☰ כל היכולות של העוזר האישי",
    "",
    "שלח את הספרה של בחירתך"
  ]);
}

function TL_Menu_SetState_(waId, state) {
  PropertiesService.getScriptProperties().setProperty(TL_MENU.STATE_KEY_PREFIX + waId, state);
}

function TL_Menu_GetState_(waId) {
  const value = String(PropertiesService.getScriptProperties().getProperty(TL_MENU.STATE_KEY_PREFIX + waId) || TL_MENU_STATES.ROOT);
  return value === "idle" ? TL_MENU_STATES.ROOT : value;
}

function TL_Menu_ClearState_(waId) {
  try {
    PropertiesService.getScriptProperties().deleteProperty(TL_MENU.STATE_KEY_PREFIX + String(waId || "").trim());
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

function TL_Menu_IsNumericChoice_(text) {
  return !!TL_Menu_ParseChoice_(text);
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
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_BRAIN_DUMP, TL_Menu_BuildBrainDumpPrompt_());
  if (choice === "2") return TL_Menu_OpenApprovalsHome_(waId);
  if (choice === "3") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.CAPABILITIES);
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_OpenApprovalsHome_(waId) {
  const items = TL_Menu_CollectApprovalPacketItems_("all");
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

  const items = TL_Menu_CollectApprovalPacketItems_(category);
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
  if (choice === "5") return TL_Menu_BuildDraftRepliesSummary_(waId);
  if (choice === "6") return TL_Menu_BuildWaitingOnOthersSummary_();
  if (choice === "7") return TL_Menu_BuildFollowupsSummary_();
  if (choice === "8") return TL_Menu_BuildOpenTasksSummary_();
  if (choice === "9") return TL_Menu_BuildBlockedTasksSummary_();
  if (choice === "10") return TL_Menu_BuildTopicCandidatesSummary_(waId);
  if (choice === "11") return TL_Menu_BuildPausedItemsSummary_(waId);
  if (choice === "12") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "13") return TL_Menu_BuildMenuReply_();
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
  if (choice === "7") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "8") return TL_Menu_BuildMenuReply_();
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
  if (choice === "1") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.TASK_NEW);
  if (choice === "2") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.REMINDERS);
  if (choice === "3") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SCHEDULE);
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_(
    TL_Menu_T_("אימיילים", "Emails"),
    TL_Menu_T_("מסלול אימיילים ייעודי יתווסף בהמשך. כרגע אישורי אימיילים מגיעים דרך אישור טיפול מוצע.", "A dedicated email lane will be added later. Right now email approvals arrive through suggested-treatment approval.")
  );
  if (choice === "5") return TL_Menu_BuildPlaceholderReply_(
    TL_Menu_T_("הודעות ווטסאפ", "WhatsApp messages"),
    TL_Menu_T_("מסלול ווטסאפ ייעודי יתווסף בהמשך. כרגע הודעות ותגובות מגיעות דרך אישור טיפול מוצע.", "A dedicated WhatsApp lane will be added later. Right now messages and replies arrive through suggested-treatment approval.")
  );
  if (choice === "6") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, TL_Menu_T_(
    "ניתן לכתוב או לומר למי להוסיף מידע ומה חשוב לזכור עליו. לדוגמה: \"להוסיף לדוד שהבן שלו מתחתן בשבוע הבא\".",
    "You can write or say who to enrich and what matters to remember. Example: \"Add for David that his son gets married next week.\""
  ));
  if (choice === "7") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.LOG);
  if (choice === "8") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_HABITS, TL_Menu_T_(
    "ניתן לכתוב או לומר את אימון הספורט שתרצה לרשום. לדוגמה: \"10 דקות הליכה מהירה\".",
    "You can write or say the sport session you want to log. Example: \"10 minutes of brisk walking.\""
  ));
  if (choice === "9") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_HEALTH, TL_Menu_T_(
    "ניתן לכתוב או לומר את פרטי התרופה או המעקב שתרצה לרשום. לדוגמה: \"לקחתי אנטיביוטיקה ב-22:00\".",
    "You can write or say the medication or tracking details you want to log. Example: \"I took antibiotics at 22:00.\""
  ));
  if (choice === "10") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS);
  if (choice === "11") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.HELP);
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
    "5. טיוטות לתגובה",
    "6. ממתין לאחרים",
    "7. מעקבים",
    "8. משימות פתוחות",
    "9. משימות חסומות",
    "10. מועמדי נושא לקידום",
    "11. פריטים מושהים",
    "12. חזרה לתפריט קודם",
    "13. חזרה לתפריט ראשי",
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
  return TL_Menu_HebrewBlock_([
    "עזרה / מה אפשר להגיד",
    "1. תזכירי לי מחר ב-08:00 לקחת תרופה",
    "2. תפתחי לי משימה להתקשר ליעקב",
    "3. תרשמי ביומן שלקחתי כדור ב-22:00",
    "4. תקבעי לי פגישה עם רותי ביום חמישי",
    "5. מה על הצלחת שלי עכשיו?",
    "6. מה דחוף כרגע?",
    "",
    "כדי לראות מה אני יכולה לעשות: כתוב \"מה את יכולה לעשות\"",
    "7. חזרה לתפריט קודם",
    "8. חזרה לתפריט ראשי",
    "0. יציאה / איפוס",
    "שלח את מספר האפשרות שתבחר"
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
  const summary = typeof TL_Capabilities_BuildBossFacingSummary_ === "function"
    ? TL_Capabilities_BuildBossFacingSummary_()
    : "";
  return TL_Menu_HebrewBlock_([
    "☰ מה אני יכולה לעשות עבורך",
    summary || "אפשר לבקש ממני משימות, תזכורות, תיאום, טיוטות, סקירת עבודה ושמירת מידע חשוב.",
    "",
    "מסלולים ישירים:",
    "1. ✅ ניהול משימות",
    "2. ⏰ תזכורות",
    "3. 📅 יומן ותיאום",
    "4. 📧 אימיילים",
    "5. 💬 הודעות ווטסאפ",
    "6. 👤 זיכרון על אנשי קשר",
    "7. 📝 רישום ומעקב",
    "8. 🏃 אימוני ספורט",
    "9. 💊 יומן תרופות",
    "10. ⚙️ הגדרות",
    "11. ❓ עזרה ודוגמאות",
    "",
    "או פשוט כתוב חופשי מה שצריך."
  ]);
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
      "מצטערת, כאן אני מטפלת רק בניהול, תזכורות, משימות, יומן, הודעות עבודה והחלטות לאישור.",
      "Sorry, here I only handle management, reminders, tasks, calendar, work messages, and approval decisions."
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
      if (candidates.length) {
        return {
          sent: false,
          reply: [
            TL_Menu_T_("מצאתי כמה אנשי קשר אפשריים, אבל אני צריכה שתדייק לפני שאשמור:"),
            candidates.slice(0, 5).map(function(item, idx) {
              return String(idx + 1) + ". " + TL_Menu_DescribeContactCandidate_(item);
            }).join("\n"),
            TL_Menu_T_("שלח שוב עם שם מלא יותר, טלפון או אימייל.")
          ].join("\n")
        };
      }
      return {
        sent: false,
        reply: TL_Menu_T_("לא מצאתי איש קשר ברור לשייך אליו את ההעשרה. שלח שוב עם שם ברור, טלפון או אימייל.")
      };
    }

    TL_Menu_AnnotateBossCapture_(inboxRow, TL_MENU_STATES.CAPTURE_CONTACT_ENRICH, "contact_enrichment_candidate=" + resolved.contact.contactId);

    const cfg = typeof TL_BossPolicy_getConfig_ === "function" ? TL_BossPolicy_getConfig_({ persistState: false }) : { bossPhone: bossWaId, now: new Date(), sendFn: TLW_sendText_ };
    const item = TL_Menu_BuildContactEnrichmentItem_(captureText, extraction, resolved.contact);
    const childRow = TL_Menu_BuildContactEnrichmentProposalRow_(loc.values, rowNumber, item, cfg, cfg.now || new Date());
    const childResult = TL_Capture_upsertChildRow_(childRow);
    if (!childResult || !childResult.rowNumber) {
      return { sent: false, reply: TL_Menu_T_("לא הצלחתי ליצור כרגע כרטיס אישור להעשרת איש קשר.") };
    }

    const packetItem = TL_Capture_buildPacketItem_(childRow, childResult.rowNumber);
    const stored = TL_Menu_StoreDecisionPacket_(bossWaId, "capture", [packetItem]);
    const phoneNumberId = String(TL_Orchestrator_value_(loc.values, "phone_number_id") || "").trim();
    const packetText = TL_Capture_buildPacketText_(item.summary, [packetItem], cfg, cfg.now || new Date());

    if (stored && phoneNumberId && cfg.sendFn) {
      cfg.sendFn(phoneNumberId, bossWaId, packetText, {
        kind: "contact_enrichment",
        items: [packetItem]
      });
      return { sent: true, rowNumber: childResult.rowNumber };
    }

    return { sent: false, reply: packetText };
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
  if (TL_Menu_IsExitCommand_(normalized)) return true;
  if (TL_MENU.TRIGGERS.some(function(t) { return normalized === String(t || "").trim().toLowerCase(); })) return true;
  if (TL_MENU.COST_TRIGGERS.some(function(t) { return normalized === String(t || "").trim().toLowerCase(); })) return true;
  if (TL_Menu_IsAiCostQuery_(normalized)) return true;
  if (TL_Menu_HasDecisionPacket_(waId)) return true;
  if (TL_Menu_GetState_(waId) !== TL_MENU_STATES.ROOT) return true;
  if (TL_Menu_IsNumericChoice_(normalized)) return true;
  try {
    const intent = TL_AI_RecognizeBossIntent_(normalized);
    if (intent && intent.intent !== "unknown") {
      TL_Menu_PutCachedIntent_(waId, text, intent);
      return true;
    }
  } catch (e) {}
  return false;
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
    if (!captureState) return null;
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    if (inboxRow) {
      TL_Menu_AnnotateBossCapture_(inboxRow, captureState, "boss_intent=" + normalized.intent);
      const immediateCapture = TL_Menu_RunImmediateCapture_(inboxRow);
      if (immediateCapture && immediateCapture.sent) return "";
    }
    return TL_Menu_BuildCaptureAck_(normalized);
  }

  if (normalized.intent === "show_settings") {
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.SETTINGS);
    return TL_Menu_BuildSettingsMenu_();
  }
  if (normalized.intent === "show_verticals") {
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.VERTICALS);
    return TL_Menu_BuildVerticalsMenu_();
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
  if (target === "capabilities") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.CAPABILITIES);
    return TL_Menu_BuildCapabilitiesMenu_();
  }
  if (target === "help") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.HELP);
    return TL_Menu_BuildHelpMenu_();
  }
  if (target === "verticals") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.VERTICALS);
    return TL_Menu_BuildVerticalsMenu_();
  }
  if (target === "settings") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.SETTINGS);
    return TL_Menu_BuildSettingsMenu_();
  }
  if (target === "reminders") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.REMINDERS);
    return TL_Menu_BuildRemindersMenu_();
  }
  if (target === "tasks") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.TASK_NEW);
    return TL_Menu_BuildTaskMenu_();
  }
  if (target === "schedule") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.SCHEDULE);
    return TL_Menu_BuildScheduleMenu_();
  }
  if (target === "notes") {
    TL_Menu_SetState_(waId, TL_MENU_STATES.LOG);
    return TL_Menu_BuildLogMenu_();
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
    return TL_Menu_ContinueCaptureItem_(waId, rawText);
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

function TL_Menu_ContinueOutboundDraft_(waId, rawText, options) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (!packet || String(packet.stage || "").trim() !== "one_by_one") return null;
  const current = packet.items[packet.cursor || 0];
  if (!current || !TL_Menu_IsOutboundCommunicationItem_(current)) return null;
  if (TL_Menu_ItemNeedsRecipientResolution_(current)) {
    return TL_Menu_TryContinueOutboundRecipientResolution_(waId, packet, current, text, options);
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

function TL_Menu_ContinueCaptureItem_(waId, rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (!packet || String(packet.stage || "").trim() !== "one_by_one") return null;
  const current = packet.items[packet.cursor || 0];
  if (!current || !TL_Menu_IsContinuableCaptureItem_(current)) return null;

  const dueUpdate = TL_Menu_TryUpdateCaptureItemDue_(current, text);
  if (dueUpdate.updated) {
    packet.items[packet.cursor || 0] = dueUpdate.item;
    TL_Menu_SetDecisionPacket_(waId, packet);
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet, TL_Menu_T_("עדכנתי את הזמן לפריט הנוכחי."));
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

function TL_Menu_RenderSummaryKind_(summaryKind, waId) {
  switch (summaryKind) {
    case "ai_cost": return TL_AI_BuildMonthToDateSpendReport_();
    case "pending": return TL_Menu_BuildPendingSummary_();
    case "urgent":
    case "attention": return TL_Menu_BuildUrgentSummary_();
    case "approvals": return TL_Menu_BuildAwaitingApprovalSummary_(waId);
    case "next_steps": return TL_Menu_BuildSuggestedNextSteps_();
    case "topic_candidates": return TL_Menu_BuildTopicCandidatesSummary_(waId);
    case "paused_items": return TL_Menu_BuildPausedItemsSummary_(waId);
    case "draft_replies": return TL_Menu_BuildDraftRepliesSummary_(waId);
    case "waiting_on_others": return TL_Menu_BuildWaitingOnOthersSummary_();
    case "followups": return TL_Menu_BuildFollowupsSummary_();
    case "open_tasks": return TL_Menu_BuildOpenTasksSummary_();
    case "blocked_tasks": return TL_Menu_BuildBlockedTasksSummary_();
    case "menu": return TL_Menu_BuildMenuReply_();
    case "help": return TL_Menu_BuildHelpMenu_();
    case "verticals": return TL_Menu_BuildVerticalsMenu_();
    case "settings": return TL_Menu_BuildSettingsMenu_();
    case "reminders": return TL_Menu_BuildRemindersSummary_();
    case "tasks": return TL_Menu_BuildOpenTasksSummary_();
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
    const summaryKind = String(analyzed && analyzed.summary_kind || fallback.summary_kind).trim().toLowerCase() || fallback.summary_kind;
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
  if (state) return state;
  const map = {};
  map.create_reminder_relative = TL_MENU_STATES.CAPTURE_REMINDER_RELATIVE;
  map.create_reminder_datetime = TL_MENU_STATES.CAPTURE_REMINDER_DATETIME;
  map.create_reminder_recurring = TL_MENU_STATES.CAPTURE_REMINDER_RECURRING;
  map.create_task_no_due = TL_MENU_STATES.CAPTURE_TASK_NO_DUE;
  map.create_task_with_due = TL_MENU_STATES.CAPTURE_TASK_WITH_DUE;
  map.create_task_dependent = TL_MENU_STATES.CAPTURE_TASK_DEPENDENT;
  map.create_task_personal = TL_MENU_STATES.CAPTURE_TASK_PERSONAL;
  map.create_task_business = TL_MENU_STATES.CAPTURE_TASK_BUSINESS;
  map.create_log_health = TL_MENU_STATES.CAPTURE_LOG_HEALTH;
  map.create_log_habits = TL_MENU_STATES.CAPTURE_LOG_HABITS;
  map.create_log_journal = TL_MENU_STATES.CAPTURE_LOG_JOURNAL;
  map.create_log_note = TL_MENU_STATES.CAPTURE_LOG_NOTE;
  map.create_contact_enrichment = TL_MENU_STATES.CAPTURE_CONTACT_ENRICH;
  map.create_schedule_business = TL_MENU_STATES.CAPTURE_SCHEDULE_BUSINESS;
  map.create_schedule_family = TL_MENU_STATES.CAPTURE_SCHEDULE_FAMILY;
  map.create_schedule_reminder = TL_MENU_STATES.CAPTURE_SCHEDULE_REMINDER;
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
    const raw = PropertiesService.getScriptProperties().getProperty(TL_MENU.PACKET_KEY_PREFIX + String(waId || "").trim());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.items && parsed.items.length ? parsed : null;
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
    items: (packet.items || []).map(function(item) {
      return {
        key: String(item.key || ""),
        rowNumber: Number(item.rowNumber || 0),
        recordId: String(item.recordId || ""),
        rootId: String(item.rootId || ""),
        recordClass: String(item.recordClass || ""),
        summary: String(item.summary || ""),
        proposal: String(item.proposal || ""),
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
        isUrgent: !!item.isUrgent,
        isHigh: !!item.isHigh
      };
    }).filter(function(item) {
      return !!item.rowNumber;
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

  const actionSpec = TL_Menu_GetDecisionPacketActionSpec_(current);
  if (actionSpec.actionKind === "promote_topic_candidate") {
    return TL_Menu_HandleTopicCandidatePacketReply_(waId, packet, choice, current);
  }

  if (TL_Menu_ItemNeedsRecipientResolution_(current)) {
    return TL_Menu_HandleDecisionPacketRecipientReply_(waId, packet, choice);
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

function TL_Menu_HandleTopicCandidatePacketReply_(waId, packet, choice, current) {
  const item = current || packet.items[packet.cursor || 0];
  if (!item) {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_T_("אין כרגע מועמד נושא פתוח.");
  }

  if (choice === "1") {
    const result = typeof TL_Topics_PromoteCandidate_ === "function"
      ? TL_Topics_PromoteCandidate_(item.topicCandidate, { topicSummary: item.topicSummary })
      : { ok: false, receiptText: TL_Menu_T_("קידום מועמד הנושא לא זמין כרגע.") };
    packet.cursor = Number(packet.cursor || 0) + 1;
    const receiptText = result && result.ok
      ? (result.receiptText || (TL_Menu_T_("קידמתי את מועמד הנושא ") + String(item.topicCandidate || "").trim() + "."))
      : String(result && result.receiptText || TL_Menu_T_("לא הצלחתי לקדם את מועמד הנושא.")).trim();
    if (!packet.items[packet.cursor || 0]) {
      TL_Menu_ClearDecisionPacket_(waId);
      return [
        receiptText,
        TL_Menu_T_("אין כרגע עוד מועמדי נושא שממתינים להחלטה.")
      ].filter(Boolean).join("\n\n");
    }
    TL_Menu_SetDecisionPacket_(waId, packet);
    return [
      receiptText,
      TL_Menu_BuildDecisionPacketOneByOneReply_(packet)
    ].filter(Boolean).join("\n\n");
  }

  if (choice === "2") {
    packet.cursor = Number(packet.cursor || 0) + 1;
  } else if (choice === "3") {
    const dismissed = typeof TL_Topics_DismissCandidate_ === "function"
      ? TL_Topics_DismissCandidate_(item.topicCandidate)
      : { ok: false, receiptText: TL_Menu_T_("דחיית מועמד הנושא לא זמינה כרגע.") };
    packet.cursor = Number(packet.cursor || 0) + 1;
    const receiptText = dismissed && dismissed.ok
      ? String(dismissed.receiptText || TL_Menu_T_("דחיתי את מועמד הנושא.")).trim()
      : String(dismissed && dismissed.receiptText || TL_Menu_T_("לא הצלחתי לדחות את מועמד הנושא.")).trim();
    if (!packet.items[packet.cursor || 0]) {
      TL_Menu_ClearDecisionPacket_(waId);
      return [
        receiptText,
        TL_Menu_T_("אין כרגע עוד מועמדי נושא שממתינים להחלטה.")
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
    return TL_Menu_T_("סיימנו את הסקירה. אין עוד מועמדי נושא פתוחים.");
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
      const emailSendNow = TL_Menu_SendApprovedEmailNow_(rowNumber);
      if (emailSendNow && emailSendNow.ok) {
        return {
          ok: true,
          actionKind: "send_email",
          receiptText: TL_Menu_T_("האימייל נשלח אל ") + String(emailSendNow.to || "").trim() + "."
        };
      }
      return {
        ok: false,
        actionKind: "send_email",
        receiptText: TL_Menu_T_("אישרתי את האימייל, אבל השליחה נכשלה.")
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
      const waSendNow = TL_Menu_SendApprovedWhatsAppNow_(rowNumber);
      if (waSendNow && waSendNow.ok) {
        return {
          ok: true,
          kind: captureKind,
          title: captureTitle,
          dueLabel: dueLabel,
          receiptText: TL_Menu_T_("הודעת ה-WhatsApp נשלחה אל ") + String(waSendNow.to || "").trim() + "."
        };
      }
      return {
        ok: false,
        kind: captureKind,
        title: captureTitle,
        dueLabel: dueLabel,
        receiptText: TL_Menu_T_("אישרתי את הודעת ה-WhatsApp, אבל השליחה נכשלה.")
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
  const values = loc.values;
  const payload = TL_Email_inboxValuesToSnapshot_(values, rowNumber).payload || {};
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
  return { ok: true, to: to, subject: subject };
}

function TL_Menu_SendApprovedWhatsAppNow_(rowNumber) {
  const loc = TL_AI_getInboxRow_(rowNumber);
  if (!loc || !loc.values) return { ok: false, reason: "missing_row" };
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
  const option3Label = String(actionSpec.option3Label || TL_Menu_T_("אח\"כ")).trim();
  const option4Label = String(actionSpec.option4Label || TL_Menu_T_("ארכב")).trim();
  const styleShortcutLine = TL_Menu_IsOutboundCommunicationItem_(current) && !TL_Menu_ItemNeedsRecipientResolution_(current)
    ? TL_Menu_T_("קיצורי ניסוח: קצר יותר | יותר אישי | יותר פורמלי | נסח מחדש", "Style shortcuts: shorter | warmer | more formal | rewrite")
    : "";
  const meta = [];
  if (current.isUrgent) meta.push("דחוף");
  else if (current.isHigh) meta.push("חשוב");
  const label = meta.length ? ("[" + meta.join(" · ") + "]") : "";
  const lines = [
    TL_Menu_T_("סקירה אחד-אחד ") + index + "/" + total,
    label ? label : "",
    senderLabel ? (TL_Menu_T_("מאת: ") + senderLabel) : "",
    channelLabel ? (TL_Menu_T_("ערוץ: ") + channelLabel) : "",
    subjectLabel ? (TL_Menu_T_("נושא: ") + subjectLabel) : "",
    rawSnippet ? (TL_Menu_T_("קטע מההודעה:") + "\n" + rawSnippet) : "",
    "",
    TL_Menu_T_("הבנתי כך:"),
    isReminder ? (TL_Menu_T_("הודעה: ") + reminderMessage) : summary,
    proposalBody ? (actionSpec.proposalHeading + "\n" + proposalBody) : "",
    isReminder && dueLabel ? (TL_Menu_T_("זמן הפעלת תזכורת: ") + dueLabel) : (isSchedule && dueLabel ? (TL_Menu_T_("זמן האירוע: ") + dueLabel) : (duePreview ? (TL_Menu_T_("יעד: ") + duePreview) : "")),
    "",
    "1. " + option1Label,
    option2Label ? ("2. " + option2Label) : "",
    option3Label ? ("3. " + option3Label) : "",
    option4Label ? ("4. " + option4Label) : "",
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
  if (typeof TL_Session_BuildSurface_ === "function") {
    return TL_Session_BuildSurface_("next_steps");
  }
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const action = TL_Orchestrator_value_(values, "suggested_action").toLowerCase();
    return !!action && action !== "ignore" && action !== "wait";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("צעדים הבאים", rows, "אין כרגע הצעות פעולה בולטות.");
}

function TL_Menu_BuildDraftRepliesSummary_(waId) {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const recordClass = TL_Orchestrator_value_(values, "record_class").toLowerCase();
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    const aiProposal = String(TL_Orchestrator_value_(values, "ai_proposal") || "").trim();
    return (recordClass === "proposal" || !!aiProposal) &&
      (approvalStatus === "draft" || approvalStatus === "awaiting_approval" || recordClass === "proposal");
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
  lines.push(TL_Menu_T_(
    "כדי לחזור לאחד מהם, שלח: המשך 2 או resume 2",
    "To resume one, send: resume 2"
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

function TL_Menu_BuildTopicCandidatesSummary_(waId) {
  if (typeof TL_Topics_BuildCandidateReviewText_ !== "function" || typeof TL_Topics_ListCandidateGroups_ !== "function") {
    return TL_Menu_T_(
      "סקירת מועמדי נושא עוד לא זמינה.",
      "Topic-candidate review is not available yet."
    );
  }
  const groups = TL_Topics_ListCandidateGroups_();
  const review = String(TL_Topics_renderCandidateSummary_(groups) || "").trim();
  if (!review) {
    return TL_Menu_T_(
      "אין כרגע מועמדי נושא פתוחים לקידום.",
      "There are no open topic candidates to promote right now."
    );
  }
  if (!waId) return review;
  const items = TL_Menu_CollectTopicCandidatePacketItems_(groups);
  if (!items.length) return review;
  TL_Menu_StoreDecisionPacket_(waId, "decision", items);
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (packet) {
    packet.stage = "one_by_one";
    packet.cursor = 0;
    TL_Menu_SetDecisionPacket_(waId, packet);
  }
  const livePacket = packet || TL_Menu_GetDecisionPacket_(waId);
  const intro = items.length === 1
    ? TL_Menu_T_("פותח עכשיו את מועמד הנושא היחיד לסקירה.")
    : (TL_Menu_T_("פותח עכשיו מועמד נושא 1 מתוך ") + items.length + ".");
  return [
    review,
    "",
    intro,
    livePacket ? TL_Menu_BuildDecisionPacketOneByOneReply_(livePacket) : TL_Menu_T_("לא הצלחתי לפתוח את מועמדי הנושא לסקירה.")
  ].join("\n\n");
}

function TL_Menu_CollectTopicCandidatePacketItems_(groups) {
  return (groups || []).map(function(group, index) {
    const sample = (group.samples || [])[0] || (group.rowRefs || [])[0] || {};
    const sampleLines = (group.samples || []).slice(0, 2).map(function(item) {
      return [item.channel, item.direction, item.summary].filter(Boolean).join(" | ");
    }).filter(Boolean);
    return {
      key: "topic_candidate:" + String(group.candidate || "").trim(),
      rowNumber: Number(sample.rowNumber || 0),
      recordId: String(sample.recordId || "").trim(),
      rootId: "",
      recordClass: "topic_candidate",
      summary: String(group.summary || group.candidate || "").trim(),
      proposal: TL_Menu_T_("מועמד נושא: ") + String(group.candidate || "").trim(),
      rawSnippet: sampleLines.join("\n"),
      sender: "",
      senderLabel: TL_Menu_T_("מועמד נושא"),
      receiver: "",
      channel: "",
      channelLabel: TL_Menu_T_("קיבוץ פנימי"),
      messageType: "topic_candidate",
      subject: "",
      suggestedAction: "review_manually",
      recipientQuery: "",
      recipientName: "",
      recipientDestination: "",
      recipientCandidates: [],
      resolutionStatus: "",
      searchQueries: [],
      contactId: "",
      approvalStatus: "candidate",
      executionStatus: "",
      taskStatus: "",
      captureKind: "topic_candidate",
      captureTitle: String(group.candidate || "").trim(),
      topicCandidate: String(group.candidate || "").trim(),
      topicSummary: String(group.summary || "").trim(),
      topicLatestAt: String(group.latestAt || "").trim(),
      topicExistingId: String(group.existingTopicId || "").trim(),
      topicCandidateCount: Number(group.count || 0),
      topicSamples: sampleLines,
      duePreview: "",
      dueLabel: "",
      isUrgent: Number(group.count || 0) >= 3,
      isHigh: index === 0
    };
  }).filter(function(item) {
    return !!item.rowNumber && !!item.topicCandidate;
  });
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
  if (normalized === "email") return channel === "email" || captureKind === "email";
  if (normalized === "whatsapp") return channel === "whatsapp" || captureKind === "whatsapp";
  if (normalized === "reminders") return captureKind === "reminder";
  if (normalized === "tasks") return captureKind === "task";
  return true;
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
  const contactsIndex = typeof TL_Session_getContactsIndex_ === "function" ? TL_Session_getContactsIndex_() : null;
  const topicSummaryMap = TL_Menu_TopicSummaryMap_();
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
  });
  const items = [];
  Object.keys(latest).forEach(function(key) {
    const item = latest[key];
    const values = item.values;
    const approvalStatus = String(TL_Orchestrator_value_(values, "approval_status") || "").toLowerCase();
    if (approvalStatus !== "draft" && approvalStatus !== "awaiting_approval") return;
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").toLowerCase();
    const sender = String(TL_Orchestrator_value_(values, "sender") || "").trim();
    const receiver = String(TL_Orchestrator_value_(values, "receiver") || "").trim();
    const messageType = String(TL_Orchestrator_value_(values, "message_type") || "").trim();
    const threadSubject = String(TL_Orchestrator_value_(values, "thread_subject") || "").trim();
    const textValue = String(TL_Orchestrator_value_(values, "text") || "").trim();
    const contactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
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
    const classified = typeof TL_BossPolicy_classifyItem_ === "function" ? TL_BossPolicy_classifyItem_(item, {}) : null;
    const packetItem = {
      key: key,
      rowNumber: item.rowNumber,
      recordId: String(TL_Orchestrator_value_(values, "record_id") || "").trim(),
      rootId: String(TL_Orchestrator_value_(values, "root_id") || "").trim(),
      recordClass: String(TL_Orchestrator_value_(values, "record_class") || "").trim(),
      summary: String(TL_Orchestrator_value_(values, "ai_summary") || threadSubject || textValue || "").trim(),
      proposal: String(TL_Orchestrator_value_(values, "ai_proposal") || "").trim(),
      sender: sender,
      senderLabel: TL_Menu_BuildPacketSenderLabel_(senderProfile, sender, receiver, contactId),
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
      isUrgent: classified ? !!classified.isUrgent : false,
      isHigh: classified ? !!classified.isHigh : false
    };
    packetItem.actionKind = TL_Menu_GetDecisionPacketActionSpec_(packetItem).actionKind;
    if (!TL_Menu_MatchesApprovalCategory_(packetItem, normalizedMode === "drafts" ? "all" : normalizedMode)) return;
    items.push(packetItem);
  });
  items.sort(function(a, b) {
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
  if (senderProfile && senderProfile.displayName) {
    return String(senderProfile.displayName).trim();
  }
  if (contactId && sender) return String(sender).trim();
  if (sender && receiver) return String(sender).trim();
  return String(sender || receiver || "").trim();
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
  if (captureKind === "topic_candidate") {
    return {
      actionKind: "promote_topic_candidate",
      primaryLabel: TL_Menu_T_("קדם כנושא"),
      option2Label: TL_Menu_T_("אח\"כ"),
      option3Label: TL_Menu_T_("דחה"),
      option4Label: "",
      proposalHeading: TL_Menu_T_("הקידום המוצע:")
    };
  }
  if (captureKind === "whatsapp") {
    return {
      actionKind: "send_whatsapp",
      primaryLabel: TL_Menu_T_("אשר ושלח ב-WhatsApp"),
      editLabel: TL_Menu_T_("ערוך את ההודעה"),
      proposalHeading: TL_Menu_T_("טיוטת ההודעה לאישור:")
    };
  }
  if (captureKind === "email") {
    return {
      actionKind: "send_email",
      primaryLabel: TL_Menu_T_("אשר ושלח את האימייל"),
      editLabel: TL_Menu_T_("ערוך את האימייל"),
      proposalHeading: TL_Menu_T_("טיוטת האימייל לאישור:")
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
      primaryLabel: TL_Menu_T_("אשר את הטיוטה לשליחה"),
      editLabel: TL_Menu_T_("ערוך את הטיוטה"),
      proposalHeading: TL_Menu_T_("הטיוטה המלאה לאישור:")
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
  if (captureKind === "topic_candidate") {
    const lines = [
      TL_Menu_T_("מזהה מוצע: ") + String(item.topicCandidate || captureTitle || "").trim(),
      item.topicSummary ? (TL_Menu_T_("סיכום: ") + String(item.topicSummary || "").trim()) : "",
      item.topicCandidateCount ? (TL_Menu_T_("מספר מופעים: ") + Number(item.topicCandidateCount || 0)) : "",
      item.topicLatestAt ? (TL_Menu_T_("הופעה אחרונה: ") + String(item.topicLatestAt || "").trim()) : "",
      item.topicExistingId ? (TL_Menu_T_("דומה לנושא קיים: ") + String(item.topicExistingId || "").trim()) : "",
      Array.isArray(item.topicSamples) && item.topicSamples.length ? (TL_Menu_T_("דוגמאות:\n") + item.topicSamples.join("\n")) : ""
    ];
    return lines.filter(Boolean).join("\n");
  }
  if (captureKind === "whatsapp") {
    return [
      TL_Menu_T_("טיוטת WhatsApp אל ") + recipientLabel + ': "' + proposal + '"',
      TL_Menu_BuildDraftWhyBlock_(item)
    ].filter(Boolean).join("\n");
  }
  if (captureKind === "email") {
    return [
      TL_Menu_T_("טיוטת אימייל אל ") + recipientLabel + ': "' + proposal + '"',
      subject ? (TL_Menu_T_("נושא: ") + subject) : "",
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
    return TL_Menu_T_("הודעת ה-WhatsApp \"") + safeTitle + TL_Menu_T_("\" נשלחה.");
  }
  if (safeKind === "email") {
    return TL_Menu_T_("האימייל \"") + safeTitle + TL_Menu_T_("\" נשלח.");
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
