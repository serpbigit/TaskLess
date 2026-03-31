/**
 * Onboarding_DealWiseClientSetup
 *
 * Canonical client setup helpers for future commercial onboarding.
 * POC can still run these manually, but this file should remain the
 * single place to evolve spreadsheet/runtime bootstrapping.
 */

const ONBOARDING_DEALWISE = {
  SHEET_ID_PROP: "TL_SHEET_ID",
  DEFAULT_CONTACT_SYNC_MODE: "both_only",
  DEFAULT_EMAIL_OWNER: "reuven007@gmail.com"
};

function Onboarding_SetClientSheet(sheetId) {
  const normalizedId = Onboarding_normalizeSpreadsheetId_(sheetId);
  if (!normalizedId) throw new Error("Onboarding_SetClientSheet: missing spreadsheet ID");

  const ss = SpreadsheetApp.openById(normalizedId);
  PropertiesService.getScriptProperties().setProperty(ONBOARDING_DEALWISE.SHEET_ID_PROP, normalizedId);

  return {
    ok: true,
    sheet_id: normalizedId,
    spreadsheet_name: ss.getName(),
    spreadsheet_url: ss.getUrl()
  };
}

function Onboarding_ConnectAndBootstrap(sheetId) {
  return Onboarding_FinalizePocSetup(sheetId);
}

function Onboarding_FinalizePocSetup(sheetId) {
  const connected = Onboarding_SetClientSheet(sheetId);
  const schema = TL_EnsureSchema();
  const layoutNormalized = typeof TL_Schema_NormalizeDealWiseLayout === "function"
    ? TL_Schema_NormalizeDealWiseLayout()
    : { ok: false, reason: "missing_layout_normalizer" };
  const emailOwner = typeof TL_Orchestrator_setSettingValue_ === "function"
    ? TL_Orchestrator_setSettingValue_("EMAIL_OWNER_EMAIL", ONBOARDING_DEALWISE.DEFAULT_EMAIL_OWNER)
    : { ok: false, reason: "missing_set_setting_helper", key: "EMAIL_OWNER_EMAIL" };
  const emailTrigger = typeof TL_Email_InstallTrigger_5m === "function"
    ? TL_Email_InstallTrigger_5m()
    : { ok: false, reason: "missing_email_trigger_installer" };
  const orchestratorTrigger = typeof TL_Orchestrator_EnsureTrigger_5m === "function"
    ? TL_Orchestrator_EnsureTrigger_5m()
    : { ok: false, reason: "missing_orchestrator_trigger_installer" };
  const summary = Onboarding_RuntimeSummary();
  summary.connected = connected;
  summary.schema = schema;
  summary.layout_normalized = layoutNormalized;
  summary.email_owner_setting = emailOwner;
  summary.email_trigger = emailTrigger;
  summary.orchestrator_trigger = orchestratorTrigger;
  return summary;
}

function Onboarding_RuntimeSummary() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = String(props.getProperty(ONBOARDING_DEALWISE.SHEET_ID_PROP) || "").trim();
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
      "Set TL_SHEET_ID via Onboarding_SetClientSheet(sheetId)",
      "Run Onboarding_ConnectAndBootstrap(sheetId)"
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

function Onboarding_GetTemplateConfig() {
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
    default_contact_sync_mode: ONBOARDING_DEALWISE.DEFAULT_CONTACT_SYNC_MODE,
    required_tabs: (typeof TL_SCHEMA !== "undefined" && TL_SCHEMA.ALLOWED_TABS)
      ? TL_SCHEMA.ALLOWED_TABS.slice()
      : []
  };
}

function Onboarding_normalizeSpreadsheetId_(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    return active ? String(active.getId() || "").trim() : "";
  }
  const match = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return raw;
}
