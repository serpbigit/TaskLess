function TL_TestActiveItem_RunAll() {
  return {
    storage: TL_TestActiveItem_StorageRun(),
    boss_turn_packet: TL_TestActiveItem_BossTurnPacketRun(),
    pause_current: TL_TestActiveItem_PauseCurrentRun(),
    resume_latest: TL_TestActiveItem_ResumeLatestRun()
  };
}

function TL_TestActiveItem_StorageRun() {
  const waId = "972500001111";
  try {
    TL_ActiveItem_Set_(waId, {
      kind: "contact_lookup",
      status: "active",
      contact_query: "Dana",
      resolved_contact_name: "Dana Banker"
    });
    const current = TL_ActiveItem_Get_(waId);
    const ok = !!current &&
      current.kind === "contact_lookup" &&
      current.contact_query === "Dana" &&
      current.resolved_contact_name === "Dana Banker";
    return {
      ok: ok,
      current: current
    };
  } finally {
    TL_ActiveItem_Clear_(waId);
  }
}

function TL_TestActiveItem_BossTurnPacketRun() {
  const waId = "972500001112";
  try {
    TL_ActiveItem_Set_(waId, {
      item_id: "AI_TEST_1",
      kind: "context_lookup",
      status: "active",
      contact_query: "Dana",
      topic_id: "topic_documents_needed",
      resolved_contact_name: "Dana Banker",
      resolved_topic_summary: "Missing documents"
    });
    const packet = TL_BossTurn_BuildPacket_({
      turn_id: "TURN_ACTIVE_1",
      wa_id: waId,
      message_text: "about documents"
    }, {
      rows: [],
      currentState: {
        menu_state: "root",
        has_open_packet: false
      },
      capabilityPacket: TL_Capabilities_BuildBossPacket_({ nowIso: "2026-03-24T12:00:00.000Z" })
    });
    return {
      ok: packet.active_item &&
        packet.active_item.item_id === "AI_TEST_1" &&
        packet.policy.active_item_state_supported === true,
      packet: packet
    };
  } finally {
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestActiveItem_PauseCurrentRun() {
  const waId = "972500001113";
  try {
    TL_ActiveItem_Set_(waId, {
      item_id: "AI_PAUSE_1",
      kind: "context_lookup",
      status: "active",
      contact_query: "Dana",
      topic_id: "topic_documents_needed",
      resolved_contact_name: "Dana Banker"
    });
    const result = TL_ActiveItem_PauseCurrent_(waId, "new_intent:show_capabilities");
    const active = TL_ActiveItem_Get_(waId);
    const paused = TL_ActiveItem_GetPaused_(waId);
    return {
      ok: !!result &&
        result.paused === true &&
        !active &&
        paused.length === 1 &&
        paused[0].item_id === "AI_PAUSE_1" &&
        paused[0].status === "paused" &&
        paused[0].pause_reason === "new_intent:show_capabilities",
      result: result,
      paused: paused
    };
  } finally {
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestActiveItem_ResumeLatestRun() {
  const waId = "972500001114";
  try {
    TL_ActiveItem_Set_(waId, {
      item_id: "AI_RESUME_1",
      kind: "context_lookup",
      status: "active",
      contact_query: "Dana",
      topic_id: "topic_documents_needed",
      resolved_contact_name: "Dana Banker"
    });
    TL_ActiveItem_PauseCurrent_(waId, "new_intent:show_capabilities");
    const result = TL_ActiveItem_ResumeLatest_(waId);
    const active = TL_ActiveItem_Get_(waId);
    const paused = TL_ActiveItem_GetPaused_(waId);
    return {
      ok: !!result &&
        result.resumed === true &&
        !!active &&
        active.item_id === "AI_RESUME_1" &&
        active.status === "active" &&
        paused.length === 0,
      result: result,
      active: active
    };
  } finally {
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}
