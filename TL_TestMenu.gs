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

function TL_TestMenu_PassiveRootHandling() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");

  if (typeof TL_Menu_ResetSession_ === "function") {
    TL_Menu_ResetSession_(bossPhone);
  } else if (typeof TL_Menu_ClearState_ === "function") {
    TL_Menu_ClearState_(bossPhone);
  }
  if (typeof TL_Menu_MarkOnboarded_ === "function") {
    TL_Menu_MarkOnboarded_(bossPhone);
  }

  const result = {
    ok: true,
    boss_phone: bossPhone,
    arbitrary_text: TL_Menu_ShouldHandleText_(bossPhone, "how are things"),
    attention_query: TL_Menu_ShouldHandleText_(bossPhone, "what needs attention"),
    menu_trigger: TL_Menu_ShouldHandleText_(bossPhone, "menu"),
    help_trigger: TL_Menu_ShouldHandleText_(bossPhone, "help")
  };
  result.ok = result.arbitrary_text === false &&
    result.attention_query === false &&
    result.menu_trigger === true &&
    result.help_trigger === true;
  Logger.log("TL_TestMenu_PassiveRootHandling: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestMenu_FirstUseWelcome() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");
  if (typeof TL_Menu_ResetSession_ === "function") TL_Menu_ResetSession_(bossPhone);
  PropertiesService.getScriptProperties().deleteProperty(TL_MENU.ONBOARDED_KEY_PREFIX + bossPhone);
  const reply = TL_Menu_HandleBossMessage_({
    from: bossPhone,
    text: "hello",
    recipient_id: "",
    phone_number_id: "896133996927016"
  }, null, {});
  const onboarded = typeof TL_Menu_IsFirstUse_ === "function" ? !TL_Menu_IsFirstUse_(bossPhone) : false;
  const ok = onboarded && String(reply || "").toLowerCase().indexOf("choose an option") !== -1;
  const out = { ok: ok, onboarded: onboarded, reply_preview: String(reply || "").slice(0, 160) };
  Logger.log("TL_TestMenu_FirstUseWelcome: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_StaleFlowCleanup() {
  const waId = "972500000001";
  const props = PropertiesService.getScriptProperties();
  TL_Menu_SetState_(waId, TL_MENU_STATES.CAPABILITIES);
  props.setProperty(TL_MENU.STATE_META_KEY_PREFIX + waId, JSON.stringify({
    state: TL_MENU_STATES.CAPABILITIES,
    updated_at: "2025-01-01T00:00:00.000Z",
    session_version: "old_version"
  }));
  props.setProperty(TL_MENU.PACKET_KEY_PREFIX + waId, JSON.stringify({
    kind: "capture",
    stage: "one_by_one",
    cursor: 0,
    created_at: "2025-01-01T00:00:00.000Z",
    session_version: "old_version",
    items: [{ key: "x", rowNumber: 1 }]
  }));
  TL_ActiveItem_Set_(waId, { item_id: "AI_test", kind: "capture_item" });
  props.setProperty(TL_ACTIVE_ITEM.KEY_PREFIX + waId, JSON.stringify({
    item_id: "AI_test",
    wa_id: waId,
    kind: "capture_item",
    status: "active",
    opened_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    session_version: "old_version"
  }));
  const hasFlow = TL_Menu_HasActiveFlow_(waId);
  const packet = TL_Menu_GetDecisionPacket_(waId);
  const active = TL_ActiveItem_Get_(waId);
  const state = TL_Menu_GetState_(waId);
  const out = {
    ok: hasFlow === false && !packet && !active && state === TL_MENU_STATES.ROOT,
    hasFlow: hasFlow,
    packet: !!packet,
    active: !!active,
    state: state
  };
  Logger.log("TL_TestMenu_StaleFlowCleanup: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_MenuCommandClearsPacket() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");
  if (typeof TL_Menu_ResetSession_ === "function") TL_Menu_ResetSession_(bossPhone);
  TL_Menu_MarkOnboarded_(bossPhone);
  TL_ActiveItem_Set_(bossPhone, {
    item_id: "AI_contact_lookup_test",
    kind: "contact_lookup",
    capture_kind: "contact_enrichment",
    status: "active",
    source_text: "old active item"
  });
  TL_Menu_SetDecisionPacket_(bossPhone, {
    kind: "decision",
    stage: "one_by_one",
    cursor: 0,
    created_at: new Date().toISOString(),
    session_version: typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : "test",
    items: [{ key: "x", rowNumber: 123, proposal: "test", summary: "test", channel: "whatsapp", captureKind: "whatsapp" }]
  });
  const menuReply = TL_Menu_HandleBossMessage_({
    from: bossPhone,
    text: "menu",
    recipient_id: "",
    phone_number_id: "896133996927016"
  }, null, {});
  const packetAfterMenu = TL_Menu_GetDecisionPacket_(bossPhone);
  const oneReply = TL_Menu_HandleBossMessage_({
    from: bossPhone,
    text: "1",
    recipient_id: "",
    phone_number_id: "896133996927016"
  }, null, {});
  const out = {
    ok: !packetAfterMenu && String(oneReply || "").toLowerCase().indexOf("one-on-one review") === -1,
    packet_after_menu: !!packetAfterMenu,
    active_after_menu: !!TL_ActiveItem_Get_(bossPhone),
    menu_preview: String(menuReply || "").slice(0, 120),
    one_preview: String(oneReply || "").slice(0, 160)
  };
  Logger.log("TL_TestMenu_MenuCommandClearsPacket: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_FreshRootNumericChoiceIsHandled() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");
  if (typeof TL_Menu_ResetSession_ === "function") TL_Menu_ResetSession_(bossPhone);
  TL_Menu_MarkOnboarded_(bossPhone);
  TL_Menu_SetState_(bossPhone, TL_MENU_STATES.ROOT, {
    source: "menu_command",
    updated_at: new Date().toISOString()
  });
  const shouldHandle = TL_Menu_ShouldHandleText_(bossPhone, "1");
  const reply = TL_Menu_HandleBossMessage_({
    from: bossPhone,
    text: "1",
    recipient_id: "",
    phone_number_id: "896133996927016"
  }, null, {});
  const out = {
    ok: shouldHandle === true && String(reply || "").toLowerCase().indexOf("one-on-one review") === -1,
    should_handle: shouldHandle,
    reply_preview: String(reply || "").slice(0, 160)
  };
  Logger.log("TL_TestMenu_FreshRootNumericChoiceIsHandled: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_IsRecentIso_DefaultsToNow() {
  const iso = new Date(Date.now() - (60 * 1000)).toISOString();
  const recent = TL_Menu_IsRecentIso_(iso, 3);
  const stale = TL_Menu_IsRecentIso_(iso, 0);
  const out = {
    ok: recent === true && stale === false,
    recent: recent,
    stale: stale,
    sample_iso: iso
  };
  Logger.log("TL_TestMenu_IsRecentIso_DefaultsToNow: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_PacketReplyBeatsFreshRootChoice() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");
  if (typeof TL_Menu_ResetSession_ === "function") TL_Menu_ResetSession_(bossPhone);
  TL_Menu_MarkOnboarded_(bossPhone);
  TL_Menu_SetState_(bossPhone, TL_MENU_STATES.ROOT, {
    source: "menu_command",
    updated_at: new Date().toISOString()
  });
  TL_Menu_SetDecisionPacket_(bossPhone, {
    kind: "decision",
    stage: "one_by_one",
    cursor: 0,
    created_at: new Date().toISOString(),
    session_version: typeof TL_Menu_SessionRuntimeVersion_ === "function" ? TL_Menu_SessionRuntimeVersion_() : "test",
    items: [{
      key: "pkt_1",
      rowNumber: 999,
      recordId: "REC_test",
      recordClass: "grouped_inbound",
      channel: "whatsapp",
      channelLabel: "whatsapp / grouped_inbound",
      sender: "972500000000",
      senderLabel: "972500000000",
      summary: "Needs reply",
      proposal: "Draft reply",
      rawSnippet: "Original message",
      approvalStatus: "awaiting_approval",
      executionStatus: "awaiting_approval",
      taskStatus: "pending",
      captureKind: "",
      isUrgent: true,
      isHigh: true
    }]
  });
  const reply = TL_Menu_HandleBossMessage_({
    from: bossPhone,
    text: "1",
    recipient_id: "",
    phone_number_id: "896133996927016"
  }, null, {});
  const out = {
    ok: String(reply || "").indexOf("Draft reply") !== -1 || String(reply || "").indexOf("Needs reply") !== -1,
    reply_preview: String(reply || "").slice(0, 220)
  };
  Logger.log("TL_TestMenu_PacketReplyBeatsFreshRootChoice: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_RefreshWhatsAppReplyPacketItem_SkipsHandledThread() {
  const groupedValues = TL_INBOX.HEADERS.map(function() { return ""; });
  groupedValues[TL_colIndex_("channel") - 1] = "whatsapp";
  groupedValues[TL_colIndex_("record_class") - 1] = "grouped_inbound";
  groupedValues[TL_colIndex_("direction") - 1] = "incoming";
  groupedValues[TL_colIndex_("display_phone_number") - 1] = "972506847373";
  groupedValues[TL_colIndex_("sender") - 1] = "972506847363";
  groupedValues[TL_colIndex_("receiver") - 1] = "972506847373";
  groupedValues[TL_colIndex_("contact_id") - 1] = "WA_896133996927016_972506847363";
  groupedValues[TL_colIndex_("notes") - 1] = "wa_contact_name=Nechama";

  function makeRow(rowNumber, direction, sender, receiver, text) {
    const values = TL_INBOX.HEADERS.map(function() { return ""; });
    values[TL_colIndex_("channel") - 1] = "whatsapp";
    values[TL_colIndex_("record_class") - 1] = "communication";
    values[TL_colIndex_("direction") - 1] = direction;
    values[TL_colIndex_("display_phone_number") - 1] = "972506847373";
    values[TL_colIndex_("sender") - 1] = sender;
    values[TL_colIndex_("receiver") - 1] = receiver;
    values[TL_colIndex_("contact_id") - 1] = "WA_896133996927016_972506847363";
    values[TL_colIndex_("text") - 1] = text;
    values[TL_colIndex_("notes") - 1] = "wa_contact_name=Nechama";
    return { rowNumber: rowNumber, values: values };
  }

  const rows = [
    makeRow(1, "incoming", "972506847363", "972506847373", "מה שלום מיכל?"),
    makeRow(2, "outgoing", "972506847373", "972506847363", "היי נחמה, תודה על העדכון לגבי מיכל.")
  ];
  const packetItem = {
    rowNumber: 10,
    contactId: "WA_896133996927016_972506847363",
    sender: "972506847373",
    senderLabel: "972506847373",
    rawSnippet: "old",
    summary: "old",
    proposal: "old"
  };
  const refreshed = TL_Menu_RefreshWhatsAppReplyPacketItem_(packetItem, groupedValues, rows, {
    byContactId: {
      "WA_896133996927016_972506847363": { display_name: "Nechama" }
    }
  });
  const out = {
    ok: refreshed === null,
    refreshed: refreshed
  };
  Logger.log("TL_TestMenu_RefreshWhatsAppReplyPacketItem_SkipsHandledThread: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_PreparedBossSnapshotsRoundTrip() {
  if (typeof TL_Menu_ClearPreparedBossSnapshots_ === "function") {
    TL_Menu_ClearPreparedBossSnapshots_();
  }
  const approvalsSet = typeof TL_Menu_SetPreparedApprovalsPacket_ === "function"
    ? TL_Menu_SetPreparedApprovalsPacket_([{ rowNumber: 1, channel: "whatsapp" }], { source: "test" })
    : null;
  const opportunitiesSet = typeof TL_Menu_SetPreparedOpportunitiesPacket_ === "function"
    ? TL_Menu_SetPreparedOpportunitiesPacket_([{ rowNumber: 2, channel: "whatsapp" }], { source: "test" })
    : null;
  const approvals = typeof TL_Menu_GetPreparedApprovalsPacket_ === "function"
    ? TL_Menu_GetPreparedApprovalsPacket_()
    : null;
  const opportunities = typeof TL_Menu_GetPreparedOpportunitiesPacket_ === "function"
    ? TL_Menu_GetPreparedOpportunitiesPacket_()
    : null;
  const out = {
    ok: !!(approvalsSet && opportunitiesSet && approvals && opportunities &&
      Array.isArray(approvals.items) && approvals.items.length === 1 &&
      Array.isArray(opportunities.items) && opportunities.items.length === 1),
    approvals_count: approvals && Array.isArray(approvals.items) ? approvals.items.length : 0,
    opportunities_count: opportunities && Array.isArray(opportunities.items) ? opportunities.items.length : 0
  };
  Logger.log("TL_TestMenu_PreparedBossSnapshotsRoundTrip: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_GetDecisionPacketReplyOptions_Multi() {
  const out = {
    ok: false,
    options: TL_Menu_GetDecisionPacketReplyOptions_({
      channel: "whatsapp",
      proposal: "Default reply",
      proposalOptions: ["Option A", "Option B", "Option C"]
    })
  };
  out.ok = Array.isArray(out.options) && out.options.length === 3 && out.options[0] === "Option A";
  Logger.log("TL_TestMenu_GetDecisionPacketReplyOptions_Multi: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_DecisionPacketRoundTrip_PreservesProposalOptions() {
  const waId = "972552630035";
  TL_Menu_ClearDecisionPacket_(waId);
  TL_Menu_SetDecisionPacket_(waId, {
    kind: "decision",
    stage: "one_by_one",
    cursor: 0,
    created_at: new Date().toISOString(),
    items: [{
      rowNumber: 68,
      channel: "whatsapp",
      summary: "Client asks for a meeting later today.",
      proposal: "Yes, I can join later today.",
      proposalOptions: ["Yes, I can join later today.", "What time works for you?", "I can't today, can we move it?"]
    }]
  });
  const packet = TL_Menu_GetDecisionPacket_(waId);
  const out = {
    ok: !!(packet && packet.items && packet.items[0] && Array.isArray(packet.items[0].proposalOptions) && packet.items[0].proposalOptions.length === 3),
    option_count: packet && packet.items && packet.items[0] && Array.isArray(packet.items[0].proposalOptions)
      ? packet.items[0].proposalOptions.length
      : 0
  };
  Logger.log("TL_TestMenu_DecisionPacketRoundTrip_PreservesProposalOptions: %s", JSON.stringify(out, null, 2));
  TL_Menu_ClearDecisionPacket_(waId);
  return out;
}

function TL_TestMenu_StaleInteractionDefaultsToMenu() {
  const waId = "972552630035";
  PropertiesService.getScriptProperties().setProperty("BOSS_CONTEXT_RESTART_MINUTES", "15");
  PropertiesService.getScriptProperties().setProperty(TL_MENU.LAST_INTERACTION_KEY_PREFIX + waId, JSON.stringify({
    at: new Date(Date.now() - (16 * 60 * 1000)).toISOString(),
    text: "old",
    session_version: TL_Menu_SessionRuntimeVersion_()
  }));
  TL_Menu_ResetSession_(waId);
  const out = {
    ok: TL_Menu_ShouldDefaultToMenuOnStaleInteraction_(waId, "h", Date.now()) === true
  };
  Logger.log("TL_TestMenu_StaleInteractionDefaultsToMenu: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_EndCommandCreatesIdleStandby() {
  const waId = "972552630035";
  TL_Menu_ResetSession_(waId);
  TL_Menu_MarkOnboarded_(waId);
  TL_Menu_SetState_(waId, TL_MENU_STATES.ROOT, { source: "menu_command" });
  const reply = TL_Menu_HandleBossMessage_({
    from: waId,
    text: "end",
    recipient_id: "",
    phone_number_id: "896133996927016"
  }, null, {});
  const out = {
    ok: TL_Menu_IsIdleSession_(waId) === true && String(reply || "").toLowerCase().indexOf("standby") !== -1,
    idle: TL_Menu_IsIdleSession_(waId),
    reply_preview: String(reply || "").slice(0, 160)
  };
  Logger.log("TL_TestMenu_EndCommandCreatesIdleStandby: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_IdleWakeReturnsMainMenu() {
  const waId = "972552630035";
  TL_Menu_ResetSession_(waId);
  TL_Menu_MarkOnboarded_(waId);
  TL_Menu_SetIdleSession_(waId);
  const reply = TL_Menu_HandleBossMessage_({
    from: waId,
    text: "h",
    recipient_id: "",
    phone_number_id: "896133996927016"
  }, null, {});
  const stateMeta = TL_Menu_GetStateMeta_(waId) || {};
  const out = {
    ok: TL_Menu_IsIdleSession_(waId) === false &&
      String(stateMeta.source || "").trim() === "idle_wake" &&
      String(reply || "").toLowerCase().indexOf("choose an option") !== -1,
    idle_after: TL_Menu_IsIdleSession_(waId),
    state_source: String(stateMeta.source || "").trim(),
    reply_preview: String(reply || "").slice(0, 160)
  };
  Logger.log("TL_TestMenu_IdleWakeReturnsMainMenu: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_GlobalCommandsAreCaseInsensitive() {
  const out = {
    ok: TL_Menu_IsMenuCommand_("Menu") === true &&
      TL_Menu_IsMenuCommand_("menu") === true &&
      TL_Menu_IsHelpCommand_("Help") === true &&
      TL_Menu_IsBackCommand_("Back") === true &&
      TL_Menu_IsEndCommand_("End") === true,
    menu_upper: TL_Menu_IsMenuCommand_("Menu"),
    menu_lower: TL_Menu_IsMenuCommand_("menu"),
    help_upper: TL_Menu_IsHelpCommand_("Help"),
    back_upper: TL_Menu_IsBackCommand_("Back"),
    end_upper: TL_Menu_IsEndCommand_("End")
  };
  Logger.log("TL_TestMenu_GlobalCommandsAreCaseInsensitive: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_HardCommandFastMenu() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");
  if (typeof TL_Menu_ResetSession_ === "function") TL_Menu_ResetSession_(bossPhone);
  const reply = TL_Menu_HandleHardCommandFast_(bossPhone, "menu");
  const out = {
    ok: !!reply &&
      String(reply.command || "") === "menu" &&
      !!reply.should_warm &&
      String(reply.reply_text || "").toLowerCase().indexOf("choose an option") !== -1,
    reply: reply
  };
  Logger.log("TL_TestMenu_HardCommandFastMenu: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_HardCommandFastEnd() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");
  const reply = TL_Menu_HandleHardCommandFast_(bossPhone, "end");
  const out = {
    ok: !!reply &&
      String(reply.command || "") === "end" &&
      !reply.should_warm &&
      String(reply.reply_text || "").toLowerCase().indexOf("standby") !== -1,
    reply: reply,
    idle: typeof TL_Menu_IsIdleSession_ === "function" ? TL_Menu_IsIdleSession_(bossPhone) : null
  };
  Logger.log("TL_TestMenu_HardCommandFastEnd: %s", JSON.stringify(out, null, 2));
  return out;
}

function TL_TestMenu_PassiveWakeFastMenu() {
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  if (!bossPhone) throw new Error("Missing BOSS_PHONE");
  if (typeof TL_Menu_ResetSession_ === "function") TL_Menu_ResetSession_(bossPhone);
  if (typeof TL_Menu_SetIdleSession_ === "function") TL_Menu_SetIdleSession_(bossPhone);
  const reply = TL_Menu_HandlePassiveWakeFast_(bossPhone, "x");
  const out = {
    ok: !!reply &&
      String(reply.command || "") === "idle_wake" &&
      !!reply.should_warm &&
      String(reply.reply_text || "").toLowerCase().indexOf("choose an option") !== -1,
    reply: reply
  };
  Logger.log("TL_TestMenu_PassiveWakeFastMenu: %s", JSON.stringify(out, null, 2));
  return out;
}
