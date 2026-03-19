/**
 * TL_TestCalendar
 *
 * Deterministic dry-run runners for the calendar sidecar.
 */

function TL_Calendar_SmokeTest() {
  return TL_Calendar_TestSmokeTest();
}

function TL_Calendar_TestAvailability() {
  const base = new Date("2026-03-20T09:00:00.000Z");
  const windowStart = new Date(base.getTime());
  const windowEnd = new Date(base.getTime() + 8 * 60 * 60000);
  const busy = [
    { start: new Date(base.getTime() + 60 * 60000), end: new Date(base.getTime() + 90 * 60000), title: "busy-1" },
    { start: new Date(base.getTime() + 180 * 60000), end: new Date(base.getTime() + 210 * 60000), title: "busy-2" }
  ];
  return {
    ok: true,
    slots: TL_Calendar_computeFreeSlots_(windowStart, windowEnd, 30, busy)
  };
}

function TL_Calendar_TestApprovalSnapshotShape() {
  const request = TL_Calendar_buildSyntheticRequest_();
  const availability = TL_Calendar_buildSyntheticAvailability_();
  const proposal = TL_Calendar_BuildProposal_(request, availability, { dryRun: true });
  const bossCard = TL_Calendar_BuildBossCard_(proposal);
  return {
    ok: true,
    title: bossCard.title,
    start: bossCard.start,
    end: bossCard.end,
    attendees: bossCard.attendees,
    reminders: bossCard.reminders,
    calendarId: bossCard.calendarId,
    eventLink: bossCard.eventLink
  };
}

function TL_Calendar_TestApprovedCreateDryRun() {
  const request = TL_Calendar_buildSyntheticRequest_();
  const availability = TL_Calendar_buildSyntheticAvailability_();
  const proposal = TL_Calendar_BuildProposal_(request, availability, { dryRun: true });
  const approved = TL_Calendar_ApproveCreate_(proposal.rowObj, { dryRun: true });
  const result = TL_Calendar_CreateApproved_({
    dryRun: true,
    batchSize: 1
  });
  return {
    ok: true,
    approvedSnapshot: approved.frozenSnapshot,
    createResult: result
  };
}

function TL_Calendar_TestEndToEndDryRun() {
  const request = TL_Calendar_buildSyntheticRequest_();
  const availability = TL_Calendar_buildSyntheticAvailability_();
  const proposal = TL_Calendar_BuildProposal_(request, availability, { dryRun: true });
  const bossCard = TL_Calendar_BuildBossCard_(proposal);
  const queued = TL_Calendar_QueueForApproval_(proposal);
  const approved = TL_Calendar_ApproveCreate_(queued.rowObj, { dryRun: true });
  return {
    ok: true,
    request: request,
    proposal: proposal,
    bossCard: bossCard,
    queued: queued,
    approved: approved
  };
}

function TL_Calendar_TestSmokeTest() {
  const request = TL_Calendar_buildSyntheticRequest_();
  const availability = TL_Calendar_buildSyntheticAvailability_();
  const proposal = TL_Calendar_BuildProposal_(request, availability, { dryRun: true });
  const bossCard = TL_Calendar_BuildBossCard_(proposal);
  return {
    ok: true,
    request: request,
    availability: availability,
    proposal: proposal,
    bossCard: bossCard
  };
}

function TL_Calendar_buildSyntheticRequest_() {
  return {
    title: "Client sync",
    durationMinutes: 30,
    attendees: ["client@example.com", "owner@example.com"],
    reminders: [{ method: "popup", minutes: 10 }],
    location: "Zoom",
    description: "Review the current plan and next steps",
    eventType: "default",
    visibility: "default"
  };
}

function TL_Calendar_buildSyntheticAvailability_() {
  const base = new Date("2026-03-20T09:00:00.000Z");
  const windowStart = new Date(base.getTime());
  const windowEnd = new Date(base.getTime() + 8 * 60 * 60000);
  const busy = [
    { start: new Date(base.getTime() + 60 * 60000), end: new Date(base.getTime() + 90 * 60000), title: "busy-1" },
    { start: new Date(base.getTime() + 180 * 60000), end: new Date(base.getTime() + 210 * 60000), title: "busy-2" }
  ];
  return {
    ok: true,
    calendarId: "primary",
    workHoursStart: "09:00",
    workHoursEnd: "17:00",
    defaultMeetingMinutes: 30,
    lookaheadDays: 1,
    days: [{
      dayIso: "2026-03-20",
      workStartIso: windowStart.toISOString(),
      workEndIso: windowEnd.toISOString(),
      busyCount: busy.length,
      slots: TL_Calendar_computeFreeSlots_(windowStart, windowEnd, 30, busy).map(function(slot) {
        return Object.assign({ calendarId: "primary", dayIso: "2026-03-20" }, slot);
      })
    }]
  };
}
