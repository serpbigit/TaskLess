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
