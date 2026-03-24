function TL_TestBossTurn_RunAll() {
  return {
    packet: TL_TestBossTurn_PacketRun(),
    prompt_brief: TL_TestBossTurn_PromptBriefRun()
  };
}

function TL_TestBossTurn_PacketRun() {
  const rows = [
    {
      rowNumber: 5,
      values: TL_TestBossTurn_buildValues_({
        timestamp: "2026-03-24T10:00:00.000Z",
        latest_message_at: "2026-03-24T10:00:00.000Z",
        record_id: "REC_1",
        record_version: 1,
        record_class: "proposal",
        channel: "whatsapp",
        direction: "incoming",
        sender: "972501111111",
        receiver: "972506847373",
        contact_id: "CI_1",
        ai_summary: "Client is waiting for missing documents.",
        approval_status: "awaiting_approval",
        execution_status: "proposal_ready",
        suggested_action: "reply_now",
        topic_id: "topic_documents_needed"
      })
    },
    {
      rowNumber: 4,
      values: TL_TestBossTurn_buildValues_({
        timestamp: "2026-03-24T09:00:00.000Z",
        latest_message_at: "2026-03-24T09:00:00.000Z",
        record_id: "REC_2",
        record_version: 1,
        record_class: "communication",
        channel: "email",
        direction: "incoming",
        sender: "dana@example.com",
        receiver: "reuven@example.com",
        contact_id: "CI_2",
        thread_id: "THREAD_1",
        thread_subject: "Mortgage approval",
        ai_summary: "Bank requested one more document.",
        suggested_action: "follow_up",
        topic_id: "topic_bank_response"
      })
    }
  ];

  const packet = TL_BossTurn_BuildPacket_({
    turn_id: "TURN_1",
    timestamp: "2026-03-24T11:00:00.000Z",
    wa_id: "972500000999",
    message_text: "tell john I will join tomorrow"
  }, {
    rows: rows,
    currentState: {
      menu_state: "manage_work",
      has_open_packet: true,
      packet_kind: "decision",
      packet_stage: "one_by_one",
      packet_cursor: 1,
      packet_size: 3
    },
    contactsIndex: {
      byContactId: {
        CI_1: { contactId: "CI_1", name: "John Cohen" },
        CI_2: { contactId: "CI_2", name: "Dana Banker" }
      },
      byPhone: {},
      byEmail: {
        "dana@example.com": { contactId: "CI_2", name: "Dana Banker" }
      }
    },
    capabilityPacket: {
      contract: "BossCapabilityPacket",
      version: "v1",
      policy: {
        stateless_ai_assumption: true,
        approval_required_for_external_execution: true,
        retrieval_budget_max: 2,
        active_item_state_supported: false
      },
      summary: {
        available: ["QUERY_CONTACTS_SEARCH","SEND_APPROVED_EMAIL"],
        limited: [],
        planned: ["ACTIVE_ITEM_STATE"]
      },
      capabilities: []
    }
  });

  return {
    ok: packet.contract === "BossTurnPacket" &&
      packet.boss_turn.turn_id === "TURN_1" &&
      packet.current_state.menu_state === "manage_work" &&
      packet.pending_items_summary.length === 1 &&
      packet.recent_memory.recent_contacts.length === 2 &&
      packet.recent_memory.recent_records.length === 2 &&
      packet.recent_memory.recent_threads.length === 1 &&
      packet.policy.retrieval_budget_max === 2 &&
      packet.active_item.item_id === null,
    packet: packet
  };
}

function TL_TestBossTurn_PromptBriefRun() {
  const brief = TL_BossTurn_BuildPromptBrief_({
    boss_turn: {
      message_text: "show me my approvals"
    },
    current_state: {
      menu_state: "root",
      has_open_packet: false
    },
    pending_items_summary: [
      { label: "Pending approval" }
    ],
    recent_memory: {
      recent_contacts: [
        { name: "Dana Banker" }
      ]
    },
    capability_packet: {
      summary: {
        available: ["QUERY_CONTACTS_SEARCH","SEND_APPROVED_EMAIL"]
      }
    },
    policy: {
      active_item_state_supported: false
    }
  });

  return {
    ok: brief.indexOf("Current Boss turn packet:") !== -1 &&
      brief.indexOf("message=show me my approvals") !== -1 &&
      brief.indexOf("recent_contacts=Dana Banker") !== -1 &&
      brief.indexOf("available_capabilities=QUERY_CONTACTS_SEARCH, SEND_APPROVED_EMAIL") !== -1,
    brief: brief
  };
}

function TL_TestBossTurn_buildValues_(overrides) {
  const base = {};
  (TL_WEBHOOK.INBOX_HEADERS || []).forEach(function(header) {
    base[header] = "";
  });
  Object.keys(overrides || {}).forEach(function(key) {
    base[key] = overrides[key];
  });
  return (TL_WEBHOOK.INBOX_HEADERS || []).map(function(header) {
    return base[header];
  });
}
