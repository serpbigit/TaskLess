/**
 * Helper_DealWiseCleanup
 *
 * One-shot live cleanup for the active DealWise spreadsheet/runtime:
 * - normalizes CONTACTS headers to the DealWise schema
 * - ensures the minimal DealWise tabs exist
 * - removes temp/admin tabs that should not stay in the live workbook
 * - removes transient/repetitive Script Properties while preserving true config
 */

function Helper_DealWiseCleanupLive() {
  const ss = typeof TL_Schema_getSpreadsheet_ === "function"
    ? TL_Schema_getSpreadsheet_()
    : SpreadsheetApp.getActiveSpreadsheet();

  const result = {
    spreadsheet_id: ss.getId(),
    spreadsheet_name: ss.getName(),
    spreadsheet_url: ss.getUrl(),
    tabs: Helper_DealWiseCleanupSyncTabs_(ss),
    script_properties: Helper_DealWiseCleanupScriptProperties_()
  };

  Logger.log("Helper_DealWiseCleanupLive %s", JSON.stringify(result, null, 2));
  try { console.log("Helper_DealWiseCleanupLive", JSON.stringify(result, null, 2)); } catch (e) {}
  return result;
}

function Helper_DealWiseCleanupSyncTabs_(ss) {
  const out = {
    ensured: [],
    removed: [],
    contacts_headers: [],
    unhidden_sheets: [],
    unhidden_columns: {}
  };

  Helper_DealWiseEnsureTabHeaders_(ss, "INBOX", TL_SCHEMA.INBOX_HEADERS);
  out.ensured.push("INBOX");

  Helper_DealWiseEnsureTabHeaders_(ss, "ARCHIVE", TL_SCHEMA.INBOX_HEADERS);
  out.ensured.push("ARCHIVE");

  Helper_DealWiseEnsureTabHeaders_(ss, "CONTACTS", TL_SCHEMA.CONTACTS_HEADERS);
  out.ensured.push("CONTACTS");
  Helper_DealWiseEnsureSheetVisible_(ss.getSheetByName("CONTACTS"));
  Helper_DealWiseEnsureColumnRangeVisible_(ss.getSheetByName("CONTACTS"), TL_SCHEMA.CONTACTS_HEADERS.length);
  out.unhidden_columns.CONTACTS = TL_SCHEMA.CONTACTS_HEADERS.length;
  out.contacts_headers = Helper_DealWiseReadHeaderRow_(ss.getSheetByName("CONTACTS"));

  Helper_DealWiseEnsureTabHeaders_(ss, "SETTINGS", TL_SCHEMA.SETTINGS_HEADERS);
  out.ensured.push("SETTINGS");

  Helper_DealWiseEnsureTabHeaders_(ss, "LOG", TL_SCHEMA.LOG_HEADERS);
  out.ensured.push("LOG");

  Helper_DealWiseEnsureTabHeaders_(ss, "AI_Cost_Tracker", TL_SCHEMA.AI_COST_TRACKER_HEADERS);
  out.ensured.push("AI_Cost_Tracker");

  if (typeof seedSettings_ === "function") seedSettings_(ss);

  const removableNames = ["TEMP_SCRIPT_PROPERTIES_EXPORT", "Copy of SETTINGS", "CONTACT_IDENTITIES", "CONTACT_ENRICHMENTS", "TOPICS"];
  ss.getSheets().forEach(function(sheet) {
    const name = String(sheet.getName() || "").trim();
    if (removableNames.indexOf(name) !== -1) {
      ss.deleteSheet(sheet);
      out.removed.push(name);
    }
  });

  return out;
}

function Helper_DealWiseEnsureTabHeaders_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }

  const lastCol = Math.max(Number(sh.getLastColumn() || 0), headers.length);
  if (lastCol > 0) {
    sh.getRange(1, 1, 1, lastCol).clearContent();
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function Helper_DealWiseEnsureSheetVisible_(sheet) {
  const sh = sheet;
  if (!sh) return false;
  try {
    if (typeof sh.isSheetHidden === "function" && sh.isSheetHidden()) {
      sh.showSheet();
      return true;
    }
  } catch (e) {}
  return false;
}

function Helper_DealWiseEnsureColumnRangeVisible_(sheet, width) {
  const sh = sheet;
  const total = Math.max(Number(width || 0), 1);
  if (!sh || total < 1) return false;
  try {
    sh.showColumns(1, total);
    return true;
  } catch (e) {
    return false;
  }
}

function Helper_DealWiseReadHeaderRow_(sheet) {
  const sh = sheet;
  if (!sh) return [];
  const width = Math.max(Number(sh.getLastColumn() || 0), 1);
  return sh.getRange(1, 1, 1, width).getValues()[0]
    .map(function(value) { return String(value || "").trim(); })
    .filter(Boolean);
}

function Helper_DealWiseCleanupScriptProperties_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties() || {};
  const keys = Object.keys(all).sort();
  const removed = [];
  const kept = [];

  keys.forEach(function(key) {
    if (Helper_DealWiseShouldDeleteScriptProperty_(key)) {
      props.deleteProperty(key);
      removed.push(key);
      return;
    }
    kept.push(key);
  });

  return {
    removed_count: removed.length,
    kept_count: kept.length,
    removed_sample: removed.slice(0, 20),
    kept_sample: kept.slice(0, 20)
  };
}

function Helper_DealWiseShouldDeleteScriptProperty_(key) {
  const k = String(key || "").trim().toUpperCase();
  if (!k) return false;
  return (
    k.indexOf("MENU_STATE_") === 0 ||
    k.indexOf("MENU_PACKET_") === 0 ||
    k.indexOf("MENU_INTENT_") === 0 ||
    k.indexOf("TL_LATE_STATUS_") === 0 ||
    k.indexOf("TL_REPLY_SENT_") === 0 ||
    k.indexOf("TL_BOSS_LAST_") === 0 ||
    k.indexOf("TL_EMAIL_LAST_") === 0 ||
    k.indexOf("TL_SEEN_") === 0 ||
    k === "TL_SEEN_CLEAN_COUNTER" ||
    k === "TL_EMAIL_LAST_PULL_AT" ||
    k === "TL_EMAIL_LAST_PULL_QUERY" ||
    k === "TL_EMAIL_LAST_PULL_MAX_MSG_AT"
  );
}
