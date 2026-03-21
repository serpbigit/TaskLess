function TL_TestDraftContext_RunAll() {
  return {
    render_prompt_brief: TL_TestDraftContext_RenderPromptBriefRun(),
    preview_truncation: TL_TestDraftContext_PreviewTruncationRun()
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
