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
