/**
 * TL_TestOrchestratorGrouping
 *
 * Deterministic tests for DealWise WhatsApp burst grouping.
 */

function TL_TestOrchestratorGrouping_RunAll() {
  return {
    sealed_burst: TL_TestOrchestratorGrouping_SealedBurstRun(),
    split_by_max_window: TL_TestOrchestratorGrouping_SplitByMaxWindowRun(),
    ignore_unsealed: TL_TestOrchestratorGrouping_IgnoreUnsealedRun(),
    skip_existing_group: TL_TestOrchestratorGrouping_SkipExistingGroupRun(),
    build_synthesis: TL_TestOrchestratorGrouping_BuildSynthesisRun(),
    latest_business_reply_closes_loop: TL_TestOrchestratorGrouping_LatestBusinessReplyClosesLoopRun(),
    sender_closure_hint_closes_loop: TL_TestOrchestratorGrouping_SenderClosureHintClosesLoopRun(),
    raw_whatsapp_deferred: TL_TestOrchestratorGrouping_RawWhatsAppDeferredRun(),
    synthetic_packet_text: TL_TestOrchestratorGrouping_SyntheticPacketTextRun()
  };
}

function TL_TestOrchestratorGrouping_SealedBurstRun() {
  const rows = [
    TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", { text: "Hi" }),
    TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:02:00Z", { text: "Need the quote" }),
    TL_TestOrchestratorGrouping_makeRow_(4, "2026-03-26T10:04:00Z", { text: "Also installation" })
  ];
  const bursts = TL_Orchestrator_collectSealedWhatsAppBursts_(rows, {
    now: new Date("2026-03-26T10:20:00Z")
  });
  return {
    ok: bursts.length === 1 &&
      bursts[0].rows.length === 3 &&
      bursts[0].latestIncomingRow.rowNumber === 4,
    bursts: bursts.map(TL_TestOrchestratorGrouping_burstSummary_)
  };
}

function TL_TestOrchestratorGrouping_SplitByMaxWindowRun() {
  const rows = [
    TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", { text: "msg 1" }),
    TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:07:00Z", { text: "msg 2" }),
    TL_TestOrchestratorGrouping_makeRow_(4, "2026-03-26T10:14:00Z", { text: "msg 3" }),
    TL_TestOrchestratorGrouping_makeRow_(5, "2026-03-26T10:21:00Z", { text: "msg 4" })
  ];
  const bursts = TL_Orchestrator_collectSealedWhatsAppBursts_(rows, {
    now: new Date("2026-03-26T10:40:00Z")
  });
  return {
    ok: bursts.length === 2 &&
      bursts[0].rows.length === 3 &&
      bursts[1].rows.length === 1,
    bursts: bursts.map(TL_TestOrchestratorGrouping_burstSummary_)
  };
}

function TL_TestOrchestratorGrouping_IgnoreUnsealedRun() {
  const rows = [
    TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", { text: "Hi" }),
    TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:04:00Z", { text: "Still typing" })
  ];
  const bursts = TL_Orchestrator_collectSealedWhatsAppBursts_(rows, {
    now: new Date("2026-03-26T10:09:00Z")
  });
  return {
    ok: bursts.length === 0,
    bursts: bursts
  };
}

function TL_TestOrchestratorGrouping_SkipExistingGroupRun() {
  const rows = [
    TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", { text: "Hi" }),
    TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:02:00Z", { text: "Need the quote" }),
    TL_TestOrchestratorGrouping_makeRow_(4, "2026-03-26T10:20:00Z", {
      record_class: "grouped_inbound",
      direction: "outgoing",
      wa_group_id: "group_contact:CRM_TEST_1_3_msg_3",
      notes: "orchestrator=dealwise_group_synthesis;dealwise_group_latest_row=3"
    })
  ];
  const bursts = TL_Orchestrator_collectSealedWhatsAppBursts_(rows, {
    now: new Date("2026-03-26T10:30:00Z")
  });
  return {
    ok: bursts.length === 0,
    bursts: bursts
  };
}

function TL_TestOrchestratorGrouping_BuildSynthesisRun() {
  const rows = [
    TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", { text: "Hi" }),
    TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:02:00Z", { text: "Need the quote" })
  ];
  const bursts = TL_Orchestrator_collectSealedWhatsAppBursts_(rows, {
    now: new Date("2026-03-26T10:20:00Z")
  });
  const synthesis = bursts.length ? TL_Orchestrator_buildBurstSynthesis_(bursts[0], {
    promptFn: function(text) {
      return {
        priority_level: "high",
        importance_level: "high",
        urgency_flag: "true",
        needs_owner_now: "true",
        suggested_action: "reply_now",
        summary: "Client asked for the quote.",
        proposal: "Thanks, I'll send the quote shortly."
      };
    }
  }) : null;
  return {
    ok: !!synthesis &&
      String(synthesis.row.record_class || "") === "grouped_inbound" &&
      String(synthesis.row.wa_group_id || "").indexOf("group_") === 0 &&
      String(synthesis.row.notes || "").indexOf("dealwise_group_latest_row=3") !== -1 &&
      String(synthesis.row.ai_proposal || "") === "Thanks, I'll send the quote shortly.",
    row: synthesis ? synthesis.row : null
  };
}

function TL_TestOrchestratorGrouping_LatestBusinessReplyClosesLoopRun() {
  const rows = [
    TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", { text: "Need the quote" }),
    TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:02:00Z", {
      direction: "outgoing",
      sender: "972500000111",
      receiver: "972544444444",
      text: "I will send it shortly"
    })
  ];
  const burst = {
    personKey: "contact:CRM_TEST_1",
    rows: [rows[0]],
    latestIncomingRow: rows[0],
    conversationRows: rows
  };
  const synthesis = TL_Orchestrator_buildBurstSynthesis_(burst, {
    promptFn: function(text) {
      return {
        priority_level: "high",
        importance_level: "high",
        urgency_flag: "true",
        needs_owner_now: "true",
        suggested_action: "reply_now",
        summary: "The contact asked for the quote.",
        proposal: "Thanks, I will send it shortly."
      };
    }
  });
  return {
    ok: !!synthesis &&
      String(synthesis.row.response_expected || "").toLowerCase() === "false" &&
      String(synthesis.row.approval_status || "").toLowerCase() === "not_needed" &&
      String(synthesis.row.resolved_reason || "").toLowerCase() === "no_reply_needed",
    row: synthesis ? synthesis.row : null
  };
}

function TL_TestOrchestratorGrouping_SenderClosureHintClosesLoopRun() {
  const rows = [
    TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", { text: "Need the quote" }),
    TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:02:00Z", {
      direction: "outgoing",
      sender: "972500000111",
      receiver: "972544444444",
      text: "I will send it shortly"
    }),
    TL_TestOrchestratorGrouping_makeRow_(4, "2026-03-26T10:04:00Z", {
      text: "Never mind, I found the solution"
    })
  ];
  const bursts = TL_Orchestrator_collectSealedWhatsAppBursts_(rows, {
    now: new Date("2026-03-26T10:20:00Z")
  });
  const synthesis = bursts.length > 1 ? TL_Orchestrator_buildBurstSynthesis_(bursts[1], {
    promptFn: function(text) {
      return {
        priority_level: "high",
        importance_level: "high",
        urgency_flag: "true",
        needs_owner_now: "true",
        suggested_action: "reply_now",
        summary: "The contact says they found the solution.",
        proposal: "Glad it worked out."
      };
    }
  }) : null;
  return {
    ok: bursts.length === 2 &&
      !!synthesis &&
      String(synthesis.row.response_expected || "").toLowerCase() === "false" &&
      String(synthesis.row.text || "").toLowerCase().indexOf("never mind") !== -1,
    bursts: bursts.map(TL_TestOrchestratorGrouping_burstSummary_),
    row: synthesis ? synthesis.row : null
  };
}

function TL_TestOrchestratorGrouping_RawWhatsAppDeferredRun() {
  const rawIncoming = TL_TestOrchestratorGrouping_makeRow_(2, "2026-03-26T10:00:00Z", {
    record_class: "communication",
    direction: "incoming",
    channel: "whatsapp"
  });
  const grouped = TL_TestOrchestratorGrouping_makeRow_(3, "2026-03-26T10:10:00Z", {
    record_class: "grouped_inbound",
    direction: "outgoing",
    channel: "whatsapp"
  });
  const rawPolicy = typeof TL_AI_TriagePolicyForInboxRowValues_ === "function"
    ? TL_AI_TriagePolicyForInboxRowValues_(rawIncoming.values)
    : null;
  const groupedPolicy = typeof TL_AI_TriagePolicyForInboxRowValues_ === "function"
    ? TL_AI_TriagePolicyForInboxRowValues_(grouped.values)
    : null;
  return {
    ok: !!rawPolicy && rawPolicy.defer === true &&
      !!groupedPolicy && groupedPolicy.defer === false,
    rawPolicy: rawPolicy,
    groupedPolicy: groupedPolicy
  };
}

function TL_TestOrchestratorGrouping_SyntheticPacketTextRun() {
  const syntheticText = "Do you want to approve the following items? Total Items:5 Urgent:5 1. Yes, approve all 2. Only some 3. Give me one by one 4. Group smartly for me 5. Reject for now 6. Return to main menu";
  const normalText = "Can you send me the updated quote today?";
  const synthetic = typeof TL_DraftContext_isSyntheticWhatsAppSystemText_ === "function"
    ? TL_DraftContext_isSyntheticWhatsAppSystemText_(syntheticText)
    : false;
  const normal = typeof TL_DraftContext_isSyntheticWhatsAppSystemText_ === "function"
    ? TL_DraftContext_isSyntheticWhatsAppSystemText_(normalText)
    : true;
  return {
    ok: synthetic === true && normal === false,
    synthetic: synthetic,
    normal: normal
  };
}

function TL_TestOrchestratorGrouping_makeRow_(rowNumber, isoTimestamp, overrides) {
  const headers = TL_WEBHOOK && TL_WEBHOOK.INBOX_HEADERS ? TL_WEBHOOK.INBOX_HEADERS : TL_INBOX.HEADERS;
  const base = {
    timestamp: new Date(isoTimestamp),
    root_id: "root_test_grouping",
    event_id: "EVT_TEST_" + rowNumber,
    parent_event_id: "",
    record_id: "REC_TEST_" + rowNumber,
    record_version: 1,
    record_class: "communication",
    channel: "whatsapp",
    direction: "incoming",
    phone_number_id: "896133996927016",
    display_phone_number: "972500000111",
    sender: "972544444444",
    receiver: "972500000111",
    message_id: "msg_" + rowNumber,
    message_type: "text",
    text: "",
    ai_summary: "",
    ai_proposal: "",
    approval_required: "",
    approval_status: "",
    execution_status: "",
    status_latest: "",
    status_timestamp: "",
    statuses_count: 0,
    contact_id: "CRM_TEST_1",
    wa_group_id: "",
    raw_payload_ref: "",
    notes: "",
    task_due: "",
    task_status: "",
    task_priority: "",
    topic_id: "topic_test",
    topic_tagged_at: "",
    biz_stage: "",
    biz_stage_ts: "",
    payment_status: "",
    delivery_due: "",
    media_id: "",
    media_mime_type: "",
    media_sha256: "",
    media_caption: "",
    media_filename: "",
    media_is_voice: false,
    priority_level: "",
    importance_level: "",
    urgency_flag: "",
    needs_owner_now: "",
    suggested_action: "",
    thread_id: "",
    thread_subject: "",
    latest_message_at: "",
    external_url: "",
    participants_json: "",
    capture_language: ""
  };
  const rowObj = Object.assign(base, overrides || {});
  return {
    rowNumber: rowNumber,
    values: headers.map(function(header) {
      return rowObj[header] !== undefined ? rowObj[header] : "";
    })
  };
}

function TL_TestOrchestratorGrouping_burstSummary_(burst) {
  return {
    personKey: burst.personKey,
    firstRow: burst.rows && burst.rows[0] ? burst.rows[0].rowNumber : 0,
    latestRow: burst.latestIncomingRow ? burst.latestIncomingRow.rowNumber : 0,
    size: burst.rows ? burst.rows.length : 0
  };
}
