/**
 * TL_TestFreeCapture
 *
 * Deterministic runners for Boss multi-intent free-capture.
 */

function TL_TestFreeCapture_RunAll() {
  return {
    capture: TL_TestFreeCapture_MultiIntentCaptureRun(),
    approval: TL_TestFreeCapture_BatchApprovalRun(),
    end_to_end: TL_TestFreeCapture_EndToEndRun()
  };
}

function TL_TestFreeCapture_MultiIntentCaptureRun() {
  const rootId = "root_free_capture_" + Utilities.getUuid();
  const seed = TL_TestFreeCapture_seedBossCaptureRow_({
    root_id: rootId,
    message_id: "msg_free_capture_" + Utilities.getUuid(),
    text: "Reminder: call Dana tomorrow. Task: pay the electricity bill. Journal: met with Yael today."
  });

  const captured = [];
  const packetStash = [];
  const captureResult = TL_Capture_Run(1, {
    useAi: false,
    promptFn: function(text) {
      return {
        summary: "multi-intent capture summary",
        items: [
          {
            kind: "reminder",
            title: "Call Dana",
            summary: "Call Dana tomorrow.",
            proposal: "Call Dana tomorrow.",
            task_due: "tomorrow",
            task_priority: "high",
            approval_required: "true"
          },
          {
            kind: "task",
            title: "Pay the electricity bill",
            summary: "Pay the electricity bill.",
            proposal: "Pay the electricity bill.",
            task_due: "",
            task_priority: "medium",
            approval_required: "true"
          },
          {
            kind: "journal",
            title: "Met with Yael",
            summary: "Met with Yael today.",
            proposal: "Journal: met with Yael today.",
            task_due: "",
            task_priority: "low",
            approval_required: "true"
          }
        ]
      };
    },
    sendFn: TL_TestFreeCapture_captureSend_(captured),
    storePacketFn: function(waId, kind, items) {
      packetStash.push({
        waId: String(waId || ""),
        kind: String(kind || ""),
        items: items
      });
      return true;
    }
  });

  const parent = TL_TestFreeCapture_findLatestRow_(rootId, "communication", "seed=free_capture");
  const children = TL_TestFreeCapture_findChildRows_(rootId, seed.eventId);
  const result = {
    ok: !!parent && children.length === 3 && captured.length === 1,
    root_id: rootId,
    seed_row: seed.rowNumber,
    parent_row: parent ? parent.rowNumber : "",
    child_rows: children.map(function(child) {
      return {
        row: child.rowNumber,
        kind: TL_Orchestrator_captureKindFromNotes_(String(child.values[TLW_colIndex_("notes") - 1] || "")),
        approval_status: String(child.values[TLW_colIndex_("approval_status") - 1] || ""),
        record_class: String(child.values[TLW_colIndex_("record_class") - 1] || ""),
        direction: String(child.values[TLW_colIndex_("direction") - 1] || ""),
        receiver: String(child.values[TLW_colIndex_("receiver") - 1] || ""),
        message_id: String(child.values[TLW_colIndex_("message_id") - 1] || "")
      };
    }),
    capture_result: captureResult,
    sent_count: captured.length,
    packet_count: packetStash.length,
    packet_kind: packetStash.length ? packetStash[0].kind : "",
    packet_items: packetStash.length ? packetStash[0].items.length : 0
  };
  Logger.log("TL_TestFreeCapture_MultiIntentCaptureRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestFreeCapture_BatchApprovalRun() {
  const rootId = "root_free_approval_" + Utilities.getUuid();
  const seed = TL_TestFreeCapture_seedBossCaptureRow_({
    root_id: rootId,
    message_id: "msg_free_approval_" + Utilities.getUuid(),
    text: "Reminder: follow up with Amir. Journal: had a budget call."
  });

  const captureResult = TL_Capture_Run(1, {
    useAi: false,
    promptFn: function(text) {
      return {
        summary: "approval capture summary",
        items: [
          {
            kind: "reminder",
            title: "Follow up with Amir",
            summary: "Follow up with Amir.",
            proposal: "Follow up with Amir.",
            task_due: "soon",
            task_priority: "high",
            approval_required: "true"
          },
          {
            kind: "journal",
            title: "Budget call",
            summary: "Had a budget call.",
            proposal: "Journal: had a budget call.",
            task_due: "",
            task_priority: "low",
            approval_required: "true"
          }
        ]
      };
    },
    sendFn: function() {
      return { ok: true, status: 200, body: "{}" };
    },
    storePacketFn: function() {
      return true;
    }
  });

  const approveResult = TL_Menu_ApprovePacketItems_((captureResult.items || []).map(function(item) {
    return { rowNumber: item.rowNumber };
  }));

  const reminder = TL_TestFreeCapture_findLatestByCaptureKind_(rootId, "reminder");
  const journal = TL_TestFreeCapture_findLatestByCaptureKind_(rootId, "journal");
  const reminderValues = reminder ? reminder.values : [];
  const journalValues = journal ? journal.values : [];
  const result = {
    ok: !!reminder && !!journal && String(reminderValues[TLW_colIndex_("record_class") - 1] || "") === "instruction" && String(journalValues[TLW_colIndex_("record_class") - 1] || "") === "communication",
    root_id: rootId,
    seed_row: seed.rowNumber,
    capture_result: captureResult,
    approve_result: approveResult,
    reminder_row: reminder ? reminder.rowNumber : "",
    reminder_record_class: reminder ? String(reminderValues[TLW_colIndex_("record_class") - 1] || "") : "",
    reminder_approval_status: reminder ? String(reminderValues[TLW_colIndex_("approval_status") - 1] || "") : "",
    reminder_task_status: reminder ? String(reminderValues[TLW_colIndex_("task_status") - 1] || "") : "",
    journal_row: journal ? journal.rowNumber : "",
    journal_record_class: journal ? String(journalValues[TLW_colIndex_("record_class") - 1] || "") : "",
    journal_approval_status: journal ? String(journalValues[TLW_colIndex_("approval_status") - 1] || "") : "",
    journal_task_status: journal ? String(journalValues[TLW_colIndex_("task_status") - 1] || "") : ""
  };
  Logger.log("TL_TestFreeCapture_BatchApprovalRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestFreeCapture_EndToEndRun() {
  const rootId = "root_free_end_to_end_" + Utilities.getUuid();
  const seed = TL_TestFreeCapture_seedBossCaptureRow_({
    root_id: rootId,
    message_id: "msg_free_end_to_end_" + Utilities.getUuid(),
    text: "תזכירי לי להתקשר לדנה מחר, תפתחי משימה לשלם חשמל, ותרשמי ביומן שנפגשתי עם יעל."
  });

  const captured = [];
  const packetStash = [];
  const captureResult = TL_Capture_Run(1, {
    useAi: false,
    promptFn: function() {
      return {
        summary: "end-to-end capture summary",
        items: [
          {
            kind: "reminder",
            title: "Call Dana",
            summary: "Call Dana tomorrow.",
            proposal: "Call Dana tomorrow.",
            task_due: "tomorrow",
            task_priority: "high",
            approval_required: "true"
          },
          {
            kind: "task",
            title: "Pay electricity",
            summary: "Pay the electricity bill.",
            proposal: "Pay the electricity bill.",
            task_due: "",
            task_priority: "medium",
            approval_required: "true"
          },
          {
            kind: "journal",
            title: "Met with Yael",
            summary: "Met with Yael today.",
            proposal: "Journal: met with Yael today.",
            task_due: "",
            task_priority: "low",
            approval_required: "true"
          }
        ]
      };
    },
    sendFn: TL_TestFreeCapture_captureSend_(captured),
    storePacketFn: function(waId, kind, items) {
      packetStash.push({
        waId: String(waId || ""),
        kind: String(kind || ""),
        items: items
      });
      return true;
    }
  });

  const approveResult = TL_Menu_ApprovePacketItems_((captureResult.items || []).map(function(item) {
    return { rowNumber: item.rowNumber };
  }));

  const reminder = TL_TestFreeCapture_findLatestByCaptureKind_(rootId, "reminder");
  const task = TL_TestFreeCapture_findLatestByCaptureKind_(rootId, "task");
  const journal = TL_TestFreeCapture_findLatestByCaptureKind_(rootId, "journal");
  const reminderValues = reminder ? reminder.values : [];
  const taskValues = task ? task.values : [];
  const journalValues = journal ? journal.values : [];
  const result = {
    ok: !!reminder && !!task && !!journal &&
      String(reminderValues[TLW_colIndex_("record_class") - 1] || "") === "instruction" &&
      String(taskValues[TLW_colIndex_("record_class") - 1] || "") === "instruction" &&
      String(journalValues[TLW_colIndex_("record_class") - 1] || "") === "communication",
    root_id: rootId,
    seed_row: seed.rowNumber,
    capture_result: captureResult,
    approve_result: approveResult,
    packet_count: packetStash.length,
    sent_count: captured.length,
    reminder_row: reminder ? reminder.rowNumber : "",
    reminder_record_class: reminder ? String(reminderValues[TLW_colIndex_("record_class") - 1] || "") : "",
    reminder_approval_status: reminder ? String(reminderValues[TLW_colIndex_("approval_status") - 1] || "") : "",
    task_row: task ? task.rowNumber : "",
    task_record_class: task ? String(taskValues[TLW_colIndex_("record_class") - 1] || "") : "",
    task_approval_status: task ? String(taskValues[TLW_colIndex_("approval_status") - 1] || "") : "",
    journal_row: journal ? journal.rowNumber : "",
    journal_record_class: journal ? String(journalValues[TLW_colIndex_("record_class") - 1] || "") : "",
    journal_approval_status: journal ? String(journalValues[TLW_colIndex_("approval_status") - 1] || "") : ""
  };
  Logger.log("TL_TestFreeCapture_EndToEndRun: %s", JSON.stringify(result, null, 2));
  return result;
}

function TL_TestFreeCapture_seedBossCaptureRow_(overrides) {
  const phoneNumberId = TL_TestFreeCapture_getPhoneNumberId_();
  const displayPhone = TL_TestFreeCapture_getDisplayPhoneNumber_();
  const bossPhone = String(TLW_getSetting_("BOSS_PHONE") || "972500000999").trim();
  const rootId = String(overrides && overrides.root_id ? overrides.root_id : "root_free_capture_" + Utilities.getUuid());
  const messageId = String(overrides && overrides.message_id ? overrides.message_id : "msg_free_capture_" + Utilities.getUuid());
  const row = {
    timestamp: overrides && overrides.timestamp ? overrides.timestamp : new Date(Date.now() - 3 * 60 * 60 * 1000),
    root_id: rootId,
    event_id: "EVT_" + Utilities.getUuid(),
    parent_event_id: "",
    record_id: "REC_" + Utilities.getUuid(),
    record_version: 1,
    record_class: "communication",
    channel: "whatsapp",
    direction: "incoming",
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    sender: bossPhone,
    receiver: displayPhone,
    message_id: messageId,
    message_type: "text",
    text: String(overrides && overrides.text ? overrides.text : ""),
    ai_summary: "",
    ai_proposal: "",
    approval_required: "",
    approval_status: "",
    execution_status: "",
    status_latest: "",
    status_timestamp: "",
    statuses_count: 0,
    contact_id: "",
    raw_payload_ref: "",
    notes: "seed=free_capture",
    task_due: "",
    task_status: "",
    task_priority: "",
    topic_id: "",
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
    suggested_action: ""
  };
  const appended = TLW_appendInboxRow_(row, TLW_safeStringify_({
    source: "TL_TestFreeCapture",
    root_id: rootId,
    message_id: messageId
  }, 2000));
  return {
    rowNumber: appended.row,
    rootId: rootId,
    eventId: row.event_id,
    messageId: messageId
  };
}

function TL_TestFreeCapture_captureSend_(captured) {
  return function(phoneId, toWaId, text, meta) {
    captured.push({
      phone_number_id: String(phoneId || ""),
      to_wa_id: String(toWaId || ""),
      text: String(text || ""),
      kind: meta && meta.kind ? String(meta.kind) : "",
      item_count: meta && meta.items ? meta.items.length : 0
    });
    return {
      ok: true,
      status: 200,
      body: JSON.stringify({
        messages: [{ id: "msg_free_capture_" + captured.length }],
        contacts: [{ wa_id: String(toWaId || "") }]
      })
    };
  };
}

function TL_TestFreeCapture_findLatestRow_(rootId, recordClass, noteFragment) {
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  for (let i = rows.length - 1; i >= 0; i--) {
    const values = rows[i].values;
    if (TL_Orchestrator_value_(values, "root_id") !== String(rootId || "")) continue;
    if (recordClass && TL_Orchestrator_value_(values, "record_class") !== String(recordClass || "")) continue;
    const notes = String(TL_Orchestrator_value_(values, "notes") || "");
    if (noteFragment && notes.indexOf(String(noteFragment || "")) === -1) continue;
    return {
      rowNumber: rows[i].rowNumber,
      values: values
    };
  }
  return null;
}

function TL_TestFreeCapture_findChildRows_(rootId, parentEventId) {
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  return rows.filter(function(item) {
    const values = item.values;
    if (TL_Orchestrator_value_(values, "root_id") !== String(rootId || "")) return false;
    if (TL_Orchestrator_value_(values, "parent_event_id") !== String(parentEventId || "")) return false;
    if (TL_Orchestrator_value_(values, "record_class") !== "proposal") return false;
    return true;
  });
}

function TL_TestFreeCapture_findLatestByCaptureKind_(rootId, kind) {
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  for (let i = rows.length - 1; i >= 0; i--) {
    const values = rows[i].values;
    if (TL_Orchestrator_value_(values, "root_id") !== String(rootId || "")) continue;
    const noteKind = TL_Orchestrator_captureKindFromNotes_(String(TL_Orchestrator_value_(values, "notes") || ""));
    if (noteKind !== String(kind || "")) continue;
    return {
      rowNumber: rows[i].rowNumber,
      values: values
    };
  }
  return null;
}

function TL_TestFreeCapture_getPhoneNumberId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("TL_META_PHONE_NUMBER_ID") ||
    TLW_getSetting_("BUSINESS_PHONE_ID") ||
    TLW_getSetting_("BUSINESS_PHONEID") ||
    "896133996927016"
  ).trim();
}

function TL_TestFreeCapture_getDisplayPhoneNumber_() {
  return String(
    TLW_getSetting_("BUSINESS_PHONE") ||
    TLW_getSetting_("DISPLAY_PHONE_NUMBER") ||
    "972506847373"
  ).trim();
}
