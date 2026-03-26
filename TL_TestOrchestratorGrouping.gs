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
    build_synthesis: TL_TestOrchestratorGrouping_BuildSynthesisRun()
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
      record_class: "proposal",
      direction: "outgoing",
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
      String(synthesis.row.record_class || "") === "proposal" &&
      String(synthesis.row.notes || "").indexOf("dealwise_group_latest_row=3") !== -1 &&
      String(synthesis.row.ai_proposal || "") === "Thanks, I'll send the quote shortly.",
    row: synthesis ? synthesis.row : null
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
