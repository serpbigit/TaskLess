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
  TRIGGERS: ["תפריט","menu","/menu","עזרה","help","מה אפשר לעשות","what can i do","what can i say"],
  HELP_TRIGGERS: ["עזרה","help","מה אפשר לעשות","what can i do","what can i say"],
  STATE_KEY_PREFIX: "MENU_STATE_", // + wa_id
  PACKET_KEY_PREFIX: "MENU_PACKET_", // + wa_id
  MAX_PENDING_SUMMARY: 5
};

const TL_MENU_STATES = {
  ROOT: "root",
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

function TL_Menu_HandleBossMessage_(ev, inboxRow, options) {
  const bossPhone = TLW_normalizePhone_(TLW_getSetting_("BOSS_PHONE") || "");
  const from = String(ev.from || "").trim();
  const normalizedFrom = TLW_normalizePhone_(from);
  const bossWaId = from;
  if (bossPhone && normalizedFrom !== bossPhone) return null; // if boss phone set, enforce; otherwise allow anyone

  const rawText = String(ev.text || "").trim();
  const text = rawText.toLowerCase();
  if (!text) return TL_Menu_BuildMenuReply_();

  const packetReply = TL_Menu_HandleDecisionPacketReply_(bossWaId, text);
  if (packetReply) return packetReply;

  // Check triggers
  if (TL_MENU.TRIGGERS.some(t => text === t)) {
    const targetState = TL_MENU.HELP_TRIGGERS.some(t => text === t) ? TL_MENU_STATES.HELP : TL_MENU_STATES.ROOT;
    TL_Menu_SetState_(bossWaId, targetState);
    return TL_Menu_BuildMenuForState_(targetState);
  }

  const state = TL_Menu_GetState_(bossWaId);

  if (TL_Menu_IsNumericChoice_(text)) {
    const reply = TL_Menu_HandleMenuChoice_(bossWaId, state, text);
    if (reply) return reply;
  }

  if (TL_Menu_IsCaptureState_(state)) {
    TL_Menu_AnnotateBossCapture_(inboxRow, state);
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    return [
      "קיבלתי.",
      "אבנה מזה הצעת פעולה מסודרת לאישור שלך לפני ביצוע.",
      "אם צריך, אחזור אליך עם כרטיס אישור או שאלת הבהרה."
    ].join("\n");
  }

  const intent = TL_Menu_PopCachedIntent_(bossWaId, rawText) || TL_Menu_RecognizeBossIntent_(rawText, options);
  const routed = TL_Menu_HandleBossIntent_(ev, inboxRow, intent);
  if (routed) return routed;

  // Unknown free-form text falls through without a forced menu reply.
  TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
  return null;
}

function TL_Menu_BuildMenuReply_() {
  const bossName = String(TLW_getSetting_("BOSS_NAME") || "ראובן").trim();
  return [
    "שלום " + bossName + ",",
    "מה תרצה לעשות?",
    "1. תזכיר לי",
    "2. משימה חדשה",
    "3. רשום לי",
    "4. קבע לי",
    "5. נהל את העבודה",
    "6. הגדרות",
    "7. עזרה / מה אפשר להגיד",
    "8. כלים ייעודיים",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_SetState_(waId, state) {
  PropertiesService.getScriptProperties().setProperty(TL_MENU.STATE_KEY_PREFIX + waId, state);
}

function TL_Menu_GetState_(waId) {
  const value = String(PropertiesService.getScriptProperties().getProperty(TL_MENU.STATE_KEY_PREFIX + waId) || TL_MENU_STATES.ROOT);
  return value === "idle" ? TL_MENU_STATES.ROOT : value;
}

function TL_Menu_IsNumericChoice_(text) {
  return /^\d+$/.test(String(text || "").trim());
}

function TL_Menu_IsCaptureState_(state) {
  return String(state || "").indexOf("capture_") === 0;
}

function TL_Menu_HandleMenuChoice_(waId, state, choice) {
  const current = String(state || TL_MENU_STATES.ROOT);
  const value = String(choice || "").trim();
  switch (current) {
    case TL_MENU_STATES.ROOT: return TL_Menu_HandleRootChoice_(waId, value);
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
  if (choice === "1") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.REMINDERS);
  if (choice === "2") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.TASK_NEW);
  if (choice === "3") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.LOG);
  if (choice === "4") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SCHEDULE);
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.MANAGE_WORK);
  if (choice === "6") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS);
  if (choice === "7") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.HELP);
  if (choice === "8") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.VERTICALS);
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_HandleRemindersChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_REMINDER_RELATIVE, "כתוב/אמור את התזכורת. לדוגמה: \"תזכירי לי בעוד שעתיים להתקשר ליעקב\".");
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_REMINDER_DATETIME, "כתוב/אמור את התזכורת עם תאריך ושעה. לדוגמה: \"תזכירי לי מחר ב-08:00 לקחת תרופה\".");
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_REMINDER_RECURRING, "כתוב/אמור את התזכורת החוזרת. לדוגמה: \"תזכירי לי כל יום ב-22:00 לקחת כדור\".");
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_("רשימת תזכורות", "תצוגת רשימת התזכורות עוד לא חוברה. בינתיים אני שומר לכידה והצעות לאישור.");
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "6") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildRemindersMenu_();
}

function TL_Menu_HandleTaskChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_NO_DUE, "כתוב/אמור את פרטי המשימה בלי תאריך יעד.");
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_WITH_DUE, "כתוב/אמור את המשימה עם תאריך יעד. לדוגמה: \"תפתחי לי משימה לשלוח הצעת מחיר עד יום חמישי\".");
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_DEPENDENT, "כתוב/אמור את המשימה והתלות. לדוגמה: \"תפתחי משימה להתקשר ליעקב אחרי שדני שולח מחירים\".");
  if (choice === "4") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_PERSONAL, "כתוב/אמור את המשימה האישית.");
  if (choice === "5") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_TASK_BUSINESS, "כתוב/אמור את המשימה העסקית.");
  if (choice === "6") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "7") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildTaskMenu_();
}

function TL_Menu_HandleLogChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_HEALTH, "כתוב/אמור מה לרשום בבריאות / תרופות.");
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_HABITS, "כתוב/אמור מה לרשום בספורט / הרגלים.");
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_JOURNAL, "כתוב/אמור מה לרשום ביומן האישי.");
  if (choice === "4") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_LOG_NOTE, "כתוב/אמור את ההערה הכללית.");
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "6") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildLogMenu_();
}

function TL_Menu_HandleScheduleChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_SCHEDULE_BUSINESS, "כתוב/אמור את פרטי הפגישה העסקית. לדוגמה: \"תקבעי לי פגישה עם רותי ביום חמישי ב-15:00\".");
  if (choice === "2") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_SCHEDULE_FAMILY, "כתוב/אמור את פרטי האירוע המשפחתי.");
  if (choice === "3") return TL_Menu_OpenCapture_(waId, TL_MENU_STATES.CAPTURE_SCHEDULE_REMINDER, "כתוב/אמור תזכורת עם זמן.");
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_("מה יש לי ביומן", "תצוגת יומן מלאה תתחבר למסלול היומן. כרגע הסיידקאר קיים אבל לא מחובר עדיין לתשובת תפריט.");
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "6") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildScheduleMenu_();
}

function TL_Menu_HandleManageWorkChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_BuildPendingSummary_();
  if (choice === "2") return TL_Menu_BuildUrgentSummary_();
  if (choice === "3") return TL_Menu_BuildAwaitingApprovalSummary_();
  if (choice === "4") return TL_Menu_BuildSuggestedNextSteps_();
  if (choice === "5") return TL_Menu_BuildDraftRepliesSummary_();
  if (choice === "6") return TL_Menu_BuildWaitingOnOthersSummary_();
  if (choice === "7") return TL_Menu_BuildFollowupsSummary_();
  if (choice === "8") return TL_Menu_BuildOpenTasksSummary_();
  if (choice === "9") return TL_Menu_BuildBlockedTasksSummary_();
  if (choice === "10") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "11") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildManageWorkMenu_();
}

function TL_Menu_HandleSettingsChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS_SECRETARY);
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_("תדירות עדכונים", "עריכת תדירות העדכונים דרך התפריט עוד לא חוברה. כרגע זה נשלט מ-SETTINGS דרך BOSS_UPDATE_INTERVAL_MINUTES.");
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_("תדירות בקשות החלטה", "עריכת תדירות בקשות החלטה דרך התפריט עוד לא חוברה. כרגע זה נשלט מ-SETTINGS דרך BOSS_DECISION_REQUEST_INTERVAL_MINUTES.");
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_("גודל אצווה להחלטות", "עריכת גודל אצווה דרך התפריט עוד לא חוברה. כרגע זה נשלט מ-SETTINGS דרך BOSS_DECISION_BATCH_SIZE ו-BOSS_MAX_ITEMS_PER_DIGEST.");
  if (choice === "5") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS_LANGUAGE);
  if (choice === "6") return TL_Menu_BuildPlaceholderReply_("התאמה אישית של התפריט", "התאמה אישית של התפריט עוד לא חוברה, אבל המבנה כבר מוגדר כרודמאפ.");
  if (choice === "7") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "8") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildSettingsMenu_();
}

function TL_Menu_HandleSettingsSecretaryChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_BuildPlaceholderReply_("הפעל / כבה דחוף בלבד", "שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.");
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_("רמת התערבות", "שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.");
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_("דחופים תמיד ראשונים", "שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.");
  if (choice === "4") return TL_Menu_BuildPlaceholderReply_("FYI בעדכון", "שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.");
  if (choice === "5") return TL_Menu_BuildPlaceholderReply_("נא לא להפריע", "שינוי דרך התפריט עוד לא חובר. כרגע הערך נשלט מ-SETTINGS.");
  if (choice === "6") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.SETTINGS);
  if (choice === "7") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildSettingsSecretaryMenu_();
}

function TL_Menu_HandleSettingsLanguageChoice_(waId, choice) {
  if (choice === "1") return TL_Menu_BuildPlaceholderReply_("עברית להכל", "ברירת המחדל כרגע היא עברית. שינוי מלא דרך התפריט עוד לא חובר.");
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_("שפת תפריט", "שפת תפריט נרשמה כדרישת המשך, אבל שינוי דרך התפריט עוד לא חובר.");
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_("שפת AI", "שפת AI נרשמה כדרישת המשך, אבל שינוי דרך התפריט עוד לא חובר.");
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
  if (choice === "1") return TL_Menu_BuildPlaceholderReply_("מטפלת / מטופלים", "המסלול הייעודי הזה עוד לא מומש, אבל הוא על הרודמאפ כמודול ורטיקלי.");
  if (choice === "2") return TL_Menu_BuildPlaceholderReply_("סיכומי מפגשים", "המסלול הזה עוד לא מומש, אבל הוא שמור כיכולות עתידיות.");
  if (choice === "3") return TL_Menu_BuildPlaceholderReply_("דוחות תקופתיים", "המסלול הזה עוד לא מומש, אבל הוא שמור כיכולות עתידיות.");
  if (choice === "4") return TL_Menu_OpenSubmenu_(waId, TL_MENU_STATES.ROOT);
  if (choice === "5") return TL_Menu_BuildMenuReply_();
  return TL_Menu_BuildVerticalsMenu_();
}

function TL_Menu_OpenSubmenu_(waId, state) {
  TL_Menu_SetState_(waId, state);
  return TL_Menu_BuildMenuForState_(state);
}

function TL_Menu_OpenCapture_(waId, state, prompt) {
  TL_Menu_SetState_(waId, state);
  return String(prompt || "כתוב/אמור את הפרטים.");
}

function TL_Menu_BuildMenuForState_(state) {
  switch (String(state || TL_MENU_STATES.ROOT)) {
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
  return [
    "תזכורות",
    "1. בעוד זמן מסוים",
    "2. בתאריך ושעה",
    "3. כל יום / כל שבוע",
    "4. רשימת תזכורות",
    "5. חזרה לתפריט קודם",
    "6. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildTaskMenu_() {
  return [
    "משימה חדשה",
    "1. בלי תאריך",
    "2. עם תאריך",
    "3. תלויה במשהו אחר",
    "4. משימה אישית",
    "5. משימה עסקית",
    "6. חזרה לתפריט קודם",
    "7. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildLogMenu_() {
  return [
    "רישום",
    "1. בריאות / תרופות",
    "2. ספורט / הרגלים",
    "3. יומן אישי",
    "4. הערה כללית",
    "5. חזרה לתפריט קודם",
    "6. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildScheduleMenu_() {
  return [
    "יומן ותיאום",
    "1. פגישה עסקית",
    "2. אירוע משפחתי",
    "3. תזכורת עם זמן",
    "4. מה יש לי ביומן",
    "5. חזרה לתפריט קודם",
    "6. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildManageWorkMenu_() {
  return [
    "ניהול העבודה",
    "1. מה על הצלחת שלי עכשיו",
    "2. דחוף בלבד",
    "3. ממתין לאישורים",
    "4. הצע לי צעדים הבאים",
    "5. טיוטות לתגובה",
    "6. ממתין לאחרים",
    "7. מעקבים",
    "8. משימות פתוחות",
    "9. משימות חסומות",
    "10. חזרה לתפריט קודם",
    "11. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildSettingsMenu_() {
  return [
    "הגדרות",
    "1. הגדרות המזכירה",
    "2. תדירות עדכונים",
    "3. תדירות בקשות החלטה",
    "4. גודל אצווה להחלטות",
    "5. שפה",
    "6. התאמה אישית של התפריט",
    "7. חזרה לתפריט קודם",
    "8. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildSettingsSecretaryMenu_() {
  return [
    "הגדרות המזכירה",
    "1. הפעל / כבה דחוף בלבד",
    "2. רמת התערבות",
    "3. דחופים תמיד ראשונים",
    "4. לכלול FYI בעדכון",
    "5. נא לא להפריע",
    "6. חזרה לתפריט קודם",
    "7. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildSettingsLanguageMenu_() {
  return [
    "שפה",
    "1. עברית להכל",
    "2. שפת תפריט",
    "3. שפת AI",
    "4. חזרה לתפריט קודם",
    "5. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildHelpMenu_() {
  return [
    "עזרה / מה אפשר להגיד",
    "1. תזכירי לי מחר ב-08:00 לקחת תרופה",
    "2. תפתחי לי משימה להתקשר ליעקב",
    "3. תרשמי ביומן שלקחתי כדור ב-22:00",
    "4. תקבעי לי פגישה עם רותי ביום חמישי",
    "5. מה על הצלחת שלי עכשיו?",
    "6. מה דחוף כרגע?",
    "7. חזרה לתפריט קודם",
    "8. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildVerticalsMenu_() {
  return [
    "כלים ייעודיים",
    "1. מטפלת / מטופלים",
    "2. סיכומי מפגשים",
    "3. דוחות תקופתיים",
    "4. חזרה לתפריט קודם",
    "5. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildPlaceholderReply_(title, body) {
  return [
    String(title || "בקרוב"),
    String(body || "המסלול הזה עוד לא חובר במלואו."),
    "חזור לתפריט הראשי עם \"תפריט\" או בחר אפשרות אחרת."
  ].join("\n");
}

function TL_Menu_BuildOutOfScopeReply_() {
  return [
    "מצטערת, כאן אני מטפלת רק בניהול, תזכורות, משימות, יומן, הודעות עבודה והחלטות לאישור.",
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
  if (extraNote) {
    const extra = String(extraNote || "").trim();
    if (extra && String(notes || "").indexOf(extra) === -1) {
      notes = String(notes || "") ? (String(notes || "") + "\n" + extra) : extra;
    }
  }
  TL_Orchestrator_updateRowFields_(rowNumber, {
    notes: notes,
    task_status: "captured"
  }, "menu_capture");
  return true;
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
  if (TL_MENU.TRIGGERS.some(function(t) { return normalized === String(t || "").trim().toLowerCase(); })) return true;
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

function TL_Menu_HandleBossIntent_(ev, inboxRow, intent) {
  const bossWaId = String(ev && ev.from ? ev.from : "").trim();
  const normalized = TL_AI_normalizeBossIntent_(intent || {});
  if (!normalized || normalized.intent === "unknown") return null;

  if (normalized.intent === "out_of_scope") {
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    return TL_Menu_BuildOutOfScopeReply_();
  }

  if (normalized.route === "menu" || normalized.intent === "show_menu" || normalized.intent === "help") {
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    if (normalized.intent === "help") return TL_Menu_BuildHelpMenu_();
    return TL_Menu_BuildMenuReply_();
  }

  if (normalized.route === "summary") {
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    return TL_Menu_HandleSummaryIntent_(normalized);
  }

  if (normalized.route === "capture") {
    const captureState = TL_Menu_CaptureStateForIntent_(normalized.intent, normalized.capture_state);
    if (!captureState) return null;
    TL_Menu_SetState_(bossWaId, TL_MENU_STATES.ROOT);
    if (inboxRow) {
      TL_Menu_AnnotateBossCapture_(inboxRow, captureState, "boss_intent=" + normalized.intent);
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

function TL_Menu_HandleSummaryIntent_(intent) {
  const summaryKind = String(intent && intent.summary_kind || "").trim().toLowerCase();
  switch (summaryKind) {
    case "pending": return TL_Menu_BuildPendingSummary_();
    case "urgent": return TL_Menu_BuildUrgentSummary_();
    case "approvals": return TL_Menu_BuildAwaitingApprovalSummary_();
    case "next_steps": return TL_Menu_BuildSuggestedNextSteps_();
    case "draft_replies": return TL_Menu_BuildDraftRepliesSummary_();
    case "waiting_on_others": return TL_Menu_BuildWaitingOnOthersSummary_();
    case "followups": return TL_Menu_BuildFollowupsSummary_();
    case "open_tasks": return TL_Menu_BuildOpenTasksSummary_();
    case "blocked_tasks": return TL_Menu_BuildBlockedTasksSummary_();
    case "menu": return TL_Menu_BuildMenuReply_();
    case "help": return TL_Menu_BuildHelpMenu_();
    case "verticals": return TL_Menu_BuildVerticalsMenu_();
    case "settings": return TL_Menu_BuildSettingsMenu_();
    case "reminders": return TL_Menu_BuildPendingSummary_();
    case "tasks": return TL_Menu_BuildOpenTasksSummary_();
    default: return TL_Menu_BuildPendingSummary_();
  }
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
      "קיבלתי.",
      "רשמתי את זה כפריט עבודה חדש.",
      "אבנה מזה הצעה לאישור לפני ביצוע."
    ].join("\n");
  }
  return "קיבלתי.";
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
        sender: String(item.sender || ""),
        receiver: String(item.receiver || ""),
        contactId: String(item.contactId || ""),
        approvalStatus: String(item.approvalStatus || ""),
        executionStatus: String(item.executionStatus || ""),
        taskStatus: String(item.taskStatus || ""),
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
      sender: item.sender,
      receiver: item.receiver,
      contactId: item.contactId,
      approvalStatus: item.approvalStatus,
      executionStatus: item.executionStatus,
      taskStatus: item.taskStatus,
      isUrgent: item.isUrgent,
      isHigh: item.isHigh
    };
  }).filter(function(item) {
    return !!item.rowNumber;
  });
  if (!packetItems.length) return false;
  return TL_Menu_SetDecisionPacket_(waId, {
    kind: kind || "decision",
    stage: "root",
    cursor: 0,
    created_at: new Date().toISOString(),
    items: packetItems
  });
}

function TL_Menu_HandleDecisionPacketReply_(waId, text) {
  const packet = TL_Menu_GetDecisionPacket_(waId);
  if (!packet) return null;

  const choice = String(text || "").trim();
  if (!choice) return TL_Menu_BuildDecisionPacketReply_(packet);

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

  TL_Menu_ClearDecisionPacket_(waId);
  return TL_Menu_BuildMenuReply_();
}

function TL_Menu_HandleDecisionPacketRootReply_(waId, packet, choice) {
  if (choice === "1") {
    const approved = TL_Menu_ApprovePacketItems_(packet.items);
    TL_Menu_ClearDecisionPacket_(waId);
    return [
      "אישרתי את כל הפריטים בחבילה.",
      "סה\"כ אושרו: " + approved.approved,
      approved.failed ? ("נכשלו: " + approved.failed) : "",
      "המערכת תמשיך לעיבוד/שליחה לפי הזרימה הרגילה."
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
    return "בסדר. לא בוצע דבר כרגע.";
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
    return "אישרתי חלק מהחבילה. אושרו " + approved.approved + " פריטים ראשונים.";
  }
  if (choice === "2") {
    const urgentOnly = packet.items.filter(function(item) { return item.isUrgent; });
    const approved = TL_Menu_ApprovePacketItems_(urgentOnly);
    TL_Menu_ClearDecisionPacket_(waId);
    return "אישרתי רק את הפריטים הדחופים. אושרו " + approved.approved + " פריטים.";
  }
  if (choice === "3") {
    const topOne = packet.items.slice(0, 1);
    const approved = TL_Menu_ApprovePacketItems_(topOne);
    TL_Menu_ClearDecisionPacket_(waId);
    return "אישרתי רק את הפריט הראשון. אושרו " + approved.approved + " פריטים.";
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
      "אישרתי את הדחופים/החשובים בלבד.",
      "אושרו: " + approved.approved,
      "נשארו ללא אישור: " + remaining
    ].join("\n");
  }
  if (choice === "2") {
    const exceptions = packet.items.filter(function(item) {
      return !(item.isUrgent || item.isHigh);
    });
    if (!exceptions.length) {
      packet.stage = "root";
      TL_Menu_SetDecisionPacket_(waId, packet);
      return "אין כרגע חריגים. כל הפריטים נראים דחופים/חשובים.";
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
    return "סיימנו את הסקירה אחד-אחד.";
  }

  if (choice === "1") {
    TL_Menu_ApprovePacketItems_([current]);
    packet.cursor = Number(packet.cursor || 0) + 1;
  } else if (choice === "2") {
    packet.cursor = Number(packet.cursor || 0) + 1;
  } else if (choice === "3") {
    TL_Menu_ClearDecisionPacket_(waId);
    return "עצרתי את הסקירה אחד-אחד.";
  } else if (choice === "4") {
    TL_Menu_ClearDecisionPacket_(waId);
    return TL_Menu_BuildMenuReply_();
  } else {
    return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
  }

  if (!packet.items[packet.cursor || 0]) {
    TL_Menu_ClearDecisionPacket_(waId);
    return "סיימנו את הסקירה. אין עוד פריטים בחבילה.";
  }

  TL_Menu_SetDecisionPacket_(waId, packet);
  return TL_Menu_BuildDecisionPacketOneByOneReply_(packet);
}

function TL_Menu_ApprovePacketItems_(items) {
  const unique = {};
  const result = { approved: 0, failed: 0 };
  (items || []).forEach(function(item) {
    if (!item || !item.rowNumber || unique[item.rowNumber]) return;
    unique[item.rowNumber] = true;
    if (TL_Menu_ApproveDecisionRow_(item.rowNumber)) result.approved++;
    else result.failed++;
  });
  return result;
}

function TL_Menu_ApproveDecisionRow_(rowNumber) {
  try {
    const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
    const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
    if (!sh || !rowNumber) return false;

    const values = sh.getRange(rowNumber, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0];
    const approvalRequired = String(values[TLW_colIndex_("approval_required") - 1] || "").trim().toLowerCase() === "true";
    const approvalStatus = String(values[TLW_colIndex_("approval_status") - 1] || "").trim().toLowerCase();
    const executionStatus = String(values[TLW_colIndex_("execution_status") - 1] || "").trim().toLowerCase();
    const taskStatus = String(values[TLW_colIndex_("task_status") - 1] || "").trim().toLowerCase();
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

    if (typeof TL_Orchestrator_updateRowFields_ === "function") {
      TL_Orchestrator_updateRowFields_(rowNumber, updates, "boss_confirm");
    } else {
      Object.keys(updates).forEach(function(key) {
        sh.getRange(rowNumber, TLW_colIndex_(key)).setValue(updates[key]);
      });
      TLW_applyVersionBump_(rowNumber, "boss_confirm");
    }
    if (typeof TL_Orchestrator_FinalizeCaptureApproval_ === "function") {
      TL_Orchestrator_FinalizeCaptureApproval_(rowNumber);
    }
    if (!approvalRequired && approvalStatus === "approved") return true;
    return true;
  } catch (e) {
    return false;
  }
}

function TL_Menu_BuildDecisionPacketReply_(packet) {
  return [
    TL_Menu_BuildDecisionPacketHeader_(packet),
    "1. כן, אשר הכל",
    "2. רק חלק",
    "3. תן לי אחד אחד",
    "4. קבץ לי בצורה חכמה",
    "5. דחה לעכשיו",
    "6. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketFewReply_(packet) {
  return [
    "אישור חלקי",
    "1. אשר את 3 הראשונים",
    "2. אשר רק דחופים",
    "3. אשר רק את הראשון",
    "4. חזרה לתפריט קודם",
    "5. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketSmartReply_(packet) {
  const urgentCount = packet.items.filter(function(item) { return item.isUrgent || item.isHigh; }).length;
  const exceptionCount = Math.max(packet.items.length - urgentCount, 0);
  return [
    "חלוקה חכמה",
    "דחופים/חשובים: " + urgentCount,
    "חריגים: " + exceptionCount,
    "1. אשר רק דחופים/חשובים",
    "2. עבור על החריגים אחד אחד",
    "3. חזרה לתפריט קודם",
    "4. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketOneByOneReply_(packet) {
  const current = packet.items[packet.cursor || 0];
  if (!current) return "אין עוד פריטים בחבילה.";
  const index = Number(packet.cursor || 0) + 1;
  const total = packet.items.length;
  const actor = current.receiver || current.sender || current.contactId || current.rootId || "לא ידוע";
  const summary = TL_Menu_Preview_(current.summary || current.proposal || current.taskStatus || "", 140);
  return [
    "בדיקה אחד-אחד " + index + "/" + total,
    actor,
    summary,
    "1. אשר",
    "2. דלג",
    "3. עצור",
    "4. חזרה לתפריט ראשי",
    "שלח את מספר האפשרות שתבחר"
  ].join("\n");
}

function TL_Menu_BuildDecisionPacketHeader_(packet) {
  const total = packet.items.length;
  const urgent = packet.items.filter(function(item) { return item.isUrgent; }).length;
  return [
    "האם לאשר את הפריטים הבאים?",
    "סה\"כ פריטים: " + total,
    "דחופים: " + urgent
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
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  // record_class = instruction, task_status = logged
  sh.getRange(r, TLW_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TLW_colIndex_("task_status")).setValue(taskStatus || "logged");
  TLW_applyVersionBump_(r, "menu_note");
}

function TL_Menu_LogMeetingRequest_(ev, inboxRow) {
  const ss = SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim());
  const sh = ss.getSheetByName(TL_WEBHOOK.INBOX_SHEET);
  if (!sh || !inboxRow) return;
  const r = inboxRow.row;
  sh.getRange(r, TLW_colIndex_("record_class")).setValue("instruction");
  sh.getRange(r, TLW_colIndex_("task_status")).setValue("pending");
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
  const rootId = TL_Orchestrator_value_(values, "root_id");
  const prefix = status ? ("[" + status + "] ") : "";
  return "- " + prefix + preview + (rootId ? (" (root " + rootId + ")") : "");
}

function TL_Menu_BuildSummaryBlock_(title, rows, emptyText) {
  if (!rows || !rows.length) return String(emptyText || "אין כרגע פריטים.");
  return [title].concat(rows.map(TL_Menu_FormatRowSummary_)).join("\n");
}

function TL_Menu_BuildPendingSummary_() {
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
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    return TL_Orchestrator_value_(values, "urgency_flag").toLowerCase() === "true" ||
      TL_Orchestrator_value_(values, "needs_owner_now").toLowerCase() === "true";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("דחוף בלבד", rows, "אין כרגע פריטים דחופים.");
}

function TL_Menu_BuildAwaitingApprovalSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const approvalStatus = TL_Orchestrator_value_(values, "approval_status").toLowerCase();
    return approvalStatus === "draft" || approvalStatus === "awaiting_approval";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("ממתין לאישורים", rows, "אין כרגע פריטים שממתינים לאישור.");
}

function TL_Menu_BuildSuggestedNextSteps_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const action = TL_Orchestrator_value_(values, "suggested_action").toLowerCase();
    return !!action && action !== "ignore" && action !== "wait";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("צעדים הבאים", rows, "אין כרגע הצעות פעולה בולטות.");
}

function TL_Menu_BuildDraftRepliesSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    return TL_Orchestrator_value_(values, "record_class").toLowerCase() === "proposal";
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("טיוטות לתגובה", rows, "אין כרגע טיוטות תגובה פתוחות.");
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

function TL_Menu_BuildBlockedTasksSummary_() {
  const rows = TL_Menu_FilterRecentRows_(function(item) {
    const values = item.values;
    const status = TL_Orchestrator_value_(values, "task_status").toLowerCase();
    const notes = TL_Orchestrator_value_(values, "notes").toLowerCase();
    return status === "blocked" || notes.indexOf("depends_on") !== -1 || notes.indexOf("dependency") !== -1;
  }, TL_MENU.MAX_PENDING_SUMMARY);
  return TL_Menu_BuildSummaryBlock_("משימות חסומות", rows, "אין כרגע משימות חסומות.");
}
