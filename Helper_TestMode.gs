/**
 * Helper_TestMode
 *
 * Status only. Boss phone override support was removed.
 */

function Helper_TestMode_Status() {
  const configuredBossPhone = String(TLW_getSetting_("BOSS_PHONE") || "").trim();
  return {
    ok: true,
    override_support_removed: true,
    effective_boss_phone: configuredBossPhone,
    configured_boss_phone: configuredBossPhone
  };
}
