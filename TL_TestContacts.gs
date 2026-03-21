/**
 * TL_TestContacts
 *
 * Deterministic tests for contact matching and merge behavior.
 */

function TL_TestContacts_RunAll() {
  return {
    match_by_phone: TL_TestContacts_MatchByPhoneRun(),
    preserve_manual_fields: TL_TestContacts_PreserveManualFieldsRun(),
    sync_mode_filter: TL_TestContacts_SyncModeFilterRun()
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
