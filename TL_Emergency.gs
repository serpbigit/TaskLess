/**
 * TL_Emergency
 *
 * Deliberately tiny emergency entrypoints.
 * Keep these obvious and easy to find in the GAS Run menu.
 */

const TL_EMERGENCY = {
  APPROVAL_OUTBOUND_KEY: "TL_APPROVAL_OUTBOUND_ENABLED",
  BOSS_PROACTIVE_UPDATES_KEY: "TL_BOSS_PROACTIVE_UPDATES_ENABLED"
};

function TL_Emergency_ApprovalOutboundEnabled_() {
  const raw = String(TLW_getSetting_(TL_EMERGENCY.APPROVAL_OUTBOUND_KEY) || "").trim().toLowerCase();
  if (!raw) return false;
  return !(raw === "false" || raw === "0" || raw === "no");
}

function TL_Emergency_SetApprovalOutboundEnabled_(enabled) {
  const value = enabled ? "TRUE" : "FALSE";
  try {
    PropertiesService.getScriptProperties().setProperty(TL_EMERGENCY.APPROVAL_OUTBOUND_KEY, value);
  } catch (e) {}
  return {
    ok: true,
    key: TL_EMERGENCY.APPROVAL_OUTBOUND_KEY,
    value: value
  };
}

function TL_Emergency_BossProactiveUpdatesEnabled_() {
  const raw = String(TLW_getSetting_(TL_EMERGENCY.BOSS_PROACTIVE_UPDATES_KEY) || "").trim().toLowerCase();
  if (!raw) return false;
  return !(raw === "false" || raw === "0" || raw === "no");
}

function TL_Emergency_SetBossProactiveUpdatesEnabled_(enabled) {
  const value = enabled ? "TRUE" : "FALSE";
  try {
    PropertiesService.getScriptProperties().setProperty(TL_EMERGENCY.BOSS_PROACTIVE_UPDATES_KEY, value);
  } catch (e) {}
  return {
    ok: true,
    key: TL_EMERGENCY.BOSS_PROACTIVE_UPDATES_KEY,
    value: value
  };
}

function TL_Emergency_BlockApprovalOutbound() {
  const setting = TL_Emergency_SetApprovalOutboundEnabled_(false);
  return {
    ok: true,
    outbound_approval_enabled: false,
    setting: setting,
    note: "Approval-triggered WhatsApp and email sends are blocked."
  };
}

function TL_Emergency_AllowApprovalOutbound() {
  const setting = TL_Emergency_SetApprovalOutboundEnabled_(true);
  return {
    ok: true,
    outbound_approval_enabled: true,
    setting: setting
  };
}

function TL_Emergency_ApprovalOutboundStatus() {
  return {
    ok: true,
    key: TL_EMERGENCY.APPROVAL_OUTBOUND_KEY,
    outbound_approval_enabled: TL_Emergency_ApprovalOutboundEnabled_()
  };
}

function TL_Emergency_BlockBossProactiveUpdates() {
  const setting = TL_Emergency_SetBossProactiveUpdatesEnabled_(false);
  return {
    ok: true,
    boss_proactive_updates_enabled: false,
    setting: setting,
    note: "Proactive boss digests and decision packets are blocked."
  };
}

function TL_Emergency_AllowBossProactiveUpdates() {
  const setting = TL_Emergency_SetBossProactiveUpdatesEnabled_(true);
  return {
    ok: true,
    boss_proactive_updates_enabled: true,
    setting: setting
  };
}

function TL_Emergency_BossProactiveUpdatesStatus() {
  return {
    ok: true,
    key: TL_EMERGENCY.BOSS_PROACTIVE_UPDATES_KEY,
    boss_proactive_updates_enabled: TL_Emergency_BossProactiveUpdatesEnabled_()
  };
}

function TL_Emergency_StopAll() {
  return TL_Automation_DisableAll();
}
