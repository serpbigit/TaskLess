/**
 * TL_TestBossIntentRouting
 *
 * Deterministic runners for Boss free-form intent recognition and routing.
 */

function TL_TestBossIntentRouting_RunAll() {
  return {
    recognition: TL_TestBossIntentRouting_RecognitionRun(),
    capabilities_route: TL_TestBossIntentRouting_CapabilitiesRouteRun(),
    contact_lookup_route: TL_TestBossIntentRouting_ContactLookupRouteRun(),
    context_lookup_route: TL_TestBossIntentRouting_ContextLookupRouteRun(),
    active_item_continuation: TL_TestBossIntentRouting_ActiveItemContinuationRun(),
    active_item_pause_replace: TL_TestBossIntentRouting_ActiveItemPauseReplaceRun(),
    resume_paused_item: TL_TestBossIntentRouting_ResumePausedItemRun(),
    outbound_draft_continuation: TL_TestBossIntentRouting_OutboundDraftContinuationRun(),
    outbound_recipient_continuation: TL_TestBossIntentRouting_OutboundRecipientContinuationRun(),
    capture_item_continuation: TL_TestBossIntentRouting_CaptureItemContinuationRun(),
    summary_route: TL_TestBossIntentRouting_ListApprovalsRouteRun(),
    topic_candidates_route: TL_TestBossIntentRouting_TopicCandidatesRouteRun(),
    capture_route: TL_TestBossIntentRouting_CreateTaskRouteRun(),
    reminders_route: TL_TestBossIntentRouting_ListRemindersRouteRun(),
    out_of_scope: TL_TestBossIntentRouting_OutOfScopeRun()
  };
}

function TL_TestBossIntentRouting_ActiveItemContinuationRun() {
  const waId = TL_TestBossIntentRouting_getBossPhone_();
  try {
    TL_ActiveItem_Set_(waId, {
      item_id: "AI_CONT_1",
      kind: "contact_lookup",
      status: "active",
      contact_query: "Dana",
      search_queries: [{ type: "name", value: "Dana" }],
      resolved_contact_id: "CI_1",
      resolved_contact_name: "Dana Banker"
    });

    const reply = TL_Menu_HandleBossMessage_({
      from: waId,
      text: "about documents"
    }, null, {
      intentFn: function() {
        return {
          intent: "unknown",
          route: "none",
          summary_kind: "none",
          capture_state: "",
          confidence: 0.2,
          needs_clarification: "false",
          reply: "",
          parameters: {
            query: "",
            capture_kind: "",
            capture_mode: "",
            time_hint: "",
            target: ""
          }
        };
      },
      contextLookupFn: function() {
        return {
          contact_query: "",
          search_queries: [],
          topic_query: "",
          topic_id: "",
          reply_preamble: ""
        };
      },
      resolveContactFn: function() {
        return {
          status: "resolved",
          contact: {
            contactId: "CI_1",
            name: "Dana Banker",
            phone1: "972501112233",
            email: "dana@bank.example"
          },
          candidates: [],
          queries: [{ type: "name", value: "Dana" }]
        };
      },
      topicLimit: 10
    });

    const current = TL_ActiveItem_Get_(waId);
    return {
      ok: String(reply || "").indexOf("ממשיכה את הבדיקה הקודמת") !== -1 &&
        !!current &&
        current.kind === "context_lookup" &&
        current.topic_query === "about documents",
      reply: reply,
      current: current
    };
  } finally {
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestBossIntentRouting_ActiveItemPauseReplaceRun() {
  const waId = TL_TestBossIntentRouting_getBossPhone_();
  try {
    TL_ActiveItem_Set_(waId, {
      item_id: "AI_CONT_2",
      kind: "context_lookup",
      status: "active",
      contact_query: "Dana",
      topic_id: "topic_documents_needed",
      resolved_contact_name: "Dana Banker",
      resolved_topic_summary: "Missing documents"
    });

    const reply = TL_Menu_HandleBossMessage_({
      from: waId,
      text: "what can you do"
    }, null, {
      intentFn: function(text) {
        return {
          intent: "show_capabilities",
          route: "menu",
          summary_kind: "none",
          capture_state: "",
          menu_target: "capabilities",
          confidence: 0.98,
          needs_clarification: "false",
          reply: "",
          parameters: {
            query: text,
            capture_kind: "",
            capture_mode: "",
            time_hint: "",
            target: ""
          }
        };
      }
    });

    const active = TL_ActiveItem_Get_(waId);
    const paused = TL_ActiveItem_GetPaused_(waId);
    return {
      ok: String(reply || "").indexOf("מה אני יכולה לעשות עבורך") !== -1 &&
        !active &&
        paused.length >= 1 &&
        paused[0].item_id === "AI_CONT_2" &&
        paused[0].pause_reason === "new_intent:show_capabilities",
      reply: reply,
      paused: paused
    };
  } finally {
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestBossIntentRouting_ResumePausedItemRun() {
  const waId = TL_TestBossIntentRouting_getBossPhone_();
  try {
    TL_ActiveItem_Set_(waId, {
      item_id: "AI_RESUME_LOOKUP_1",
      kind: "context_lookup",
      status: "active",
      source_text: "show recent messages with Dana about documents",
      contact_query: "Dana",
      search_queries: [{ type: "name", value: "Dana" }],
      topic_query: "documents",
      topic_id: "topic_documents_needed",
      resolved_contact_id: "CI_1",
      resolved_contact_name: "Dana Banker",
      resolved_topic_summary: "Missing documents"
    });
    TL_ActiveItem_PauseCurrent_(waId, "new_intent:show_capabilities");

    const reply = TL_Menu_HandleBossMessage_({
      from: waId,
      text: "continue previous"
    }, null, {
      resolveContactFn: function() {
        return {
          status: "resolved",
          contact: {
            contactId: "CI_1",
            name: "Dana Banker",
            phone1: "972501112233",
            email: "dana@bank.example"
          },
          candidates: [],
          queries: [{ type: "name", value: "Dana" }]
        };
      },
      topicLimit: 10
    });

    const active = TL_ActiveItem_Get_(waId);
    return {
      ok: String(reply || "").indexOf("חוזרת למה שהשארנו פתוח") !== -1 &&
        String(reply || "").indexOf("הקשר אחרון עבור") !== -1 &&
        !!active &&
        active.item_id === "AI_RESUME_LOOKUP_1" &&
        active.status === "active",
      reply: reply,
      active: active
    };
  } finally {
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestBossIntentRouting_OutboundDraftContinuationRun() {
  const waId = TL_TestBossIntentRouting_getBossPhone_();
  TL_Menu_ClearDecisionPacket_(waId);
  try {
    const seeded = typeof TL_TestBossDecision_seedDecisionItem_ === "function"
      ? TL_TestBossDecision_seedDecisionItem_({
          root_id: "root_outbound_draft_" + Utilities.getUuid(),
          approval_status: "awaiting_approval",
          execution_status: "proposal_ready",
          ai_summary: "Send Dana a quick update.",
          ai_proposal: "Dana, I will be 10 minutes late."
        })
      : null;
    if (!seeded) return { ok: false, reason: "missing_seed_helper" };
    const item = Object.assign({}, seeded.item, {
      channel: "whatsapp",
      channelLabel: "WhatsApp",
      captureKind: "whatsapp",
      recipientQuery: "Dana",
      recipientName: "Dana Banker",
      recipientDestination: "972501112233",
      resolutionStatus: "resolved",
      contactId: "CI_1",
      proposal: "Dana, I will be 10 minutes late.",
      summary: "Send Dana a quick update."
    });
    TL_Menu_StoreDecisionPacket_(waId, "capture", [item]);
    const livePacket = TL_Menu_GetDecisionPacket_(waId);
    TL_Menu_BuildDecisionPacketOneByOneReply_(livePacket);

    const reply = TL_Menu_HandleBossMessage_({
      from: waId,
      text: "Dana, I will be 15 minutes late."
    }, null, {
      intentFn: function() {
        return {
          intent: "unknown",
          route: "none",
          summary_kind: "none",
          capture_state: "",
          confidence: 0.2,
          needs_clarification: "false",
          reply: "",
          parameters: {
            query: "",
            capture_kind: "",
            capture_mode: "",
            time_hint: "",
            target: ""
          }
        };
      }
    });

    const packetAfter = TL_Menu_GetDecisionPacket_(waId);
    const current = packetAfter && packetAfter.items ? packetAfter.items[0] : null;
    return {
      ok: String(reply || "").indexOf("עדכנתי את הנוסח") !== -1 &&
        !!current &&
        String(current.proposal || "") === "Dana, I will be 15 minutes late.",
      reply: reply,
      current: current
    };
  } finally {
    TL_Menu_ClearDecisionPacket_(waId);
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestBossIntentRouting_OutboundRecipientContinuationRun() {
  const waId = TL_TestBossIntentRouting_getBossPhone_();
  TL_Menu_ClearDecisionPacket_(waId);
  try {
    const seeded = typeof TL_TestBossDecision_seedDecisionItem_ === "function"
      ? TL_TestBossDecision_seedDecisionItem_({
          root_id: "root_outbound_recipient_" + Utilities.getUuid(),
          approval_status: "awaiting_approval",
          execution_status: "proposal_ready",
          ai_summary: "Send Dana a quick update.",
          ai_proposal: "Dana, I will be 10 minutes late."
        })
      : null;
    if (!seeded) return { ok: false, reason: "missing_seed_helper" };
    const item = Object.assign({}, seeded.item, {
      channel: "whatsapp",
      channelLabel: "WhatsApp",
      captureKind: "whatsapp",
      recipientQuery: "Dana",
      recipientName: "",
      recipientDestination: "",
      resolutionStatus: "ambiguous",
      contactId: "",
      recipientCandidates: [
        { contactId: "CI_X", name: "Old Dana", phone1: "972500000001", preferredDestination: "972500000001" }
      ],
      proposal: "Dana, I will be 10 minutes late.",
      summary: "Send Dana a quick update."
    });
    TL_Menu_StoreDecisionPacket_(waId, "capture", [item]);
    const livePacket = TL_Menu_GetDecisionPacket_(waId);
    TL_Menu_BuildDecisionPacketOneByOneReply_(livePacket);

    const reply = TL_Menu_HandleBossMessage_({
      from: waId,
      text: "Dana banker"
    }, null, {
      intentFn: function() {
        return {
          intent: "unknown",
          route: "none",
          summary_kind: "none",
          capture_state: "",
          confidence: 0.2,
          needs_clarification: "false",
          reply: "",
          parameters: {
            query: "",
            capture_kind: "",
            capture_mode: "",
            time_hint: "",
            target: ""
          }
        };
      },
      resolveContactFn: function() {
        return {
          status: "resolved",
          contact: {
            contactId: "CI_1",
            name: "Dana Banker",
            phone1: "972501112233",
            email: "dana@bank.example"
          },
          destination: "972501112233",
          candidates: [],
          queries: [{ type: "name", value: "Dana banker" }]
        };
      }
    });

    const packetAfter = TL_Menu_GetDecisionPacket_(waId);
    const current = packetAfter && packetAfter.items ? packetAfter.items[0] : null;
    return {
      ok: String(reply || "").indexOf("בחרתי את איש הקשר המתאים") !== -1 &&
        !!current &&
        String(current.recipientName || "") === "Dana Banker" &&
        String(current.recipientDestination || "") === "972501112233" &&
        String(current.resolutionStatus || "") === "resolved",
      reply: reply,
      current: current
    };
  } finally {
    TL_Menu_ClearDecisionPacket_(waId);
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestBossIntentRouting_CaptureItemContinuationRun() {
  const waId = TL_TestBossIntentRouting_getBossPhone_();
  TL_Menu_ClearDecisionPacket_(waId);
  try {
    const seeded = typeof TL_TestBossDecision_seedDecisionItem_ === "function"
      ? TL_TestBossDecision_seedDecisionItem_({
          root_id: "root_capture_item_" + Utilities.getUuid(),
          approval_status: "awaiting_approval",
          execution_status: "proposal_ready",
          ai_summary: "Call Dana.",
          ai_proposal: "Call Dana."
        })
      : null;
    if (!seeded) return { ok: false, reason: "missing_seed_helper" };
    const item = Object.assign({}, seeded.item, {
      channel: "whatsapp",
      channelLabel: "WhatsApp",
      captureKind: "task",
      proposal: "Call Dana.",
      summary: "Call Dana.",
      duePreview: "",
      dueLabel: ""
    });
    TL_Menu_StoreDecisionPacket_(waId, "capture", [item]);
    const livePacket = TL_Menu_GetDecisionPacket_(waId);
    TL_Menu_BuildDecisionPacketOneByOneReply_(livePacket);

    const reply = TL_Menu_HandleBossMessage_({
      from: waId,
      text: "tomorrow 17:00"
    }, null, {
      intentFn: function() {
        return {
          intent: "unknown",
          route: "none",
          summary_kind: "none",
          capture_state: "",
          confidence: 0.2,
          needs_clarification: "false",
          reply: "",
          parameters: {
            query: "",
            capture_kind: "",
            capture_mode: "",
            time_hint: "",
            target: ""
          }
        };
      }
    });

    const packetAfter = TL_Menu_GetDecisionPacket_(waId);
    const current = packetAfter && packetAfter.items ? packetAfter.items[0] : null;
    return {
      ok: String(reply || "").indexOf("עדכנתי את הזמן") !== -1 &&
        !!current &&
        String(current.duePreview || "").trim() !== "",
      reply: reply,
      current: current
    };
  } finally {
    TL_Menu_ClearDecisionPacket_(waId);
    TL_ActiveItem_Clear_(waId);
    TL_ActiveItem_ClearPaused_(waId);
  }
}

function TL_TestBossIntentRouting_ContextLookupRouteRun() {
  const reply = TL_Menu_HandleBossMessage_({
    from: TL_TestBossIntentRouting_getBossPhone_(),
    text: "show recent messages with Dana about documents"
  }, null, {
    intentFn: function(text) {
      return {
        intent: "find_context",
        route: "summary",
        summary_kind: "context_lookup",
        capture_state: "",
        confidence: 0.95,
        needs_clarification: "false",
        reply: "",
        parameters: {
          query: text,
          capture_kind: "",
          capture_mode: "",
          time_hint: "",
          target: "Dana"
        }
      };
    },
    contextLookupFn: function() {
      return {
        contact_query: "Dana",
        search_queries: [
          { type: "name", value: "Dana" }
        ],
        topic_query: "documents",
        topic_id: "topic_documents_needed",
        reply_preamble: "אוספת את ההקשר האחרון שביקשת."
      };
    },
    resolveContactFn: function() {
      return {
        status: "resolved",
        contact: {
          contactId: "CI_1",
          name: "Dana Banker",
          phone1: "972501112233",
          email: "dana@bank.example"
        },
        candidates: [],
        queries: [{ type: "name", value: "Dana" }]
      };
    },
    packetFn: function(turn) {
      return {
        boss_turn: { message_text: turn.message_text },
        policy: { retrieval_budget_max: 2 }
      };
    },
    analysisFn: function() {
      return {
        summary_kind: "context_lookup",
        retrieval_focus: ["recent_records"],
        reply_preamble: "אוספת את ההקשר האחרון שביקשת.",
        confidence: 0.95
      };
    },
    topicLimit: 10
  });

  const output = {
    ok: String(reply || "").indexOf("הקשר אחרון עבור") !== -1 &&
      String(reply || "").indexOf("לא מצאתי עדיין פריטים מתאימים") !== -1,
    reply: reply
  };
  Logger.log("TL_TestBossIntentRouting_ContextLookupRouteRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_ContactLookupRouteRun() {
  const reply = TL_Menu_HandleBossMessage_({
    from: TL_TestBossIntentRouting_getBossPhone_(),
    text: "find Dana banker"
  }, null, {
    intentFn: function(text) {
      return {
        intent: "find_contact",
        route: "summary",
        summary_kind: "contact_lookup",
        capture_state: "",
        confidence: 0.95,
        needs_clarification: "false",
        reply: "",
        parameters: {
          query: text,
          capture_kind: "",
          capture_mode: "",
          time_hint: "",
          target: "Dana"
        }
      };
    },
    contactLookupFn: function() {
      return {
        contact_query: "Dana",
        search_queries: [
          { type: "name", value: "Dana" },
          { type: "org", value: "bank" }
        ],
        reply_preamble: "בודקת את איש הקשר שביקשת."
      };
    },
    resolveContactFn: function() {
      return {
        status: "resolved",
        contact: {
          name: "Dana Banker",
          org: "Leumi",
          role: "Banker",
          phone1: "972501112233",
          email: "dana@bank.example"
        },
        candidates: [],
        queries: [
          { type: "name", value: "Dana" },
          { type: "org", value: "bank" }
        ]
      };
    }
  });

  const output = {
    ok: String(reply || "").indexOf("מצאתי התאמה אחת") !== -1 &&
      String(reply || "").indexOf("Dana Banker") !== -1,
    reply: reply
  };
  Logger.log("TL_TestBossIntentRouting_ContactLookupRouteRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_CapabilitiesRouteRun() {
  const reply = TL_Menu_HandleBossMessage_({
    from: TL_TestBossIntentRouting_getBossPhone_(),
    text: "what can you do"
  }, null, {
    intentFn: function(text) {
      return {
        intent: "show_capabilities",
        route: "menu",
        summary_kind: "none",
        capture_state: "",
        menu_target: "capabilities",
        confidence: 0.98,
        needs_clarification: "false",
        reply: "",
        parameters: {
          query: text,
          capture_kind: "",
          capture_mode: "",
          time_hint: "",
          target: ""
        }
      };
    }
  });

  const output = {
    ok: String(reply || "").indexOf("מה אני יכולה לעשות עבורך") !== -1 &&
      String(reply || "").indexOf("ניהול משימות") !== -1,
    reply: reply
  };
  Logger.log("TL_TestBossIntentRouting_CapabilitiesRouteRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_RecognitionRun() {
  const result = TL_AI_RecognizeBossIntent_("what approvals are waiting?", {
    intentFn: function(text) {
      return {
        intent: "list_approvals",
        route: "summary",
        summary_kind: "approvals",
        capture_state: "",
        confidence: 0.98,
        needs_clarification: "false",
        reply: "מראה לך את מה שממתין לאישור.",
        parameters: {
          query: "approvals",
          capture_kind: "",
          capture_mode: "",
          time_hint: "",
          target: ""
        }
      };
    }
  });

  const output = {
    ok: result.intent === "list_approvals" && result.route === "summary" && result.summary_kind === "approvals",
    intent: result.intent,
    route: result.route,
    summary_kind: result.summary_kind,
    confidence: result.confidence,
    reply: result.reply
  };
  Logger.log("TL_TestBossIntentRouting_RecognitionRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_ListApprovalsRouteRun() {
  const approvalRow = TL_TestBossIntentRouting_seedRow_({
    root_id: "root_intent_approvals_" + Utilities.getUuid(),
    record_class: "proposal",
    approval_status: "awaiting_approval",
    execution_status: "proposal_ready",
    task_status: "proposal_ready",
    ai_summary: "Pending approval summary",
    ai_proposal: "Please approve this item."
  });

  const reply = TL_Menu_HandleBossMessage_({
    from: TL_TestBossIntentRouting_getBossPhone_(),
    text: "what approvals are waiting?"
  }, null, {
    intentFn: function(text) {
      return {
        intent: "list_approvals",
        route: "summary",
        summary_kind: "approvals",
        capture_state: "",
        confidence: 0.98,
        needs_clarification: "false",
        reply: "",
        parameters: {
          query: text,
          capture_kind: "",
          capture_mode: "",
          time_hint: "",
          target: ""
        }
      };
    }
  });

  const output = {
    ok: String(reply || "").indexOf("ממתין") !== -1 || String(reply || "").indexOf("אישורים") !== -1,
    seeded_row: approvalRow.rowNumber,
    reply: reply
  };
  Logger.log("TL_TestBossIntentRouting_ListApprovalsRouteRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_TopicCandidatesRouteRun() {
  const originalList = typeof TL_Topics_ListCandidateGroups_ === "function"
    ? TL_Topics_ListCandidateGroups_
    : null;
  try {
    TL_Topics_ListCandidateGroups_ = function() {
      return [{
        candidate: "topic_documents_needed",
        summary: "Missing mortgage documents",
        count: 2,
        latestAt: "2026-03-24T10:00:00.000Z",
        existingTopicId: "",
        samples: [
          { rowNumber: 2, recordId: "REC_1", channel: "whatsapp", direction: "incoming", summary: "Client says documents are still missing." }
        ],
        rowRefs: [
          { rowNumber: 2, recordId: "REC_1", channel: "whatsapp", direction: "incoming", summary: "Client says documents are still missing." }
        ]
      }];
    };

    const reply = TL_Menu_HandleBossMessage_({
      from: TL_TestBossIntentRouting_getBossPhone_(),
      text: "show topic candidates"
    }, null, {
      intentFn: function(text) {
        return {
          intent: "list_topic_candidates",
          route: "summary",
          summary_kind: "topic_candidates",
          capture_state: "",
          confidence: 0.97,
          needs_clarification: "false",
          reply: "",
          parameters: {
            query: text,
            capture_kind: "",
            capture_mode: "",
            time_hint: "",
            target: ""
          }
        };
      }
    });

    const output = {
      ok: String(reply || "").indexOf("מועמדי נושא לקידום") !== -1 &&
        String(reply || "").indexOf("קדם כנושא") !== -1,
      reply: reply
    };
    Logger.log("TL_TestBossIntentRouting_TopicCandidatesRouteRun: %s", JSON.stringify(output, null, 2));
    return output;
  } finally {
    TL_Menu_ClearDecisionPacket_(TL_TestBossIntentRouting_getBossPhone_());
    TL_Topics_ListCandidateGroups_ = originalList;
  }
}

function TL_TestBossIntentRouting_CreateTaskRouteRun() {
  const rootId = "root_intent_capture_" + Utilities.getUuid();
  const bossPhone = TL_TestBossIntentRouting_getBossPhone_();
  const row = TL_TestBossIntentRouting_seedRow_({
    root_id: rootId,
    record_class: "communication",
    direction: "incoming",
    sender: bossPhone,
    receiver: TL_TestBossIntentRouting_getDisplayPhone_(),
    text: "Please add a task for calling Dana tomorrow."
  });

  const reply = TL_Menu_HandleBossMessage_({
    from: bossPhone,
    text: "Please add a task for calling Dana tomorrow."
  }, { row: row.rowNumber }, {
    intentFn: function(text) {
      return {
        intent: "create_task_with_due",
        route: "capture",
        summary_kind: "none",
        capture_state: "CAPTURE_TASK_WITH_DUE",
        confidence: 0.97,
        needs_clarification: "false",
        reply: "קיבלתי, אכין משימה עם תאריך יעד.",
        parameters: {
          query: text,
          capture_kind: "task",
          capture_mode: "with_due",
          time_hint: "tomorrow",
          target: "Dana"
        }
      };
    }
  });

  const updated = TL_TestBossIntentRouting_findRowByRoot_(rootId);
  const notes = updated ? String(updated.values[TLW_colIndex_("notes") - 1] || "") : "";
  const output = {
    ok: !!updated && notes.indexOf("menu_route=task_with_due") !== -1 && notes.indexOf("boss_intent=create_task_with_due") !== -1 && String(updated.values[TLW_colIndex_("task_status") - 1] || "") === "captured",
    seeded_row: row.rowNumber,
    updated_row: updated ? updated.rowNumber : "",
    task_status: updated ? String(updated.values[TLW_colIndex_("task_status") - 1] || "") : "",
    notes: notes,
    reply: reply
  };
  Logger.log("TL_TestBossIntentRouting_CreateTaskRouteRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_ListRemindersRouteRun() {
  const reminderRow = TL_TestBossIntentRouting_seedRow_({
    root_id: "root_intent_reminders_" + Utilities.getUuid(),
    record_class: "instruction",
    task_status: "reminder_pending",
    execution_status: "reminder_pending",
    task_due: "מחר ב-08:00",
    ai_summary: "תזכורת לקחת תרופה מחר בבוקר.",
    notes: "boss_capture_kind=reminder\nboss_capture_finalized=reminder"
  });

  const reply = TL_Menu_HandleBossMessage_({
    from: TL_TestBossIntentRouting_getBossPhone_(),
    text: "show my reminders"
  }, null, {
    intentFn: function(text) {
      return {
        intent: "list_reminders",
        route: "summary",
        summary_kind: "reminders",
        capture_state: "",
        confidence: 0.98,
        needs_clarification: "false",
        reply: "",
        parameters: {
          query: text,
          capture_kind: "",
          capture_mode: "",
          time_hint: "",
          target: ""
        }
      };
    }
  });

  const output = {
    ok: String(reply || "").indexOf("רשימת תזכורות") !== -1 && String(reply || "").indexOf("מחר ב-08:00") !== -1,
    seeded_row: reminderRow.rowNumber,
    reply: reply
  };
  Logger.log("TL_TestBossIntentRouting_ListRemindersRouteRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_OutOfScopeRun() {
  const reply = TL_Menu_HandleBossMessage_({
    from: TL_TestBossIntentRouting_getBossPhone_(),
    text: "what is the weather today?"
  }, null, {
    intentFn: function(text) {
      return {
        intent: "out_of_scope",
        route: "none",
        summary_kind: "none",
        capture_state: "",
        confidence: 0.99,
        needs_clarification: "false",
        reply: "",
        parameters: {
          query: text,
          capture_kind: "",
          capture_mode: "",
          time_hint: "",
          target: ""
        }
      };
    }
  });

  const output = {
    ok: String(reply || "").indexOf("מצטערת") !== -1 && String(reply || "").indexOf("מה תרצה לעשות?") !== -1,
    reply: reply
  };
  Logger.log("TL_TestBossIntentRouting_OutOfScopeRun: %s", JSON.stringify(output, null, 2));
  return output;
}

function TL_TestBossIntentRouting_seedRow_(overrides) {
  const phoneNumberId = TL_TestBossIntentRouting_getPhoneNumberId_();
  const displayPhone = TL_TestBossIntentRouting_getDisplayPhone_();
  const row = {
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    root_id: String(overrides && overrides.root_id ? overrides.root_id : "root_intent_" + Utilities.getUuid()),
    event_id: "EVT_" + Utilities.getUuid(),
    parent_event_id: "",
    record_id: "REC_" + Utilities.getUuid(),
    record_version: 1,
    record_class: String(overrides && overrides.record_class ? overrides.record_class : "communication"),
    channel: "whatsapp",
    direction: String(overrides && overrides.direction ? overrides.direction : "incoming"),
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhone,
    sender: String(overrides && overrides.sender ? overrides.sender : TL_TestBossIntentRouting_getBossPhone_()),
    receiver: String(overrides && overrides.receiver ? overrides.receiver : displayPhone),
    message_id: "msg_" + Utilities.getUuid(),
    message_type: "text",
    text: String(overrides && overrides.text ? overrides.text : ""),
    ai_summary: String(overrides && overrides.ai_summary ? overrides.ai_summary : ""),
    ai_proposal: String(overrides && overrides.ai_proposal ? overrides.ai_proposal : ""),
    approval_required: String(overrides && overrides.approval_required ? overrides.approval_required : ""),
    approval_status: String(overrides && overrides.approval_status ? overrides.approval_status : ""),
    execution_status: String(overrides && overrides.execution_status ? overrides.execution_status : ""),
    status_latest: "",
    status_timestamp: "",
    statuses_count: 0,
    contact_id: "",
    raw_payload_ref: "",
    notes: String(overrides && overrides.notes ? overrides.notes : ""),
    task_due: "",
    task_status: String(overrides && overrides.task_status ? overrides.task_status : ""),
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
    source: "TL_TestBossIntentRouting",
    root_id: row.root_id,
    record_class: row.record_class
  }, 2000));
  return {
    rowNumber: appended.row,
    rootId: row.root_id
  };
}

function TL_TestBossIntentRouting_findRowByRoot_(rootId) {
  const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (TL_Orchestrator_value_(rows[i].values, "root_id") === String(rootId || "")) {
      return rows[i];
    }
  }
  return null;
}

function TL_TestBossIntentRouting_getBossPhone_() {
  return String(TLW_getSetting_("BOSS_PHONE") || "972500000999").trim();
}

function TL_TestBossIntentRouting_getPhoneNumberId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("TL_META_PHONE_NUMBER_ID") ||
    TLW_getSetting_("BUSINESS_PHONE_ID") ||
    TLW_getSetting_("BUSINESS_PHONEID") ||
    "896133996927016"
  ).trim();
}

function TL_TestBossIntentRouting_getDisplayPhone_() {
  return String(
    TLW_getSetting_("BUSINESS_PHONE") ||
    TLW_getSetting_("DISPLAY_PHONE_NUMBER") ||
    "972506847373"
  ).trim();
}
