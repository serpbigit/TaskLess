/**
 * TL_TestEmail
 *
 * Dry-run runners for the Gmail sidecar.
 */

function TL_Email_SmokeTest() {
  return TL_Email_TestSmokeTest();
}

function TL_Email_TestPullImportantPreview() {
  return {
    ok: true,
    query: TL_EMAIL.DEFAULT_QUERY,
    ownerEmail: TL_Email_ownerEmail_()
  };
}

function TL_Email_TestPullFromBizLatest() {
  const query = 'is:important from:reuven.cohen@aismart.solutions newer_than:14d';
  const result = TL_Email_PullImportant_Run({
    query: query,
    maxThreads: 5
  });
  if (typeof TL_Email_logExecution_ === "function") {
    TL_Email_logExecution_("TL_Email_TestPullFromBizLatest", result);
  }
  return result;
}

function TL_Email_TestPullTasklessDirect() {
  const query = 'is:important from:reuven.cohen@aismart.solutions subject:"taskless direct test" newer_than:14d';
  const result = TL_Email_PullImportant_Run({
    query: query,
    maxThreads: 5
  });
  if (typeof TL_Email_logExecution_ === "function") {
    TL_Email_logExecution_("TL_Email_TestPullTasklessDirect", result);
  }
  return result;
}

function TL_Email_TestPullCheckpointQueryPreview() {
  const checkpoint = {
    lastPullAtIso: "2026-03-19T08:30:00.000Z",
    lastPullQuery: TL_EMAIL.DEFAULT_QUERY,
    lastPullMaxMsgAtIso: "2026-03-19T08:29:00.000Z"
  };
  return {
    ok: true,
    baseQuery: TL_EMAIL.DEFAULT_QUERY,
    queryWithCheckpoint: TL_Email_buildPullQuery_(TL_EMAIL.DEFAULT_QUERY, checkpoint, {}),
    checkpoint: checkpoint
  };
}

function TL_Email_TestPullCheckpointRoundTrip() {
  const props = PropertiesService.getScriptProperties();
  const prior = {
    lastPullAtIso: props.getProperty(TL_EMAIL.PROP_LAST_PULL_AT),
    lastPullQuery: props.getProperty(TL_EMAIL.PROP_LAST_PULL_QUERY),
    lastPullMaxMsgAtIso: props.getProperty(TL_EMAIL.PROP_LAST_PULL_MAX_MSG_AT)
  };

  try {
    props.setProperties({
      [TL_EMAIL.PROP_LAST_PULL_AT]: "2026-03-19T09:00:00.000Z",
      [TL_EMAIL.PROP_LAST_PULL_QUERY]: TL_EMAIL.DEFAULT_QUERY,
      [TL_EMAIL.PROP_LAST_PULL_MAX_MSG_AT]: "2026-03-19T08:59:00.000Z"
    }, false);

    const before = TL_Email_getPullCheckpoint_();
    const query = TL_Email_buildPullQuery_(TL_EMAIL.DEFAULT_QUERY, before, {});
    const write = TL_Email_recordPullCheckpoint_({
      query: query,
      completedAtIso: "2026-03-19T09:05:00.000Z",
      latestMsgAtIso: "2026-03-19T09:04:00.000Z",
      threadCount: 1,
      ingested: 1,
      skipped: 0
    });
    const after = TL_Email_getPullCheckpoint_();

    return {
      ok: true,
      query: query,
      before: before,
      after: after,
      write: write
    };
  } finally {
    const restore = {};
    Object.keys(prior).forEach(function(key) {
      if (prior[key] === null || prior[key] === undefined) return;
      restore[key] = prior[key];
    });
    const allKeys = [
      TL_EMAIL.PROP_LAST_PULL_AT,
      TL_EMAIL.PROP_LAST_PULL_QUERY,
      TL_EMAIL.PROP_LAST_PULL_MAX_MSG_AT
    ];
    allKeys.forEach(function(key) {
      if (!(key in prior)) return;
      if (prior[key] === null || prior[key] === undefined) {
        props.deleteProperty(key);
      }
    });
    if (Object.keys(restore).length) {
      props.setProperties(restore, false);
    }
  }
}

function TL_Email_TestApprovalSnapshotShape() {
  const snapshot = TL_Email_buildSyntheticSnapshot_();
  const triage = TL_Email_TriageSnapshot_(snapshot, { dryRun: true });
  const proposal = TL_Email_BuildReplyProposal_(snapshot, triage, { dryRun: true });
  const bossCard = TL_Email_BuildBossCard_(snapshot, triage, proposal);
  return {
    ok: true,
    to: bossCard.to,
    subject: bossCard.subject,
    body: bossCard.body,
    approvalStatus: bossCard.approvalStatus,
    sendStatus: bossCard.sendStatus
  };
}

function TL_Email_TestReplyProposalRefineDryRun() {
  const snapshot = TL_Email_buildSyntheticSnapshot_();
  const triage = TL_Email_TriageSnapshot_(snapshot, { dryRun: true });
  triage.topic_id = "topic_documents_needed";
  triage.draftContext = {
    contact: {
      contactId: "CI_1",
      name: "Dana Banker"
    }
  };
  const proposal = TL_Email_BuildReplyProposal_(snapshot, triage, {
    dryRun: true,
    similarRepliesFn: function() {
      return [{
        rowNumber: 12,
        channel: "email",
        subject: "Re: Missing documents",
        proposal: "Please send the missing mortgage documents so I can proceed."
      }];
    },
    refineFn: function(inputText, currentProposal, opts) {
      return {
        proposal: "Please send the missing payslips so I can move this forward.",
        subject: String(opts.subject || "").trim()
      };
    }
  });
  return {
    ok: String(proposal.body || "").indexOf("missing payslips") !== -1 &&
      Number(proposal.similarRepliesUsed || 0) === 1,
    proposal: proposal
  };
}

function TL_Email_TestApprovedSendDryRun() {
  TL_Sheets_bootstrapPOC();
  const snapshot = TL_Email_buildSyntheticSnapshot_();
  const triage = TL_Email_TriageSnapshot_(snapshot, { dryRun: true });
  const proposal = TL_Email_BuildReplyProposal_(snapshot, triage, { dryRun: true });
  const bossCard = TL_Email_BuildBossCard_(snapshot, triage, proposal);
  const merged = TL_Email_mergePayload_(snapshot.payload, {
    triage: triage,
    proposal: proposal,
    approvalSnapshot: Object.assign({}, bossCard, { approvalStatus: "approved" }),
    approvalStatus: "approved",
    sendStatus: "pending"
  });
  const row = TL_Email_rowWithUpdates_(snapshot.rowObj, {
    status: "REVISION",
    draftOrPromptJson: JSON.stringify(merged),
    lastAction: "EMAIL_QUEUE_APPROVAL",
    lastActionAt: new Date().toISOString()
  });
  TL_Email_UpsertThreadRow_({
    refId: snapshot.refId,
    rowObj: row
  }, TL_Email_tabRevision_());
  return TL_Email_SendApproved({ dryRun: true, batchSize: 1 });
}

function TL_Email_TestHistoryGatingPreview() {
  return TL_Email_TestHistoryGating();
}

function TL_Email_TestEndToEndDryRun() {
  return TL_Email_TestApprovedSendDryRun();
}

function TL_Email_TestIncrementalPullPlan() {
  return TL_Email_TestPullCheckpointQueryPreview();
}

function TL_Email_TestCheckpointRoundTrip() {
  return TL_Email_TestPullCheckpointRoundTrip();
}
