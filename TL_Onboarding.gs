/**
 * TL_Onboarding
 *
 * Canonical client setup helpers for future commercial onboarding.
 * POC can still run these manually, but this file should remain the
 * single place to evolve spreadsheet/runtime bootstrapping.
 */

const TL_ONBOARDING = {
  SHEET_ID_PROP: "TL_SHEET_ID",
  DEFAULT_CONTACT_SYNC_MODE: "both_only"
};

function TL_Onboarding_SetClientSheet(sheetId) {
  const normalizedId = TL_Onboarding_normalizeSpreadsheetId_(sheetId);
  if (!normalizedId) throw new Error("TL_Onboarding_SetClientSheet: missing spreadsheet ID");

  const ss = SpreadsheetApp.openById(normalizedId);
  PropertiesService.getScriptProperties().setProperty(TL_ONBOARDING.SHEET_ID_PROP, normalizedId);

  return {
    ok: true,
    sheet_id: normalizedId,
    spreadsheet_name: ss.getName(),
    spreadsheet_url: ss.getUrl()
  };
}

function TL_Onboarding_ConnectAndBootstrap(sheetId) {
  const connected = TL_Onboarding_SetClientSheet(sheetId);
  TL_EnsureSchema();
  const summary = TL_Onboarding_RuntimeSummary();
  summary.connected = connected;
  return summary;
}

function TL_Onboarding_RuntimeSummary() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = String(props.getProperty(TL_ONBOARDING.SHEET_ID_PROP) || "").trim();
  const out = {
    ok: true,
    sheet_id: sheetId,
    has_sheet_id: !!sheetId,
    tabs: [],
    expected_tabs: (typeof TL_SCHEMA !== "undefined" && TL_SCHEMA.ALLOWED_TABS)
      ? TL_SCHEMA.ALLOWED_TABS.slice()
      : [],
    missing_tabs: [],
    recommended_next_steps: []
  };

  if (!sheetId) {
    out.ok = false;
    out.recommended_next_steps = [
      "Set TL_SHEET_ID via TL_Onboarding_SetClientSheet(sheetId)",
      "Run TL_Onboarding_ConnectAndBootstrap(sheetId)"
    ];
    return out;
  }

  const ss = SpreadsheetApp.openById(sheetId);
  out.spreadsheet_name = ss.getName();
  out.spreadsheet_url = ss.getUrl();
  out.tabs = ss.getSheets().map(function(sh) { return sh.getName(); });

  if (out.expected_tabs.length) {
    out.missing_tabs = out.expected_tabs.filter(function(tabName) {
      return out.tabs.indexOf(tabName) === -1;
    });
  }

  if (out.missing_tabs.length) {
    out.recommended_next_steps.push("Run TL_EnsureSchema()");
  }
  out.recommended_next_steps.push("Run TL_Contacts_ProfileStats()");
  out.recommended_next_steps.push("Run TL_Contacts_SyncGoogleContacts_DryRun()");

  return out;
}

function TL_Onboarding_GetTemplateConfig() {
  return {
    script_properties: [
      "TL_SHEET_ID",
      "TL_ENV_MODE",
      "TL_META_APP_ID",
      "TL_META_APP_SECRET",
      "TL_META_VERIFY_TOKEN",
      "TL_META_SYSTEM_USER_TOKEN",
      "TL_META_WABA_ID",
      "TL_META_PHONE_NUMBER_ID",
      "TL_META_BUSINESS_ACCOUNT_ID",
      "TL_CTRL_OWNER_E164",
      "TL_CTRL_DIRECT_MODE",
      "TL_CTRL_ROUTER_MODE",
      "TL_CTRL_ROUTER_E164",
      "TL_WEBHOOK_URL",
      "TL_ONBOARDING_REDIRECT_URL"
    ],
    default_contact_sync_mode: TL_ONBOARDING.DEFAULT_CONTACT_SYNC_MODE,
    required_tabs: (typeof TL_SCHEMA !== "undefined" && TL_SCHEMA.ALLOWED_TABS)
      ? TL_SCHEMA.ALLOWED_TABS.slice()
      : []
  };
}

function TL_Onboarding_normalizeSpreadsheetId_(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    return active ? String(active.getId() || "").trim() : "";
  }
  const match = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return raw;
}
