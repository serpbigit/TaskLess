/**
 * TL_TestSession
 *
 * Deterministic tests for the new session/context layer.
 */

function TL_TestSession_RunAll() {
  return {
    group_cross_channel: TL_TestSession_GroupCrossChannelRun(),
    render_attention: TL_TestSession_RenderAttentionRun()
  };
}

function TL_TestSession_GroupCrossChannelRun() {
  const groups = TL_Session_groupItems_([
    {
      entityKey: "contact:C1",
      entityLabel: "David",
      channel: "whatsapp",
      sourceId: "wa_1",
      summary: "לקוח כתב בוואטסאפ",
      suggestedAction: "follow_up",
      approvalStatus: "",
      taskStatus: "pending",
      evidence: ["אותת כמעקב"],
      lastAt: new Date("2026-03-21T09:00:00Z"),
      score: 3
    },
    {
      entityKey: "contact:C1",
      entityLabel: "David",
      channel: "email",
      sourceId: "email_1",
      summary: "אותו לקוח שלח גם אימייל",
      suggestedAction: "",
      approvalStatus: "awaiting_approval",
      taskStatus: "revision",
      evidence: ["ממתין לאישור"],
      lastAt: new Date("2026-03-21T10:00:00Z"),
      score: 4
    },
    {
      entityKey: "contact:C2",
      entityLabel: "Ruth",
      channel: "whatsapp",
      sourceId: "wa_2",
      summary: "פנייה אחרת",
      suggestedAction: "reply_later",
      approvalStatus: "",
      taskStatus: "open",
      evidence: ["פריט אחד"],
      lastAt: new Date("2026-03-21T08:00:00Z"),
      score: 1
    }
  ]);

  const david = groups.filter(function(group) {
    return group.key === "contact:C1";
  })[0];

  return {
    ok: !!david &&
      david.items.length === 2 &&
      david.channels.indexOf("whatsapp") !== -1 &&
      david.channels.indexOf("email") !== -1 &&
      david.evidence.indexOf("יש הקשר רב-ערוצי") !== -1,
    groups: groups.length,
    david_channels: david ? david.channels.join(",") : "",
    david_evidence: david ? david.evidence.join(" | ") : ""
  };
}

function TL_TestSession_RenderAttentionRun() {
  const text = TL_Session_renderSurface_("attention", [{
    key: "contact:C1",
    label: "David",
    items: [{ suggestedAction: "follow_up", summary: "צריך לחזור אליו" }],
    channels: ["whatsapp", "email"],
    evidence: ["ממתין לאישור", "יש הקשר רב-ערוצי"],
    latestAt: new Date("2026-03-21T10:00:00Z"),
    score: 4,
    topItem: { suggestedAction: "follow_up", summary: "צריך לחזור אליו" }
  }]);

  return {
    ok: text.indexOf("מה צריך תשומת לב") !== -1 &&
      text.indexOf("David") !== -1 &&
      text.indexOf("whatsapp+email") !== -1 &&
      text.indexOf("ממתין לאישור") !== -1,
    text: text
  };
}
