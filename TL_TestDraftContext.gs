function TL_TestDraftContext_RunAll() {
  return {
    render_prompt_brief: TL_TestDraftContext_RenderPromptBriefRun(),
    preview_truncation: TL_TestDraftContext_PreviewTruncationRun(),
    topic_existing_selection: TL_TestDraftContext_TopicExistingSelectionRun(),
    topic_candidate_notes: TL_TestDraftContext_TopicCandidateNotesRun()
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
