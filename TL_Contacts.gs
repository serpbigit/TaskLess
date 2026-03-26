/**
 * TL_Contacts
 *
 * Manual Google Contacts sync into CONTACTS.
 * This is intended as an admin/setup tool for now, not a background worker.
 */

const TL_CONTACTS = {
  SOURCE_SYSTEM: "google_contacts",
  DEFAULT_PAGE_SIZE: 500,
  DEFAULT_SYNC_MODE: "both_only"
};

function TL_Contacts_SyncGoogleContacts_DryRun() {
  const result = TL_Contacts_SyncGoogleContacts({ dryRun: true });
  TL_Contacts_logRunnerResult_("TL_Contacts_SyncGoogleContacts_DryRun", result);
  return result;
}

function TL_Contacts_SyncGoogleContacts(options) {
  const opts = options || {};
  const dryRun = opts.dryRun === true || String(opts.dryRun || "").toLowerCase() === "true";
  const syncMode = TL_Contacts_normalizeSyncMode_(opts.syncMode || TL_CONTACTS.DEFAULT_SYNC_MODE);
  TL_Contacts_assertPeopleApiReady_();
  const sheet = TL_Contacts_getSheet_();
  const headers = TL_Contacts_headers_();
  const existing = TL_Contacts_readExistingRows_(sheet, headers);
  const groupNames = TL_Contacts_fetchGroupNames_();
  const people = TL_Contacts_fetchPeople_();
  const nowIso = new Date().toISOString();
  const result = {
    ok: true,
    dryRun: dryRun,
    syncMode: syncMode,
    fetched: people.length,
    with_both: 0,
    phone_only: 0,
    email_only: 0,
    neither: 0,
    importable: 0,
    skipped_by_filter: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    ambiguous: 0,
    sample: []
  };

  for (let i = 0; i < people.length; i++) {
    const mapped = TL_Contacts_mapGooglePerson_(people[i], groupNames, nowIso);
    if (!mapped) {
      result.skipped++;
      continue;
    }

    const profile = TL_Contacts_profileKind_(mapped);
    if (profile === "both") result.with_both++;
    else if (profile === "phone_only") result.phone_only++;
    else if (profile === "email_only") result.email_only++;
    else result.neither++;

    if (!TL_Contacts_isImportable_(mapped, syncMode)) {
      result.skipped_by_filter++;
      continue;
    }
    result.importable++;

    const match = TL_Contacts_matchExistingRow_(mapped, existing);
    if (match.ambiguous) {
      result.ambiguous++;
      result.sample.push({
        name: mapped.name,
        source_id: mapped.source_id,
        action: "ambiguous"
      });
      continue;
    }

    if (match.row) {
      const merged = TL_Contacts_mergeRow_(match.row, mapped, nowIso);
      if (TL_Contacts_rowsEqual_(match.row, merged, headers)) {
        result.skipped++;
        continue;
      }
      result.updated++;
      result.sample.push({
        name: merged.name,
        source_id: merged.source_id,
        action: "updated"
      });
      if (!dryRun) {
        TL_Contacts_writeRowObject_(sheet, headers, match.rowNumber, merged);
        TL_Contacts_reindexRow_(existing, merged, match.rowNumber);
      }
      continue;
    }

    const created = TL_Contacts_buildNewRow_(mapped, nowIso);
    result.created++;
    result.sample.push({
      name: created.name,
      source_id: created.source_id,
      action: "created"
    });
    if (!dryRun) {
      TL_Contacts_appendRowObject_(sheet, headers, created);
      TL_Contacts_reindexRow_(existing, created, sheet.getLastRow());
    }
  }

  TL_Contacts_logSyncResult_(result);
  result.sample = result.sample.slice(0, 10);
  TL_Contacts_logRunnerResult_("TL_Contacts_SyncGoogleContacts", result);
  return result;
}

function TL_Contacts_assertPeopleApiReady_() {
  if (typeof People === "undefined" || !People || !People.People || !People.People.Connections) {
    throw new Error("Google People API is not enabled in this Apps Script project. Enable the advanced service named 'Google People API' before running contact sync.");
  }
}

function TL_Contacts_getSheet_() {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  const ss = sheetId ? SpreadsheetApp.openById(sheetId) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("CONTACTS");
  if (!sh) {
    sh = ss.insertSheet("CONTACTS");
  }
  const headers = TL_Contacts_headers_();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
  return sh;
}

function TL_Contacts_headers_() {
  if (typeof TL_SCHEMA !== "undefined" && TL_SCHEMA.CONTACTS_HEADERS && TL_SCHEMA.CONTACTS_HEADERS.length) {
    return TL_SCHEMA.CONTACTS_HEADERS.slice();
  }
  return [
    "contact_id","name","alias","org","website","phone1","phone2","email","role","tags","last_note","last_enriched_at",
    "source_system","source_id","phone1_normalized","phone2_normalized","email_normalized","labels","sync_status","last_synced_at","notes_internal",
    "crm_id","display_name","identity_terms","phones","emails","personal_summary","business_summary","current_state","next_action","last_contact_at","last_updated"
  ];
}

function TL_Contacts_fetchPeople_() {
  const out = [];
  let pageToken = "";
  do {
    const response = People.People.Connections.list("people/me", {
      pageSize: TL_CONTACTS.DEFAULT_PAGE_SIZE,
      pageToken: pageToken || undefined,
      personFields: "names,phoneNumbers,emailAddresses,organizations,urls,memberships",
      sources: ["READ_SOURCE_TYPE_CONTACT"]
    });
    const batch = response && response.connections ? response.connections : [];
    for (let i = 0; i < batch.length; i++) out.push(batch[i]);
    pageToken = response && response.nextPageToken ? String(response.nextPageToken) : "";
  } while (pageToken);
  return out;
}

function TL_Contacts_fetchGroupNames_() {
  const out = {};
  try {
    let pageToken = "";
    do {
      const response = People.ContactGroups.list({
        pageSize: TL_CONTACTS.DEFAULT_PAGE_SIZE,
        pageToken: pageToken || undefined
      });
      const groups = response && response.contactGroups ? response.contactGroups : [];
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (group && group.resourceName) {
          out[String(group.resourceName)] = String(group.name || "");
        }
      }
      pageToken = response && response.nextPageToken ? String(response.nextPageToken) : "";
    } while (pageToken);
  } catch (err) {
    // Best-effort only. Sync should still work without label names.
  }
  return out;
}

function TL_Contacts_mapGooglePerson_(person, groupNames, nowIso) {
  if (!person || !person.resourceName) return null;
  const personId = String(person.resourceName).split("/").pop();
  const phones = TL_Contacts_extractPhones_(person.phoneNumbers);
  const emails = TL_Contacts_pickValues_(person.emailAddresses, "value").map(function(value) {
    return TL_Contacts_normalizeEmail_(value);
  }).filter(Boolean);
  const nameTerms = TL_Contacts_extractNameTerms_(person.names);
  const organizations = person.organizations || [];
  const urls = TL_Contacts_pickValues_(person.urls, "value");
  const labels = TL_Contacts_extractLabels_(person.memberships, groupNames);
  const org = organizations.length ? String(organizations[0].name || "").trim() : "";
  const role = organizations.length ? String(organizations[0].title || "").trim() : "";
  const displayName = TL_Contacts_pickDisplayName_(person.names);
  const identityTerms = TL_Contacts_mergeMultiValueLists_([
    nameTerms,
    org ? [org] : [],
    role ? [role] : [],
    labels
  ]);
  const row = {
    contact_id: "GC_" + personId,
    name: displayName,
    alias: "",
    org: org,
    website: urls.length ? urls[0] : "",
    phone1: phones.length ? phones[0] : "",
    phone2: phones.length > 1 ? phones[1] : "",
    email: emails.length ? emails[0] : "",
    role: role,
    tags: "",
    last_note: "",
    last_enriched_at: "",
    source_system: TL_CONTACTS.SOURCE_SYSTEM,
    source_id: String(person.resourceName || ""),
    phone1_normalized: phones.length ? TLW_normalizePhone_(phones[0]) : "",
    phone2_normalized: phones.length > 1 ? TLW_normalizePhone_(phones[1]) : "",
    email_normalized: emails.length ? emails[0] : "",
    labels: labels.join(", "),
    sync_status: "synced",
    last_synced_at: nowIso,
    notes_internal: "google_contact_id=" + personId,
    crm_id: "GC_" + personId,
    display_name: displayName,
    identity_terms: TL_Contacts_stringifyMultiValueField_(identityTerms),
    phones: TL_Contacts_stringifyMultiValueField_(phones),
    emails: TL_Contacts_stringifyMultiValueField_(emails),
    personal_summary: "",
    business_summary: TL_Contacts_composeBusinessSummary_(org, role, urls),
    current_state: "",
    next_action: "",
    last_contact_at: "",
    last_updated: nowIso
  };
  return TL_Contacts_attachLegacyAliases_(row);
}

function TL_Contacts_normalizeSyncMode_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["both_only", "phone_only", "email_only", "all"];
  return allowed.indexOf(v) !== -1 ? v : TL_CONTACTS.DEFAULT_SYNC_MODE;
}

function TL_Contacts_profileKind_(mapped) {
  const hasPhone = TL_Contacts_extractPhonesFromRow_(mapped).length > 0;
  const hasEmail = TL_Contacts_extractEmailsFromRow_(mapped).length > 0;
  if (hasPhone && hasEmail) return "both";
  if (hasPhone) return "phone_only";
  if (hasEmail) return "email_only";
  return "neither";
}

function TL_Contacts_isImportable_(mapped, syncMode) {
  const profile = TL_Contacts_profileKind_(mapped);
  if (syncMode === "all") return profile !== "neither";
  if (syncMode === "phone_only") return profile === "phone_only" || profile === "both";
  if (syncMode === "email_only") return profile === "email_only" || profile === "both";
  return profile === "both";
}

function TL_Contacts_ProfileStats() {
  TL_Contacts_assertPeopleApiReady_();
  const groupNames = TL_Contacts_fetchGroupNames_();
  const people = TL_Contacts_fetchPeople_();
  const nowIso = new Date().toISOString();
  const result = {
    ok: true,
    fetched: people.length,
    with_both: 0,
    phone_only: 0,
    email_only: 0,
    neither: 0
  };

  for (let i = 0; i < people.length; i++) {
    const mapped = TL_Contacts_mapGooglePerson_(people[i], groupNames, nowIso);
    if (!mapped) {
      result.neither++;
      continue;
    }
    const profile = TL_Contacts_profileKind_(mapped);
    if (profile === "both") result.with_both++;
    else if (profile === "phone_only") result.phone_only++;
    else if (profile === "email_only") result.email_only++;
    else result.neither++;
  }

  TL_Contacts_logRunnerResult_("TL_Contacts_ProfileStats", result);
  return result;
}

function TL_Contacts_DebugPeopleApi() {
  TL_Contacts_assertPeopleApiReady_();

  const groupResponse = People.ContactGroups.list({
    pageSize: 20
  }) || {};

  let myContactsResponse = {};
  let otherContactsResponse = {};
  try {
    myContactsResponse = People.ContactGroups.get("contactGroups/myContacts", {
      maxMembers: 10
    }) || {};
  } catch (err) {
    myContactsResponse = { _error: String(err && err.message ? err.message : err) };
  }

  try {
    otherContactsResponse = People.OtherContacts.list({
      pageSize: 10,
      readMask: "names,emailAddresses,phoneNumbers"
    }) || {};
  } catch (err) {
    otherContactsResponse = { _error: String(err && err.message ? err.message : err) };
  }

  const peopleResponse = People.People.Connections.list("people/me", {
    pageSize: 10,
    personFields: "names,phoneNumbers,emailAddresses,memberships",
    sources: ["READ_SOURCE_TYPE_CONTACT"]
  }) || {};

  const sampleConnections = (peopleResponse.connections || []).slice(0, 5).map(function(person) {
    const name = TL_Contacts_pickDisplayName_(person.names);
    const phones = TL_Contacts_pickValues_(person.phoneNumbers, "value");
    const emails = TL_Contacts_pickValues_(person.emailAddresses, "value");
    return {
      resourceName: String(person.resourceName || ""),
      name: name,
      phones: phones,
      emails: emails
    };
  });

  const result = {
    ok: true,
    account_email_hint: Session.getActiveUser().getEmail(),
    contact_groups_count: (groupResponse.contactGroups || []).length,
    contact_group_names: (groupResponse.contactGroups || []).slice(0, 10).map(function(group) {
      return String(group && group.name ? group.name : "");
    }),
    my_contacts_member_count: myContactsResponse.memberCount,
    my_contacts_members_sample_count: (myContactsResponse.memberResourceNames || []).length,
    my_contacts_error: myContactsResponse._error || "",
    other_contacts_first_page_count: (otherContactsResponse.otherContacts || []).length,
    other_contacts_error: otherContactsResponse._error || "",
    connections_count_first_page: (peopleResponse.connections || []).length,
    next_page_token_present: !!peopleResponse.nextPageToken,
    people_response_keys: Object.keys(peopleResponse || {}),
    sample_connections: sampleConnections
  };

  TL_Contacts_logRunnerResult_("TL_Contacts_DebugPeopleApi", result);
  return result;
}

function TL_Contacts_pickDisplayName_(names) {
  if (!names || !names.length) return "No Name";
  for (let i = 0; i < names.length; i++) {
    if (names[i] && names[i].displayName) return String(names[i].displayName).trim();
  }
  return "No Name";
}

function TL_Contacts_extractNameTerms_(names) {
  const out = [];
  (names || []).forEach(function(item) {
    const display = String(item && item.displayName || "").trim();
    const given = String(item && item.givenName || "").trim();
    const family = String(item && item.familyName || "").trim();
    [display, given, family, [given, family].filter(Boolean).join(" ")].forEach(function(value) {
      if (!value) return;
      if (out.indexOf(value) === -1) out.push(value);
    });
  });
  return out;
}

function TL_Contacts_pickValues_(items, fieldName) {
  const out = [];
  (items || []).forEach(function(item) {
    const value = String(item && item[fieldName] ? item[fieldName] : "").trim();
    if (value && out.indexOf(value) === -1) out.push(value);
  });
  return out;
}

function TL_Contacts_extractPhones_(phoneNumbers) {
  const out = [];
  (phoneNumbers || []).forEach(function(item) {
    const rawValue = String(item && item.value ? item.value : "").trim();
    TL_Contacts_splitPhoneCandidates_(rawValue).forEach(function(candidate) {
      if (!candidate || out.indexOf(candidate) !== -1) return;
      out.push(candidate);
    });
  });
  return out;
}

function TL_Contacts_splitPhoneCandidates_(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return [];

  const cleaned = raw
    .replace(/\b(?:ext|extension|x)\b[\s\.:#-]*\d+/gi, " ")
    .replace(/\bcar\b[\s\.:#-]*/gi, " ")
    .replace(/[\r\n;,\/]+/g, " | ")
    .replace(/\s{2,}/g, " | ");

  const parts = cleaned.split("|").map(function(part) {
    return String(part || "").trim();
  }).filter(Boolean);

  const out = [];
  parts.forEach(function(part) {
    const normalized = TL_Contacts_normalizePhoneCandidate_(part);
    if (!normalized || out.indexOf(normalized) !== -1) return;
    out.push(normalized);
  });
  return out;
}

function TL_Contacts_normalizePhoneCandidate_(value) {
  let digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";

  if (digits.indexOf("00") === 0 && digits.length > 4) {
    digits = digits.slice(2);
  }

  // Israel local numbers often appear without country code in Contacts.
  if (digits.indexOf("972") === 0) {
    return digits;
  }
  if (digits.length === 10 && digits.charAt(0) === "0") {
    return "972" + digits.slice(1);
  }
  if (digits.length === 9 && /^[23589]/.test(digits)) {
    return "972" + digits;
  }
  if (digits.length === 8 && /^[23489]/.test(digits)) {
    return "972" + digits;
  }

  return digits;
}

function TL_Contacts_extractLabels_(memberships, groupNames) {
  const out = [];
  (memberships || []).forEach(function(item) {
    const groupMembership = item && item.contactGroupMembership ? item.contactGroupMembership : null;
    const resourceName = groupMembership && groupMembership.contactGroupResourceName
      ? String(groupMembership.contactGroupResourceName)
      : "";
    if (!resourceName) return;
    const label = String((groupNames && groupNames[resourceName]) || resourceName).trim();
    if (!label) return;
    if (/mycontacts|starred|friends/i.test(label)) return;
    if (out.indexOf(label) === -1) out.push(label);
  });
  return out;
}

function TL_Contacts_readExistingRows_(sheet, headers) {
  const out = {
    rows: [],
    bySourceId: {},
    byPhone: {},
    byEmail: {}
  };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const rowNumber = i + 2;
    const row = TL_Contacts_rowValuesToObject_(headers, values[i]);
    out.rows.push({ rowNumber: rowNumber, row: row });
    TL_Contacts_indexExistingRow_(out, row, rowNumber);
  }
  return out;
}

function TL_Contacts_rowValuesToObject_(headers, values) {
  const out = {};
  for (let i = 0; i < headers.length; i++) {
    out[String(headers[i] || "")] = values[i];
  }
  return TL_Contacts_attachLegacyAliases_(out);
}

function TL_Contacts_indexExistingRow_(index, row, rowNumber) {
  const sourceId = String(row && row.source_id || "").trim();
  const phones = TL_Contacts_extractPhonesFromRow_(row);
  const emails = TL_Contacts_extractEmailsFromRow_(row);

  if (sourceId) index.bySourceId[sourceId] = { rowNumber: rowNumber, row: row };
  phones.forEach(function(phone) {
    if (!index.byPhone[phone]) index.byPhone[phone] = [];
    index.byPhone[phone].push({ rowNumber: rowNumber, row: row });
  });
  emails.forEach(function(email) {
    if (!index.byEmail[email]) index.byEmail[email] = [];
    index.byEmail[email].push({ rowNumber: rowNumber, row: row });
  });
}

function TL_Contacts_matchExistingRow_(mapped, existing) {
  const sourceId = String(mapped.source_id || "").trim();
  if (sourceId && existing.bySourceId[sourceId]) {
    return existing.bySourceId[sourceId];
  }

  const candidates = {};
  TL_Contacts_extractPhonesFromRow_(mapped).forEach(function(phone) {
    (existing.byPhone[phone] || []).forEach(function(item) {
      candidates["row_" + item.rowNumber] = item;
    });
  });
  TL_Contacts_extractEmailsFromRow_(mapped).forEach(function(email) {
    (existing.byEmail[email] || []).forEach(function(item) {
      candidates["row_" + item.rowNumber] = item;
    });
  });

  const matches = Object.keys(candidates).map(function(key) { return candidates[key]; });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return { ambiguous: true, matches: matches };
  return { row: null, rowNumber: 0 };
}

function TL_Contacts_mergeRow_(existingRow, mapped, nowIso) {
  const existingSafe = TL_Contacts_attachLegacyAliases_(existingRow || {});
  const mappedSafe = TL_Contacts_attachLegacyAliases_(mapped || {});
  const merged = Object.assign({}, existingSafe || {});
  const mergedPhones = TL_Contacts_mergeMultiValueLists_([
    TL_Contacts_extractPhonesFromRow_(existingSafe),
    TL_Contacts_extractPhonesFromRow_(mappedSafe)
  ]);
  const mergedEmails = TL_Contacts_mergeMultiValueLists_([
    TL_Contacts_extractEmailsFromRow_(existingSafe),
    TL_Contacts_extractEmailsFromRow_(mappedSafe)
  ]);
  const mergedIdentityTerms = TL_Contacts_mergeMultiValueLists_([
    TL_Contacts_extractIdentityTermsFromRow_(existingSafe),
    TL_Contacts_extractIdentityTermsFromRow_(mappedSafe)
  ]);
  merged.crm_id = TL_Contacts_rowContactId_(existingSafe) || TL_Contacts_rowContactId_(mappedSafe);
  merged.contact_id = merged.crm_id;
  merged.display_name = TL_Contacts_chooseSyncValue_(existingSafe.display_name || existingSafe.name, mappedSafe.display_name || mappedSafe.name);
  merged.name = merged.display_name;
  merged.org = TL_Contacts_chooseSyncValue_(existingSafe.org, mappedSafe.org);
  merged.website = TL_Contacts_chooseSyncValue_(existingSafe.website, mappedSafe.website);
  merged.role = TL_Contacts_chooseSyncValue_(existingSafe.role, mappedSafe.role);
  merged.alias = String(existingSafe.alias || "").trim();
  merged.tags = String(existingSafe.tags || "").trim();
  merged.last_note = String(existingSafe.last_note || "").trim();
  merged.last_enriched_at = String(existingSafe.last_enriched_at || "").trim();
  merged.source_system = TL_Contacts_chooseSyncValue_(existingSafe.source_system, mappedSafe.source_system);
  merged.source_id = TL_Contacts_chooseSyncValue_(existingSafe.source_id, mappedSafe.source_id);
  merged.labels = TL_Contacts_mergeCsvValues_(existingSafe.labels, mappedSafe.labels);
  merged.sync_status = "synced";
  merged.last_synced_at = nowIso;
  merged.notes_internal = TL_Contacts_mergeInternalNotes_(existingSafe.notes_internal, mappedSafe.notes_internal);
  merged.identity_terms = TL_Contacts_stringifyMultiValueField_(mergedIdentityTerms);
  merged.phones = TL_Contacts_stringifyMultiValueField_(mergedPhones);
  merged.emails = TL_Contacts_stringifyMultiValueField_(mergedEmails);
  merged.personal_summary = String(existingSafe.personal_summary || "").trim();
  merged.business_summary = TL_Contacts_chooseSyncValue_(
    existingSafe.business_summary,
    mappedSafe.business_summary || TL_Contacts_composeBusinessSummary_(mappedSafe.org, mappedSafe.role, [mappedSafe.website])
  );
  merged.current_state = String(existingSafe.current_state || "").trim();
  merged.next_action = String(existingSafe.next_action || "").trim();
  merged.last_contact_at = String(existingSafe.last_contact_at || "").trim();
  merged.last_updated = nowIso;
  return TL_Contacts_attachLegacyAliases_(merged);
}

function TL_Contacts_buildNewRow_(mapped, nowIso) {
  const row = TL_Contacts_attachLegacyAliases_(Object.assign({}, mapped));
  row.last_synced_at = nowIso;
  row.sync_status = "synced";
  row.crm_id = TL_Contacts_rowContactId_(row);
  row.contact_id = row.crm_id;
  row.display_name = TL_Contacts_rowDisplayName_(row);
  row.name = row.display_name;
  row.identity_terms = TL_Contacts_stringifyMultiValueField_(TL_Contacts_extractIdentityTermsFromRow_(row));
  row.phones = TL_Contacts_stringifyMultiValueField_(TL_Contacts_extractPhonesFromRow_(row));
  row.emails = TL_Contacts_stringifyMultiValueField_(TL_Contacts_extractEmailsFromRow_(row));
  row.personal_summary = String(row.personal_summary || "").trim();
  row.business_summary = String(row.business_summary || "").trim();
  row.current_state = String(row.current_state || "").trim();
  row.next_action = String(row.next_action || "").trim();
  row.last_contact_at = String(row.last_contact_at || "").trim();
  row.last_updated = nowIso;
  return TL_Contacts_attachLegacyAliases_(row);
}

function TL_Contacts_chooseSyncValue_(existingValue, mappedValue) {
  const existing = TL_Contacts_sanitizeStoredText_(existingValue);
  const mapped = TL_Contacts_sanitizeStoredText_(mappedValue);
  if (!mapped) return existing;
  return mapped;
}

function TL_Contacts_choosePhoneSlot_(existingValue, mappedValue, siblingValue) {
  const existing = TL_Contacts_sanitizeStoredText_(existingValue);
  const mapped = TL_Contacts_sanitizeStoredText_(mappedValue);
  const sibling = TL_Contacts_normalizePhoneField_(siblingValue || "");
  if (!mapped) return existing;
  if (!existing) {
    return sibling && sibling === TL_Contacts_normalizePhoneField_(mapped) ? "" : mapped;
  }
  const existingNorm = TL_Contacts_normalizePhoneField_(existing);
  const mappedNorm = TL_Contacts_normalizePhoneField_(mapped);
  if (!existingNorm && mappedNorm) return sibling && sibling === mappedNorm ? "" : mapped;
  if (existingNorm === mappedNorm) return existing;
  if (sibling && sibling === mappedNorm) return existing;
  return existing;
}

function TL_Contacts_normalizePhoneField_(value) {
  return TL_Contacts_normalizePhoneCandidate_(value || "");
}

function TL_Contacts_normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function TL_Contacts_normalizeSearchText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/["'׳״.,;:()_\-\/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function TL_Contacts_stripNonDigits_(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function TL_Contacts_normalizeStringArray_(value) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return String(item || "").trim();
    }).filter(Boolean);
  }
  const single = String(value || "").trim();
  return single ? [single] : [];
}

function TL_Contacts_parseMultiValueField_(value) {
  if (Array.isArray(value)) return TL_Contacts_normalizeStringArray_(value);
  return String(value || "")
    .split(/\r?\n|[|;,]+/)
    .map(function(item) { return String(item || "").trim(); })
    .filter(Boolean);
}

function TL_Contacts_stringifyMultiValueField_(value) {
  return TL_Contacts_mergeMultiValueLists_([TL_Contacts_parseMultiValueField_(value)]).join("\n");
}

function TL_Contacts_mergeMultiValueLists_(lists) {
  const seen = {};
  const out = [];
  (lists || []).forEach(function(list) {
    TL_Contacts_parseMultiValueField_(list).forEach(function(item) {
      const key = String(item || "").trim().toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(String(item || "").trim());
    });
  });
  return out;
}

function TL_Contacts_composeBusinessSummary_(org, role, urls) {
  const bits = [];
  if (org) bits.push("Organization: " + org);
  if (role) bits.push("Role: " + role);
  if (Array.isArray(urls) && urls.length) bits.push("Website: " + String(urls[0] || "").trim());
  return bits.join(" | ");
}

function TL_Contacts_extractPhonesFromRow_(row) {
  const safe = row || {};
  return TL_Contacts_mergeMultiValueLists_([
    TL_Contacts_parseMultiValueField_(safe.phones),
    [safe.phone1, safe.phone2],
    [safe.phone1_normalized, safe.phone2_normalized]
  ]).map(function(item) {
    return TL_Contacts_normalizePhoneField_(item);
  }).filter(Boolean);
}

function TL_Contacts_extractEmailsFromRow_(row) {
  const safe = row || {};
  return TL_Contacts_mergeMultiValueLists_([
    TL_Contacts_parseMultiValueField_(safe.emails),
    [safe.email, safe.email_normalized]
  ]).map(function(item) {
    return TL_Contacts_normalizeEmail_(item);
  }).filter(Boolean);
}

function TL_Contacts_extractIdentityTermsFromRow_(row) {
  const safe = row || {};
  return TL_Contacts_mergeMultiValueLists_([
    TL_Contacts_parseMultiValueField_(safe.identity_terms),
    [safe.display_name, safe.name, safe.alias],
    TL_Contacts_parseMultiValueField_(safe.labels),
    [safe.org, safe.role]
  ]);
}

function TL_Contacts_rowContactId_(row) {
  return String(row && (row.crm_id || row.contact_id) || "").trim();
}

function TL_Contacts_rowDisplayName_(row) {
  return String(row && (row.display_name || row.name) || "").trim();
}

function TL_Contacts_attachLegacyAliases_(row) {
  const safe = Object.assign({}, row || {});
  const crmId = TL_Contacts_rowContactId_(safe);
  const displayName = TL_Contacts_rowDisplayName_(safe);
  const phones = TL_Contacts_extractPhonesFromRow_(safe);
  const emails = TL_Contacts_extractEmailsFromRow_(safe);
  const identityTerms = TL_Contacts_extractIdentityTermsFromRow_(safe);
  safe.crm_id = crmId;
  safe.display_name = displayName;
  safe.identity_terms = TL_Contacts_stringifyMultiValueField_(identityTerms);
  safe.phones = TL_Contacts_stringifyMultiValueField_(phones);
  safe.emails = TL_Contacts_stringifyMultiValueField_(emails);
  safe.contact_id = crmId;
  safe.name = displayName;
  safe.alias = safe.alias !== undefined ? String(safe.alias || "").trim() : identityTerms.filter(function(term) {
    return TL_Contacts_normalizeSearchText_(term) !== TL_Contacts_normalizeSearchText_(displayName);
  }).slice(0, 3).join(", ");
  safe.phone1 = phones[0] || String(safe.phone1 || "").trim();
  safe.phone2 = phones[1] || String(safe.phone2 || "").trim();
  safe.email = emails[0] || String(safe.email || "").trim();
  safe.phone1_normalized = TL_Contacts_normalizePhoneField_(safe.phone1 || phones[0] || "");
  safe.phone2_normalized = TL_Contacts_normalizePhoneField_(safe.phone2 || phones[1] || "");
  safe.email_normalized = TL_Contacts_normalizeEmail_(safe.email || emails[0] || "");
  if (safe.last_updated === undefined) safe.last_updated = String(safe.last_synced_at || "").trim();
  return safe;
}

function TL_Contacts_buildSearchContactFromRow_(row) {
  const safe = TL_Contacts_attachLegacyAliases_(row);
  const identityTerms = TL_Contacts_extractIdentityTermsFromRow_(safe);
  const phones = TL_Contacts_extractPhonesFromRow_(safe);
  const emails = TL_Contacts_extractEmailsFromRow_(safe);
  const displayName = TL_Contacts_rowDisplayName_(safe);
  const personalSummary = String(safe.personal_summary || "").trim();
  const businessSummary = String(safe.business_summary || "").trim();
  const currentState = String(safe.current_state || "").trim();
  const nextAction = String(safe.next_action || "").trim();
  const notesInternal = String(safe.notes_internal || "").trim();
  return {
    contactId: TL_Contacts_rowContactId_(safe),
    crmId: TL_Contacts_rowContactId_(safe),
    name: displayName,
    displayName: displayName,
    alias: String(safe.alias || "").trim(),
    identityTerms: identityTerms,
    phones: phones,
    emails: emails,
    org: String(safe.org || "").trim(),
    role: String(safe.role || "").trim(),
    tags: String(safe.tags || "").trim(),
    labels: String(safe.labels || "").trim(),
    email: emails[0] || "",
    phone1: phones[0] || "",
    phone2: phones[1] || "",
    notesInternal: notesInternal,
    personalSummary: personalSummary,
    businessSummary: businessSummary,
    currentState: currentState,
    nextAction: nextAction,
    lastContactAt: String(safe.last_contact_at || "").trim(),
    lastUpdated: String(safe.last_updated || "").trim(),
    phone1Norm: phones[0] || "",
    phone2Norm: phones[1] || "",
    emailNorm: emails[0] || "",
    nameNorm: TL_Contacts_normalizeSearchText_(displayName),
    aliasNorm: TL_Contacts_normalizeSearchText_(String(safe.alias || "").trim()),
    identityTermsNorm: identityTerms.map(TL_Contacts_normalizeSearchText_).filter(Boolean),
    orgNorm: TL_Contacts_normalizeSearchText_(String(safe.org || "").trim()),
    roleNorm: TL_Contacts_normalizeSearchText_(String(safe.role || "").trim()),
    tagsNorm: TL_Contacts_normalizeSearchText_(String(safe.tags || "").trim()),
    labelsNorm: TL_Contacts_normalizeSearchText_(String(safe.labels || "").trim()),
    personalSummaryNorm: TL_Contacts_normalizeSearchText_(personalSummary),
    businessSummaryNorm: TL_Contacts_normalizeSearchText_(businessSummary),
    currentStateNorm: TL_Contacts_normalizeSearchText_(currentState),
    nextActionNorm: TL_Contacts_normalizeSearchText_(nextAction)
  };
}

function TL_Contacts_readSearchContacts_() {
  const out = [];
  try {
    const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
    if (!sheetId) return out;
    const ss = SpreadsheetApp.openById(sheetId);
    const sh = ss.getSheetByName("CONTACTS");
    if (!sh || sh.getLastRow() < 2) return out;
    const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const headers = values[0];
    const rows = values.slice(1);
    const idx = {};
    headers.forEach(function(header, index) { idx[String(header || "")] = index; });
    rows.forEach(function(row) {
      const rowObj = TL_Contacts_rowValuesToObject_(headers, row);
      const contact = TL_Contacts_buildSearchContactFromRow_(rowObj);
      if (!contact.contactId || !contact.name) return;
      out.push(contact);
    });
  } catch (err) {}
  return out;
}

function TL_Contacts_buildSearchHints_(rawText, extraction) {
  const raw = String(rawText || "").trim();
  const data = extraction || {};
  const query = String(data.contact_query || raw).trim();

  const nameHints = [];
  const phoneHints = [];
  const emailHints = [];
  const emailDomainHints = [];
  const relationshipHints = [];
  const orgHints = [];
  const roleHints = [];
  const identityHints = [];

  TL_Contacts_normalizeStringArray_(data.name_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(nameHints, item);
  });
  TL_Contacts_normalizeStringArray_(data.phone_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(phoneHints, TL_Contacts_stripNonDigits_(item));
  });
  TL_Contacts_normalizeStringArray_(data.email_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(emailHints, TL_Contacts_normalizeEmail_(item));
  });
  TL_Contacts_normalizeStringArray_(data.email_domain_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(emailDomainHints, String(item || "").trim().toLowerCase().replace(/^@/, ""));
  });
  TL_Contacts_normalizeStringArray_(data.relationship_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(relationshipHints, item);
  });
  TL_Contacts_normalizeStringArray_(data.org_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(orgHints, item);
  });
  TL_Contacts_normalizeStringArray_(data.role_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(roleHints, item);
  });
  TL_Contacts_normalizeStringArray_(data.identity_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(identityHints, item);
  });

  const emailMatches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  emailMatches.forEach(function(item) {
    const normalizedEmail = TL_Contacts_normalizeEmail_(item);
    TL_Contacts_pushUniqueHint_(emailHints, normalizedEmail);
    const domain = normalizedEmail.indexOf("@") !== -1 ? normalizedEmail.split("@").pop() : "";
    if (domain) TL_Contacts_pushUniqueHint_(emailDomainHints, domain);
  });

  const domainMatches = raw.match(/(?:@)?[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  domainMatches.forEach(function(item) {
    const cleaned = String(item || "").trim().toLowerCase().replace(/^@/, "");
    if (cleaned && cleaned.indexOf(".") !== -1) TL_Contacts_pushUniqueHint_(emailDomainHints, cleaned);
  });

  const phoneMatches = raw.match(/\d[\d\-\s().]{1,}\d/g) || [];
  phoneMatches.forEach(function(item) {
    const digits = TL_Contacts_stripNonDigits_(item);
    if (digits.length >= 3) TL_Contacts_pushUniqueHint_(phoneHints, digits);
  });

  if (query) {
    const queryEmail = TL_Contacts_normalizeEmail_(query);
    if (queryEmail.indexOf("@") !== -1) {
      TL_Contacts_pushUniqueHint_(emailHints, queryEmail);
    } else {
      const queryDigits = TL_Contacts_stripNonDigits_(query);
      if (queryDigits.length >= 3) TL_Contacts_pushUniqueHint_(phoneHints, queryDigits);
      const normalizedQuery = TL_Contacts_normalizeSearchText_(query);
      if (normalizedQuery) {
        TL_Contacts_pushUniqueHint_(nameHints, normalizedQuery);
        normalizedQuery.split(" ").forEach(function(token) {
          if (!token) return;
          TL_Contacts_pushUniqueHint_(nameHints, token);
          TL_Contacts_pushUniqueHint_(identityHints, token);
          if (token.length >= 3) TL_Contacts_pushUniqueHint_(nameHints, token.slice(0, 3));
        });
      }
    }
  }

  return {
    query: query,
    nameHints: nameHints,
    phoneHints: phoneHints.filter(function(item) { return String(item || "").length >= 3; }),
    emailHints: emailHints,
    emailDomainHints: emailDomainHints,
    relationshipHints: relationshipHints.map(TL_Contacts_normalizeSearchText_).filter(Boolean),
    orgHints: orgHints.map(TL_Contacts_normalizeSearchText_).filter(Boolean),
    roleHints: roleHints.map(TL_Contacts_normalizeSearchText_).filter(Boolean),
    identityHints: identityHints.map(TL_Contacts_normalizeSearchText_).filter(Boolean)
  };
}

function TL_Contacts_normalizeSearchQueryType_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["name", "name_prefix", "phone_fragment", "email", "email_domain", "relationship", "org", "role", "identity_term"];
  return allowed.indexOf(v) !== -1 ? v : "";
}

function TL_Contacts_parseInternalNotesMap_(text) {
  const out = {};
  String(text || "").split(/\r?\n/).forEach(function(line) {
    const raw = String(line || "").trim();
    if (!raw) return;
    const eq = raw.indexOf("=");
    if (eq <= 0) return;
    const key = String(raw.slice(0, eq) || "").trim().toLowerCase();
    const value = String(raw.slice(eq + 1) || "").trim();
    if (!key) return;
    out[key] = value;
  });
  return out;
}

function TL_Contacts_csvList_(value) {
  return String(value || "")
    .split(",")
    .map(function(part) { return String(part || "").trim(); })
    .filter(Boolean);
}

function TL_Contacts_contactHandledTopics_(contact) {
  const notesMap = TL_Contacts_parseInternalNotesMap_(contact && contact.notesInternal || contact && contact.notes_internal || "");
  const topics = TL_Contacts_csvList_(notesMap.handled_topics || notesMap.topic_owner_for || "");
  return topics.map(function(item) {
    return TL_AI_normalizeTopicSlug_(item);
  }).filter(Boolean);
}

function TL_Contacts_findTopicOwners_(topicId, options, contactsOverride) {
  const normalizedTopicId = TL_AI_normalizeTopicSlug_(topicId);
  if (!normalizedTopicId) return [];
  const limit = Number(options && options.limit || 3);
  const contacts = Array.isArray(contactsOverride) ? contactsOverride : TL_Contacts_readSearchContacts_();

  return (contacts || []).map(function(contact) {
    const handledTopics = TL_Contacts_contactHandledTopics_(contact);
    const routingRole = String(TL_Contacts_parseInternalNotesMap_(contact && contact.notesInternal || contact && contact.notes_internal || "").routing_role || "").trim();
    const hasTopicOwnership = handledTopics.indexOf(normalizedTopicId) !== -1;
    const tagText = String(contact && contact.tags || "").toLowerCase();
    const hasTopicTag = tagText.indexOf(normalizedTopicId.toLowerCase()) !== -1;
    let score = 0;
    if (hasTopicOwnership) score += 200;
    if (hasTopicTag) score += 40;
    if (!hasTopicOwnership && !hasTopicTag) return null;
    if (String(contact && contact.role || "").trim()) score += 5;
    if (String(contact && contact.org || "").trim()) score += 5;
    if (score <= 0) return null;
    return {
      contactId: String(contact && contact.contactId || "").trim(),
      name: String(contact && contact.name || "").trim(),
      alias: String(contact && contact.alias || "").trim(),
      org: String(contact && contact.org || "").trim(),
      role: String(contact && contact.role || "").trim(),
      tags: String(contact && contact.tags || "").trim(),
      email: String(contact && contact.email || "").trim(),
      phone1: String(contact && contact.phone1 || "").trim(),
      phone2: String(contact && contact.phone2 || "").trim(),
      handledTopics: handledTopics,
      routingRole: routingRole,
      matchScore: score
    };
  }).filter(Boolean).sort(function(a, b) {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return String(a.name || "").localeCompare(String(b.name || ""));
  }).slice(0, limit > 0 ? limit : 3);
}

function TL_Contacts_buildSearchQueries_(rawText, extraction) {
  const data = extraction || {};
  const out = [];

  function pushQuery(type, value) {
    const normalizedType = TL_Contacts_normalizeSearchQueryType_(type);
    const normalizedValue = String(value || "").trim();
    if (!normalizedType || !normalizedValue) return;
    const signature = normalizedType + "::" + normalizedValue.toLowerCase();
    if (out.some(function(item) {
      return (item.type + "::" + String(item.value || "").toLowerCase()) === signature;
    })) return;
    out.push({ type: normalizedType, value: normalizedValue });
  }

  const explicitQueries = Array.isArray(data.search_queries) ? data.search_queries : [];
  explicitQueries.forEach(function(item) {
    if (!item || typeof item !== "object") return;
    pushQuery(item.type, item.value);
  });

  TL_Contacts_normalizeStringArray_(data.name_hints).forEach(function(item) { pushQuery("name", item); });
  TL_Contacts_normalizeStringArray_(data.phone_hints).forEach(function(item) {
    const digits = TL_Contacts_stripNonDigits_(item);
    if (digits.length >= 3) pushQuery("phone_fragment", digits);
  });
  TL_Contacts_normalizeStringArray_(data.email_hints).forEach(function(item) { pushQuery("email", TL_Contacts_normalizeEmail_(item)); });
  TL_Contacts_normalizeStringArray_(data.email_domain_hints).forEach(function(item) { pushQuery("email_domain", String(item || "").trim().toLowerCase().replace(/^@/, "")); });
  TL_Contacts_normalizeStringArray_(data.relationship_hints).forEach(function(item) { pushQuery("relationship", item); });
  TL_Contacts_normalizeStringArray_(data.org_hints).forEach(function(item) { pushQuery("org", item); });
  TL_Contacts_normalizeStringArray_(data.role_hints).forEach(function(item) { pushQuery("role", item); });
  TL_Contacts_normalizeStringArray_(data.identity_hints).forEach(function(item) { pushQuery("identity_term", item); });

  const hints = TL_Contacts_buildSearchHints_(rawText, extraction);
  (hints.nameHints || []).forEach(function(item, idx) {
    pushQuery(idx === 0 ? "name" : "name_prefix", item);
  });
  (hints.phoneHints || []).forEach(function(item) { pushQuery("phone_fragment", item); });
  (hints.emailHints || []).forEach(function(item) { pushQuery("email", item); });
  (hints.emailDomainHints || []).forEach(function(item) { pushQuery("email_domain", item); });
  (hints.relationshipHints || []).forEach(function(item) { pushQuery("relationship", item); });
  (hints.orgHints || []).forEach(function(item) { pushQuery("org", item); });
  (hints.roleHints || []).forEach(function(item) { pushQuery("role", item); });
  (hints.identityHints || []).forEach(function(item) { pushQuery("identity_term", item); });

  return out.slice(0, 12);
}

function TL_Contacts_pushUniqueHint_(target, value) {
  const normalized = String(value || "").trim();
  if (!normalized) return;
  if (target.indexOf(normalized) === -1) target.push(normalized);
}

function TL_Contacts_resolveBySearchHints_(input, contactsOverride) {
  const source = input || {};
  const contacts = Array.isArray(contactsOverride) ? contactsOverride : TL_Contacts_readSearchContacts_();
  const rawText = source.rawText || source.query || "";
  const queries = TL_Contacts_buildSearchQueries_(rawText, source.extraction || source);
  const scoredMap = {};

  queries.forEach(function(query) {
    (contacts || []).forEach(function(contact) {
      const hit = TL_Contacts_scoreSearchCandidate_(contact, query);
      if (hit.score <= 0) return;
      const key = String(contact.contactId || "");
      if (!scoredMap[key]) {
        scoredMap[key] = {
          contact: contact,
          score: 0,
          reasons: [],
          matchedQueryTypes: {}
        };
      }
      scoredMap[key].score += hit.score;
      hit.reasons.forEach(function(reason) {
        if (scoredMap[key].reasons.indexOf(reason) === -1) scoredMap[key].reasons.push(reason);
      });
      scoredMap[key].matchedQueryTypes[query.type] = true;
    });
  });

  const scored = Object.keys(scoredMap).map(function(key) {
    const item = scoredMap[key];
    const queryTypeCount = Object.keys(item.matchedQueryTypes).length;
    if (queryTypeCount > 1) item.score += (queryTypeCount - 1) * 25;
    return item;
  });

  scored.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.contact.name || "").localeCompare(String(b.contact.name || ""));
  });

  const candidates = scored.slice(0, 5).map(function(item) {
    const enriched = Object.assign({}, item.contact);
    enriched.matchScore = item.score;
    enriched.matchReasons = item.reasons.slice();
    return enriched;
  });

  const top = scored.length ? scored[0] : null;
  const second = scored.length > 1 ? scored[1] : null;
  let resolved = null;

  if (scored.length === 1) {
    resolved = candidates[0];
  } else if (top && top.score >= 140 && (!second || (top.score - second.score) >= 35)) {
    resolved = candidates[0];
  }

  return {
    contact: resolved,
    candidates: candidates,
    queries: queries
  };
}

function TL_Contacts_ResolveRequest_(input, options, contactsOverride) {
  const source = input || {};
  const opts = options || {};
  const channel = String(opts.channel || source.channel || "").trim().toLowerCase();
  const resolution = TL_Contacts_resolveBySearchHints_(source, contactsOverride);
  const resolved = resolution && resolution.contact ? resolution.contact : null;
  const candidates = Array.isArray(resolution && resolution.candidates) ? resolution.candidates : [];
  const queries = Array.isArray(resolution && resolution.queries) ? resolution.queries : [];

  const chosenDestination = resolved
    ? TL_Contacts_destinationForChannel_(resolved, channel)
    : "";

  return {
    ok: true,
    channel: channel,
    query: String(
      source.query ||
      source.contact_query ||
      source.recipient_query ||
      source.rawText ||
      ""
    ).trim(),
    status: resolved ? "resolved" : (candidates.length ? "ambiguous" : "missing"),
    contact: resolved,
    destination: chosenDestination,
    candidates: candidates,
    queries: queries
  };
}

function TL_Contacts_destinationForChannel_(contact, channel) {
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  if (normalizedChannel === "email") {
    return String(contact && contact.email || contact && contact.emailNorm || "").trim();
  }
  return String(contact && (contact.phone1 || contact.phone2 || contact.phone1Norm || contact.phone2Norm || "") || "").trim();
}

function TL_Contacts_scoreSearchCandidate_(contact, query) {
  const reasons = [];
  let score = 0;
  const phoneFields = TL_Contacts_mergeMultiValueLists_([
    [String(contact && contact.phone1Norm || ""), String(contact && contact.phone2Norm || "")],
    contact && contact.phones
  ]).map(function(item) {
    return TL_Contacts_normalizePhoneField_(item);
  }).filter(Boolean);
  const emailFields = TL_Contacts_mergeMultiValueLists_([
    [String(contact && contact.emailNorm || "")],
    contact && contact.emails
  ]).map(function(item) {
    return TL_Contacts_normalizeEmail_(item);
  }).filter(Boolean);
  const nameFields = [
    TL_Contacts_normalizeSearchText_(contact && contact.name || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.alias || "")
  ].concat(Array.isArray(contact && contact.identityTermsNorm) ? contact.identityTermsNorm : []).filter(Boolean);
  const contextFields = [
    TL_Contacts_normalizeSearchText_(contact && contact.org || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.role || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.tags || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.labels || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.personalSummary || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.businessSummary || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.currentState || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.nextAction || "")
  ].concat(Array.isArray(contact && contact.identityTermsNorm) ? contact.identityTermsNorm : []).filter(Boolean);
  const kind = String(query && query.type || "").trim().toLowerCase();
  const rawValue = String(query && query.value || "").trim();
  const value = kind === "email" ? TL_Contacts_normalizeEmail_(rawValue)
    : kind === "phone_fragment" ? TL_Contacts_stripNonDigits_(rawValue)
    : TL_Contacts_normalizeSearchText_(rawValue);

  if (!kind || !value) {
    return { contact: contact, score: 0, reasons: [] };
  }

  if (kind === "phone_fragment") {
    phoneFields.forEach(function(phone) {
      if (phone === value) {
        score += 150;
        reasons.push("exact_phone:" + value);
      } else if (value.length >= 3 && phone.indexOf(value) !== -1) {
        score += 60;
        reasons.push("partial_phone:" + value);
      }
    });
  } else if (kind === "email") {
    emailFields.forEach(function(emailField) {
      if (emailField === value) {
        score += 150;
        reasons.push("exact_email:" + value);
      } else if (emailField && emailField.indexOf(value) !== -1) {
        score += 70;
        reasons.push("partial_email:" + value);
      }
    });
  } else if (kind === "email_domain") {
    emailFields.forEach(function(emailField) {
      const domain = emailField.indexOf("@") !== -1 ? emailField.split("@").pop() : "";
      if (!domain) return;
      if (domain === value) {
        score += 90;
        reasons.push("exact_email_domain:" + value);
      } else if (domain.indexOf(value) !== -1) {
        score += 45;
        reasons.push("partial_email_domain:" + value);
      }
    });
  } else if (kind === "relationship" || kind === "org" || kind === "role" || kind === "identity_term") {
    contextFields.forEach(function(field) {
      if (!field) return;
      if (field === value) {
        score += 60;
        reasons.push("exact_context:" + value);
      } else if (field.indexOf(value) !== -1) {
        score += 35;
        reasons.push("partial_context:" + value);
      }
    });
  } else {
    nameFields.forEach(function(field) {
      const tokens = field.split(" ").filter(Boolean);
      if (field === value) {
        score += 120;
        reasons.push("exact_name:" + value);
        return;
      }
      if (tokens.indexOf(value) !== -1) {
        score += 105;
        reasons.push("token_name:" + value);
        return;
      }
      if (kind === "name_prefix" && (field.indexOf(value) === 0 || tokens.some(function(token) { return token.indexOf(value) === 0; }))) {
        score += 80;
        reasons.push("prefix_name:" + value);
        return;
      }
      if (field.indexOf(value) !== -1) {
        score += kind === "name_prefix" ? 45 : 55;
        reasons.push("partial_name:" + value);
      }
    });
  }

  return {
    contact: contact,
    score: score,
    reasons: reasons
  };
}

function TL_Contacts_sanitizeStoredText_(value) {
  const text = String(value == null ? "" : value).trim();
  if (/^#(?:ERROR|REF|VALUE|NAME|N\/A|DIV\/0)!?$/i.test(text)) return "";
  return text;
}

function TL_Contacts_mergeCsvValues_(existingValue, mappedValue) {
  const seen = {};
  const out = [];
  [existingValue, mappedValue].forEach(function(value) {
    String(value || "").split(",").map(function(part) {
      return String(part || "").trim();
    }).filter(Boolean).forEach(function(part) {
      const key = part.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(part);
    });
  });
  return out.join(", ");
}

function TL_Contacts_mergeInternalNotes_(existingValue, mappedValue) {
  const existing = String(existingValue || "").trim();
  const mapped = String(mappedValue || "").trim();
  if (!mapped) return existing;
  if (!existing) return mapped;
  if (existing.indexOf(mapped) !== -1) return existing;
  return existing + "\n" + mapped;
}

function TL_Contacts_rowsEqual_(before, after, headers) {
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (String(before[key] || "") !== String(after[key] || "")) return false;
  }
  return true;
}

function TL_Contacts_writeRowObject_(sheet, headers, rowNumber, rowObj) {
  const values = headers.map(function(header) {
    return rowObj[header] !== undefined ? rowObj[header] : "";
  });
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  range.setNumberFormat("@");
  range.setValues([values]);
}

function TL_Contacts_appendRowObject_(sheet, headers, rowObj) {
  const values = headers.map(function(header) {
    return rowObj[header] !== undefined ? rowObj[header] : "";
  });
  const rowNumber = sheet.getLastRow() + 1;
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  range.setNumberFormat("@");
  range.setValues([values]);
}

function TL_Contacts_reindexRow_(existing, rowObj, rowNumber) {
  if (!existing) return;
  TL_Contacts_indexExistingRow_(existing, rowObj, rowNumber);
}

function TL_Contacts_BackfillDealWiseFields_() {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) return { ok: false, reason: "missing_sheet_id" };
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName("CONTACTS");
  if (!sh || sh.getLastRow() < 2) return { ok: true, updated: 0 };
  const headers = TL_Contacts_headers_();
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  let updated = 0;
  values.forEach(function(rowValues, index) {
    const row = TL_Contacts_rowValuesToObject_(headers, rowValues);
    const normalized = TL_Contacts_buildNewRow_(row, String(row.last_updated || row.last_synced_at || new Date().toISOString()).trim());
    if (!TL_Contacts_rowsEqual_(row, normalized, headers)) {
      TL_Contacts_writeRowObject_(sh, headers, index + 2, normalized);
      updated++;
    }
  });
  return {
    ok: true,
    updated: updated
  };
}

function TL_Contacts_RebuildIdentitySheet_() {
  return { ok: true, skipped: true, reason: "contacts_only_schema" };
}

function TL_Contacts_buildIdentityRowsForContact_(row) {
  const safe = TL_Contacts_attachLegacyAliases_(row);
  const crmId = TL_Contacts_rowContactId_(safe);
  if (!crmId) return [];
  const source = String(safe.source_system || "contacts").trim();
  const seen = {};
  const out = [];
  const nowIso = String(safe.last_updated || safe.last_synced_at || new Date().toISOString()).trim();

  function push(identityType, rawValue, normalizedValue, label, sourceValue) {
    const raw = String(rawValue || "").trim();
    const normalized = String(normalizedValue || "").trim();
    if (!raw || !normalized) return;
    const key = (identityType + "::" + normalized).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push({
      identity_id: "ID_" + crmId + "_" + String(out.length + 1),
      crm_id: crmId,
      identity_type: identityType,
      raw_value: raw,
      normalized_value: normalized,
      label: String(label || "").trim(),
      source: String(sourceValue || source).trim(),
      link_status: "linked",
      last_seen_at: nowIso
    });
  }

  TL_Contacts_extractIdentityTermsFromRow_(safe).forEach(function(term) {
    push("term", term, TL_Contacts_normalizeSearchText_(term), "identity term", "manual");
  });
  TL_Contacts_extractPhonesFromRow_(safe).forEach(function(phone) {
    push("phone", phone, TL_Contacts_normalizePhoneField_(phone), "phone", source);
  });
  TL_Contacts_extractEmailsFromRow_(safe).forEach(function(email) {
    push("email", email, TL_Contacts_normalizeEmail_(email), "email", source);
  });
  if (String(safe.source_id || "").trim()) {
    push("source_ref", String(safe.source_id || "").trim(), String(safe.source_id || "").trim(), "source", source);
  }

  return out;
}

function TL_Contacts_crmLanguage_(overrideLanguage) {
  const explicit = String(overrideLanguage || "").trim();
  if (explicit) return explicit;
  if (typeof TLW_getSetting_ === "function") {
    return String(TLW_getSetting_("AI_DEFAULT_LANGUAGE") || "Hebrew").trim() || "Hebrew";
  }
  return "Hebrew";
}

function TL_Contacts_internalText_(hebrewText, englishText, overrideLanguage) {
  const language = TL_Contacts_crmLanguage_(overrideLanguage);
  if (typeof TL_Language_IsHebrew_ === "function") {
    return TL_Language_IsHebrew_(language) ? String(hebrewText || "").trim() : String(englishText || hebrewText || "").trim();
  }
  return /^he/i.test(language) ? String(hebrewText || "").trim() : String(englishText || hebrewText || "").trim();
}

function TL_Contacts_excerpt_(value, limit) {
  const max = Math.max(Number(limit || 160), 16);
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : (text.slice(0, max - 1).trim() + "…");
}

function TL_Contacts_openContactsSheet_() {
  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) return null;
  const ss = SpreadsheetApp.openById(sheetId);
  let sh = ss.getSheetByName("CONTACTS");
  if (!sh) {
    sh = ss.insertSheet("CONTACTS");
    sh.getRange(1, 1, 1, TL_Contacts_headers_().length).setValues([TL_Contacts_headers_()]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function TL_Contacts_findRowByCrmId_(sheet, headers, crmId) {
  if (!sheet || !crmId) return { rowNumber: 0, row: null };
  const values = sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  for (let i = 0; i < values.length; i++) {
    const candidate = TL_Contacts_rowValuesToObject_(headers, values[i]);
    if (TL_Contacts_rowContactId_(candidate) === crmId) {
      return { rowNumber: i + 2, row: candidate };
    }
  }
  return { rowNumber: 0, row: null };
}

function TL_Contacts_buildRuntimeBaseRow_(crmId, data, nowIso) {
  const safe = data && typeof data === "object" ? data : {};
  return TL_Contacts_buildNewRow_({
    crm_id: crmId,
    contact_id: crmId,
    display_name: String(safe.display_name || safe.name || safe.phone || safe.email || crmId).trim(),
    identity_terms: TL_Contacts_stringifyMultiValueField_(TL_Contacts_mergeMultiValueLists_([
      TL_Contacts_parseMultiValueField_(safe.identity_terms),
      [safe.display_name || safe.name || "", safe.phone || "", safe.email || ""]
    ])),
    phones: TL_Contacts_stringifyMultiValueField_(TL_Contacts_mergeMultiValueLists_([
      TL_Contacts_parseMultiValueField_(safe.phones),
      [safe.phone || ""]
    ])),
    emails: TL_Contacts_stringifyMultiValueField_(TL_Contacts_mergeMultiValueLists_([
      TL_Contacts_parseMultiValueField_(safe.emails),
      [safe.email || ""]
    ])),
    source_system: "dealwise_runtime",
    source_id: crmId,
    personal_summary: String(safe.personal_summary || "").trim(),
    business_summary: String(safe.business_summary || safe.summary || "").trim(),
    current_state: String(safe.current_state || "").trim(),
    next_action: String(safe.next_action || "").trim(),
    last_contact_at: String(safe.last_contact_at || "").trim(),
    last_updated: nowIso
  }, nowIso);
}

function TL_Contacts_applyPatchToRow_(row, patch, nowIso) {
  const safeRow = TL_Contacts_attachLegacyAliases_(row || {});
  const data = patch && typeof patch === "object" ? patch : {};
  const updated = TL_Contacts_attachLegacyAliases_(Object.assign({}, safeRow, {
    display_name: String(data.display_name || data.name || safeRow.display_name || safeRow.name || "").trim() || TL_Contacts_rowDisplayName_(safeRow),
    identity_terms: TL_Contacts_stringifyMultiValueField_(TL_Contacts_mergeMultiValueLists_([
      TL_Contacts_extractIdentityTermsFromRow_(safeRow),
      TL_Contacts_parseMultiValueField_(data.identity_terms),
      [data.display_name || data.name || "", data.phone || "", data.email || ""]
    ])),
    phones: TL_Contacts_stringifyMultiValueField_(TL_Contacts_mergeMultiValueLists_([
      TL_Contacts_extractPhonesFromRow_(safeRow),
      TL_Contacts_parseMultiValueField_(data.phones),
      [data.phone || ""]
    ])),
    emails: TL_Contacts_stringifyMultiValueField_(TL_Contacts_mergeMultiValueLists_([
      TL_Contacts_extractEmailsFromRow_(safeRow),
      TL_Contacts_parseMultiValueField_(data.emails),
      [data.email || ""]
    ])),
    personal_summary: TL_Contacts_mergeSummaryText_(safeRow.personal_summary, data.personal_summary || ""),
    business_summary: TL_Contacts_mergeSummaryText_(safeRow.business_summary, data.business_summary || data.summary || ""),
    current_state: String(data.current_state || safeRow.current_state || "").trim(),
    next_action: String(data.next_action || safeRow.next_action || "").trim(),
    last_contact_at: String(data.last_contact_at || safeRow.last_contact_at || "").trim(),
    last_updated: nowIso
  }));

  if (String(data.source_type || "").trim() === "manual_enrichment") {
    const noteSnippet = TL_Contacts_excerpt_(data.personal_summary || data.business_summary || data.summary || "", 200);
    if (noteSnippet) {
      updated.last_note = noteSnippet;
      updated.last_enriched_at = nowIso;
    }
  }

  return updated;
}

function TL_Contacts_ApplyCrmPatch_(contactId, payload) {
  const crmId = String(contactId || "").trim();
  if (!crmId) return { ok: false, reason: "missing_contact_id" };
  const sh = TL_Contacts_openContactsSheet_();
  if (!sh) return { ok: false, reason: "missing_sheet_id" };
  const headers = TL_Contacts_headers_();
  const located = TL_Contacts_findRowByCrmId_(sh, headers, crmId);
  const data = payload && typeof payload === "object" ? payload : {};
  const nowIso = String(data.last_updated || new Date().toISOString()).trim() || new Date().toISOString();
  let row = located.row;
  let rowNumber = located.rowNumber;
  if (!row) {
    row = TL_Contacts_buildRuntimeBaseRow_(crmId, data, nowIso);
    TL_Contacts_appendRowObject_(sh, headers, row);
    rowNumber = sh.getLastRow();
  }
  const updated = TL_Contacts_applyPatchToRow_(row, data, nowIso);
  TL_Contacts_writeRowObject_(sh, headers, rowNumber, updated);
  return { ok: true, rowNumber: rowNumber, crmId: crmId };
}

function TL_Contacts_buildGroupedInteractionPatch_(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  return {
    source_type: "grouped_inbound",
    display_name: String(data.display_name || data.name || "").trim(),
    phone: String(data.phone || "").trim(),
    email: String(data.email || "").trim(),
    business_summary: String(data.business_summary || data.summary || "").trim(),
    current_state: String(data.current_state || "").trim(),
    next_action: String(data.next_action || "").trim(),
    last_contact_at: String(data.last_contact_at || "").trim(),
    last_updated: String(data.last_updated || "").trim()
  };
}

function TL_Contacts_buildManualEnrichmentWritebackPatch_(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const noteType = String(data.note_type || "general").trim().toLowerCase() || "general";
  const noteText = String(data.note_text || data.summary || "").trim();
  const personalTypes = {
    personal_context: true,
    family_event: true,
    relationship_signal: true,
    preference: true
  };
  const patch = {
    source_type: "manual_enrichment",
    display_name: String(data.display_name || data.name || "").trim(),
    phone: String(data.phone || "").trim(),
    email: String(data.email || "").trim(),
    current_state: String(data.current_state || "").trim(),
    next_action: String(data.next_action || "").trim(),
    last_updated: String(data.last_updated || "").trim()
  };

  if (personalTypes[noteType]) patch.personal_summary = noteText;
  else patch.business_summary = noteText;

  if (noteType === "followup_context" && noteText && !patch.next_action) {
    patch.next_action = noteText;
  }

  return patch;
}

function TL_Contacts_buildOutboundWritebackPatch_(payload, overrideLanguage) {
  const data = payload && typeof payload === "object" ? payload : {};
  const language = TL_Contacts_crmLanguage_(overrideLanguage);
  const explicitSummary = String(data.summary || data.business_summary || "").trim();
  const outboundText = TL_Contacts_excerpt_(data.outbound_text || data.body || data.proposal || data.text || "", 220);
  const fallbackSummary = outboundText
    ? (TL_Contacts_internalText_("נשלחה הודעה ללקוח: ", "Sent outbound message: ", language) + outboundText)
    : "";
  return {
    source_type: "outbound",
    display_name: String(data.display_name || data.name || "").trim(),
    phone: String(data.phone || "").trim(),
    email: String(data.email || "").trim(),
    business_summary: explicitSummary || fallbackSummary,
    current_state: String(data.current_state || TL_Contacts_internalText_("ממתינים לתגובה.", "Waiting for reply.", language)).trim(),
    next_action: String(data.next_action || TL_Contacts_internalText_("להמתין לתגובה ולבדוק אם נדרש מעקב.", "Wait for reply and check whether follow-up is needed.", language)).trim(),
    last_contact_at: String(data.last_contact_at || new Date().toISOString()).trim(),
    last_updated: String(data.last_updated || new Date().toISOString()).trim()
  };
}

function TL_Contacts_ApplyGroupedInteractionWriteback_(contactId, payload) {
  return TL_Contacts_ApplyCrmPatch_(contactId, TL_Contacts_buildGroupedInteractionPatch_(payload));
}

function TL_Contacts_ApplyManualEnrichmentWriteback_(contactId, payload) {
  return TL_Contacts_ApplyCrmPatch_(contactId, TL_Contacts_buildManualEnrichmentWritebackPatch_(payload));
}

function TL_Contacts_ApplyOutboundWriteback_(contactId, payload) {
  return TL_Contacts_ApplyCrmPatch_(contactId, TL_Contacts_buildOutboundWritebackPatch_(payload));
}

function TL_Contacts_mergeSummaryText_(existingValue, nextValue) {
  const existing = String(existingValue || "").trim();
  const next = String(nextValue || "").trim();
  if (!next) return existing;
  if (!existing) return next.slice(0, 1200);
  const existingNorm = TL_Contacts_normalizeSearchText_(existing);
  const nextNorm = TL_Contacts_normalizeSearchText_(next);
  if (!nextNorm || existingNorm.indexOf(nextNorm) !== -1) return existing.slice(0, 1200);
  return (existing + " | " + next).slice(0, 1200);
}

function TL_Contacts_logSyncResult_(result) {
  if (typeof TLW_logInfo_ === "function") {
    TLW_logInfo_("contacts_sync_google", result);
  }
}

function TL_Contacts_logRunnerResult_(label, result) {
  try {
    Logger.log("%s %s", String(label || "TL_Contacts"), JSON.stringify(result || {}, null, 2));
  } catch (err) {
    // Logging should never block the admin runner.
  }
}
