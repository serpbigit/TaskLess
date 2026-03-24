/**
 * TL_TestContacts
 *
 * Deterministic tests for contact matching and merge behavior.
 */

function TL_TestContacts_RunAll() {
  return {
    match_by_phone: TL_TestContacts_MatchByPhoneRun(),
    preserve_manual_fields: TL_TestContacts_PreserveManualFieldsRun(),
    sync_mode_filter: TL_TestContacts_SyncModeFilterRun(),
    phone_candidate_split: TL_TestContacts_PhoneCandidateSplitRun(),
    replace_error_phone: TL_TestContacts_ReplaceErrorPhoneRun(),
    resolve_search_queries: TL_TestContacts_ResolveSearchQueriesRun(),
    topic_owners: TL_TestContacts_TopicOwnersRun(),
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
      merged.alias === "Dave" &&
      merged.tags === "vip" &&
      merged.last_note === "manual note" &&
      merged.org === "Acme" &&
      merged.role === "CEO" &&
      merged.labels.indexOf("Clients") !== -1,
    merged: merged
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

function TL_TestContacts_TopicOwnersRun() {
  const contacts = [
    {
      contactId: "GC_1",
      name: "Dana Banker",
      alias: "",
      org: "Leumi",
      role: "Banker",
      tags: "bank",
      email: "dana@example.com",
      phone1: "972501111111",
      phone2: "",
      notesInternal: "handled_topics=topic_documents_needed,topic_bank_response\nrouting_role=banker"
    },
    {
      contactId: "GC_2",
      name: "Liat Insurance",
      alias: "",
      org: "Clal",
      role: "Insurance Agent",
      tags: "insurance",
      email: "liat@example.com",
      phone1: "972502222222",
      phone2: "",
      notesInternal: "handled_topics=topic_insurance\nrouting_role=insurance"
    }
  ];

  const owners = TL_Contacts_findTopicOwners_("topic_documents_needed", { limit: 3 }, contacts);
  return {
    ok: owners.length === 1 &&
      owners[0].contactId === "GC_1" &&
      owners[0].routingRole === "banker" &&
      owners[0].handledTopics.indexOf("topic_bank_response") !== -1,
    owners: owners
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

  return {
    ok: emailBody.indexOf("Draft Email to David Cohen | david@example.com") !== -1 &&
      emailBody.indexOf("Subject: Good job") !== -1 &&
      waBody.indexOf("Draft WhatsApp to David Cohen | 972506847373") !== -1,
    emailBody: emailBody,
    waBody: waBody
  };
}
