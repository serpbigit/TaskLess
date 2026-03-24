/**
 * TL_Topics
 *
 * Deterministic review/promotion helpers for topic candidates written to
 * INBOX notes during inbound enrichment.
 */

const TL_TOPICS = {
  DEFAULT_SCAN_ROWS: 250,
  DEFAULT_GROUP_LIMIT: 12,
  DEFAULT_SAMPLE_LIMIT: 3
};

function TL_Topics_BuildCandidateReviewText_(options) {
  const groups = TL_Topics_ListCandidateGroups_(options);
  if (!groups.length) {
    return "אין כרגע מועמדי נושא פתוחים לקידום.";
  }
  return TL_Topics_renderCandidateSummary_(groups);
}

function TL_Topics_ListCandidateGroups_(options) {
  const opts = options || {};
  const rows = typeof TL_Orchestrator_readRecentRows_ === "function"
    ? TL_Orchestrator_readRecentRows_(Number(opts.scanRows || TL_TOPICS.DEFAULT_SCAN_ROWS))
    : [];
  const topics = typeof TL_DraftContext_fetchTopics_ === "function"
    ? TL_DraftContext_fetchTopics_(null, { topicLimit: 200 })
    : [];
  return TL_Topics_groupCandidatesFromRows_(rows, topics, opts);
}

function TL_Topics_PromoteCandidate_(candidateSlug, options) {
  const candidate = TL_AI_normalizeTopicSlug_(candidateSlug);
  if (!candidate) throw new Error("TL_Topics_PromoteCandidate_: candidate slug is required");

  const opts = options || {};
  const rows = typeof TL_Orchestrator_readRecentRows_ === "function"
    ? TL_Orchestrator_readRecentRows_(Number(opts.scanRows || TL_TOPICS.DEFAULT_SCAN_ROWS))
    : [];
  const topics = typeof TL_DraftContext_fetchTopics_ === "function"
    ? TL_DraftContext_fetchTopics_(null, { topicLimit: 200 })
    : [];
  const groups = TL_Topics_groupCandidatesFromRows_(rows, topics, opts);
  const target = groups.find(function(item) {
    return String(item && item.candidate || "").trim() === candidate;
  });
  if (!target) throw new Error("TL_Topics_PromoteCandidate_: candidate not found: " + candidate);

  const topicId = String(opts.topicId || target.existingTopicId || target.candidate || "").trim();
  const topicSummary = String(opts.topicSummary || target.summary || "").trim();
  const nowIso = String(opts.nowIso || new Date().toISOString()).trim() || new Date().toISOString();
  const dryRun = !!opts.dryRun;
  const registryWrite = dryRun
    ? {
        ok: true,
        dryRun: true,
        topic_id: topicId,
        topic_summary: topicSummary,
        existing: !!target.existingTopicId
      }
    : TL_Topics_upsertRegistryFromGroup_(topicId, topicSummary, target, nowIso);
  const inboxWrite = TL_Topics_applyPromotionToInboxRows_(target, topicId, nowIso, dryRun);

  return {
    ok: true,
    candidate: candidate,
    topic_id: topicId,
    topic_summary: topicSummary,
    registry: registryWrite,
    inbox: inboxWrite
  };
}

function TL_Topics_groupCandidatesFromRows_(rows, topics, options) {
  const opts = options || {};
  const sampleLimit = Number(opts.sampleLimit || TL_TOPICS.DEFAULT_SAMPLE_LIMIT);
  const groupLimit = Number(opts.groupLimit || TL_TOPICS.DEFAULT_GROUP_LIMIT);
  const registry = typeof TL_AI_topicRegistryMap_ === "function" ? TL_AI_topicRegistryMap_(topics || []) : {};
  const grouped = {};

  (rows || []).forEach(function(item) {
    const values = item && item.values ? item.values : [];
    if (!values.length) return;
    const recordClass = String(TL_Orchestrator_value_(values, "record_class") || "").trim().toLowerCase();
    if (recordClass !== "communication") return;

    const extracted = TL_Topics_extractCandidateFromNotes_(TL_Orchestrator_value_(values, "notes"));
    if (!extracted.candidate) return;

    const key = extracted.candidate;
    if (!grouped[key]) {
      const existing = registry[key.toLowerCase()] || null;
      grouped[key] = {
        candidate: key,
        summary: extracted.summary,
        count: 0,
        latestAt: "",
        existingTopicId: existing ? String(existing.topicId || "").trim() : "",
        existingTopicSummary: existing ? String(existing.topicSummary || "").trim() : "",
        samples: [],
        rowRefs: []
      };
    }

    const group = grouped[key];
    const at = TL_Topics_rowIso_(values);
    if (!group.latestAt || TL_DraftContext_safeDate_(at).getTime() > TL_DraftContext_safeDate_(group.latestAt).getTime()) {
      group.latestAt = at;
    }
    if (!group.summary && extracted.summary) group.summary = extracted.summary;
    group.count++;

    const rowRef = {
      rowNumber: Number(item.rowNumber || 0),
      recordId: String(TL_Orchestrator_value_(values, "record_id") || "").trim(),
      messageId: String(TL_Orchestrator_value_(values, "message_id") || "").trim(),
      topicId: String(TL_Orchestrator_value_(values, "topic_id") || "").trim(),
      summary: TL_DraftContext_preview_(String(
        TL_Orchestrator_value_(values, "ai_summary") ||
        TL_Orchestrator_value_(values, "text") ||
        TL_Orchestrator_value_(values, "ai_proposal") ||
        ""
      ).trim(), 120),
      channel: String(TL_Orchestrator_value_(values, "channel") || "").trim(),
      direction: String(TL_Orchestrator_value_(values, "direction") || "").trim(),
      at: at
    };
    group.rowRefs.push(rowRef);
    group.samples.push(rowRef);
  });

  return Object.keys(grouped).map(function(key) {
    const group = grouped[key];
    group.rowRefs.sort(function(a, b) {
      return TL_DraftContext_safeDate_(b.at).getTime() - TL_DraftContext_safeDate_(a.at).getTime();
    });
    group.samples = group.rowRefs.slice(0, sampleLimit > 0 ? sampleLimit : TL_TOPICS.DEFAULT_SAMPLE_LIMIT);
    return group;
  }).sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return TL_DraftContext_safeDate_(b.latestAt).getTime() - TL_DraftContext_safeDate_(a.latestAt).getTime();
  }).slice(0, groupLimit > 0 ? groupLimit : TL_TOPICS.DEFAULT_GROUP_LIMIT);
}

function TL_Topics_extractCandidateFromNotes_(notes) {
  const lines = String(notes || "").split(/\r?\n/).map(function(line) {
    return String(line || "").trim();
  }).filter(Boolean);
  let candidate = "";
  let summary = "";
  lines.forEach(function(line) {
    const lower = line.toLowerCase();
    if (!candidate && lower.indexOf("topic_candidate=") === 0) {
      candidate = TL_AI_normalizeTopicSlug_(line.slice("topic_candidate=".length));
      return;
    }
    if (!summary && lower.indexOf("topic_candidate_summary=") === 0) {
      summary = String(line.slice("topic_candidate_summary=".length) || "").trim();
    }
  });
  return {
    candidate: candidate,
    summary: summary
  };
}

function TL_Topics_renderCandidateSummary_(groups) {
  const lines = ["מועמדי נושא לקידום:"];
  (groups || []).forEach(function(group, idx) {
    const parts = [];
    parts.push(String(idx + 1) + ". " + String(group.candidate || ""));
    if (group.summary) parts.push(group.summary);
    parts.push("count=" + Number(group.count || 0));
    if (group.latestAt) parts.push("latest=" + group.latestAt);
    if (group.existingTopicId) parts.push("existing=" + group.existingTopicId);
    lines.push(parts.join(" | "));
    (group.samples || []).slice(0, 2).forEach(function(sample) {
      lines.push("   - " + [sample.channel, sample.direction, sample.summary].filter(Boolean).join(" | "));
    });
  });
  return lines.join("\n");
}

function TL_Topics_rowIso_(values) {
  return TL_DraftContext_safeDate_(
    TL_Orchestrator_value_(values, "latest_message_at") ||
    TL_Orchestrator_value_(values, "timestamp")
  ).toISOString();
}

function TL_Topics_upsertRegistryFromGroup_(topicId, topicSummary, group, nowIso) {
  const normalizedTopicId = TL_AI_normalizeTopicSlug_(topicId);
  if (!normalizedTopicId) throw new Error("TL_Topics_upsertRegistryFromGroup_: topic_id is required");

  const sheetId = String(PropertiesService.getScriptProperties().getProperty("TL_SHEET_ID") || "").trim();
  if (!sheetId) throw new Error("TL_Topics_upsertRegistryFromGroup_: missing TL_SHEET_ID");
  const ss = SpreadsheetApp.openById(sheetId);
  let sh = ss.getSheetByName("TOPICS");
  if (!sh) sh = ss.insertSheet("TOPICS");

  const headers = TL_SCHEMA && TL_SCHEMA.TOPICS_HEADERS ? TL_SCHEMA.TOPICS_HEADERS : ["topic_id","contact_id","contact_name","topic_summary","last_used_at","usage_count","recent_examples_json","notes"];
  const range = sh.getRange(1, 1, 1, headers.length);
  const existingHeaders = range.getValues()[0];
  const needsHeaders = existingHeaders.some(function(value, index) {
    return String(value || "") !== String(headers[index] || "");
  });
  if (needsHeaders) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }

  const lastRow = sh.getLastRow();
  let rowNumber = 0;
  let existingRow = [];
  if (lastRow >= 2) {
    const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = 0; i < values.length; i++) {
      if (TL_AI_normalizeTopicSlug_(values[i][0]).toLowerCase() === normalizedTopicId.toLowerCase()) {
        rowNumber = i + 2;
        existingRow = values[i];
        break;
      }
    }
  }

  const prevUsage = Number(existingRow[5] || 0);
  const nextUsage = prevUsage + Number(group && group.count || 0);
  const existingExamplesJson = String(existingRow[6] || "[]").trim();
  let mergedExamplesJson = existingExamplesJson || "[]";
  (group && group.samples || []).forEach(function(sample) {
    mergedExamplesJson = typeof TL_AI_mergeTopicExamples_ === "function"
      ? TL_AI_mergeTopicExamples_(mergedExamplesJson, {
          topic_id: normalizedTopicId,
          topic_summary: topicSummary,
          source: "topic_candidate_promotion",
          record_id: sample.recordId,
          message_id: sample.messageId,
          channel: sample.channel,
          direction: sample.direction,
          latest_message_at: sample.at,
          summary: sample.summary
        })
      : mergedExamplesJson;
  });

  const row = [
    normalizedTopicId,
    String(existingRow[1] || "").trim(),
    String(existingRow[2] || "").trim(),
    String(topicSummary || existingRow[3] || "").trim(),
    nowIso,
    nextUsage,
    mergedExamplesJson,
    String(existingRow[7] || "").trim()
  ];

  if (rowNumber) {
    sh.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    return {
      ok: true,
      topic_id: normalizedTopicId,
      updated: true,
      created: false,
      rowNumber: rowNumber
    };
  }

  sh.appendRow(row);
  return {
    ok: true,
    topic_id: normalizedTopicId,
    updated: false,
    created: true,
    rowNumber: sh.getLastRow()
  };
}

function TL_Topics_applyPromotionToInboxRows_(group, topicId, nowIso, dryRun) {
  const result = {
    ok: true,
    matched: 0,
    updated: 0,
    conflicts: 0,
    rows: []
  };
  const normalizedTopicId = TL_AI_normalizeTopicSlug_(topicId);
  const rowRefs = group && Array.isArray(group.rowRefs) ? group.rowRefs : [];
  rowRefs.forEach(function(ref) {
    result.matched++;
    if (dryRun) {
      result.rows.push({
        rowNumber: ref.rowNumber,
        updated: !ref.topicId || ref.topicId === normalizedTopicId,
        conflict: !!ref.topicId && ref.topicId !== normalizedTopicId
      });
      return;
    }

    const loc = typeof TL_AI_getInboxRow_ === "function" ? TL_AI_getInboxRow_(ref.rowNumber) : null;
    if (!loc || !loc.sh) return;
    const currentTopicId = String(loc.values[TLW_colIndex_("topic_id") - 1] || "").trim();
    if (currentTopicId && currentTopicId !== normalizedTopicId) {
      result.conflicts++;
      result.rows.push({
        rowNumber: ref.rowNumber,
        updated: false,
        conflict: true,
        existingTopicId: currentTopicId
      });
      return;
    }

    const currentNotes = String(loc.values[TLW_colIndex_("notes") - 1] || "").trim();
    const nextNotes = typeof TL_AI_removeNoteKey_ === "function"
      ? TL_AI_removeNoteKey_(TL_AI_removeNoteKey_(currentNotes, "topic_candidate"), "topic_candidate_summary")
      : currentNotes;

    loc.sh.getRange(loc.row, TLW_colIndex_("topic_id")).setValue(normalizedTopicId);
    loc.sh.getRange(loc.row, TLW_colIndex_("topic_tagged_at")).setValue(nowIso);
    loc.sh.getRange(loc.row, TLW_colIndex_("notes")).setValue(nextNotes);
    if (typeof TLW_applyVersionBump_ === "function") {
      TLW_applyVersionBump_(loc.row, "topic_candidate_promoted");
    }

    result.updated++;
    result.rows.push({
      rowNumber: ref.rowNumber,
      updated: true,
      conflict: false
    });
  });
  return result;
}
