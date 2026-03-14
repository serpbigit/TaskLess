/**
 * TL_Config - Script Properties helper + SETTINGS sheet helpers (POC)
 *
 * ScriptProperties:
 * - secrets/config (tokens, ids, webhook values, app ids)
 *
 * SETTINGS tab:
 * - non-secret knobs (controller mode, owner number, env mode, etc.)
 *
 * IMPORTANT:
 * - SETTINGS values are "digits-only" for WhatsApp numbers (no +).
 * - Bootstrap helpers only ADD missing keys; they NEVER overwrite existing user values.
 * - Secret values should not be hardcoded in source. Use the setter helpers below.
 */

// ============================================================================
// Script Properties - primitive helpers
// ============================================================================

function TL_Config_get_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === undefined || v === "") ? fallback : v;
}

function TL_Config_set_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function TL_Config_delete_(key) {
  PropertiesService.getScriptProperties().deleteProperty(String(key));
}

function TL_Config_getAll_() {
  return PropertiesService.getScriptProperties().getProperties();
}

function TL_Config_setMany_(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("TL_Config_setMany_: expected plain object");
  }

  const normalized = {};
  Object.keys(obj).forEach(function(key) {
    normalized[String(key)] = String(obj[key] == null ? "" : obj[key]);
  });

  PropertiesService.getScriptProperties().setProperties(normalized, false);
  return { ok: true, keys: Object.keys(normalized) };
}

// ============================================================================
// Script Properties - bootstrap / admin helpers
// ============================================================================

/**
 * Adds expected script-property keys if missing.
 * Does NOT overwrite existing values.
 *
 * Use this once per environment to make the expected config structure visible.
 */
function TL_Config_bootstrapScriptProperties_() {
  const props = PropertiesService.getScriptProperties();
  const current = props.getProperties();

  const required = {
    // Generic environment
    TL_ENV_MODE: "DEV",

    // WhatsApp / Meta / Cloud API
    TL_META_APP_ID: "",
    TL_META_APP_SECRET: "",
    TL_META_VERIFY_TOKEN: "",
    TL_META_SYSTEM_USER_TOKEN: "",
    TL_META_WABA_ID: "",
    TL_META_PHONE_NUMBER_ID: "",
    TL_META_BUSINESS_ACCOUNT_ID: "",

    // Router / controller
    TL_CTRL_OWNER_E164: "",
    TL_CTRL_DIRECT_MODE: "NO",
    TL_CTRL_ROUTER_MODE: "NO",
    TL_CTRL_ROUTER_E164: "",

    // Optional web / onboarding values
    TL_WEBHOOK_URL: "",
    TL_ONBOARDING_REDIRECT_URL: ""
  };

  const toSet = {};
  const added = [];

  Object.keys(required).forEach(function(key) {
    if (!(key in current)) {
      toSet[key] = String(required[key]);
      added.push(key);
    }
  });

  if (added.length) {
    props.setProperties(toSet, false);
  }

  return {
    ok: true,
    added: added,
    totalKeysNow: Object.keys(props.getProperties()).length
  };
}

/**
 * Safe export for chat/debugging.
 * Redacts values for keys that look secret-like.
 */
function TL_Config_exportScriptPropertiesSafe_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const out = {};

  Object.keys(props).sort().forEach(function(key) {
    const value = String(props[key] || "");
    const looksSecret = /TOKEN|SECRET|KEY|PASSWORD/i.test(key);
    out[key] = looksSecret
      ? (value ? "[REDACTED_PRESENT]" : "")
      : value;
  });

  return JSON.stringify({
    ok: true,
    scriptProperties: out
  }, null, 2);
}

/**
 * Set one property from Apps Script editor or mobile execution.
 */
function TL_Config_setScriptProperty(key, value) {
  if (!key) throw new Error("TL_Config_setScriptProperty: key is required");
  TL_Config_set_(String(key), String(value == null ? "" : value));
  return { ok: true, key: String(key) };
}

/**
 * Delete one property explicitly.
 */
function TL_Config_deleteScriptProperty(key) {
  if (!key) throw new Error("TL_Config_deleteScriptProperty: key is required");
  TL_Config_delete_(String(key));
  return { ok: true, deleted: String(key) };
}

/**
 * Bulk set from JSON text.
 *
 * Example:
 * TL_Config_setScriptPropertiesFromJson_('{
 *   "TL_META_SYSTEM_USER_TOKEN": "EAAB...",
 *   "TL_META_PHONE_NUMBER_ID": "1234567890"
 * }');
 */
function TL_Config_setScriptPropertiesFromJson_(jsonText) {
  if (!jsonText) throw new Error("TL_Config_setScriptPropertiesFromJson_: jsonText is required");

  let parsed;
  try {
    parsed = JSON.parse(String(jsonText));
  } catch (err) {
    throw new Error("Invalid JSON passed to TL_Config_setScriptPropertiesFromJson_: " + err.message);
  }

  return TL_Config_setMany_(parsed);
}

/**
 * Convenience helper for common Meta/WhatsApp values.
 * Pass only what you want to update.
 */
function TL_Config_setWhatsAppConfig_(cfg) {
  if (!cfg || typeof cfg !== "object") {
    throw new Error("TL_Config_setWhatsAppConfig_: cfg object is required");
  }

  const allowed = [
    "TL_META_APP_ID",
    "TL_META_APP_SECRET",
    "TL_META_VERIFY_TOKEN",
    "TL_META_SYSTEM_USER_TOKEN",
    "TL_META_WABA_ID",
    "TL_META_PHONE_NUMBER_ID",
    "TL_META_BUSINESS_ACCOUNT_ID",
    "TL_WEBHOOK_URL",
    "TL_ONBOARDING_REDIRECT_URL"
  ];

  const payload = {};
  allowed.forEach(function(key) {
    if (key in cfg) payload[key] = cfg[key];
  });

  return TL_Config_setMany_(payload);
}

// ============================================================================
// Shared normalization helper
// ============================================================================

/** Digits-only normalization (WhatsApp webhook "from" is digits-only). */
function TL_Normalize_digits_(v) {
  return String(v || "").replace(/[^\d]/g, "").trim();
}

// ============================================================================
// SETTINGS sheet helpers
// ============================================================================

/** Returns the bound spreadsheet SETTINGS sheet (creates sheet + headers if missing). */
function TL_Settings_getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // bound sheet
  const tabName = TL_Config_get_("TL_CFG_TAB_SETTINGS", "SETTINGS");

  let sh = ss.getSheetByName(tabName);
  if (!sh) sh = ss.insertSheet(tabName);

  // Ensure header row exists: ["key","value"]
  const lastRow = sh.getLastRow();
  const lastCol = Math.max(1, sh.getLastColumn());
  const firstRow = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  const hasHeader = (firstRow[0] === "key" && firstRow[1] === "value");

  if (lastRow === 0 || !hasHeader) {
    sh.clear();
    sh.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
    sh.setFrozenRows(1);
  }

  return sh;
}

/**
 * Bootstrap REQUIRED SETTINGS keys (adds missing only; never overwrite).
 * Call this after creating a new sheet / or before wiring logic.
 */
function TL_Settings_bootstrapRequired_() {
  const sh = TL_Settings_getSheet_();

  const required = [
    // Controller flags
    ["TL_CTRL_DIRECT_MODE", "NO"],            // YES/NO
    ["TL_CTRL_OWNER_E164", ""],               // digits-only (no +)

    // Future (kept as placeholders so schema is ready)
    ["TL_CTRL_ROUTER_MODE", "NO"],            // YES/NO (future)
    ["TL_CTRL_ROUTER_E164", ""],              // digits-only (future)

    // Environment knobs (future safe defaults)
    ["TL_ENV_MODE", "DEV"]                    // DEV/PROD
  ];

  const lastRow = sh.getLastRow();
  const existing = {};

  if (lastRow >= 2) {
    const vals = sh.getRange(2, 1, lastRow - 1, 2).getValues();
    vals.forEach(function(r) {
      const k = String(r[0] || "").trim();
      if (k) existing[k] = true;
    });
  }

  const toAppend = required
    .filter(function(pair) { return !existing[String(pair[0])]; })
    .map(function(pair) { return [String(pair[0]), String(pair[1])]; });

  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, 2).setValues(toAppend);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: true,
    added: toAppend.map(function(r) { return r[0]; }),
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    tab: sh.getName()
  };
}

/** Read SETTINGS into { key: value } object (keys preserved; values trimmed). */
function TL_Settings_getAll_() {
  const sh = TL_Settings_getSheet_();
  const lastRow = sh.getLastRow();
  const out = {};

  if (lastRow < 2) return out;

  const vals = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  vals.forEach(function(r) {
    const k = String(r[0] || "").trim();
    if (!k) return;
    out[k] = String(r[1] || "").trim();
  });

  return out;
}

/**
 * Validate SETTINGS consistency (throws actionable errors).
 * Use this before enabling real routing/execution logic.
 */
function TL_Settings_validate_() {
  const s = TL_Settings_getAll_();

  const direct = String(s["TL_CTRL_DIRECT_MODE"] || "NO").toUpperCase();
  const owner = TL_Normalize_digits_(s["TL_CTRL_OWNER_E164"] || "");

  if (direct === "YES" && !owner) {
    throw new Error("SETTINGS invalid: TL_CTRL_DIRECT_MODE=YES but TL_CTRL_OWNER_E164 is empty (must be digits-only, e.g. 97250...)");
  }

  const routerMode = String(s["TL_CTRL_ROUTER_MODE"] || "NO").toUpperCase();
  const router = TL_Normalize_digits_(s["TL_CTRL_ROUTER_E164"] || "");
  if (routerMode === "YES" && !router) {
    throw new Error("SETTINGS invalid: TL_CTRL_ROUTER_MODE=YES but TL_CTRL_ROUTER_E164 is empty (digits-only)");
  }

  return {
    ok: true,
    directMode: direct,
    ownerE164: owner,
    routerMode: routerMode,
    routerE164: router
  };
}

/**
 * Export compact JSON for copy/paste into chat (so AI can align wiring).
 * Includes spreadsheet identity, tabs list, SETTINGS map,
 * and a safe script-properties export.
 */
function TL_Settings_exportJson_(rowLimitPerTab) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = ss.getSheets().map(function(sh) { return sh.getName(); });

  const out = {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    tabs: tabs,
    settings: TL_Settings_getAll_(),
    scriptPropertiesSafe: JSON.parse(TL_Config_exportScriptPropertiesSafe_()).scriptProperties
  };

  // Optional: lightweight sanity peek into key tabs (no heavy dumps)
  const limit = Number(rowLimitPerTab || 0);
  if (limit > 0) {
    out.peek = {};
    tabs.forEach(function(name) {
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      const lr = sh.getLastRow();
      const lc = sh.getLastColumn();
      const rows = Math.min(lr, limit);
      if (rows <= 0 || lc <= 0) {
        out.peek[name] = { rows: 0, cols: 0, values: [] };
        return;
      }
      out.peek[name] = {
        rows: rows,
        cols: lc,
        values: sh.getRange(1, 1, rows, lc).getValues()
      };
    });
  }

  return JSON.stringify(out);
}
