function TL_TestDraftContext_RunAll() {
  return {
    render_prompt_brief: TL_TestDraftContext_RenderPromptBriefRun(),
    preview_truncation: TL_TestDraftContext_PreviewTruncationRun(),
    topic_existing_selection: TL_TestDraftContext_TopicExistingSelectionRun(),
    topic_candidate_notes: TL_TestDraftContext_TopicCandidateNotesRun(),
    topic_examples_retrieval: TL_TestDraftContext_TopicExamplesRetrievalRun(),
    topic_owner_rendering: TL_TestDraftContext_TopicOwnerRenderingRun()
  };
}

function TL_TestDraftContext_RenderPromptBriefRun() {
  const brief = TL_DraftContext_renderPromptBrief_(
    {
      contactId: "CI_1",
      name: "David Cohen",
      phone: "972541111111",
      email: "david@example.com"
    },
    [
      { noteType: "family_event", noteText: "His son has a wedding next week." }
    ],
    [
      { subject: "Quote follow-up", summary: "Asked whether he reviewed the quote." }
    ],
    [
      { direction: "incoming", summary: "Running late because of family event." }
    ]
  );

  return {
    ok: brief.indexOf("David Cohen") !== -1 &&
      brief.indexOf("His son has a wedding next week.") !== -1 &&
      brief.indexOf("Quote follow-up") !== -1 &&
      brief.indexOf("Running late because of family event.") !== -1,
    brief: brief
  };
}

function TL_TestDraftContext_PreviewTruncationRun() {
  const text = "abcdefghijklmnopqrstuvwxyz";
  const preview = TL_DraftContext_preview_(text, 10);
  return {
    ok: preview === "abcdefghij...",
    preview: preview
  };
}

function TL_TestDraftContext_TopicExistingSelectionRun() {
  const topics = [
    {
      topicId: "topic_documents_needed",
      topicSummary: "Missing mortgage documents"
    }
  ];
  const decision = TL_AI_normalizeTopicDecision_({
    topic_id: "topic_documents_needed",
    topic_candidate: "",
    topic_summary: "Missing mortgage documents",
    topic_confidence: "0.91"
  }, topics);
  const writeback = TL_AI_resolveTopicWriteback_({
    topic_id: "topic_documents_needed",
    topic_candidate: "",
    topic_summary: "Missing mortgage documents",
    topic_confidence: "0.91"
  }, { topics: topics }, [], "", { nowIso: "2026-03-24T10:00:00.000Z" });

  return {
    ok: decision.topic_id === "topic_documents_needed" &&
      decision.topic_candidate === "" &&
      !!writeback.registryWrite &&
      writeback.topic_tagged_at === "2026-03-24T10:00:00.000Z",
    decision: decision,
    writeback: {
      topic_id: writeback.topic_id,
      topic_candidate: writeback.topic_candidate,
      topic_tagged_at: writeback.topic_tagged_at,
      hasRegistryWrite: !!writeback.registryWrite
    }
  };
}

function TL_TestDraftContext_TopicCandidateNotesRun() {
  const topics = [
    {
      topicId: "topic_bank_response",
      topicSummary: "Waiting for bank response"
    }
  ];
  const writeback = TL_AI_resolveTopicWriteback_({
    topic_id: "",
    topic_candidate: "topic_appraisal_delay",
    topic_summary: "Appraisal delay",
    topic_confidence: "0.73"
  }, { topics: topics }, [], "email_triaged", { nowIso: "2026-03-24T10:05:00.000Z" });

  return {
    ok: writeback.topic_id === "" &&
      writeback.topic_candidate === "topic_appraisal_delay" &&
      writeback.notes.indexOf("topic_candidate=topic_appraisal_delay") !== -1 &&
      writeback.notes.indexOf("topic_candidate_summary=Appraisal delay") !== -1 &&
      !writeback.registryWrite,
    writeback: {
      topic_id: writeback.topic_id,
      topic_candidate: writeback.topic_candidate,
      notes: writeback.notes,
      hasRegistryWrite: !!writeback.registryWrite
    }
  };
}

function TL_TestDraftContext_TopicExamplesRetrievalRun() {
  const originalReadRecentRows = typeof TL_Orchestrator_readRecentRows_ === "function"
    ? TL_Orchestrator_readRecentRows_
    : null;
  try {
    TL_Orchestrator_readRecentRows_ = function() {
      return [
        {
          rowNumber: 2,
          values: TL_TestDraftContext_buildTopicExampleValues_({
            record_id: "REC_CURRENT",
            message_id: "MSG_CURRENT",
            topic_id: "topic_documents_needed",
            channel: "whatsapp",
            direction: "incoming",
            text: "I sent the documents today",
            timestamp: "2026-03-24T10:00:00.000Z"
          })
        },
        {
          rowNumber: 3,
          values: TL_TestDraftContext_buildTopicExampleValues_({
            record_id: "REC_1",
            message_id: "MSG_1",
            topic_id: "topic_documents_needed",
            channel: "whatsapp",
            direction: "outgoing",
            ai_proposal: "Please send the missing payslips and bank statements.",
            ai_summary: "Asked for missing mortgage documents.",
            approval_status: "approved",
            execution_status: "sent",
            timestamp: "2026-03-23T10:00:00.000Z"
          })
        },
        {
          rowNumber: 4,
          values: TL_TestDraftContext_buildTopicExampleValues_({
            record_id: "REC_2",
            message_id: "MSG_2",
            topic_id: "topic_documents_needed",
            channel: "email",
            direction: "outgoing",
            ai_proposal: "Thanks, I received the documents and will review them.",
            ai_summary: "Confirmed document receipt.",
            approval_status: "approved",
            execution_status: "executed",
            timestamp: "2026-03-22T10:00:00.000Z"
          })
        },
        {
          rowNumber: 5,
          values: TL_TestDraftContext_buildTopicExampleValues_({
            record_id: "REC_3",
            message_id: "MSG_3",
            topic_id: "topic_documents_needed",
            channel: "whatsapp",
            direction: "incoming",
            ai_summary: "Client says only the ID copy is still missing.",
            text: "Only the ID copy is still missing",
            timestamp: "2026-03-21T10:00:00.000Z"
          })
        },
        {
          rowNumber: 6,
          values: TL_TestDraftContext_buildTopicExampleValues_({
            record_id: "REC_4",
            message_id: "MSG_4",
            topic_id: "topic_bank_response",
            channel: "whatsapp",
            direction: "outgoing",
            ai_proposal: "We are still waiting for the bank response.",
            timestamp: "2026-03-23T10:00:00.000Z"
          })
        }
      ];
    };

    const examples = TL_DraftContext_fetchTopicExamples_("topic_documents_needed", {
      excludeTopicRecordId: "REC_CURRENT",
      excludeTopicMessageId: "MSG_CURRENT",
      topicExampleLimit: 3,
      topicExampleWindowDays: 30
    });
    const rendered = TL_DraftContext_renderTopicExampleSection_(examples);

    return {
      ok: examples.length === 3 &&
        examples[0].direction === "outgoing" &&
        examples[0].executionStatus === "sent" &&
        rendered.length === 3 &&
        rendered[0].indexOf("reply=Please send the missing payslips") !== -1,
      examples: examples,
      rendered: rendered
    };
  } finally {
    TL_Orchestrator_readRecentRows_ = originalReadRecentRows;
  }
}

function TL_TestDraftContext_TopicOwnerRenderingRun() {
  const brief = TL_DraftContext_renderPromptBrief_(
    {
      contactId: "CI_1",
      name: "David Cohen",
      phone: "972541111111",
      email: "david@example.com"
    },
    [],
    [],
    [],
    [
      {
        contactId: "GC_1",
        name: "Dana Banker",
        routingRole: "banker",
        role: "Mortgage Banker",
        org: "Leumi",
        phone1: "972501111111",
        email: "dana@example.com"
      }
    ],
    [],
    []
  );
  const review = TL_DraftContext_renderReviewBrief_(
    {
      contactId: "CI_1",
      name: "David Cohen",
      phone: "972541111111",
      email: "david@example.com"
    },
    [],
    [],
    [],
    [
      {
        contactId: "GC_1",
        name: "Dana Banker",
        routingRole: "banker",
        role: "Mortgage Banker",
        org: "Leumi"
      }
    ],
    []
  );

  return {
    ok: brief.indexOf("Likely topic handlers:") !== -1 &&
      brief.indexOf("Dana Banker") !== -1 &&
      review.indexOf("מטפל אפשרי: Dana Banker | routing_role=banker | org=Leumi") !== -1,
    brief: brief,
    review: review
  };
}

function TL_TestDraftContext_buildTopicExampleValues_(overrides) {
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
