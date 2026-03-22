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
    "source_system","source_id","phone1_normalized","phone2_normalized","email_normalized","labels","sync_status","last_synced_at","notes_internal"
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
  const organizations = person.organizations || [];
  const urls = TL_Contacts_pickValues_(person.urls, "value");
  const labels = TL_Contacts_extractLabels_(person.memberships, groupNames);
  const org = organizations.length ? String(organizations[0].name || "").trim() : "";
  const role = organizations.length ? String(organizations[0].title || "").trim() : "";

  return {
    contact_id: "GC_" + personId,
    name: TL_Contacts_pickDisplayName_(person.names),
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
    notes_internal: "google_contact_id=" + personId
  };
}

function TL_Contacts_normalizeSyncMode_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["both_only", "phone_only", "email_only", "all"];
  return allowed.indexOf(v) !== -1 ? v : TL_CONTACTS.DEFAULT_SYNC_MODE;
}

function TL_Contacts_profileKind_(mapped) {
  const hasPhone = !!String((mapped && (mapped.phone1_normalized || mapped.phone2_normalized || mapped.phone1 || mapped.phone2)) || "").trim();
  const hasEmail = !!String((mapped && (mapped.email_normalized || mapped.email)) || "").trim();
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
  return out;
}

function TL_Contacts_indexExistingRow_(index, row, rowNumber) {
  const sourceId = String(row.source_id || "").trim();
  const phones = [
    TL_Contacts_normalizePhoneField_(row.phone1_normalized || row.phone1),
    TL_Contacts_normalizePhoneField_(row.phone2_normalized || row.phone2)
  ].filter(Boolean);
  const email = TL_Contacts_normalizeEmail_(row.email_normalized || row.email);

  if (sourceId) index.bySourceId[sourceId] = { rowNumber: rowNumber, row: row };
  phones.forEach(function(phone) {
    if (!index.byPhone[phone]) index.byPhone[phone] = [];
    index.byPhone[phone].push({ rowNumber: rowNumber, row: row });
  });
  if (email) {
    if (!index.byEmail[email]) index.byEmail[email] = [];
    index.byEmail[email].push({ rowNumber: rowNumber, row: row });
  }
}

function TL_Contacts_matchExistingRow_(mapped, existing) {
  const sourceId = String(mapped.source_id || "").trim();
  if (sourceId && existing.bySourceId[sourceId]) {
    return existing.bySourceId[sourceId];
  }

  const candidates = {};
  [mapped.phone1_normalized, mapped.phone2_normalized].filter(Boolean).forEach(function(phone) {
    (existing.byPhone[phone] || []).forEach(function(item) {
      candidates["row_" + item.rowNumber] = item;
    });
  });
  if (mapped.email_normalized) {
    (existing.byEmail[mapped.email_normalized] || []).forEach(function(item) {
      candidates["row_" + item.rowNumber] = item;
    });
  }

  const matches = Object.keys(candidates).map(function(key) { return candidates[key]; });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return { ambiguous: true, matches: matches };
  return { row: null, rowNumber: 0 };
}

function TL_Contacts_mergeRow_(existingRow, mapped, nowIso) {
  const merged = Object.assign({}, existingRow || {});
  merged.contact_id = String(existingRow && existingRow.contact_id ? existingRow.contact_id : mapped.contact_id);
  merged.name = TL_Contacts_chooseSyncValue_(existingRow && existingRow.name, mapped.name);
  merged.org = TL_Contacts_chooseSyncValue_(existingRow && existingRow.org, mapped.org);
  merged.website = TL_Contacts_chooseSyncValue_(existingRow && existingRow.website, mapped.website);
  merged.phone1 = TL_Contacts_choosePhoneSlot_(existingRow && existingRow.phone1, mapped.phone1);
  merged.phone2 = TL_Contacts_choosePhoneSlot_(existingRow && existingRow.phone2, mapped.phone2, merged.phone1);
  merged.email = TL_Contacts_chooseSyncValue_(existingRow && existingRow.email, mapped.email);
  merged.role = TL_Contacts_chooseSyncValue_(existingRow && existingRow.role, mapped.role);
  merged.alias = String(existingRow && existingRow.alias ? existingRow.alias : "");
  merged.tags = String(existingRow && existingRow.tags ? existingRow.tags : "");
  merged.last_note = String(existingRow && existingRow.last_note ? existingRow.last_note : "");
  merged.last_enriched_at = String(existingRow && existingRow.last_enriched_at ? existingRow.last_enriched_at : "");
  merged.source_system = mapped.source_system;
  merged.source_id = mapped.source_id;
  merged.phone1_normalized = TL_Contacts_normalizePhoneField_(merged.phone1 || mapped.phone1_normalized);
  merged.phone2_normalized = TL_Contacts_normalizePhoneField_(merged.phone2 || mapped.phone2_normalized);
  merged.email_normalized = TL_Contacts_normalizeEmail_(merged.email || mapped.email_normalized);
  merged.labels = TL_Contacts_mergeCsvValues_(existingRow && existingRow.labels, mapped.labels);
  merged.sync_status = "synced";
  merged.last_synced_at = nowIso;
  merged.notes_internal = TL_Contacts_mergeInternalNotes_(existingRow && existingRow.notes_internal, mapped.notes_internal);
  return merged;
}

function TL_Contacts_buildNewRow_(mapped, nowIso) {
  const row = Object.assign({}, mapped);
  row.last_synced_at = nowIso;
  row.sync_status = "synced";
  return row;
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
      const contactId = String(row[idx.contact_id] || "").trim();
      const name = String(row[idx.name] || "").trim();
      if (!contactId || !name) return;
      const alias = String(row[idx.alias] || "").trim();
      const org = String(row[idx.org] || "").trim();
      const role = String(row[idx.role] || "").trim();
      const tags = String(row[idx.tags] || "").trim();
      const email = String(row[idx.email] || "").trim();
      const phone1 = String(row[idx.phone1] || "").trim();
      const phone2 = String(row[idx.phone2] || "").trim();
      out.push({
        contactId: contactId,
        name: name,
        alias: alias,
        org: org,
        role: role,
        tags: tags,
        email: email,
        phone1: phone1,
        phone2: phone2,
        phone1Norm: TL_Contacts_normalizePhoneField_(row[idx.phone1_normalized] || phone1 || ""),
        phone2Norm: TL_Contacts_normalizePhoneField_(row[idx.phone2_normalized] || phone2 || ""),
        emailNorm: TL_Contacts_normalizeEmail_(row[idx.email_normalized] || email || ""),
        nameNorm: TL_Contacts_normalizeSearchText_(name),
        aliasNorm: TL_Contacts_normalizeSearchText_(alias),
        orgNorm: TL_Contacts_normalizeSearchText_(org),
        roleNorm: TL_Contacts_normalizeSearchText_(role),
        tagsNorm: TL_Contacts_normalizeSearchText_(tags)
      });
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
  const relationshipHints = [];
  const orgHints = [];

  TL_Contacts_normalizeStringArray_(data.name_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(nameHints, item);
  });
  TL_Contacts_normalizeStringArray_(data.phone_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(phoneHints, TL_Contacts_stripNonDigits_(item));
  });
  TL_Contacts_normalizeStringArray_(data.email_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(emailHints, TL_Contacts_normalizeEmail_(item));
  });
  TL_Contacts_normalizeStringArray_(data.relationship_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(relationshipHints, item);
  });
  TL_Contacts_normalizeStringArray_(data.org_hints).forEach(function(item) {
    TL_Contacts_pushUniqueHint_(orgHints, item);
  });

  const emailMatches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  emailMatches.forEach(function(item) {
    TL_Contacts_pushUniqueHint_(emailHints, TL_Contacts_normalizeEmail_(item));
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
    relationshipHints: relationshipHints.map(TL_Contacts_normalizeSearchText_).filter(Boolean),
    orgHints: orgHints.map(TL_Contacts_normalizeSearchText_).filter(Boolean)
  };
}

function TL_Contacts_normalizeSearchQueryType_(value) {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["name", "name_prefix", "phone_fragment", "email", "relationship", "org"];
  return allowed.indexOf(v) !== -1 ? v : "";
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
  TL_Contacts_normalizeStringArray_(data.relationship_hints).forEach(function(item) { pushQuery("relationship", item); });
  TL_Contacts_normalizeStringArray_(data.org_hints).forEach(function(item) { pushQuery("org", item); });

  const hints = TL_Contacts_buildSearchHints_(rawText, extraction);
  (hints.nameHints || []).forEach(function(item, idx) {
    pushQuery(idx === 0 ? "name" : "name_prefix", item);
  });
  (hints.phoneHints || []).forEach(function(item) { pushQuery("phone_fragment", item); });
  (hints.emailHints || []).forEach(function(item) { pushQuery("email", item); });
  (hints.relationshipHints || []).forEach(function(item) { pushQuery("relationship", item); });
  (hints.orgHints || []).forEach(function(item) { pushQuery("org", item); });

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

function TL_Contacts_scoreSearchCandidate_(contact, query) {
  const reasons = [];
  let score = 0;
  const phoneFields = [String(contact && contact.phone1Norm || ""), String(contact && contact.phone2Norm || "")].filter(Boolean);
  const emailField = String(contact && contact.emailNorm || "").trim();
  const nameFields = [
    TL_Contacts_normalizeSearchText_(contact && contact.name || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.alias || "")
  ].filter(Boolean);
  const contextFields = [
    TL_Contacts_normalizeSearchText_(contact && contact.org || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.role || ""),
    TL_Contacts_normalizeSearchText_(contact && contact.tags || "")
  ].filter(Boolean);
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
    if (emailField === value) {
      score += 150;
      reasons.push("exact_email:" + value);
    } else if (emailField && emailField.indexOf(value) !== -1) {
      score += 70;
      reasons.push("partial_email:" + value);
    }
  } else if (kind === "relationship" || kind === "org") {
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
