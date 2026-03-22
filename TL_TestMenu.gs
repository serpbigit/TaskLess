/**
 * TL_TestMenu - manual test harness for the boss menu.
 * Run from Apps Script UI: Run -> TL_TestMenu
 */
function TL_TestMenu() {
  const testPhoneId = "896133996927016"; // set to your business phone_number_id if different
  const testFrom = "972552630035";       // set to your boss number or any test number
  const testText = "תפריט";

  const fakeEvent = {
    event_type: "messages",
    message_type: "text",
    phone_number_id: testPhoneId,
    from: testFrom,
    recipient_id: "",
    message_id: "test-menu-" + Date.now(),
    text: testText
  };

  const menuReply = TLW_tryBossMenu_([fakeEvent]);
  Logger.log("Menu reply object: %s", JSON.stringify(menuReply, null, 2));

  if (menuReply && menuReply.toSend) {
    const sent = TLW_sendText_(menuReply.toPhoneId, menuReply.toWaId, menuReply.text);
    Logger.log("Send result: %s", JSON.stringify(sent));
  } else {
    Logger.log("No menu reply produced.");
  }
}

function TL_Debug_MenuLanguage() {
  const scriptProperty = String(PropertiesService.getScriptProperties().getProperty("AI_DEFAULT_LANGUAGE") || "");
  const resolvedSetting = String(TLW_getSetting_("AI_DEFAULT_LANGUAGE") || "");
  const menuIsEnglish = typeof TL_Menu_IsEnglishUi_ === "function" ? TL_Menu_IsEnglishUi_() : null;
  const rawBossLanguage = typeof TL_Menu_BossLanguage_ === "function" ? TL_Menu_BossLanguage_() : resolvedSetting;

  const out = {
    scriptProperty: scriptProperty,
    resolvedSetting: resolvedSetting,
    rawBossLanguage: rawBossLanguage,
    menuIsEnglish: menuIsEnglish
  };

  Logger.log("TL_Debug_MenuLanguage %s", JSON.stringify(out, null, 2));
  try { console.log("TL_Debug_MenuLanguage", JSON.stringify(out)); } catch (e) {}
  return out;
}
