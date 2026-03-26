function TL_TestDraftContext_RunAll() {
  return {
    render_prompt_brief: TL_TestDraftContext_RenderPromptBriefRun(),
    preview_truncation: TL_TestDraftContext_PreviewTruncationRun(),
    contact_row_memory: TL_TestDraftContext_ContactRowMemoryRun(),
    contacts_only_topics_disabled: TL_TestDraftContext_ContactsOnlyTopicsDisabledRun()
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

function TL_TestDraftContext_ContactRowMemoryRun() {
  const contact = {
    contactId: "CI_1",
    name: "David Cohen",
    phone: "972541111111",
    email: "david@example.com",
    personalSummary: "His son has a wedding next week.",
    businessSummary: "Waiting for the signed quote.",
    currentState: "Interested and comparing options.",
    nextAction: "Follow up on Tuesday."
  };
  const enrichments = TL_DraftContext_fetchEnrichments_(contact, { enrichmentLimit: 10 });
  const brief = TL_DraftContext_renderPromptBrief_(contact, enrichments, [], []);

  return {
    ok: enrichments.length === 4 &&
      brief.indexOf("His son has a wedding next week.") !== -1 &&
      brief.indexOf("Waiting for the signed quote.") !== -1 &&
      brief.indexOf("Follow up on Tuesday.") !== -1,
    enrichments: enrichments,
    brief: brief
  };
}

function TL_TestDraftContext_ContactsOnlyTopicsDisabledRun() {
  const topics = TL_DraftContext_fetchTopics_(null, { topicLimit: 10 });
  const registryWrite = TL_AI_upsertTopicRegistry_({
    topicDecision: { topic_id: "topic_documents_needed" }
  });
  return {
    ok: Array.isArray(topics) &&
      topics.length === 0 &&
      registryWrite &&
      registryWrite.ok === true &&
      registryWrite.skipped === true,
    topics: topics,
    registryWrite: registryWrite
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
