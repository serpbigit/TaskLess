/**
 * Helper_TestWhatsApp
 *
 * Test-only helpers for live WhatsApp grouping validation without waiting
 * for the production quiet window to expire.
 */

const HELPER_TEST_WHATSAPP = {
  MR_T_PHONE: "972552630029"
};

function Helper_TestWhatsApp_SealBurstsNow(batchSize) {
  const limit = Number(batchSize || 20);
  const futureNow = new Date(Date.now() + (30 * 60000));
  const synthesis = TL_Synthesis_Run(limit, { now: futureNow });
  return {
    ok: true,
    helper: "Helper_TestWhatsApp_SealBurstsNow",
    simulated_now: futureNow.toISOString(),
    synthesis: synthesis
  };
}

function Helper_TestWhatsApp_SealBurstsNowAndExport(batchSize) {
  const seal = Helper_TestWhatsApp_SealBurstsNow(batchSize);
  const schema = Helper_ExportSchemaJson();
  return {
    ok: true,
    helper: "Helper_TestWhatsApp_SealBurstsNowAndExport",
    seal: seal,
    schema: schema
  };
}

function Helper_TestWhatsApp_SealBurstsNowForContact(contactPhone, batchSize) {
  const targetPhone = TLW_normalizePhone_(contactPhone || "");
  if (!targetPhone) {
    return {
      ok: false,
      reason: "missing_contact_phone"
    };
  }
  const limit = Number(batchSize || 20);
  const futureNow = new Date(Date.now() + (30 * 60000));
  return TL_Orchestrator_withLock_("synthesis", function() {
    const rows = TL_Orchestrator_readRecentRows_(TL_ORCHESTRATOR.DEFAULT_SCAN_ROWS);
    const bursts = TL_Orchestrator_collectSealedWhatsAppBursts_(rows, { now: futureNow }).filter(function(burst) {
      const latest = burst && burst.latestIncomingRow && burst.latestIncomingRow.values ? burst.latestIncomingRow.values : [];
      const sender = TLW_normalizePhone_(TL_Orchestrator_value_(latest, "sender") || "");
      const contactId = String(TL_Orchestrator_value_(latest, "contact_id") || "").trim();
      return sender === targetPhone || contactId.indexOf(targetPhone) !== -1;
    });
    const result = {
      ok: true,
      helper: "Helper_TestWhatsApp_SealBurstsNowForContact",
      contact_phone: targetPhone,
      simulated_now: futureNow.toISOString(),
      scanned: bursts.length,
      synthesized: 0,
      skipped: 0
    };
    for (let i = 0; i < bursts.length && result.synthesized < limit; i++) {
      const synthesis = TL_Orchestrator_buildBurstSynthesis_(bursts[i], { now: futureNow });
      if (!synthesis) {
        result.skipped++;
        continue;
      }
      TLW_appendInboxRow_(synthesis.row, synthesis.rawJson);
      if (synthesis.crmWriteback && typeof TL_Contacts_ApplyGroupedInteractionWriteback_ === "function") {
        TL_Contacts_ApplyGroupedInteractionWriteback_(synthesis.crmWriteback.contactId, synthesis.crmWriteback);
      }
      result.synthesized++;
    }
    return result;
  });
}

function Helper_TestWhatsApp_SealBurstsNowForContactAndExport(contactPhone, batchSize) {
  const seal = Helper_TestWhatsApp_SealBurstsNowForContact(contactPhone, batchSize);
  const schema = Helper_ExportSchemaJson();
  return {
    ok: true,
    helper: "Helper_TestWhatsApp_SealBurstsNowForContactAndExport",
    seal: seal,
    schema: schema
  };
}

function Helper_TestWhatsApp_SealBurstsNowForMrT() {
  return Helper_TestWhatsApp_SealBurstsNowForContact(HELPER_TEST_WHATSAPP.MR_T_PHONE);
}

function Helper_TestWhatsApp_SealBurstsNowForMrTAndExport() {
  return Helper_TestWhatsApp_SealBurstsNowForContactAndExport(HELPER_TEST_WHATSAPP.MR_T_PHONE);
}

function Helper_PrepareMrTReplyTest() {
  const seal = Helper_TestWhatsApp_SealBurstsNowForContact(HELPER_TEST_WHATSAPP.MR_T_PHONE);
  const prepareBoss = typeof Helper_PrepareBossSnapshotsNow === "function"
    ? Helper_PrepareBossSnapshotsNow()
    : { ok: false, reason: "boss_snapshot_helper_unavailable" };
  const bossStatus = typeof Helper_BossSessionStatus === "function"
    ? Helper_BossSessionStatus()
    : { ok: false, reason: "boss_session_status_unavailable" };
  return {
    ok: !!(seal && seal.ok),
    helper: "Helper_PrepareMrTReplyTest",
    target_contact_phone: HELPER_TEST_WHATSAPP.MR_T_PHONE,
    seal: seal,
    prepare_boss: prepareBoss,
    boss_status: bossStatus
  };
}

function Helper_SetWhatsAppQuietWindow3m() {
  const quiet = typeof TL_Orchestrator_setSettingValue_ === "function"
    ? TL_Orchestrator_setSettingValue_("WHATSAPP_GROUP_QUIET_MINUTES", "3")
    : null;
  const max = typeof TL_Orchestrator_setSettingValue_ === "function"
    ? TL_Orchestrator_setSettingValue_("WHATSAPP_GROUP_MAX_MINUTES", "12")
    : null;
  return {
    ok: !!quiet && !!max,
    quiet_minutes: quiet,
    max_minutes: max
  };
}

function Helper_RepairGroupedWhatsAppRows(scanRows) {
  const limit = Number(scanRows || 250);
  return TL_Orchestrator_withLock_("synthesis", function() {
    const rows = TL_Orchestrator_readRecentRows_(limit);
    const result = {
      ok: true,
      helper: "Helper_RepairGroupedWhatsAppRows",
      scanned: 0,
      updated: 0,
      touched_rows: []
    };
    (rows || []).forEach(function(item) {
      if (!item || !item.values) return;
      const values = item.values;
      const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
      const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
      if (recordClass !== "grouped_inbound" || channel !== "whatsapp") return;
      result.scanned++;

      const notes = String(TL_Orchestrator_value_(values, "notes") || "").trim();
      const contactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
      const displayPhone = TLW_normalizePhone_(TL_Orchestrator_value_(values, "display_phone_number") || "");
      const currentSender = TLW_normalizePhone_(TL_Orchestrator_value_(values, "sender") || "");
      const currentReceiver = TLW_normalizePhone_(TL_Orchestrator_value_(values, "receiver") || "");
      const noteExternal = TLW_normalizePhone_(typeof TL_ContactEnrichment_getNoteValue_ === "function"
        ? TL_ContactEnrichment_getNoteValue_(notes, "dealwise_group_external_sender")
        : "");
      const noteBusiness = TLW_normalizePhone_(typeof TL_ContactEnrichment_getNoteValue_ === "function"
        ? TL_ContactEnrichment_getNoteValue_(notes, "dealwise_group_business_line")
        : "");
      const contactPhone = typeof TL_Orchestrator_contactPhoneFromContactId_ === "function"
        ? TL_Orchestrator_contactPhoneFromContactId_(contactId)
        : "";
      const sender = noteExternal || contactPhone || (currentSender && currentSender !== displayPhone ? currentSender : "") || (currentReceiver && currentReceiver !== displayPhone ? currentReceiver : "");
      const receiver = noteBusiness || displayPhone || currentReceiver || currentSender;

      let groupedText = "";
      try {
        const payload = JSON.parse(String(TL_Orchestrator_value_(values, "raw_payload_ref") || "").trim() || "{}");
        groupedText = String(payload && payload.grouped_text || "").trim();
      } catch (e) {}

      const updates = {};
      if (String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase() !== "incoming") {
        updates.direction = "incoming";
      }
      if (sender && sender !== currentSender) updates.sender = sender;
      if (receiver && receiver !== currentReceiver) {
        updates.receiver = receiver;
        updates.display_phone_number = receiver;
      }
      if (groupedText && groupedText !== String(TL_Orchestrator_value_(values, "text") || "").trim()) {
        updates.text = groupedText;
      }
      if (Object.keys(updates).length) {
        TL_Orchestrator_updateRowFields_(item.rowNumber, updates, "repair_grouped_whatsapp_participants");
        result.updated++;
        result.touched_rows.push(item.rowNumber);
      }
    });
    return result;
  });
}
