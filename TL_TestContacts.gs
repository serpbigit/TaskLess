/**
 * TL_TestContacts
 *
 * Deterministic tests for contact matching and merge behavior.
 */

function TL_TestContacts_RunAll() {
  return {
    match_by_phone: TL_TestContacts_MatchByPhoneRun(),
    preserve_manual_fields: TL_TestContacts_PreserveManualFieldsRun(),
    dealwise_shape: TL_TestContacts_DealWiseShapeRun(),
    contacts_only_schema: TL_TestContacts_ContactsOnlySchemaRun(),
    summary_merge: TL_TestContacts_SummaryMergeRun(),
    manual_enrichment_patch: TL_TestContacts_ManualEnrichmentPatchRun(),
    outbound_patch: TL_TestContacts_OutboundPatchRun(),
    resolve_email_domain: TL_TestContacts_ResolveEmailDomainRun(),
    sync_mode_filter: TL_TestContacts_SyncModeFilterRun(),
    phone_candidate_split: TL_TestContacts_PhoneCandidateSplitRun(),
    replace_error_phone: TL_TestContacts_ReplaceErrorPhoneRun(),
    resolve_search_queries: TL_TestContacts_ResolveSearchQueriesRun(),
    resolve_identity_terms: TL_TestContacts_ResolveIdentityTermsRun(),
    resolve_request_email: TL_TestContacts_ResolveRequestEmailRun(),
    resolve_request_ambiguous: TL_TestContacts_ResolveRequestAmbiguousRun(),
    prepare_outbound_recipient: TL_TestContacts_PrepareOutboundRecipientRun(),
    outbound_card_format: TL_TestContacts_OutboundCardFormatRun()
  };
}

function TL_TestContacts_MatchByPhoneRun() {
  const existing = {
    rows: [],
    bySourceId: {},
    byPhone: {},
    byEmail: {}
  };
  const row = {
    contact_id: "CI_manual_1",
    name: "David Cohen",
    alias: "Dave",
    org: "",
    website: "",
    phone1: "+972541234567",
    phone2: "",
    email: "david@example.com",
    role: "",
    tags: "vip",
    last_note: "",
    last_enriched_at: "",
    source_system: "",
    source_id: "",
    phone1_normalized: "972541234567",
    phone2_normalized: "",
    email_normalized: "david@example.com",
    labels: "",
    sync_status: "manual",
    last_synced_at: "",
    notes_internal: ""
  };
  TL_Contacts_indexExistingRow_(existing, row, 2);

  const match = TL_Contacts_matchExistingRow_({
    source_id: "people/c123",
    phone1_normalized: "972541234567",
    phone2_normalized: "",
    email_normalized: "david@example.com"
  }, existing);

  return {
    ok: !!match && match.rowNumber === 2 && String(match.row.contact_id || "") === "CI_manual_1",
    rowNumber: match && match.rowNumber ? match.rowNumber : 0,
    contact_id: match && match.row ? String(match.row.contact_id || "") : ""
  };
}

function TL_TestContacts_PreserveManualFieldsRun() {
  const merged = TL_Contacts_mergeRow_({
    contact_id: "CI_manual_1",
    name: "David Cohen",
    alias: "Dave",
    org: "",
    website: "",
    phone1: "+972541234567",
    phone2: "",
    email: "david@example.com",
    role: "",
    tags: "vip",
    last_note: "manual note",
    last_enriched_at: "",
    source_system: "",
    source_id: "",
    phone1_normalized: "972541234567",
    phone2_normalized: "",
    email_normalized: "david@example.com",
    labels: "Old Label",
    sync_status: "manual",
    last_synced_at: "",
    notes_internal: ""
  }, {
    contact_id: "GC_c123",
    name: "David Cohen",
    org: "Acme",
    website: "https://acme.example",
    phone1: "+972541234567",
    phone2: "+972509999999",
    email: "david@example.com",
    role: "CEO",
    source_system: "google_contacts",
    source_id: "people/c123",
    phone1_normalized: "972541234567",
    phone2_normalized: "972509999999",
    email_normalized: "david@example.com",
    labels: "Clients",
    notes_internal: "google_contact_id=c123"
  }, "2026-03-21T12:30:00Z");

  return {
    ok: merged.contact_id === "CI_manual_1" &&
      merged.crm_id === "CI_manual_1" &&
      merged.display_name === "David Cohen" &&
      merged.alias === "Dave" &&
      merged.tags === "vip" &&
      merged.last_note === "manual note" &&
      merged.org === "Acme" &&
      merged.role === "CEO" &&
      String(merged.phones || "").indexOf("972509999999") !== -1 &&
      String(merged.emails || "").indexOf("david@example.com") !== -1 &&
      merged.labels.indexOf("Clients") !== -1,
    merged: merged
  };
}

function TL_TestContacts_DealWiseShapeRun() {
  const contact = TL_Contacts_buildSearchContactFromRow_({
    crm_id: "CRM_1",
    display_name: "Moshe Cohen",
    identity_terms: "Moshe\nמשה\nmy contractor",
    phones: "972541111111\n972542222222",
    emails: "moshe@example.com\nmoshe.work@example.com",
    personal_summary: "Has a daughter who got married recently.",
    business_summary: "Contractor for home renovation.",
    current_state: "Interested in next project.",
    next_action: "Follow up next week."
  });

  return {
    ok: contact.contactId === "CRM_1" &&
      contact.name === "Moshe Cohen" &&
      contact.phone1 === "972541111111" &&
      contact.phone2 === "972542222222" &&
      contact.email === "moshe@example.com" &&
      contact.identityTerms.indexOf("my contractor") !== -1 &&
      contact.businessSummary === "Contractor for home renovation.",
    contact: contact
  };
}

function TL_TestContacts_ContactsOnlySchemaRun() {
  const row = TL_Contacts_buildNewRow_({
    crm_id: "CRM_2",
    display_name: "Dana Banker",
    identity_terms: "Dana\nדנה\nthe banker",
    phones: "972501111111",
    emails: "dana@example.com",
    source_system: "google_contacts",
    source_id: "people/c123",
    last_updated: "2026-03-26T10:00:00Z"
  }, "2026-03-26T10:00:00Z");
  const skipped = TL_Contacts_RebuildIdentitySheet_();
  return {
    ok: String(row.identity_terms || "").indexOf("the banker") !== -1 &&
      String(row.phones || "").indexOf("972501111111") !== -1 &&
      String(row.emails || "").indexOf("dana@example.com") !== -1 &&
      skipped && skipped.ok === true &&
      skipped.skipped === true,
    row: row,
    identity_sheet: skipped
  };
}

function TL_TestContacts_SummaryMergeRun() {
  const merged = TL_Contacts_mergeSummaryText_(
    "Asked about pricing and delivery.",
    "Asked about pricing and delivery."
  );
  const appended = TL_Contacts_mergeSummaryText_(
    "Asked about pricing and delivery.",
    "Wants installation next week."
  );
  return {
    ok: merged === "Asked about pricing and delivery." &&
      appended.indexOf("Wants installation next week.") !== -1,
    merged: merged,
    appended: appended
  };
}

function TL_TestContacts_ManualEnrichmentPatchRun() {
  const row = TL_Contacts_buildNewRow_({
    crm_id: "CRM_3",
    display_name: "Yael",
    identity_terms: "Yael",
    phones: "972541111999",
    emails: "yael@example.com",
    personal_summary: "",
    business_summary: "Interested in kitchen renovation.",
    current_state: "Waiting for quote.",
    next_action: "",
    last_contact_at: "",
    last_updated: "2026-03-26T08:00:00Z"
  }, "2026-03-26T08:00:00Z");
  const patch = TL_Contacts_buildManualEnrichmentWritebackPatch_({
    display_name: "Yael",
    note_type: "family_event",
    note_text: "Her daughter got married recently.",
    last_updated: "2026-03-26T09:00:00Z"
  });
  const updated = TL_Contacts_applyPatchToRow_(row, patch, "2026-03-26T09:00:00Z");

  return {
    ok: updated.personal_summary.indexOf("daughter got married") !== -1 &&
      updated.business_summary.indexOf("Interested in kitchen renovation.") !== -1 &&
      updated.last_note.indexOf("daughter got married") !== -1 &&
      updated.last_enriched_at === "2026-03-26T09:00:00Z",
    updated: updated
  };
}

function TL_TestContacts_OutboundPatchRun() {
  const row = TL_Contacts_buildNewRow_({
    crm_id: "CRM_4",
    display_name: "Noam",
    identity_terms: "Noam",
    phones: "972542220000",
    emails: "noam@example.com",
    personal_summary: "",
    business_summary: "Asked about pricing.",
    current_state: "Interested.",
    next_action: "Prepare quote.",
    last_contact_at: "",
    last_updated: "2026-03-26T08:00:00Z"
  }, "2026-03-26T08:00:00Z");
  const patch = TL_Contacts_buildOutboundWritebackPatch_({
    email: "noam@example.com",
    summary: "Followed up after sending pricing details.",
    outbound_text: "Hi Noam, sending the pricing details here.",
    last_contact_at: "2026-03-26T09:15:00Z"
  }, "English");
  const updated = TL_Contacts_applyPatchToRow_(row, patch, "2026-03-26T09:15:00Z");

  return {
    ok: updated.business_summary.indexOf("Followed up after sending pricing details.") !== -1 &&
      updated.current_state === "Waiting for reply." &&
      updated.next_action === "Wait for reply and check whether follow-up is needed." &&
      updated.last_contact_at === "2026-03-26T09:15:00Z",
    updated: updated
  };
}

function TL_TestContacts_ResolveEmailDomainRun() {
  const contacts = [
    TL_Contacts_buildSearchContactFromRow_({
      crm_id: "CRM_DOM_1",
      display_name: "Leah",
      identity_terms: "Leah\ncontractor",
      phones: "972541010101",
      emails: "leah@gmail.com",
      business_summary: "Contractor"
    }),
    TL_Contacts_buildSearchContactFromRow_({
      crm_id: "CRM_DOM_2",
      display_name: "Ronen",
      identity_terms: "Ronen",
      phones: "972542020202",
      emails: "ronen@company.com",
      business_summary: "Designer"
    })
  ];
  const result = TL_Contacts_ResolveRequest_({
    rawText: "the contractor from gmail",
    extraction: {
      search_queries: [
        { type: "identity_term", value: "contractor" },
        { type: "email_domain", value: "gmail.com" }
      ]
    }
  }, { channel: "" }, contacts);
  return {
    ok: !!(result && result.contact && result.contact.contactId === "CRM_DOM_1"),
    result: result
  };
}

function TL_TestContacts_SyncModeFilterRun() {
  const both = {
    phone1_normalized: "972541234567",
    phone2_normalized: "",
    email_normalized: "david@example.com"
  };
  const phoneOnly = {
    phone1_normalized: "972500000000",
    phone2_normalized: "",
    email_normalized: ""
  };
  const emailOnly = {
    phone1_normalized: "",
    phone2_normalized: "",
    email_normalized: "only@example.com"
  };

  return {
    ok: TL_Contacts_isImportable_(both, "both_only") === true &&
      TL_Contacts_isImportable_(phoneOnly, "both_only") === false &&
      TL_Contacts_isImportable_(emailOnly, "both_only") === false &&
      TL_Contacts_isImportable_(phoneOnly, "phone_only") === true &&
      TL_Contacts_isImportable_(emailOnly, "email_only") === true,
    both_only_both: TL_Contacts_isImportable_(both, "both_only"),
    both_only_phone: TL_Contacts_isImportable_(phoneOnly, "both_only"),
    both_only_email: TL_Contacts_isImportable_(emailOnly, "both_only")
  };
}

function TL_TestContacts_PhoneCandidateSplitRun() {
  const values = TL_Contacts_extractPhones_([
    { value: "718-5499000 ext 117 718-5498800" },
    { value: "917-796-0803 car #  917 2828237" }
  ]);

  return {
    ok: values.length === 4 &&
      values[0] === "7185499000" &&
      values[1] === "7185498800" &&
      values[2] === "9177960803" &&
      values[3] === "9172828237",
    values: values
  };
}

function TL_TestContacts_ReplaceErrorPhoneRun() {
  const merged = TL_Contacts_mergeRow_({
    contact_id: "GC_c123",
    name: "Maria",
    alias: "",
    org: "",
    website: "",
    phone1: "#ERROR!",
    phone2: "",
    email: "maria@example.com",
    role: "",
    tags: "",
    last_note: "",
    last_enriched_at: "",
    source_system: "google_contacts",
    source_id: "people/c123",
    phone1_normalized: "",
    phone2_normalized: "",
    email_normalized: "maria@example.com",
    labels: "",
    sync_status: "synced",
    last_synced_at: "",
    notes_internal: ""
  }, {
    contact_id: "GC_c123",
    name: "Maria",
    phone1: "972546629996",
    phone2: "",
    email: "maria@example.com",
    source_system: "google_contacts",
    source_id: "people/c123",
    phone1_normalized: "972546629996",
    phone2_normalized: "",
    email_normalized: "maria@example.com",
    labels: "",
    notes_internal: "google_contact_id=c123"
  }, "2026-03-21T13:50:00Z");

  return {
    ok: merged.phone1 === "972546629996" && merged.phone1_normalized === "972546629996",
    merged: merged
  };
}

function TL_TestContacts_ResolveSearchQueriesRun() {
  const contacts = [
    {
      contactId: "GC_1",
      name: "אופיר כהן",
      alias: "Ofir Cohen",
      org: "",
      role: "",
      tags: "",
      email: "ofir@example.com",
      phone1: "972509639111",
      phone2: "",
      phone1Norm: "972509639111",
      phone2Norm: "",
      emailNorm: "ofir@example.com"
    },
    {
      contactId: "GC_2",
      name: "אורי לוי",
      alias: "Uri Levi",
      org: "",
      role: "",
      tags: "",
      email: "uri@example.com",
      phone1: "972501112222",
      phone2: "",
      phone1Norm: "972501112222",
      phone2Norm: "",
      emailNorm: "uri@example.com"
    }
  ];

  const result = TL_Contacts_resolveBySearchHints_({
    rawText: "אני מחפש את אופיר בטלפון עם ספרות 963",
    extraction: {
      contact_query: "אופיר",
      search_queries: [
        { type: "name", value: "אופיר" },
        { type: "name", value: "Ofir" },
        { type: "name_prefix", value: "אופ" },
        { type: "phone_fragment", value: "963" }
      ]
    }
  }, contacts);

  return {
    ok: !!(result && result.contact && result.contact.contactId === "GC_1") &&
      Array.isArray(result.candidates) &&
      result.candidates.length > 0 &&
      result.candidates[0].contactId === "GC_1",
    resolved: result && result.contact ? result.contact.contactId : "",
    firstCandidate: result && result.candidates && result.candidates[0] ? result.candidates[0].contactId : "",
    queries: result && result.queries ? result.queries : []
  };
}

function TL_TestContacts_ResolveIdentityTermsRun() {
  const contacts = [
    TL_Contacts_buildSearchContactFromRow_({
      crm_id: "CRM_REL_1",
      display_name: "Yaakov Installer",
      identity_terms: "Yaakov\nיעקב\nthe installer\nmy son",
      phones: "972503333333",
      emails: "yaakov@example.com",
      business_summary: "Installer for windows."
    })
  ];

  const result = TL_Contacts_resolveBySearchHints_({
    rawText: "find my son",
    extraction: {
      contact_query: "my son",
      search_queries: [
        { type: "relationship", value: "my son" }
      ]
    }
  }, contacts);

  return {
    ok: !!(result && result.contact && result.contact.contactId === "CRM_REL_1"),
    result: result
  };
}

function TL_TestContacts_ResolveRequestEmailRun() {
  const contacts = [
    {
      contactId: "GC_1",
      name: "David Cohen",
      alias: "David",
      org: "",
      role: "",
      tags: "",
      email: "david@example.com",
      phone1: "972506847373",
      phone2: "",
      phone1Norm: "972506847373",
      phone2Norm: "",
      emailNorm: "david@example.com"
    }
  ];

  const result = TL_Contacts_ResolveRequest_({
    rawText: "email David that this works",
    extraction: {
      recipient_query: "David",
      search_queries: [
        { type: "name", value: "David" },
        { type: "name_prefix", value: "Dav" }
      ]
    }
  }, { channel: "email" }, contacts);

  return {
    ok: result.status === "resolved" &&
      result.contact &&
      result.contact.contactId === "GC_1" &&
      result.destination === "david@example.com" &&
      Array.isArray(result.queries) &&
      result.queries.length >= 2,
    result: result
  };
}

function TL_TestContacts_ResolveRequestAmbiguousRun() {
  const contacts = [
    {
      contactId: "GC_1",
      name: "John Cohen",
      alias: "John",
      org: "",
      role: "",
      tags: "",
      email: "john1@example.com",
      phone1: "972501111111",
      phone2: "",
      phone1Norm: "972501111111",
      phone2Norm: "",
      emailNorm: "john1@example.com"
    },
    {
      contactId: "GC_2",
      name: "John Levi",
      alias: "John",
      org: "",
      role: "",
      tags: "",
      email: "john2@example.com",
      phone1: "972502222222",
      phone2: "",
      phone1Norm: "972502222222",
      phone2Norm: "",
      emailNorm: "john2@example.com"
    }
  ];

  const result = TL_Contacts_ResolveRequest_({
    rawText: "message John",
    extraction: {
      recipient_query: "John",
      search_queries: [
        { type: "name", value: "John" }
      ]
    }
  }, { channel: "whatsapp" }, contacts);

  return {
    ok: result.status === "ambiguous" &&
      !result.contact &&
      Array.isArray(result.candidates) &&
      result.candidates.length === 2,
    result: result
  };
}

function TL_TestContacts_PrepareOutboundRecipientRun() {
  const contacts = [
    {
      contactId: "GC_1",
      name: "David Cohen",
      alias: "David",
      org: "",
      role: "",
      tags: "",
      email: "david@example.com",
      phone1: "972506847373",
      phone2: "",
      phone1Norm: "972506847373",
      phone2Norm: "",
      emailNorm: "david@example.com"
    }
  ];

  const result = TL_Capture_prepareOutboundRecipient_({
    kind: "email",
    title: "Good job",
    summary: "Send David a quick note.",
    proposal: "This works.",
    subject: "Good job",
    recipient_query: "David",
    search_queries: [
      { type: "name", value: "David" },
      { type: "name_prefix", value: "Dav" }
    ]
  }, "Email David that this works.", contacts);

  return {
    ok: result &&
      result.resolution_status === "resolved" &&
      result.recipient_name === "David Cohen" &&
      result.recipient_destination === "david@example.com" &&
      result.recipient_contact_id === "GC_1",
    result: result
  };
}

function TL_TestContacts_OutboundCardFormatRun() {
  const emailBody = TL_Menu_BuildDecisionPacketProposalBody_({
    captureKind: "email",
    recipientName: "David Cohen",
    recipientDestination: "david@example.com",
    proposal: "This works.",
    subject: "Good job"
  });
  const waBody = TL_Menu_BuildDecisionPacketProposalBody_({
    captureKind: "whatsapp",
    recipientName: "David Cohen",
    recipientDestination: "972506847373",
    proposal: "I'll be back in an hour."
  });

  const expectedLanguage = typeof TL_Language_BossUiLanguage_ === "function"
    ? TL_Language_BossUiLanguage_()
    : "Hebrew";
  const expectsHebrew = typeof TL_Language_IsHebrew_ === "function"
    ? TL_Language_IsHebrew_(expectedLanguage)
    : String(expectedLanguage || "").toLowerCase() === "hebrew";

  return {
    ok: emailBody.indexOf("David Cohen | david@example.com") !== -1 &&
      emailBody.indexOf("Good job") !== -1 &&
      waBody.indexOf("David Cohen | 972506847373") !== -1 &&
      (expectsHebrew
        ? (emailBody.indexOf("טיוטת אימייל אל") !== -1 &&
          emailBody.indexOf("נושא: Good job") !== -1 &&
          waBody.indexOf("טיוטת WhatsApp אל") !== -1)
        : (emailBody.indexOf("Draft Email to") !== -1 &&
          emailBody.indexOf("Subject: Good job") !== -1 &&
          waBody.indexOf("Draft WhatsApp to") !== -1)),
    expectedLanguage: expectedLanguage,
    emailBody: emailBody,
    waBody: waBody
  };
}
