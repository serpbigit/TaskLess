function TL_TestTopics_RunAll() {
  return {
    extract_candidate: TL_TestTopics_ExtractCandidateRun(),
    group_candidates: TL_TestTopics_GroupCandidatesRun(),
    promote_candidate_dry_run: TL_TestTopics_PromoteCandidateDryRun(),
    dismiss_candidate_dry_run: TL_TestTopics_DismissCandidateDryRun()
  };
}

function TL_TestTopics_ExtractCandidateRun() {
  const extracted = TL_Topics_extractCandidateFromNotes_([
    "email_triaged",
    "topic_candidate=topic_appraisal_delay",
    "topic_candidate_summary=Appraisal delay"
  ].join("\n"));
  return {
    ok: extracted.candidate === "topic_appraisal_delay" &&
      extracted.summary === "Appraisal delay",
    extracted: extracted
  };
}

function TL_TestTopics_GroupCandidatesRun() {
  const groups = TL_Topics_groupCandidatesFromRows_([
    {
      rowNumber: 2,
      values: TL_TestTopics_buildValues_({
        record_class: "communication",
        record_id: "REC_1",
        message_id: "MSG_1",
        channel: "whatsapp",
        direction: "incoming",
        notes: "topic_candidate=topic_documents_needed\ntopic_candidate_summary=Missing mortgage documents",
        ai_summary: "Client says two documents are still missing.",
        timestamp: "2026-03-24T10:00:00.000Z"
      })
    },
    {
      rowNumber: 3,
      values: TL_TestTopics_buildValues_({
        record_class: "communication",
        record_id: "REC_2",
        message_id: "MSG_2",
        channel: "email",
        direction: "incoming",
        notes: "topic_candidate=topic_documents_needed\ntopic_candidate_summary=Missing mortgage documents",
        ai_summary: "Client attached some but not all documents.",
        timestamp: "2026-03-23T10:00:00.000Z"
      })
    },
    {
      rowNumber: 4,
      values: TL_TestTopics_buildValues_({
        record_class: "communication",
        record_id: "REC_3",
        message_id: "MSG_3",
        channel: "whatsapp",
        direction: "incoming",
        notes: "topic_candidate=topic_bank_response\ntopic_candidate_summary=Waiting for bank response",
        ai_summary: "Client asks whether the bank answered.",
        timestamp: "2026-03-22T10:00:00.000Z"
      })
    }
  ], [
    { topicId: "topic_bank_response", topicSummary: "Waiting for bank response" }
  ], {
    sampleLimit: 2,
    groupLimit: 5
  });

  return {
    ok: groups.length === 2 &&
      groups[0].candidate === "topic_documents_needed" &&
      groups[0].count === 2 &&
      groups[1].existingTopicId === "topic_bank_response",
    groups: groups
  };
}

function TL_TestTopics_PromoteCandidateDryRun() {
  const result = TL_Topics_applyPromotionToInboxRows_({
    rowRefs: [
      { rowNumber: 2, topicId: "" },
      { rowNumber: 3, topicId: "topic_documents_needed" },
      { rowNumber: 4, topicId: "topic_other" }
    ]
  }, "topic_documents_needed", "2026-03-24T12:00:00.000Z", true);

  return {
    ok: result.matched === 3 &&
      result.updated === 0 &&
      result.conflicts === 0 &&
      result.rows[0].updated === true &&
      result.rows[1].updated === true &&
      result.rows[2].conflict === true,
    result: result
  };
}

function TL_TestTopics_DismissCandidateDryRun() {
  const result = TL_Topics_clearCandidateFromInboxRows_({
    rowRefs: [
      { rowNumber: 2 },
      { rowNumber: 3 }
    ]
  }, "2026-03-24T12:00:00.000Z", true, "topic_candidate_dismissed");

  return {
    ok: result.matched === 2 &&
      result.updated === 0 &&
      result.rows.length === 2 &&
      result.rows[0].updated === true &&
      result.rows[1].updated === true,
    result: result
  };
}

function TL_TestTopics_buildValues_(overrides) {
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
