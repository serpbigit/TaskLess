function TL_TestCapabilities_RunAll() {
  return {
    packet: TL_TestCapabilities_PacketRun(),
    brief: TL_TestCapabilities_PromptBriefRun(),
    boss_prompt: TL_TestCapabilities_BossPromptRun()
  };
}

function TL_TestCapabilities_PacketRun() {
  const packet = TL_Capabilities_BuildBossPacket_({
    nowIso: "2026-03-24T18:00:00.000Z"
  });
  const ids = (packet.capabilities || []).map(function(item) { return item.id; });
  const contactsCapability = (packet.capabilities || []).find(function(item) {
    return item.id === "QUERY_CONTACTS_SEARCH";
  }) || {};
  const activeItemCapability = (packet.capabilities || []).find(function(item) {
    return item.id === "ACTIVE_ITEM_STATE";
  }) || {};

  return {
    ok: packet.contract === "BossCapabilityPacket" &&
      packet.version === "v1" &&
      packet.generated_at === "2026-03-24T18:00:00.000Z" &&
      packet.policy &&
      packet.policy.approval_required_for_external_execution === true &&
      ids.indexOf("QUERY_CONTACTS_SEARCH") !== -1 &&
      ids.indexOf("SEND_APPROVED_EMAIL") !== -1 &&
      contactsCapability.status === "available" &&
      activeItemCapability.status === "planned",
    packet: packet
  };
}

function TL_TestCapabilities_PromptBriefRun() {
  const brief = TL_Capabilities_BuildPromptBrief_();
  return {
    ok: brief.indexOf("Current DealWise capability packet:") !== -1 &&
      brief.indexOf("query:") !== -1 &&
      brief.indexOf("QUERY_CONTACTS_SEARCH") !== -1 &&
      brief.indexOf("SEND_APPROVED_EMAIL") !== -1 &&
      brief.indexOf("planned_not_yet_supported: ACTIVE_ITEM_STATE") !== -1,
    brief: brief
  };
}

function TL_TestCapabilities_BossPromptRun() {
  const prompt = TL_AI_buildBossIntentPrompt_("show me my approvals", "Hebrew", "Boss");
  return {
    ok: prompt.indexOf("Current DealWise capability packet:") !== -1 &&
      prompt.indexOf("QUERY_CONTACTS_SEARCH") !== -1 &&
      prompt.indexOf("active_item_state_supported=false") !== -1,
    prompt_preview: prompt.slice(0, 1200)
  };
}
