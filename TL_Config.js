/**
 * TL_Config - Script Properties helper + SETTINGS sheet helpers (POC)
 * - ScriptProperties: secrets/config (tokens, ids)
 * - SETTINGS tab: non-secret knobs (controller mode, owner number, etc.)
 *
 * IMPORTANT:
 * - SETTINGS values are "digits-only" for WhatsApp numbers (no +).
 * - Bootstrap only ADDS missing keys; it NEVER overwrites existing user values.
 */

function TL_Config_get_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === undefined || v === "") ? fallback : v;
}

function TL_Config_set_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/** Digits-only normalization (WhatsApp webhook "from" is digits-only). */
function TL_Normalize_digits_(v) {
  return String(v || "").replace(/[^\d]/g, "").trim();
}

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
    vals.forEach(r => {
      const k = String(r[0] || "").trim();
      if (k) existing[k] = true;
    });
  }

  const toAppend = required
    .filter(pair => !existing[String(pair[0])])
    .map(pair => [String(pair[0]), String(pair[1])]);

  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, 2).setValues(toAppend);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: true,
    added: toAppend.map(r => r[0]),
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
  vals.forEach(r => {
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

  return { ok: true, directMode: direct, ownerE164: owner, routerMode: routerMode, routerE164: router };
}

/**
 * Export compact JSON for copy/paste into chat (so AI can align wiring).
 * Includes spreadsheet identity, tabs list, and SETTINGS map.
 */
function TL_Settings_exportJson_(rowLimitPerTab) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = ss.getSheets().map(sh => sh.getName());

  const out = {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    tabs: tabs,
    settings: TL_Settings_getAll_()
  };

  // Optional: lightweight sanity peek into key tabs (no heavy dumps)
  const limit = Number(rowLimitPerTab || 0);
  if (limit > 0) {
    out.peek = {};
    tabs.forEach(name => {
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      const lr = sh.getLastRow();
      const lc = sh.getLastColumn();
      const rows = Math.min(lr, limit);
      if (rows <= 0 || lc <= 0) { out.peek[name] = { rows: 0, cols: 0, values: [] }; return; }
      out.peek[name] = { rows: rows, cols: lc, values: sh.getRange(1, 1, rows, lc).getValues() };
    });
  }

  return JSON.stringify(out);
}
