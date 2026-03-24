/**
 * TL_BossTurn
 *
 * Machine-readable Boss turn packet.
 * Current scope includes a lightweight durable active-item layer.
 */

const TL_BOSS_TURN = {
  VERSION: "v1",
  DEFAULT_RECENT_CONTACTS: 5,
  DEFAULT_RECENT_RECORDS: 5,
  DEFAULT_RECENT_THREADS: 5,
  DEFAULT_PENDING_ITEMS: 5,
  DEFAULT_SCAN_ROWS: 120
};

function TL_BossTurn_BuildPacket_(bossTurn, options) {
  const turn = bossTurn || {};
  const opts = options || {};
  const nowIso = String(
    turn.timestamp ||
    opts.nowIso ||
    new Date().toISOString()
  ).trim() || new Date().toISOString();
  const waId = String(turn.wa_id || turn.waId || opts.waId || "").trim();
  const rows = TL_BossTurn_recentRows_(opts);
  const latestRows = typeof TL_Session_latestInboxRows_ === "function"
    ? TL_Session_latestInboxRows_(rows)
    : (rows || []);
  const capabilityPacket = opts.capabilityPacket || (
    typeof TL_Capabilities_BuildBossPacket_ === "function"
      ? TL_Capabilities_BuildBossPacket_({ nowIso: nowIso })
      : null
  );
  const currentState = TL_BossTurn_currentState_(waId, opts);
  const activeItem = TL_BossTurn_activeItem_(waId, opts);
  const pausedItems = TL_BossTurn_pausedItems_(waId, opts);

  return {
    contract: "BossTurnPacket",
    version: TL_BOSS_TURN.VERSION,
    boss_turn: {
      turn_id: String(turn.turn_id || turn.turnId || ("TURN_" + Utilities.getUuid())).trim(),
      timestamp: nowIso,
      wa_id: waId,
      message_text: String(turn.message_text || turn.messageText || "").trim()
    },
    current_state: currentState,
    active_item: activeItem,
    paused_items_summary: pausedItems,
    pending_items_summary: TL_BossTurn_pendingItems_(latestRows, opts),
    recent_memory: {
      recent_contacts: TL_BossTurn_recentContacts_(latestRows, opts),
      recent_records: TL_BossTurn_recentRecords_(latestRows, opts),
      recent_threads: TL_BossTurn_recentThreads_(latestRows, opts)
    },
    capability_packet: capabilityPacket,
    policy: capabilityPacket && capabilityPacket.policy ? capabilityPacket.policy : {
      stateless_ai_assumption: true,
      approval_required_for_external_execution: true,
      retrieval_budget_max: 2,
      active_item_state_supported: true
    }
  };
}

function TL_BossTurn_BuildPromptBrief_(packet) {
  const data = packet || {};
  const lines = [
    "Current Boss turn packet:"
  ];
  if (data.boss_turn) {
    lines.push("message=" + String(data.boss_turn.message_text || "").trim());
  }
  if (data.current_state) {
    lines.push(
      "state: menu_state=" + String(data.current_state.menu_state || "").trim() +
      " | has_open_packet=" + String(!!data.current_state.has_open_packet) +
      " | active_item_supported=" + String(!!(data.policy && data.policy.active_item_state_supported))
    );
  }
  if (data.active_item && data.active_item.item_id) {
    lines.push(
      "active_item=" +
      String(data.active_item.kind || "").trim() +
      " | status=" + String(data.active_item.status || "").trim() +
      " | contact=" + String(data.active_item.resolved_contact_name || data.active_item.contact_query || "").trim() +
      " | topic=" + String(data.active_item.resolved_topic_summary || data.active_item.topic_id || data.active_item.topic_query || "").trim()
    );
  }
  if (data.paused_items_summary && data.paused_items_summary.length) {
    lines.push("paused_items=" + data.paused_items_summary.map(function(item) {
      return String(item.label || item.kind || item.item_id || "").trim();
    }).filter(Boolean).join(", "));
  }
  if (data.pending_items_summary && data.pending_items_summary.length) {
    lines.push("pending_items=" + data.pending_items_summary.map(function(item) {
      return String(item.label || item.record_id || "").trim();
    }).filter(Boolean).join(", "));
  }
  if (data.recent_memory && data.recent_memory.recent_contacts && data.recent_memory.recent_contacts.length) {
    lines.push("recent_contacts=" + data.recent_memory.recent_contacts.map(function(item) {
      return String(item.name || item.contact_id || item.address || "").trim();
    }).filter(Boolean).join(", "));
  }
  if (data.capability_packet && data.capability_packet.summary && data.capability_packet.summary.available) {
    lines.push("available_capabilities=" + data.capability_packet.summary.available.join(", "));
  }
  return lines.join("\n");
}

function TL_BossTurn_recentRows_(options) {
  const opts = options || {};
  if (Array.isArray(opts.rows)) return opts.rows.slice();
  if (typeof TL_Orchestrator_readRecentRows_ !== "function") return [];
  return TL_Orchestrator_readRecentRows_(Number(opts.scanRows || TL_BOSS_TURN.DEFAULT_SCAN_ROWS));
}

function TL_BossTurn_currentState_(waId, options) {
  const opts = options || {};
  if (opts.currentState && typeof opts.currentState === "object") {
    return Object.assign({
      menu_state: "root",
      has_open_packet: false,
      packet_kind: "",
      packet_stage: "",
      packet_cursor: 0,
      packet_size: 0,
      has_active_item: false,
      paused_count: 0
    }, opts.currentState);
  }

  const state = waId && typeof TL_Menu_GetState_ === "function"
    ? String(TL_Menu_GetState_(waId) || "root").trim()
    : "root";
  const packet = waId && typeof TL_Menu_GetDecisionPacket_ === "function"
    ? TL_Menu_GetDecisionPacket_(waId)
    : null;

  const pausedCount = waId && typeof TL_ActiveItem_GetPaused_ === "function"
    ? TL_ActiveItem_GetPaused_(waId).length
    : 0;
  return {
    menu_state: state || "root",
    has_open_packet: !!packet,
    packet_kind: String(packet && packet.kind || "").trim(),
    packet_stage: String(packet && packet.stage || "").trim(),
    packet_cursor: Number(packet && packet.cursor || 0),
    packet_size: Array.isArray(packet && packet.items) ? packet.items.length : 0,
    has_active_item: !!(waId && typeof TL_ActiveItem_Get_ === "function" && TL_ActiveItem_Get_(waId)),
    paused_count: pausedCount
  };
}

function TL_BossTurn_activeItem_(waId, options) {
  const opts = options || {};
  if (opts.activeItem && typeof opts.activeItem === "object") {
    return Object.assign({
      item_id: null,
      status: null
    }, opts.activeItem);
  }
  if (!waId || typeof TL_ActiveItem_Get_ !== "function") {
    return {
      item_id: null,
      status: null
    };
  }
  const active = TL_ActiveItem_Get_(waId);
  return active || {
    item_id: null,
    status: null
  };
}

function TL_BossTurn_pausedItems_(waId, options) {
  const opts = options || {};
  if (Array.isArray(opts.pausedItems)) return opts.pausedItems.slice();
  if (!waId || typeof TL_ActiveItem_GetPaused_ !== "function") return [];
  return TL_ActiveItem_GetPaused_(waId).slice(0, 3).map(function(item) {
    return {
      item_id: String(item && item.item_id || "").trim(),
      kind: String(item && item.kind || "").trim(),
      status: String(item && item.status || "").trim(),
      label: [
        String(item && (item.resolved_contact_name || item.contact_query) || "").trim(),
        String(item && (item.resolved_topic_summary || item.topic_id || item.topic_query) || "").trim()
      ].filter(Boolean).join(" | "),
      paused_at: String(item && item.paused_at || "").trim()
    };
  });
}

function TL_BossTurn_pendingItems_(rows, options) {
  const limit = Number((options && options.pendingLimit) || TL_BOSS_TURN.DEFAULT_PENDING_ITEMS);
  return (rows || []).map(function(item) {
    const values = item && item.values ? item.values : [];
    const approvalStatus = String(TL_Orchestrator_value_(values, "approval_status") || "").trim().toLowerCase();
    const taskStatus = String(TL_Orchestrator_value_(values, "task_status") || "").trim().toLowerCase();
    const executionStatus = String(TL_Orchestrator_value_(values, "execution_status") || "").trim().toLowerCase();
    const suggestedAction = String(TL_Orchestrator_value_(values, "suggested_action") || "").trim().toLowerCase();
    const isPending = approvalStatus === "draft" ||
      approvalStatus === "awaiting_approval" ||
      taskStatus === "pending" ||
      taskStatus === "captured" ||
      taskStatus === "proposal_ready" ||
      taskStatus === "reminder_pending" ||
      executionStatus === "proposal_ready" ||
      executionStatus === "approved" ||
      executionStatus === "reminder_pending";
    if (!isPending) return null;
    return {
      record_id: String(TL_Orchestrator_value_(values, "record_id") || "").trim(),
      label: TL_BossTurn_preview_(
        TL_Orchestrator_value_(values, "ai_summary") ||
        TL_Orchestrator_value_(values, "thread_subject") ||
        TL_Orchestrator_value_(values, "text") ||
        TL_Orchestrator_value_(values, "ai_proposal") ||
        "",
        80
      ),
      channel: String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase(),
      approval_status: approvalStatus,
      task_status: taskStatus,
      execution_status: executionStatus,
      suggested_action: suggestedAction
    };
  }).filter(Boolean).slice(0, limit > 0 ? limit : TL_BOSS_TURN.DEFAULT_PENDING_ITEMS);
}

function TL_BossTurn_recentContacts_(rows, options) {
  const limit = Number((options && options.recentContactsLimit) || TL_BOSS_TURN.DEFAULT_RECENT_CONTACTS);
  const contactsIndex = options && options.contactsIndex ? options.contactsIndex : (
    typeof TL_Session_getContactsIndex_ === "function" ? TL_Session_getContactsIndex_() : { byContactId: {}, byPhone: {}, byEmail: {} }
  );
  const seen = {};
  const out = [];

  (rows || []).forEach(function(item) {
    if (out.length >= limit) return;
    const values = item && item.values ? item.values : [];
    const contactId = String(TL_Orchestrator_value_(values, "contact_id") || "").trim();
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    const sender = String(TL_Orchestrator_value_(values, "sender") || "").trim();
    const receiver = String(TL_Orchestrator_value_(values, "receiver") || "").trim();
    const direction = String(TL_Orchestrator_value_(values, "direction") || "").trim().toLowerCase();
    const phone = channel === "email" ? "" : TLW_normalizePhone_(direction === "incoming" ? sender : (receiver || sender));
    const email = channel === "email" && typeof TL_Session_extractEmailAddress_ === "function"
      ? TL_Session_extractEmailAddress_(direction === "incoming" ? sender : (receiver || sender))
      : "";
    const record = (contactId && contactsIndex.byContactId[contactId]) ||
      (phone && contactsIndex.byPhone[phone]) ||
      (email && contactsIndex.byEmail[email]) ||
      null;
    const key = String(record && record.contactId || contactId || email || phone || "").trim();
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push({
      contact_id: String(record && record.contactId || contactId || "").trim(),
      name: String(record && record.name || "").trim(),
      address: email || phone || "",
      channel_hint: channel || "",
      last_at: TL_BossTurn_rowIso_(values)
    });
  });

  return out;
}

function TL_BossTurn_recentRecords_(rows, options) {
  const limit = Number((options && options.recentRecordsLimit) || TL_BOSS_TURN.DEFAULT_RECENT_RECORDS);
  return (rows || []).slice(0, limit > 0 ? limit : TL_BOSS_TURN.DEFAULT_RECENT_RECORDS).map(function(item) {
    const values = item && item.values ? item.values : [];
    return {
      record_id: String(TL_Orchestrator_value_(values, "record_id") || "").trim(),
      channel: String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase(),
      topic_id: String(TL_Orchestrator_value_(values, "topic_id") || "").trim(),
      summary: TL_BossTurn_preview_(
        TL_Orchestrator_value_(values, "ai_summary") ||
        TL_Orchestrator_value_(values, "text") ||
        TL_Orchestrator_value_(values, "ai_proposal") ||
        "",
        120
      ),
      suggested_action: String(TL_Orchestrator_value_(values, "suggested_action") || "").trim().toLowerCase(),
      approval_status: String(TL_Orchestrator_value_(values, "approval_status") || "").trim().toLowerCase(),
      execution_status: String(TL_Orchestrator_value_(values, "execution_status") || "").trim().toLowerCase(),
      last_at: TL_BossTurn_rowIso_(values)
    };
  }).filter(function(item) {
    return !!item.record_id;
  });
}

function TL_BossTurn_recentThreads_(rows, options) {
  const limit = Number((options && options.recentThreadsLimit) || TL_BOSS_TURN.DEFAULT_RECENT_THREADS);
  const seen = {};
  const out = [];
  (rows || []).forEach(function(item) {
    if (out.length >= limit) return;
    const values = item && item.values ? item.values : [];
    const channel = String(TL_Orchestrator_value_(values, "channel") || "").trim().toLowerCase();
    if (channel !== "email") return;
    const threadId = String(
      TL_Orchestrator_value_(values, "thread_id") ||
      TL_Orchestrator_value_(values, "record_id") ||
      ""
    ).trim();
    if (!threadId || seen[threadId]) return;
    seen[threadId] = true;
    out.push({
      thread_id: threadId,
      subject: String(TL_Orchestrator_value_(values, "thread_subject") || "").trim(),
      summary: TL_BossTurn_preview_(
        TL_Orchestrator_value_(values, "ai_summary") ||
        TL_Orchestrator_value_(values, "text") ||
        "",
        120
      ),
      last_at: TL_BossTurn_rowIso_(values)
    });
  });
  return out;
}

function TL_BossTurn_rowIso_(values) {
  const dt = typeof TL_DraftContext_safeDate_ === "function"
    ? TL_DraftContext_safeDate_(TL_Orchestrator_value_(values, "latest_message_at") || TL_Orchestrator_value_(values, "timestamp"))
    : new Date(TL_Orchestrator_value_(values, "latest_message_at") || TL_Orchestrator_value_(values, "timestamp") || "");
  return isNaN(dt.getTime()) ? "" : dt.toISOString();
}

function TL_BossTurn_preview_(text, limit) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const max = Number(limit || 120);
  if (!raw || raw.length <= max) return raw;
  return raw.slice(0, max) + "...";
}
