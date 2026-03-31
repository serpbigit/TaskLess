function Helper_RunDealWiseReleaseGate() {
  return Helper_RunDealWiseReleaseGate_({
    mode: "full",
    include_operational_canary: true,
    include_stateful_suites: true
  });
}

function Helper_RunDealWiseReleaseGate_ReadOnly() {
  return Helper_RunDealWiseReleaseGate_({
    mode: "read_only",
    include_operational_canary: true,
    include_stateful_suites: false
  });
}

function Helper_RunDealWiseReleaseGate_Staging() {
  return Helper_RunDealWiseReleaseGate();
}

function Helper_RunDealWiseReleaseGate_(options) {
  var opts = options || {};
  var startedAt = new Date();
  var ss = typeof Helper_GetSpreadsheet_ === "function"
    ? Helper_GetSpreadsheet_()
    : (typeof TL_Schema_getSpreadsheet_ === "function" ? TL_Schema_getSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet());
  var beforeCounts = Helper_RunDealWiseReleaseGate_captureSheetCounts_(ss);
  var warnings = [];
  var sections = {};
  var mode = String(opts.mode || "full").trim().toLowerCase() || "full";
  var includeStatefulSuites = !!opts.include_stateful_suites;

  if (includeStatefulSuites && !Helper_RunDealWiseReleaseGate_isLikelyStagingSheet_(ss.getName())) {
    warnings.push("Stateful suites append fixture rows. Prefer running this gate on a staging/test sheet instead of the main live workbook.");
  }

  sections.schema = Helper_RunDealWiseReleaseGate_runSection_("schema", function() {
    var ensure = typeof TL_EnsureSchema === "function"
      ? TL_EnsureSchema()
      : { ok: false, error: "missing TL_EnsureSchema" };
    var tabs = typeof Helper_ListTabsAndHeaders === "function"
      ? Helper_ListTabsAndHeaders()
      : [];
    return {
      ok: Helper_RunDealWiseReleaseGate_valueOk_(ensure) && tabs.length > 0,
      ensure: ensure,
      tabs: tabs.map(function(tab) {
        return {
          tab: tab.tab,
          lastRow: Number(tab.lastRow || 0),
          lastCol: Number(tab.lastCol || 0),
          header_count: Array.isArray(tab.headers) ? tab.headers.length : 0
        };
      })
    };
  });

  if (opts.include_operational_canary !== false) {
    sections.operational_canary = Helper_RunDealWiseReleaseGate_runSection_("operational_canary", function() {
      return {
        ok: true,
        settings: Helper_RunDealWiseReleaseGate_checkSettings_(),
        email_status: typeof TL_Email_Status === "function"
          ? TL_Email_Status()
          : { ok: false, error: "missing TL_Email_Status" },
        orchestrator_status: typeof TL_Orchestrator_Status === "function"
          ? TL_Orchestrator_Status()
          : { ok: false, error: "missing TL_Orchestrator_Status" }
      };
    });
  }

  sections.deterministic_core = Helper_RunDealWiseReleaseGate_runSection_("deterministic_core", function() {
    return {
      ok: true,
      smoke_suite: typeof Helper_RunDealWiseSmokeSuite === "function"
        ? Helper_RunDealWiseSmokeSuite()
        : { ok: false, error: "missing Helper_RunDealWiseSmokeSuite" },
      email_inbox: typeof TL_TestEmailInbox_RunAll === "function"
        ? TL_TestEmailInbox_RunAll()
        : { ok: false, error: "missing TL_TestEmailInbox_RunAll" },
      email_dry_run: typeof TL_TestEmail_RunAll === "function"
        ? TL_TestEmail_RunAll()
        : { ok: false, error: "missing TL_TestEmail_RunAll" },
      contact_enrichment: typeof TL_TestContactEnrichment_RunAll === "function"
        ? TL_TestContactEnrichment_RunAll()
        : { ok: false, error: "missing TL_TestContactEnrichment_RunAll" },
      boss_turn: typeof TL_TestBossTurn_RunAll === "function"
        ? TL_TestBossTurn_RunAll()
        : { ok: false, error: "missing TL_TestBossTurn_RunAll" }
    };
  });

  if (includeStatefulSuites) {
    sections.stateful_regression = Helper_RunDealWiseReleaseGate_runSection_("stateful_regression", function() {
      return {
        ok: true,
        boss_menu_contract: typeof TL_TestBossMenuContract_RunAll === "function"
          ? TL_TestBossMenuContract_RunAll()
          : { ok: false, error: "missing TL_TestBossMenuContract_RunAll" },
        boss_intent_routing: typeof TL_TestBossIntentRouting_RunAll === "function"
          ? TL_TestBossIntentRouting_RunAll()
          : { ok: false, error: "missing TL_TestBossIntentRouting_RunAll" },
        boss_decision: typeof TL_TestBossDecision_RunAll === "function"
          ? TL_TestBossDecision_RunAll()
          : { ok: false, error: "missing TL_TestBossDecision_RunAll" },
        secretary_loop: typeof TL_TestSecretaryLoop_RunAll === "function"
          ? TL_TestSecretaryLoop_RunAll()
          : { ok: false, error: "missing TL_TestSecretaryLoop_RunAll" }
      };
    });
  } else {
    warnings.push("Read-only mode skipped stateful regression suites that append fixtures or update runtime state.");
  }

  var completedAt = new Date();
  var afterCounts = Helper_RunDealWiseReleaseGate_captureSheetCounts_(ss);
  var summary = Helper_RunDealWiseReleaseGate_summarizeSections_(sections);
  var result = {
    ok: summary.ok,
    mode: mode,
    started_iso: startedAt.toISOString(),
    completed_iso: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    spreadsheet: {
      id: ss.getId(),
      name: ss.getName(),
      url: ss.getUrl()
    },
    warnings: warnings,
    before_counts: beforeCounts,
    after_counts: afterCounts,
    row_deltas: Helper_RunDealWiseReleaseGate_diffCounts_(beforeCounts, afterCounts),
    summary: summary,
    sections: sections
  };

  Logger.log("Helper_RunDealWiseReleaseGate %s", JSON.stringify(result, null, 2));
  try { console.log("Helper_RunDealWiseReleaseGate", JSON.stringify(result)); } catch (e) {}
  return result;
}

function Helper_RunDealWiseReleaseGate_runSection_(name, fn) {
  try {
    var value = typeof fn === "function" ? fn() : { ok: false, error: "missing runner for " + String(name || "") };
    if (value && typeof value === "object") {
      value.ok = Helper_RunDealWiseReleaseGate_valueOk_(value);
    }
    return value;
  } catch (err) {
    return {
      ok: false,
      error: String(err && err.message ? err.message : err),
      section: String(name || "")
    };
  }
}

function Helper_RunDealWiseReleaseGate_checkSettings_() {
  var required = [
    "EMAIL_OWNER_EMAIL",
    "BOSS_PHONE",
    "BUSINESS_PHONE",
    "BUSINESS_PHONE_ID",
    "AUTOMATION_ENABLED"
  ];
  var values = {};
  var missing = [];
  required.forEach(function(key) {
    var value = String(TLW_getSetting_(key) || "").trim();
    values[key] = value;
    if (!value) missing.push(key);
  });
  return {
    ok: missing.length === 0,
    missing: missing,
    values: values
  };
}

function Helper_RunDealWiseReleaseGate_captureSheetCounts_(ss) {
  var out = {};
  (ss.getSheets() || []).forEach(function(sheet) {
    out[String(sheet.getName() || "")] = {
      lastRow: Number(sheet.getLastRow() || 0),
      lastCol: Number(sheet.getLastColumn() || 0)
    };
  });
  return out;
}

function Helper_RunDealWiseReleaseGate_diffCounts_(beforeCounts, afterCounts) {
  var before = beforeCounts || {};
  var after = afterCounts || {};
  var names = {};
  Object.keys(before).forEach(function(name) { names[name] = true; });
  Object.keys(after).forEach(function(name) { names[name] = true; });

  var out = {};
  Object.keys(names).sort().forEach(function(name) {
    var beforeRow = before[name] ? Number(before[name].lastRow || 0) : 0;
    var afterRow = after[name] ? Number(after[name].lastRow || 0) : 0;
    var beforeCol = before[name] ? Number(before[name].lastCol || 0) : 0;
    var afterCol = after[name] ? Number(after[name].lastCol || 0) : 0;
    out[name] = {
      row_delta: afterRow - beforeRow,
      col_delta: afterCol - beforeCol
    };
  });
  return out;
}

function Helper_RunDealWiseReleaseGate_isLikelyStagingSheet_(name) {
  var value = String(name || "").trim().toLowerCase();
  return value.indexOf("stage") !== -1 ||
    value.indexOf("staging") !== -1 ||
    value.indexOf("test") !== -1 ||
    value.indexOf("sandbox") !== -1 ||
    value.indexOf("dev") !== -1;
}

function Helper_RunDealWiseReleaseGate_summarizeSections_(sections) {
  var summary = {
    ok: true,
    total_checks: 0,
    failed_checks: 0,
    sections: {}
  };

  Object.keys(sections || {}).forEach(function(name) {
    var sectionSummary = Helper_RunDealWiseReleaseGate_summarizeValue_(sections[name], String(name || ""));
    summary.sections[name] = sectionSummary;
    summary.total_checks += Number(sectionSummary.total_checks || 0);
    summary.failed_checks += Number(sectionSummary.failed_checks || 0);
    if (!sectionSummary.ok) summary.ok = false;
  });

  return summary;
}

function Helper_RunDealWiseReleaseGate_summarizeValue_(value, path) {
  if (value == null) {
    return {
      ok: false,
      total_checks: 1,
      failed_checks: 1,
      failures: [String(path || "missing")]
    };
  }

  if (typeof value !== "object") {
    return {
      ok: true,
      total_checks: 1,
      failed_checks: 0,
      failures: []
    };
  }

  var keys = Object.keys(value);
  var childKeys = keys.filter(function(key) {
    if (key === "ok" || key === "error" || key === "section") return false;
    var child = value[key];
    return !!child && typeof child === "object";
  });

  if (typeof value.ok === "boolean" && !childKeys.length) {
    return {
      ok: value.ok,
      total_checks: 1,
      failed_checks: value.ok ? 0 : 1,
      failures: value.ok ? [] : [Helper_RunDealWiseReleaseGate_failureLabel_(path, value)]
    };
  }

  if (!childKeys.length) {
    return {
      ok: true,
      total_checks: 1,
      failed_checks: 0,
      failures: []
    };
  }

  var out = {
    ok: true,
    total_checks: 0,
    failed_checks: 0,
    failures: []
  };

  childKeys.forEach(function(key) {
    var childPath = path ? path + "." + key : key;
    var childSummary = Helper_RunDealWiseReleaseGate_summarizeValue_(value[key], childPath);
    out.total_checks += Number(childSummary.total_checks || 0);
    out.failed_checks += Number(childSummary.failed_checks || 0);
    if (!childSummary.ok) out.ok = false;
    if (childSummary.failures && childSummary.failures.length) {
      out.failures = out.failures.concat(childSummary.failures);
    }
  });

  out.failures = out.failures.slice(0, 20);
  return out;
}

function Helper_RunDealWiseReleaseGate_failureLabel_(path, value) {
  var label = String(path || "check");
  var error = value && value.error ? String(value.error) : "";
  return error ? (label + ": " + error) : label;
}

function Helper_RunDealWiseReleaseGate_valueOk_(value) {
  if (value == null) return false;
  if (typeof value !== "object") return true;
  var keys = Object.keys(value);
  if (!keys.length) return true;
  var objectKeys = keys.filter(function(key) {
    if (key === "ok" || key === "error" || key === "section") return false;
    return value[key] && typeof value[key] === "object";
  });
  var childOk = !objectKeys.length || objectKeys.every(function(key) {
    return Helper_RunDealWiseReleaseGate_valueOk_(value[key]);
  });
  if (typeof value.ok === "boolean") {
    return value.ok && childOk;
  }
  return childOk;
}

function Helper_RunDealWiseStatefulGateProgressive() {
  return Helper_RunDealWiseStatefulGateProgressive_({
    reset: false
  });
}

function Helper_RunDealWiseStatefulGateProgressive_Reset() {
  var props = PropertiesService.getScriptProperties();
  var stateKey = "DW_STATEFUL_GATE_PROGRESS_V1";
  props.deleteProperty(stateKey);
  var result = {
    ok: true,
    reset: true,
    state_key: stateKey,
    cleared_at_iso: new Date().toISOString(),
    next_step: "Run Helper_RunDealWiseStatefulGateProgressive"
  };
  Logger.log("Helper_RunDealWiseStatefulGateProgressive_Reset %s", JSON.stringify(result, null, 2));
  try { console.log("Helper_RunDealWiseStatefulGateProgressive_Reset", JSON.stringify(result)); } catch (e) {}
  return result;
}

function Helper_RunDealWiseStatefulGateProgressive_(options) {
  var opts = options || {};
  var props = PropertiesService.getScriptProperties();
  var stateKey = "DW_STATEFUL_GATE_PROGRESS_V1";
  var suites = [
    { key: "boss_menu_contract", fn: "Helper_RunDealWiseBossMenuTests" },
    { key: "boss_intent_routing", fn: "TL_TestBossIntentRouting_RunAll" },
    { key: "boss_decision", fn: "TL_TestBossDecision_RunAll" },
    { key: "secretary_loop", fn: "TL_TestSecretaryLoop_RunAll" }
  ];
  var startedAt = new Date();
  var budgetMs = 240000;

  if (opts.reset) {
    props.deleteProperty(stateKey);
  }

  var state = {
    cursor: 0,
    runs: 0,
    started_iso: startedAt.toISOString(),
    results: {}
  };

  try {
    var raw = String(props.getProperty(stateKey) || "").trim();
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.cursor = Number(parsed.cursor || 0);
        state.runs = Number(parsed.runs || 0);
        state.started_iso = String(parsed.started_iso || state.started_iso);
        state.results = parsed.results && typeof parsed.results === "object" ? parsed.results : {};
      }
    }
  } catch (e) {}

  if (state.cursor < 0 || state.cursor >= suites.length) {
    state.cursor = 0;
    state.results = {};
  }

  state.runs += 1;

  while (state.cursor < suites.length) {
    if ((new Date()).getTime() - startedAt.getTime() >= budgetMs) break;
    var suite = suites[state.cursor];
    var fn = this[String(suite.fn || "")];
    var result;
    try {
      result = typeof fn === "function"
        ? fn()
        : { ok: false, error: "missing runner " + String(suite.fn || "") };
    } catch (err) {
      result = { ok: false, error: String(err && err.message ? err.message : err) };
    }
    state.results[suite.key] = result;
    state.cursor += 1;
    props.setProperty(stateKey, JSON.stringify(state));
  }

  var done = state.cursor >= suites.length;
  var summary = {
    ok: true,
    done: done,
    runs: state.runs,
    started_iso: state.started_iso,
    completed_iso: done ? new Date().toISOString() : "",
    next_cursor: done ? 0 : state.cursor,
    next_suite: done ? "" : String(suites[state.cursor].key || ""),
    results: state.results
  };

  Object.keys(state.results || {}).forEach(function(key) {
    if (!Helper_RunDealWiseReleaseGate_valueOk_(state.results[key])) summary.ok = false;
  });

  if (done) {
    props.deleteProperty(stateKey);
  } else {
    props.setProperty(stateKey, JSON.stringify(state));
  }

  Logger.log("Helper_RunDealWiseStatefulGateProgressive %s", JSON.stringify(summary, null, 2));
  try { console.log("Helper_RunDealWiseStatefulGateProgressive", JSON.stringify(summary)); } catch (e) {}
  return summary;
}
