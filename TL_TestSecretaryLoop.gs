/**
 * TL_TestSecretaryLoop
 *
 * Deterministic GAS runners for secretary-loop-v1.
 * These helpers seed their own fixtures and avoid external AI/send calls.
 */

function TL_TestSecretaryLoop_RunAll() {
  return {
    synthesis: TL_TestSecretaryLoop_QuietWindowSynthesisRun(),
    approval: TL_TestSecretaryLoop_ApprovalTransitionRun(),
    send: TL_TestSecretaryLoop_ApprovedSendRun()
  };
}

function TL_TestSecretaryLoop_QuietWindowSynthesisRun() {
  const fixture = TL_TestSecretaryLoop_seedIncomingThread_({
    root_id: "root_secretary_synth_" + Utilities.getUuid(),
    message_id: "msg_secretary_synth_" + Utilities.getUuid(),
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000)
  });

  const synthResult = TL_Synthesis_Run(1, {
    useAi: false,
    promptFn: function(threadText, thread) {
      return {
        summary: "quiet-window-summary:" + String(thread.rootId || ""),
        proposal: "quiet-window-proposal:" + String(thread.latestIncomingRow && thread.latestIncomingRow.rowNumber ? thread.latestIncomingRow.rowNumber : "")
      };
    }
  });

  const synthesized = TL_TestSecretaryLoop_findLatestRow_(fixture.rootId, TL_ORCHESTRATOR.WHATSAPP_GROUP_RECORD_CLASS);
  const snapshot = synthesized ? synthesized.values : [];
  const result = {
    ok: !!synthesized &&
      String(snapshot[TLW_colIndex_("ai_summary") - 1] || "").indexOf("quiet-window-summary:") === 0 &&
      String(snapshot[TLW_colIndex_("ai_proposal") - 1] || "").indexOf("quiet-window-proposal:") === 0,
    root_id: fixture.rootId,
    seed_row: fixture.rowNumber,
    synth_result: synthResult,
    proposal_row: synthesized ? synthesized.rowNumber : "",
    parent_event_id: synthesized ? String(snapshot[TLW_colIndex_("parent_event_id") - 1] || "") : "",
    approval_status: synthesized ? String(snapshot[TLW_colIndex_("approval_status") - 1] || "") : "",
    execution_status: synthesized ? String(snapshot[TLW_colIndex_("execution_status") - 1] || "") : "",
    task_status: synthesized ? String(snapshot[TLW_colIndex_("task_status") - 1] || "") : "",
    ai_summary: synthesized ? String(snapshot[TLW_colIndex_("ai_summary") - 1] || "") : "",
    ai_proposal: synthesized ? String(snapshot[TLW_colIndex_("ai_proposal") - 1] || "") : "",
    record_class: synthesized ? String(snapshot[TLW_colIndex_("record_class") - 1] || "") : ""
  };
  Logger.log("TL_TestSecretaryLoop_QuietWindowSynthesisRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestSecretaryLoop_ApprovalTransitionRun() {
  const fixture = TL_TestSecretaryLoop_seedProposal_( {
    root_id: "root_secretary_approval_" + Utilities.getUuid(),
    message_id: "msg_secretary_approval_" + Utilities.getUuid(),
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
    approval_status: "draft",
    execution_status: "proposal_ready",
    ai_summary: "approval transition summary",
    ai_proposal: "approval transition proposal"
  });

  const approvalResult = TL_Approval_Run(1);
  const proposal = TL_TestSecretaryLoop_findLatestRow_(fixture.rootId, "proposal");
  const snapshot = proposal ? proposal.values : [];
  const result = {
    ok: !!proposal,
    root_id: fixture.rootId,
    seed_row: fixture.rowNumber,
    approval_result: approvalResult,
    proposal_row: proposal ? proposal.rowNumber : "",
    record_version: proposal ? Number(snapshot[TLW_colIndex_("record_version") - 1] || 0) : 0,
    approval_status: proposal ? String(snapshot[TLW_colIndex_("approval_status") - 1] || "") : "",
    execution_status: proposal ? String(snapshot[TLW_colIndex_("execution_status") - 1] || "") : "",
    approval_required: proposal ? String(snapshot[TLW_colIndex_("approval_required") - 1] || "") : ""
  };
  Logger.log("TL_TestSecretaryLoop_ApprovalTransitionRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestSecretaryLoop_ApprovedSendRun() {
  const rootId = "root_secretary_send_" + Utilities.getUuid();
  const contactWaId = "972500000111";
  const phoneNumberId = TL_TestSecretaryLoop_getPhoneNumberId_();
  const businessPhone = TL_TestSecretaryLoop_getDisplayPhoneNumber_();

  const incoming = TL_TestSecretaryLoop_seedIncomingThread_({
    root_id: rootId,
    message_id: "msg_secretary_seed_" + Utilities.getUuid(),
    sender: contactWaId,
    receiver: businessPhone,
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000)
  });

  const fixture = TL_TestSecretaryLoop_seedProposal_({
    root_id: rootId,
    message_id: "msg_secretary_send_" + Utilities.getUuid(),
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    sender: businessPhone,
    receiver: "",
    contact_id: "",
    approval_status: "approved",
    execution_status: "awaiting_approval",
    ai_summary: "approved send summary",
    ai_proposal: "approved send proposal"
  });

  const capture = {};
  const sendResult = TL_Send_RunApproved(1, {
    sendFn: function(phoneId, toWaId, text) {
      const messageId = "msg_secretary_sent_" + Utilities.getUuid();
      const responseBody = JSON.stringify({
        messages: [{ id: messageId }],
        contacts: [{ wa_id: toWaId }]
      });
      capture.phone_number_id = phoneId;
      capture.to_wa_id = toWaId;
      capture.text = text;
      capture.message_id = messageId;
      TLW_logOutboundTextSend_(phoneId, toWaId, text, responseBody);
      return {
        ok: true,
        status: 200,
        body: responseBody
      };
    }
  });

  const proposal = TL_TestSecretaryLoop_findLatestRow_(rootId, "proposal");
  const proposalSnapshot = proposal ? proposal.values : [];
  const outbound = TLW_findRowByMessageId_(phoneNumberId, capture.message_id || "");
  const outboundSnapshot = outbound ? outbound.sh.getRange(outbound.row, 1, 1, TL_WEBHOOK.INBOX_HEADERS.length).getValues()[0] : [];

  const result = {
    ok: !!capture.message_id && !!outbound,
    root_id: rootId,
    seed_incoming_row: incoming.rowNumber,
    seed_proposal_row: fixture.rowNumber,
    send_result: sendResult,
    send_capture: capture,
    proposal_row: proposal ? proposal.rowNumber : "",
    proposal_record_version: proposal ? Number(proposalSnapshot[TLW_colIndex_("record_version") - 1] || 0) : 0,
    proposal_approval_status: proposal ? String(proposalSnapshot[TLW_colIndex_("approval_status") - 1] || "") : "",
    proposal_execution_status: proposal ? String(proposalSnapshot[TLW_colIndex_("execution_status") - 1] || "") : "",
    outbound_row: outbound ? outbound.row : "",
    outbound_receiver: outbound ? String(outboundSnapshot[TLW_colIndex_("receiver") - 1] || "") : "",
    outbound_direction: outbound ? String(outboundSnapshot[TLW_colIndex_("direction") - 1] || "") : ""
  };
  Logger.log("TL_TestSecretaryLoop_ApprovedSendRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestSecretaryLoop_seedIncomingThread_(overrides) {
  const phoneNumberId = TL_TestSecretaryLoop_getPhoneNumberId_();
  const displayPhone = TL_TestSecretaryLoop_getDisplayPhoneNumber_();
  const rootId = String(overrides && overrides.root_id ? overrides.root_id : "root_secretary_" + Utilities.getUuid());
  const messageId = String(overrides && overrides.message_id ? overrides.message_id : "msg_secretary_" + Utilities.getUuid());
  const sender = String(overrides && overrides.sender ? overrides.sender : "972500000001");
  const row = TL_TestSecretaryLoop_buildRow_({
    timestamp: overrides && overrides.timestamp ? overrides.timestamp : new Date(Date.now() - 3 * 60 * 60 * 1000),
    root_id: rootId,
    event_id: "EVT_" + Utilities.getUuid(),
    record_id: "REC_" + Utilities.getUuid(),
    record_class: "communication",
    direction: "incoming",
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    sender: sender,
    receiver: displayPhone,
    message_id: messageId,
    message_type: "text",
    text: "seed incoming message for secretary loop",
    contact_id: "WA_" + phoneNumberId + "_" + sender,
    notes: "seed=secretary_loop_incoming"
  });
  return TL_TestSecretaryLoop_appendRow_(row);
}

function TL_TestSecretaryLoop_seedProposal_(overrides) {
  const phoneNumberId = TL_TestSecretaryLoop_getPhoneNumberId_();
  const displayPhone = TL_TestSecretaryLoop_getDisplayPhoneNumber_();
  const rootId = String(overrides && overrides.root_id ? overrides.root_id : "root_secretary_" + Utilities.getUuid());
  const messageId = String(overrides && overrides.message_id ? overrides.message_id : "msg_secretary_" + Utilities.getUuid());
  const row = TL_TestSecretaryLoop_buildRow_({
    timestamp: overrides && overrides.timestamp ? overrides.timestamp : new Date(Date.now() - 2 * 60 * 60 * 1000),
    root_id: rootId,
    event_id: "EVT_" + Utilities.getUuid(),
    parent_event_id: String(overrides && overrides.parent_event_id ? overrides.parent_event_id : ""),
    record_id: "REC_" + Utilities.getUuid(),
    record_class: "proposal",
    direction: "outgoing",
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    sender: String(overrides && overrides.sender ? overrides.sender : displayPhone),
    receiver: String(overrides && overrides.receiver ? overrides.receiver : ""),
    message_id: messageId,
    message_type: "text",
    text: String(overrides && overrides.text ? overrides.text : overrides && overrides.ai_proposal ? overrides.ai_proposal : "draft reply"),
    ai_summary: String(overrides && overrides.ai_summary ? overrides.ai_summary : "seed proposal summary"),
    ai_proposal: String(overrides && overrides.ai_proposal ? overrides.ai_proposal : "seed proposal"),
    approval_required: String(overrides && overrides.approval_required ? overrides.approval_required : "true"),
    approval_status: String(overrides && overrides.approval_status ? overrides.approval_status : "draft"),
    execution_status: String(overrides && overrides.execution_status ? overrides.execution_status : "proposal_ready"),
    contact_id: String(overrides && overrides.contact_id ? overrides.contact_id : ""),
    notes: String(overrides && overrides.notes ? overrides.notes : "seed=secretary_loop_proposal"),
    task_status: String(overrides && overrides.task_status ? overrides.task_status : "proposal_ready")
  });
  return TL_TestSecretaryLoop_appendRow_(row);
}

function TL_TestSecretaryLoop_buildRow_(overrides) {
  return {
    timestamp: overrides.timestamp || new Date(),
    root_id: String(overrides.root_id || ""),
    event_id: String(overrides.event_id || "EVT_" + Utilities.getUuid()),
    parent_event_id: String(overrides.parent_event_id || ""),
    record_id: String(overrides.record_id || "REC_" + Utilities.getUuid()),
    record_version: Number(overrides.record_version || 1),
    record_class: String(overrides.record_class || "communication"),
    channel: "whatsapp",
    direction: String(overrides.direction || "incoming"),
    phone_number_id: String(overrides.phone_number_id || TL_TestSecretaryLoop_getPhoneNumberId_()),
    display_phone_number: String(overrides.display_phone_number || TL_TestSecretaryLoop_getDisplayPhoneNumber_()),
    sender: String(overrides.sender || ""),
    receiver: String(overrides.receiver || ""),
    message_id: String(overrides.message_id || "msg_" + Utilities.getUuid()),
    message_type: String(overrides.message_type || "text"),
    text: String(overrides.text || ""),
    ai_summary: String(overrides.ai_summary || ""),
    ai_proposal: String(overrides.ai_proposal || ""),
    approval_required: String(overrides.approval_required || ""),
    approval_status: String(overrides.approval_status || ""),
    execution_status: String(overrides.execution_status || ""),
    status_latest: String(overrides.status_latest || ""),
    status_timestamp: String(overrides.status_timestamp || ""),
    statuses_count: Number(overrides.statuses_count || 0),
    contact_id: String(overrides.contact_id || ""),
    raw_payload_ref: String(overrides.raw_payload_ref || ""),
    notes: String(overrides.notes || ""),
    task_due: String(overrides.task_due || ""),
    task_status: String(overrides.task_status || ""),
    task_priority: String(overrides.task_priority || ""),
    topic_id: String(overrides.topic_id || ""),
    topic_tagged_at: String(overrides.topic_tagged_at || ""),
    biz_stage: String(overrides.biz_stage || ""),
    biz_stage_ts: String(overrides.biz_stage_ts || ""),
    payment_status: String(overrides.payment_status || ""),
    delivery_due: String(overrides.delivery_due || ""),
    media_id: String(overrides.media_id || ""),
    media_mime_type: String(overrides.media_mime_type || ""),
    media_sha256: String(overrides.media_sha256 || ""),
    media_caption: String(overrides.media_caption || ""),
    media_filename: String(overrides.media_filename || ""),
    media_is_voice: !!overrides.media_is_voice,
    priority_level: String(overrides.priority_level || ""),
    importance_level: String(overrides.importance_level || ""),
    urgency_flag: String(overrides.urgency_flag || ""),
    needs_owner_now: String(overrides.needs_owner_now || ""),
    suggested_action: String(overrides.suggested_action || "")
  };
}

function TL_TestSecretaryLoop_appendRow_(row) {
  const appended = TLW_appendInboxRow_(row, TLW_safeStringify_({
    source: "TL_TestSecretaryLoop",
    root_id: row.root_id,
    record_class: row.record_class,
    message_id: row.message_id
  }, 2000));
  return {
    rowNumber: appended.row,
    row: appended.row,
    rootId: row.root_id,
    messageId: row.message_id
  };
}

function TL_TestSecretaryLoop_findLatestRow_(rootId, recordClass) {
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  for (let i = rows.length - 1; i >= 0; i--) {
    const values = rows[i].values;
    if (TL_Orchestrator_value_(values, "root_id") !== String(rootId || "")) continue;
    if (recordClass && TL_Orchestrator_value_(values, "record_class") !== String(recordClass || "")) continue;
    return {
      rowNumber: rows[i].rowNumber,
      values: values
    };
  }
  return null;
}

function TL_TestSecretaryLoop_getPhoneNumberId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("TL_META_PHONE_NUMBER_ID") ||
    TLW_getSetting_("BUSINESS_PHONE_ID") ||
    TLW_getSetting_("BUSINESS_PHONEID") ||
    "896133996927016"
  ).trim();
}

function TL_TestSecretaryLoop_getDisplayPhoneNumber_() {
  return String(
    TLW_getSetting_("BUSINESS_PHONE") ||
    TLW_getSetting_("DISPLAY_PHONE_NUMBER") ||
    "972506847373"
  ).trim();
}
