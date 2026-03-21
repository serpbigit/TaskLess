function TL_TestContactEnrichment_RunAll() {
  return {
    candidate_search: TL_TestContactEnrichment_CandidateSearchRun(),
    item_build: TL_TestContactEnrichment_ItemBuildRun()
  };
}

function TL_TestContactEnrichment_CandidateSearchRun() {
  const contacts = [
    { contactId: "CI_1", name: "David Cohen", alias: "", email: "david@example.com", phone1: "972541111111", phone2: "" },
    { contactId: "CI_2", name: "Dana Levi", alias: "", email: "dana@example.com", phone1: "972542222222", phone2: "" }
  ];
  const candidates = TL_Menu_FindContactCandidatesByName_("David", contacts);
  return {
    ok: candidates.length === 1 && candidates[0].contactId === "CI_1",
    candidates: candidates
  };
}

function TL_TestContactEnrichment_ItemBuildRun() {
  const item = TL_Menu_BuildContactEnrichmentItem_(
    "make note that I met David and his son has a wedding next week",
    {
      contact_query: "David",
      note_type: "family_event",
      note_text: "I met David and his son has a wedding next week.",
      summary: "",
      proposal: ""
    },
    {
      contactId: "CI_1",
      name: "David Cohen",
      phone1: "972541111111",
      phone2: "",
      email: "david@example.com"
    }
  );

  return {
    ok: item.kind === "contact_enrichment" &&
      item.summary.indexOf("David Cohen") !== -1 &&
      item.notes.indexOf("contact_enrichment_note_type=family_event") !== -1 &&
      item.notes.indexOf("contact_enrichment_contact_id=CI_1") !== -1,
    item: item
  };
}
