function Helper_RunDealWiseSmokeSuite() {
  const result = {
    schema: Helper_RunDealWiseSchemaAndBackfill_(false),
    boss_menu_contract: Helper_RunDealWiseBossMenuTests_(false),
    contacts_tests: Helper_RunDealWiseContactTests_(false),
    orchestrator_grouping: Helper_RunDealWiseGroupingTests_(false)
  };
  const summary = {
    ok: Helper_RunDealWiseSmokeSuite_isSuiteOk_(result),
    schema: Helper_RunDealWiseSmokeSuite_summarizeSection_("schema", result.schema),
    boss_menu_contract: Helper_RunDealWiseSmokeSuite_summarizeSection_("boss_menu_contract", result.boss_menu_contract),
    contacts_tests: Helper_RunDealWiseSmokeSuite_summarizeSection_("contacts_tests", result.contacts_tests),
    orchestrator_grouping: Helper_RunDealWiseSmokeSuite_summarizeSection_("orchestrator_grouping", result.orchestrator_grouping)
  };
  Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseSmokeSuite", summary);
  return summary;
}

function Helper_RunDealWiseSchemaAndBackfill() {
  return Helper_RunDealWiseSchemaAndBackfill_(true);
}

function Helper_RunDealWiseBossMenuTests() {
  return Helper_RunDealWiseBossMenuTests_(true);
}

function Helper_RunDealWiseBossMenuTestsCore() {
  return Helper_RunDealWiseBossMenuTestsCore_(true);
}

function Helper_RunDealWiseBossMenuTestsLiveData() {
  return Helper_RunDealWiseBossMenuTestsLiveData_(true);
}

function Helper_RunDealWiseBossTest_ColdStartMenu() {
  return Helper_RunDealWiseBossMenuSingleTest_("cold_start_menu", TL_TestBossMenuContract_ColdStartMenuRun);
}

function Helper_RunDealWiseBossTest_NonBossIgnored() {
  return Helper_RunDealWiseBossMenuSingleTest_("non_boss_ignored", TL_TestBossMenuContract_NonBossIgnoredRun);
}

function Helper_RunDealWiseBossTest_ReplyCategoryFilters() {
  return Helper_RunDealWiseBossMenuSingleTest_("reply_category_filters", TL_TestBossMenuContract_ReplyCategoryFiltersRun);
}

function Helper_RunDealWiseBossTest_OpportunityScoring() {
  return Helper_RunDealWiseBossMenuSingleTest_("opportunity_scoring", TL_TestBossMenuContract_OpportunityScoringRun);
}

function Helper_RunDealWiseBossTest_OpportunityDraftCopyReady() {
  return Helper_RunDealWiseBossMenuSingleTest_("opportunity_draft_copy_ready", TL_TestBossMenuContract_OpportunityDraftCopyReadyRun);
}

function Helper_RunDealWiseBossTest_OpportunityChannelSwitch() {
  return Helper_RunDealWiseBossMenuSingleTest_("opportunity_channel_switch", TL_TestBossMenuContract_OpportunityChannelSwitchRun);
}

function Helper_RunDealWiseBossTest_EnrichCrmNumericPrecedence() {
  return Helper_RunDealWiseBossMenuSingleTest_("enrich_crm_numeric_precedence", TL_TestBossMenuContract_EnrichCrmNumericPrecedenceRun);
}

function Helper_RunDealWiseBossTest_EnrichCrmCandidateSelection() {
  return Helper_RunDealWiseBossMenuSingleTest_("enrich_crm_candidate_selection", TL_TestBossMenuContract_EnrichCrmCandidateSelectionRun);
}

function Helper_RunDealWiseBossTest_MenuPausesActiveItem() {
  return Helper_RunDealWiseBossMenuSingleTest_("menu_pauses_active_item", TL_TestBossMenuContract_MenuPausesActiveItemRun);
}

function Helper_RunDealWiseBossTest_ResumeOpenPacket() {
  return Helper_RunDealWiseBossMenuSingleTest_("resume_open_packet", TL_TestBossMenuContract_ResumeOpenPacketRun);
}

function Helper_RunDealWiseBossTest_ExplicitEditRequired() {
  return Helper_RunDealWiseBossMenuSingleTest_("explicit_edit_required", TL_TestBossMenuContract_ExplicitEditRequiredRun);
}

function Helper_RunDealWiseBossTest_OpportunitiesManualSend() {
  return Helper_RunDealWiseBossMenuSingleTest_("opportunities_manual_send", TL_TestBossMenuContract_OpportunitiesManualSendRun);
}

function Helper_RunDealWiseBossTest_UiLanguageFollowsSettings() {
  return Helper_RunDealWiseBossMenuSingleTest_("ui_language_follows_settings", TL_TestBossMenuContract_UiLanguageFollowsSettingsRun);
}

function Helper_RunDealWiseContactTests() {
  return Helper_RunDealWiseContactTests_(true);
}

function Helper_RunDealWiseContactTest_TopicOwners() {
  return Helper_RunDealWiseContactSingleTest_("topic_owners", TL_TestContacts_TopicOwnersRun);
}

function Helper_RunDealWiseContactTest_PrepareOutboundRecipient() {
  return Helper_RunDealWiseContactSingleTest_("prepare_outbound_recipient", TL_TestContacts_PrepareOutboundRecipientRun);
}

function Helper_RunDealWiseContactTest_OutboundCardFormat() {
  return Helper_RunDealWiseContactSingleTest_("outbound_card_format", TL_TestContacts_OutboundCardFormatRun);
}

function Helper_RunDealWiseContactTest_ResolveRequestEmail() {
  return Helper_RunDealWiseContactSingleTest_("resolve_request_email", TL_TestContacts_ResolveRequestEmailRun);
}

function Helper_RunDealWiseContactTest_ResolveRequestAmbiguous() {
  return Helper_RunDealWiseContactSingleTest_("resolve_request_ambiguous", TL_TestContacts_ResolveRequestAmbiguousRun);
}

function Helper_RunDealWiseGroupingTests() {
  return Helper_RunDealWiseGroupingTests_(true);
}

function Helper_RunDealWiseSchemaAndBackfill_(shouldLog) {
  const result = {
    schema: null,
    contacts_backfill: null
  };
  try {
    result.schema = typeof TL_EnsureSchema === "function"
      ? { ok: true, value: TL_EnsureSchema() || "ok" }
      : { ok: false, error: "missing TL_EnsureSchema" };
  } catch (err) {
    result.schema = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  try {
    result.contacts_backfill = typeof TL_Contacts_BackfillDealWiseFields_ === "function"
      ? TL_Contacts_BackfillDealWiseFields_()
      : { ok: false, error: "missing TL_Contacts_BackfillDealWiseFields_" };
  } catch (err) {
    result.contacts_backfill = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const summary = {
    ok: Helper_RunDealWiseSmokeSuite_isSuiteOk_(result),
    schema: Helper_RunDealWiseSmokeSuite_summarizeSection_("schema", result.schema),
    contacts_backfill: Helper_RunDealWiseSmokeSuite_summarizeSection_("contacts_backfill", result.contacts_backfill)
  };
  if (shouldLog) Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseSchemaAndBackfill", summary);
  return summary;
}

function Helper_RunDealWiseBossMenuTests_(shouldLog) {
  const result = {
    core: Helper_RunDealWiseBossMenuTestsCore_(false),
    live_data: Helper_RunDealWiseBossMenuTestsLiveData_(false)
  };
  const summary = {
    ok: Helper_RunDealWiseSmokeSuite_isSuiteOk_(result),
    core: Helper_RunDealWiseSmokeSuite_summarizeSection_("boss_menu_contract_core", result.core),
    live_data: Helper_RunDealWiseSmokeSuite_summarizeSection_("boss_menu_contract_live_data", result.live_data)
  };
  if (shouldLog) Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseBossMenuTests", summary);
  return summary;
}

function Helper_RunDealWiseBossMenuTestsCore_(shouldLog) {
  let result;
  try {
    result = {
      cold_start_menu: TL_TestBossMenuContract_ColdStartMenuRun(),
      non_boss_ignored: TL_TestBossMenuContract_NonBossIgnoredRun(),
      reply_category_filters: TL_TestBossMenuContract_ReplyCategoryFiltersRun(),
      opportunity_scoring: TL_TestBossMenuContract_OpportunityScoringRun(),
      opportunity_draft_copy_ready: TL_TestBossMenuContract_OpportunityDraftCopyReadyRun(),
      opportunity_channel_switch: TL_TestBossMenuContract_OpportunityChannelSwitchRun(),
      enrich_crm_numeric_precedence: TL_TestBossMenuContract_EnrichCrmNumericPrecedenceRun(),
      enrich_crm_candidate_selection: TL_TestBossMenuContract_EnrichCrmCandidateSelectionRun(),
      menu_pauses_active_item: TL_TestBossMenuContract_MenuPausesActiveItemRun(),
      resume_open_packet: TL_TestBossMenuContract_ResumeOpenPacketRun(),
      explicit_edit_required: TL_TestBossMenuContract_ExplicitEditRequiredRun(),
      ui_language_follows_settings: TL_TestBossMenuContract_UiLanguageFollowsSettingsRun()
    };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const summary = Helper_RunDealWiseSmokeSuite_summarizeSection_("boss_menu_contract_core", result);
  if (shouldLog) Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseBossMenuTestsCore", summary);
  return summary;
}

function Helper_RunDealWiseBossMenuTestsLiveData_(shouldLog) {
  let result;
  try {
    result = {
      opportunities_manual_send: TL_TestBossMenuContract_OpportunitiesManualSendRun()
    };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const summary = Helper_RunDealWiseSmokeSuite_summarizeSection_("boss_menu_contract_live_data", result);
  if (shouldLog) Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseBossMenuTestsLiveData", summary);
  return summary;
}

function Helper_RunDealWiseBossMenuSingleTest_(name, fn) {
  let result;
  try {
    result = typeof fn === "function"
      ? fn()
      : { ok: false, error: "missing runner " + String(name || "") };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const summary = Helper_RunDealWiseSmokeSuite_summarizeSection_(String(name || "boss_menu_test"), result);
  Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseBossMenuSingleTest_" + String(name || "unknown"), summary);
  return summary;
}

function Helper_RunDealWiseContactTests_(shouldLog) {
  let result;
  try {
    result = typeof TL_TestContacts_RunAll === "function"
      ? TL_TestContacts_RunAll()
      : { ok: false, error: "missing TL_TestContacts_RunAll" };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const summary = Helper_RunDealWiseSmokeSuite_summarizeSection_("contacts_tests", result);
  if (shouldLog) Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseContactTests", summary);
  return summary;
}

function Helper_RunDealWiseContactSingleTest_(name, fn) {
  let result;
  try {
    result = typeof fn === "function"
      ? fn()
      : { ok: false, error: "missing runner " + String(name || "") };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const summary = Helper_RunDealWiseSmokeSuite_summarizeSection_(String(name || "contact_test"), result);
  Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseContactSingleTest_" + String(name || "unknown"), summary);
  return summary;
}

function Helper_RunDealWiseGroupingTests_(shouldLog) {
  let result;
  try {
    result = typeof TL_TestOrchestratorGrouping_RunAll === "function"
      ? TL_TestOrchestratorGrouping_RunAll()
      : { ok: false, error: "missing TL_TestOrchestratorGrouping_RunAll" };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  const summary = Helper_RunDealWiseSmokeSuite_summarizeSection_("orchestrator_grouping", result);
  if (shouldLog) Helper_RunDealWiseSmokeSuite_logSummary_("Helper_RunDealWiseGroupingTests", summary);
  return summary;
}

function Helper_RunDealWiseSmokeSuite_summarizeSection_(name, section) {
  if (section == null) return { ok: false, error: "missing " + name };
  if (typeof section !== "object") return { ok: true, value: String(section) };
  if (typeof section.ok === "boolean") {
    const out = { ok: section.ok };
    if (!section.ok && section.error) out.error = String(section.error);
    if (section.updated !== undefined) out.updated = Number(section.updated || 0);
    if (section.rows && typeof section.rows === "number") out.rows = Number(section.rows || 0);
    if (section.identities && typeof section.identities === "object" && section.identities.rows !== undefined) {
      out.identity_rows = Number(section.identities.rows || 0);
    }
    return out;
  }
  const checks = Object.keys(section);
  const failures = checks.filter(function(key) {
    const value = section[key];
    return value && typeof value === "object" && value.ok === false;
  });
  return {
    ok: failures.length === 0,
    total: checks.length,
    failed: failures.length,
    first_failure: failures.length ? failures[0] : ""
  };
}

function Helper_RunDealWiseSmokeSuite_isSuiteOk_(result) {
  return Object.keys(result || {}).every(function(key) {
    const section = result[key];
    if (!section || typeof section !== "object") return false;
    if (typeof section.ok === "boolean") return section.ok;
    return Object.keys(section).every(function(childKey) {
      const child = section[childKey];
      return !(child && typeof child === "object" && child.ok === false);
    });
  });
}

function Helper_RunDealWiseSmokeSuite_logSummary_(label, summary) {
  Logger.log("%s %s", label, JSON.stringify(summary, null, 2));
}
