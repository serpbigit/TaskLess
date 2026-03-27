/**
 * TL_Capabilities
 *
 * Canonical machine-readable capability registry for Boss-facing AI turns.
 * This does not implement the active-item loop yet; it describes what the
 * current runtime can query, draft, persist, and execute.
 */

const TL_CAPABILITIES = {
  VERSION: "v1",
  DEFAULT_RETRIEVAL_BUDGET: 2
};

function TL_Capabilities_BuildBossPacket_(options) {
  const opts = options || {};
  const nowIso = String(opts.nowIso || new Date().toISOString()).trim() || new Date().toISOString();
  const capabilities = TL_Capabilities_List_();
  const available = capabilities.filter(function(item) { return item.status === "available"; });
  const limited = capabilities.filter(function(item) { return item.status === "limited"; });
  const planned = capabilities.filter(function(item) { return item.status === "planned"; });

  return {
    contract: "BossCapabilityPacket",
    version: TL_CAPABILITIES.VERSION,
    generated_at: nowIso,
    policy: {
      stateless_ai_assumption: true,
      approval_required_for_external_execution: true,
      retrieval_budget_max: TL_Capabilities_retrievalBudget_(),
      active_item_state_supported: true
    },
    capabilities: capabilities,
    summary: {
      available: available.map(function(item) { return item.id; }),
      limited: limited.map(function(item) { return item.id; }),
      planned: planned.map(function(item) { return item.id; })
    }
  };
}

function TL_Capabilities_List_() {
  return TL_Capabilities_registryDefs_().map(function(def) {
    const status = TL_Capabilities_statusFor_(def);
    return {
      id: String(def.id || "").trim(),
      category: String(def.category || "").trim(),
      status: status,
      approval_required: !!def.approval_required,
      description: String(def.description || "").trim(),
      reads: Array.isArray(def.reads) ? def.reads.slice() : [],
      writes: Array.isArray(def.writes) ? def.writes.slice() : [],
      channels: Array.isArray(def.channels) ? def.channels.slice() : [],
      fn: String(def.fn || "").trim(),
      phase: String(def.phase || "current").trim()
    };
  });
}

function TL_Capabilities_BuildPromptBrief_() {
  const packet = TL_Capabilities_BuildBossPacket_();
  const byCategory = {};
  (packet.capabilities || []).forEach(function(item) {
    const bucket = String(item && item.category || "").trim() || "other";
    if (!byCategory[bucket]) byCategory[bucket] = [];
    if (String(item && item.status || "").trim() !== "available") return;
    byCategory[bucket].push(String(item && item.id || "").trim());
  });

  const lines = [
    "Current DealWise capability packet:",
    "policy: stateless_ai_assumption=true | approval_required_for_external_execution=true | retrieval_budget_max=" + packet.policy.retrieval_budget_max + " | active_item_state_supported=true"
  ];

  ["query","draft","persist","execute","system"].forEach(function(category) {
    const items = byCategory[category] || [];
    if (!items.length) return;
    lines.push(category + ": " + items.join(", "));
  });

  if (packet.summary && packet.summary.planned && packet.summary.planned.length) {
    lines.push("planned_not_yet_supported: " + packet.summary.planned.join(", "));
  }

  return lines.join("\n");
}

function TL_Capabilities_BuildHumanSummary_() {
  const packet = TL_Capabilities_BuildBossPacket_();
  const sections = {};
  (packet.capabilities || []).forEach(function(item) {
    const category = String(item && item.category || "").trim() || "other";
    if (!sections[category]) sections[category] = [];
    sections[category].push(item);
  });

  const lines = [
    "Current DealWise capabilities",
    "approval_required_for_external_execution=true",
    "retrieval_budget_max=" + packet.policy.retrieval_budget_max,
    ""
  ];

  ["query","draft","persist","execute","system"].forEach(function(category) {
    const items = sections[category] || [];
    if (!items.length) return;
    lines.push(category + ":");
    items.forEach(function(item) {
      lines.push("- " + item.id + " [" + item.status + "]" + (item.approval_required ? " approval_required" : ""));
    });
    lines.push("");
  });

  return lines.join("\n").trim();
}

function TL_Capabilities_BuildBossFacingSummary_() {
  const lines = [
    TL_Language_UiText_("מה אני יכולה לעזור לך לעשות כרגע:", "What I can help you do right now:"),
    "",
    "1. " + TL_Language_UiText_("לפתוח ולנהל משימות", "Open and manage tasks"),
    "2. " + TL_Language_UiText_("ליצור ולסקור תזכורות", "Create and review reminders"),
    "3. " + TL_Language_UiText_("לתאם פגישות ואירועים", "Coordinate meetings and events"),
    "4. " + TL_Language_UiText_("להכין הודעות וטיוטות לאישור", "Prepare messages and drafts for approval"),
    "5. " + TL_Language_UiText_("לרכז מה פתוח, מה דחוף ומה ממתין לאישור", "Show what is open, urgent, or waiting for approval"),
    "6. " + TL_Language_UiText_("לשמור מידע חשוב על אנשי קשר", "Save important contact memory"),
    "",
    TL_Language_UiText_("אפשר פשוט לכתוב חופשי, למשל:", "You can also just ask naturally, for example:"),
    TL_Language_UiText_("\"תפתחי לי משימה להתקשר לדנה מחר\"", "\"Create a task to call Dana tomorrow\""),
    TL_Language_UiText_("\"מה ממתין לאישור שלי?\"", "\"What is waiting for my approval?\""),
    TL_Language_UiText_("\"תכיני הודעה ללקוח שאני מאחר בעשר דקות\"", "\"Draft a message telling the client I'm 10 minutes late\"")
  ];
  return lines.join("\n");
}

function TL_Capabilities_registryDefs_() {
  return [
    {
      id: "QUERY_INBOX_RECENT",
      category: "query",
      fn: "TL_Orchestrator_readRecentRows_",
      approval_required: false,
      reads: ["INBOX","ARCHIVE"],
      channels: ["whatsapp","email"],
      description: "Read recent operational rows from the unified ledger."
    },
    {
      id: "QUERY_CONTACT_ENRICHMENTS",
      category: "query",
      fn: "TL_DraftContext_fetchEnrichments_",
      approval_required: false,
      reads: ["CONTACTS"],
      channels: [],
      description: "Read the CRM memory fields stored directly on the contact row."
    },
    {
      id: "QUERY_CONTACTS_SEARCH",
      category: "query",
      fn: "TL_Contacts_ResolveRequest_",
      approval_required: false,
      reads: ["CONTACTS"],
      channels: ["whatsapp","email"],
      description: "Resolve contacts using name, alias, phone, email, relationship, and org hints."
    },
    {
      id: "QUERY_RECENT_CONTEXT",
      category: "query",
      fn: "TL_Menu_FindRecentContextRows_",
      approval_required: false,
      reads: ["INBOX"],
      channels: ["whatsapp","email"],
      description: "Fetch recent local context by resolved contact and/or topic."
    },
    {
      id: "QUERY_SIMILAR_REPLIES",
      category: "query",
      fn: "TL_Menu_FindSimilarReplyRows_",
      approval_required: false,
      reads: ["INBOX"],
      channels: ["whatsapp","email"],
      description: "Fetch a few strong prior outgoing replies by resolved contact and/or topic."
    },
    {
      id: "DRAFT_CONTEXT_FOR_INBOX_ROW",
      category: "draft",
      fn: "TL_DraftContext_BuildForInboxRowValues_",
      approval_required: false,
      reads: ["INBOX","CONTACTS"],
      channels: ["whatsapp","email"],
      description: "Build compact drafting context for an INBOX record."
    },
    {
      id: "DRAFT_CONTEXT_FOR_EMAIL_THREAD",
      category: "draft",
      fn: "TL_DraftContext_BuildForEmailSnapshot_",
      approval_required: false,
      reads: ["INBOX","CONTACTS"],
      channels: ["email"],
      description: "Build compact drafting context for an email thread snapshot."
    },
    {
      id: "PREPARE_OUTBOUND_RECIPIENT",
      category: "draft",
      fn: "TL_Capture_prepareOutboundRecipient_",
      approval_required: false,
      reads: ["CONTACTS"],
      writes: ["INBOX"],
      channels: ["whatsapp","email"],
      description: "Resolve recipient candidates and prepare destination fields for outbound capture items."
    },
    {
      id: "WRITE_CONTACT_ENRICHMENT",
      category: "persist",
      fn: "TL_Menu_BuildContactEnrichmentProposalRow_",
      approval_required: true,
      reads: ["CONTACTS"],
      writes: ["CONTACTS","INBOX"],
      channels: [],
      description: "Prepare and persist approved contact memory directly into CONTACTS."
    },
    {
      id: "SEND_APPROVED_WHATSAPP",
      category: "execute",
      fn: "TL_Menu_SendApprovedWhatsAppNow_",
      approval_required: true,
      reads: ["INBOX"],
      writes: ["INBOX"],
      channels: ["whatsapp"],
      description: "Send an approved WhatsApp message."
    },
    {
      id: "SEND_APPROVED_EMAIL",
      category: "execute",
      fn: "TL_Menu_SendApprovedEmailNow_",
      approval_required: true,
      reads: ["INBOX"],
      writes: ["INBOX"],
      channels: ["email"],
      description: "Send an approved email message."
    },
    {
      id: "FINALIZE_APPROVED_CAPTURE",
      category: "execute",
      fn: "TL_Orchestrator_FinalizeCaptureApproval_",
      approval_required: true,
      reads: ["INBOX"],
      writes: ["INBOX"],
      channels: ["whatsapp","email","task","reminder","schedule","journal"],
      description: "Finalize an approved capture item into its deterministic stored form."
    },
    {
      id: "ACTIVE_ITEM_STATE",
      category: "system",
      fn: "TL_ActiveItem_Get_",
      approval_required: false,
      reads: ["SCRIPT_PROPERTIES"],
      writes: ["SCRIPT_PROPERTIES"],
      channels: [],
      description: "Durable active-item continuity layer for Boss turns.",
      phase: "current"
    },
    {
      id: "PAUSE_AND_RESUME_ITEMS",
      category: "system",
      fn: "TL_ActiveItem_ResumeLatest_",
      approval_required: false,
      reads: ["SCRIPT_PROPERTIES"],
      writes: ["SCRIPT_PROPERTIES"],
      channels: [],
      description: "Pause the current Boss item and resume the latest paused item.",
      phase: "current"
    }
  ];
}

function TL_Capabilities_statusFor_(def) {
  if (def && def.status) return String(def.status || "").trim();
  const fnName = String(def && def.fn || "").trim();
  if (!fnName) return "planned";
  const scope = typeof globalThis !== "undefined" ? globalThis : this;
  return scope && typeof scope[fnName] === "function" ? "available" : "limited";
}

function TL_Capabilities_retrievalBudget_() {
  const raw = Number(TLW_getSetting_("AI_RETRIEVAL_BUDGET") || TL_CAPABILITIES.DEFAULT_RETRIEVAL_BUDGET);
  return isFinite(raw) && raw > 0 ? raw : TL_CAPABILITIES.DEFAULT_RETRIEVAL_BUDGET;
}
