/**
 * TL_Calendar
 *
 * Calendar sidecar for availability, proposals, Boss approval, and approved event creation.
 * This file is intentionally disjoint from the WhatsApp and email tracks.
 */

const TL_CALENDAR = {
  VERSION: "v1",
  DEFAULT_LOOKAHEAD_DAYS: 7,
  DEFAULT_MEETING_MINUTES: 30,
  DEFAULT_HISTORY_WINDOW_DAYS: 30,
  DEFAULT_PULL_LIMIT: 20
};

function TL_Calendar_ReadUpcoming_Run(opts) {
  const options = opts || {};
  const calendar = TL_Calendar_resolveCalendar_();
  const calendarId = TL_Calendar_calendarId_();
  const start = TL_Calendar_now_();
  const end = TL_Calendar_addDays_(start, TL_Calendar_int_(options.lookaheadDays, TL_CALENDAR.DEFAULT_LOOKAHEAD_DAYS));
  const events = calendar.getEvents(start, end);
  const results = [];
  let upserted = 0;

  TL_Sheets_bootstrapPOC();

  events.slice(0, TL_Calendar_int_(options.maxEvents, TL_CALENDAR.DEFAULT_PULL_LIMIT)).forEach(function(event) {
    const snapshot = TL_Calendar_eventSnapshot_(event, calendarId);
    TL_Calendar_UpsertEventRow_(snapshot, TL_Calendar_tabOpen_());
    upserted++;
    results.push({
      eventId: snapshot.eventId,
      title: snapshot.title,
      startIso: snapshot.startIso,
      endIso: snapshot.endIso,
      eventLink: snapshot.eventLink
    });
  });

  return {
    ok: true,
    calendarId: calendarId,
    read: events.length,
    upserted: upserted,
    sample: results.slice(0, 5)
  };
}

function TL_Calendar_ReadAvailability_(opts) {
  const options = opts || {};
  const calendar = TL_Calendar_resolveCalendar_();
  const settings = TL_Calendar_getSettings_();
  const workStart = TL_Calendar_parseClock_(settings.WORK_HOURS_START, "09:00");
  const workEnd = TL_Calendar_parseClock_(settings.WORK_HOURS_END, "17:00");
  const meetingMinutes = TL_Calendar_int_(settings.DEFAULT_MEETING_MINUTES || options.meetingMinutes, TL_CALENDAR.DEFAULT_MEETING_MINUTES);
  const lookaheadDays = TL_Calendar_int_(options.lookaheadDays, TL_CALENDAR.DEFAULT_LOOKAHEAD_DAYS);
  const calendarId = TL_Calendar_calendarId_();
  const start = TL_Calendar_now_();
  const slots = [];

  for (let dayOffset = 0; dayOffset < lookaheadDays; dayOffset++) {
    const day = TL_Calendar_addDays_(start, dayOffset);
    if (TL_Calendar_isWeekend_(day)) continue;

    const windowStart = TL_Calendar_localDateTime_(day, workStart.hour, workStart.minute);
    const windowEnd = TL_Calendar_localDateTime_(day, workEnd.hour, workEnd.minute);
    const busyIntervals = calendar.getEvents(windowStart, windowEnd).map(function(event) {
      return {
        start: event.getStartTime(),
        end: event.getEndTime(),
        id: String(event.getId() || ""),
        title: String(event.getTitle() || "")
      };
    });

    const daySlots = TL_Calendar_computeFreeSlots_(windowStart, windowEnd, meetingMinutes, busyIntervals).map(function(slot) {
      return Object.assign({
        calendarId: calendarId,
        dayIso: TL_Calendar_dateOnlyIso_(slot.start)
      }, slot);
    });

    slots.push({
      dayIso: TL_Calendar_dateOnlyIso_(day),
      workStartIso: windowStart.toISOString(),
      workEndIso: windowEnd.toISOString(),
      busyCount: busyIntervals.length,
      slots: daySlots
    });
  }

  return {
    ok: true,
    calendarId: calendarId,
    workHoursStart: TL_Calendar_setting_("WORK_HOURS_START", "09:00"),
    workHoursEnd: TL_Calendar_setting_("WORK_HOURS_END", "17:00"),
    defaultMeetingMinutes: meetingMinutes,
    lookaheadDays: lookaheadDays,
    days: slots
  };
}

function TL_Calendar_BuildProposal_(request, availability, opts) {
  const options = opts || {};
  const calendarId = TL_Calendar_calendarId_();
  const tz = TL_Calendar_timeZone_();
  const req = request || {};
  const selectedSlot = TL_Calendar_pickSlot_(availability, req);
  const title = String(req.title || req.subject || "Calendar meeting").trim();
  const durationMinutes = TL_Calendar_int_(req.durationMinutes, TL_Calendar_int_(TL_Calendar_setting_("DEFAULT_MEETING_MINUTES", ""), TL_CALENDAR.DEFAULT_MEETING_MINUTES));
  const start = selectedSlot ? new Date(selectedSlot.startIso) : TL_Calendar_parseDateTime_(req.startIso || req.start || "");
  const end = selectedSlot ? new Date(selectedSlot.endIso) : TL_Calendar_addMinutes_(start, durationMinutes);
  const attendees = TL_Calendar_normalizeAttendees_(req.attendees || []);
  const reminders = TL_Calendar_normalizeReminders_(req.reminders, options.remindersFallback);
  const location = String(req.location || "").trim();
  const description = String(req.description || "").trim();

  const approvalSnapshot = {
    calendarId: calendarId,
    timeZone: tz,
    title: title,
    start: start.toISOString(),
    end: end.toISOString(),
    attendees: attendees,
    reminders: reminders,
    location: location,
    description: description,
    eventType: String(req.eventType || "default"),
    visibility: String(req.visibility || "default"),
    notes: String(req.notes || ""),
    eventLink: "",
    status: "awaiting_approval"
  };

  const payload = {
    source: "calendar",
    version: TL_CALENDAR.VERSION,
    calendarId: calendarId,
    timeZone: tz,
    title: title,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    attendees: attendees,
    reminders: reminders,
    location: location,
    description: description,
    eventType: approvalSnapshot.eventType,
    selectedSlot: selectedSlot || null,
    approvalSnapshot: approvalSnapshot,
    approvalStatus: "awaiting_approval",
    createStatus: "pending",
    createReceipt: null
  };

  return {
    calendarId: calendarId,
    timeZone: tz,
    title: title,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    attendees: attendees,
    reminders: reminders,
    location: location,
    description: description,
    eventType: approvalSnapshot.eventType,
    selectedSlot: selectedSlot,
    approvalSnapshot: approvalSnapshot,
    payload: payload,
    rowObj: TL_Calendar_row_({
      title: title,
      status: "OPEN",
      kind: "calendar_event",
      channel: "calendar",
      payload: payload,
      lastAction: "CALENDAR_PROPOSE"
    })
  };
}

function TL_Calendar_BuildBossCard_(proposal) {
  const payload = proposal && proposal.payload ? proposal.payload : {};
  const approvalSnapshot = payload.approvalSnapshot || proposal.approvalSnapshot || {};
  return {
    title: String(approvalSnapshot.title || proposal.title || ""),
    start: String(approvalSnapshot.start || proposal.startIso || ""),
    end: String(approvalSnapshot.end || proposal.endIso || ""),
    attendees: approvalSnapshot.attendees || proposal.attendees || [],
    reminders: approvalSnapshot.reminders || proposal.reminders || [],
    location: String(approvalSnapshot.location || proposal.location || ""),
    description: String(approvalSnapshot.description || proposal.description || ""),
    calendarId: String(approvalSnapshot.calendarId || proposal.calendarId || ""),
    timeZone: String(approvalSnapshot.timeZone || proposal.timeZone || TL_Calendar_timeZone_()),
    eventType: String(approvalSnapshot.eventType || proposal.eventType || "default"),
    visibility: String(approvalSnapshot.visibility || "default"),
    eventLink: String(approvalSnapshot.eventLink || ""),
    approvalStatus: "awaiting_approval",
    createStatus: "pending"
  };
}

function TL_Calendar_QueueForApproval_(proposal) {
  const bossCard = TL_Calendar_BuildBossCard_(proposal);
  const payload = TL_Calendar_mergePayload_(proposal.payload || {}, {
    approvalSnapshot: bossCard,
    approvalStatus: "awaiting_approval",
    createStatus: "pending"
  });
  const row = TL_Calendar_row_({
    title: bossCard.title,
    status: "REVISION",
    kind: "calendar_event",
    channel: "calendar",
    payload: payload,
    lastAction: "CALENDAR_QUEUE_APPROVAL"
  });
  row.draftOrPromptJson = JSON.stringify(payload);
  return {
    ok: true,
    bossCard: bossCard,
    rowObj: row,
    payload: payload
  };
}

function TL_Calendar_ApproveCreate_(rowObj, opts) {
  const options = opts || {};
  const payload = TL_Calendar_getPayload_(rowObj);
  const approval = payload.approvalSnapshot || {};
  const frozen = {
    title: String(approval.title || ""),
    start: String(approval.start || ""),
    end: String(approval.end || ""),
    attendees: TL_Calendar_normalizeAttendees_(approval.attendees || []),
    reminders: TL_Calendar_normalizeReminders_(approval.reminders || []),
    location: String(approval.location || ""),
    description: String(approval.description || ""),
    calendarId: String(approval.calendarId || payload.calendarId || TL_Calendar_calendarId_()),
    timeZone: String(approval.timeZone || payload.timeZone || TL_Calendar_timeZone_()),
    eventType: String(approval.eventType || "default"),
    visibility: String(approval.visibility || "default"),
    eventLink: String(approval.eventLink || ""),
    approvalStatus: "approved",
    createStatus: "pending"
  };

  return {
    ok: true,
    dryRun: String(options.dryRun || "").toLowerCase() === "true" || options.dryRun === true,
    rowObj: TL_Calendar_row_({
      title: frozen.title,
      status: "REVISION",
      kind: "calendar_event",
      channel: "calendar",
      payload: TL_Calendar_mergePayload_(payload, {
        approvalSnapshot: frozen,
        approvalStatus: "approved",
        createStatus: "pending"
      }),
      lastAction: "CALENDAR_APPROVE_CREATE"
    }),
    frozenSnapshot: frozen
  };
}

function TL_Calendar_CreateApproved_(opts) {
  const options = opts || {};
  const dryRun = String(options.dryRun || "").toLowerCase() === "true" || options.dryRun === true;
  const batchSize = TL_Calendar_int_(options.batchSize, 5);
  const rows = TL_Calendar_scanRows_([TL_Calendar_tabRevision_()], function(item) {
    const payload = TL_Calendar_getPayload_(item.data);
    const approval = payload.approvalSnapshot || {};
    return String(item.data.channel || "").toLowerCase() === "calendar" &&
      String(item.data.status || "").toUpperCase() === "REVISION" &&
      String(payload.approvalStatus || approval.approvalStatus || "").toLowerCase() === "approved" &&
      String(payload.createStatus || approval.createStatus || "").toLowerCase() !== "created";
  }, batchSize);

  const result = { ok: true, scanned: 0, created: 0, failed: 0, skipped: 0, dryRun: dryRun };

  for (let i = rows.length - 1; i >= 0 && result.scanned < batchSize; i--) {
    const item = rows[i];
    result.scanned++;
    const payload = TL_Calendar_getPayload_(item.data);
    const approval = payload.approvalSnapshot || {};
    const frozen = TL_Calendar_frozenSnapshot_(approval, payload);
    if (!frozen.title || !frozen.start || !frozen.end) {
      result.skipped++;
      continue;
    }

    let createdEvent = null;
    let receipt = {
      createdAt: new Date().toISOString(),
      calendarId: frozen.calendarId,
      title: frozen.title,
      start: frozen.start,
      end: frozen.end,
      attendees: frozen.attendees,
      reminders: frozen.reminders,
      eventId: "",
      eventLink: "",
      dryRun: dryRun
    };

    if (!dryRun) {
      try {
        createdEvent = TL_Calendar_createEvent_(frozen);
        receipt = Object.assign(receipt, TL_Calendar_ExposeEventLink_(createdEvent));
      } catch (err) {
        const failedPayload = TL_Calendar_mergePayload_(payload, {
          approvalStatus: "approved",
          createStatus: "failed",
          createReceipt: {
            createdAt: new Date().toISOString(),
            error: String(err && err.stack ? err.stack : err),
            frozenSnapshot: frozen
          },
          lastError: String(err && err.stack ? err.stack : err),
          lastAction: "CALENDAR_CREATE_FAILED",
          lastActionAt: new Date().toISOString()
        });
        TL_Calendar_updateRow_(TL_Calendar_tabRevision_(), item.rowNumber, TL_Calendar_rowWithUpdates_(item.data, {
          draftOrPromptJson: JSON.stringify(failedPayload),
          lastAction: "CALENDAR_CREATE_FAILED",
          lastActionAt: new Date().toISOString()
        }));
        result.failed++;
        continue;
      }
    }

    const finalPayload = TL_Calendar_mergePayload_(payload, {
      approvalStatus: "approved",
      createStatus: dryRun ? "dry_run_created" : "created",
      createReceipt: receipt,
      eventLink: String(receipt.eventLink || ""),
      eventId: String(receipt.eventId || ""),
      lastAction: "CALENDAR_CREATE",
      lastActionAt: receipt.createdAt,
      executedAt: receipt.createdAt
    });

    const nextRow = TL_Calendar_rowWithUpdates_(item.data, {
      status: "ARCHIVE",
      draftOrPromptJson: JSON.stringify(finalPayload),
      executedAt: receipt.createdAt,
      lastAction: "CALENDAR_CREATE",
      lastActionAt: receipt.createdAt
    });
    TL_Calendar_moveRow_(TL_Calendar_tabRevision_(), item.rowNumber, TL_Calendar_tabArchive_(), nextRow);
    result.created++;
    result.sample = result.sample || [];
    result.sample.push(receipt);
  }

  return result;
}

function TL_Calendar_ExposeEventLink_(event) {
  const eventId = String(event && event.getId ? event.getId() : "");
  const htmlLink = String(event && event.getHtmlLink ? event.getHtmlLink() : "");
  return {
    eventId: eventId,
    eventLink: htmlLink || "",
    htmlLink: htmlLink || ""
  };
}

function TL_Calendar_LogReceipt_(receipt) {
  return {
    ok: true,
    receipt: receipt
  };
}

function TL_Calendar_eventSnapshot_(event, calendarId) {
  const start = event.getStartTime();
  const end = event.getEndTime();
  const attendees = event.getGuestList ? event.getGuestList().map(function(guest) {
    return String(guest.getEmail() || "");
  }).filter(Boolean) : [];
  return {
    eventId: String(event.getId() || ""),
    calendarId: String(calendarId || ""),
    title: String(event.getTitle() || ""),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    attendees: attendees,
    reminders: [],
    location: String(event.getLocation ? event.getLocation() || "" : ""),
    description: String(event.getDescription ? event.getDescription() || "" : ""),
    eventLink: String(event.getHtmlLink ? event.getHtmlLink() : ""),
    timeZone: TL_Calendar_timeZone_(),
    eventType: "default"
  };
}

function TL_Calendar_createEvent_(frozen) {
  const calendar = TL_Calendar_resolveCalendar_(frozen.calendarId);
  const start = TL_Calendar_parseDateTime_(frozen.start);
  const end = TL_Calendar_parseDateTime_(frozen.end);
  const guests = (frozen.attendees || []).join(",");
  const options = {
    location: frozen.location || "",
    description: frozen.description || "",
    guests: guests,
    sendInvites: !!guests,
    timeZone: frozen.timeZone || TL_Calendar_timeZone_()
  };

  const event = calendar.createEvent(frozen.title, start, end, options);
  TL_Calendar_applyReminders_(event, frozen.reminders || []);
  return event;
}

function TL_Calendar_applyReminders_(event, reminders) {
  if (!event || !reminders || !reminders.length) return;
  if (event.removeAllReminders) {
    event.removeAllReminders();
  }
  reminders.forEach(function(reminder) {
    const minutes = TL_Calendar_int_(reminder.minutes, 0);
    if (!minutes) return;
    if (String(reminder.method || "").toLowerCase() === "email" && event.addEmailReminder) {
      event.addEmailReminder(minutes);
      return;
    }
    if (event.addPopupReminder) {
      event.addPopupReminder(minutes);
    }
  });
}

function TL_Calendar_computeFreeSlots_(windowStart, windowEnd, meetingMinutes, busyIntervals) {
  const slots = [];
  let cursor = new Date(windowStart.getTime());
  const stepMs = TL_Calendar_int_(meetingMinutes, TL_CALENDAR.DEFAULT_MEETING_MINUTES) * 60000;
  const busy = (busyIntervals || []).map(function(item) {
    return { start: new Date(item.start), end: new Date(item.end), id: String(item.id || ""), title: String(item.title || "") };
  });

  while ((cursor.getTime() + stepMs) <= windowEnd.getTime()) {
    const slotStart = new Date(cursor.getTime());
    const slotEnd = new Date(cursor.getTime() + stepMs);
    const overlaps = busy.some(function(item) {
      return TL_Calendar_overlaps_(slotStart, slotEnd, item.start, item.end);
    });
    if (!overlaps) {
      slots.push({
        start: slotStart,
        end: slotEnd,
        startIso: slotStart.toISOString(),
        endIso: slotEnd.toISOString()
      });
    }
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return slots;
}

function TL_Calendar_pickSlot_(availability, request) {
  if (request && request.startIso && request.endIso) {
    return {
      startIso: String(request.startIso),
      endIso: String(request.endIso)
    };
  }

  const days = (availability && availability.days) || [];
  for (let i = 0; i < days.length; i++) {
    if (days[i].slots && days[i].slots.length) {
      return days[i].slots[0];
    }
  }
  return null;
}

function TL_Calendar_normalizeAttendees_(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(",");
  const out = [];
  arr.forEach(function(item) {
    const email = TL_Email_extractEmail_ ? TL_Email_extractEmail_(item) : String(item || "").trim().toLowerCase();
    if (email && out.indexOf(email) === -1) out.push(email);
  });
  return out;
}

function TL_Calendar_normalizeReminders_(value, fallback) {
  const base = Array.isArray(value) ? value : (fallback || []);
  return base.map(function(item) {
    return {
      method: String(item.method || "popup").toLowerCase(),
      minutes: TL_Calendar_int_(item.minutes, 0)
    };
  }).filter(function(item) { return item.minutes > 0; });
}

function TL_Calendar_frozenSnapshot_(approval, payload) {
  return {
    calendarId: String(approval.calendarId || payload.calendarId || TL_Calendar_calendarId_()),
    timeZone: String(approval.timeZone || payload.timeZone || TL_Calendar_timeZone_()),
    title: String(approval.title || payload.title || ""),
    start: String(approval.start || payload.startIso || ""),
    end: String(approval.end || payload.endIso || ""),
    attendees: TL_Calendar_normalizeAttendees_(approval.attendees || payload.attendees || []),
    reminders: TL_Calendar_normalizeReminders_(approval.reminders || payload.reminders || []),
    location: String(approval.location || payload.location || ""),
    description: String(approval.description || payload.description || ""),
    eventType: String(approval.eventType || payload.eventType || "default"),
    visibility: String(approval.visibility || payload.visibility || "default"),
    eventLink: String(approval.eventLink || payload.eventLink || ""),
    approvalStatus: String(approval.approvalStatus || payload.approvalStatus || "approved"),
    createStatus: String(approval.createStatus || payload.createStatus || "pending")
  };
}

function TL_Calendar_UpsertEventRow_(snapshot, tabName) {
  const row = TL_Calendar_row_({
    title: snapshot.title,
    status: "OPEN",
    kind: "calendar_event",
    channel: "calendar",
    payload: TL_Calendar_mergePayload_({
      source: "calendar",
      version: TL_CALENDAR.VERSION
    }, snapshot),
    lastAction: "CALENDAR_PULL"
  });
  row.draftOrPromptJson = JSON.stringify(row.draftOrPromptJson ? row.draftOrPromptJson : TL_Calendar_mergePayload_({
    source: "calendar",
    version: TL_CALENDAR.VERSION
  }, snapshot));
  TL_Sheets_upsertTask_(tabName || TL_Calendar_tabOpen_(), row, "refId", "calendar:event:" + snapshot.calendarId + ":" + snapshot.eventId);
  return row;
}

function TL_Calendar_row_(spec) {
  const now = new Date().toISOString();
  const payload = spec.payload || {};
  return {
    createdAt: now,
    updatedAt: now,
    userE164: "",
    refId: String(spec.refId || ("calendar:" + Utilities.getUuid())),
    chunkId: String(spec.chunkId || ""),
    title: String(spec.title || payload.title || ""),
    kind: String(spec.kind || "calendar_event"),
    channel: String(spec.channel || "calendar"),
    status: String(spec.status || "OPEN"),
    askedAt: "",
    answeredAt: "",
    executedAt: "",
    draftOrPromptJson: JSON.stringify(payload),
    lastAction: String(spec.lastAction || ""),
    lastActionAt: now
  };
}

function TL_Calendar_getPayload_(rowObj) {
  try {
    return JSON.parse(String(rowObj && rowObj.draftOrPromptJson ? rowObj.draftOrPromptJson : "{}"));
  } catch (err) {
    return {};
  }
}

function TL_Calendar_mergePayload_(basePayload, patch) {
  return Object.assign({}, basePayload || {}, patch || {});
}

function TL_Calendar_updateRow_(tabName, rowNumber, rowObj) {
  const ss = TL_Sheets_getStore_();
  const sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error("Missing tab: " + tabName);
  TL_Sheets_writeTaskRow_(sh, TL_Sheets_taskHeaders_(), rowNumber, rowObj);
  return { ok: true, tab: tabName, row: rowNumber };
}

function TL_Calendar_moveRow_(fromTab, rowNumber, toTab, rowObj) {
  const ss = TL_Sheets_getStore_();
  const fromSh = ss.getSheetByName(fromTab);
  const toSh = TL_Sheets_ensureTab_(ss, toTab, TL_Sheets_taskHeaders_());
  TL_Sheets_appendTask_(toSh, TL_Sheets_taskHeaders_(), rowObj);
  if (fromSh && rowNumber >= 2 && rowNumber <= fromSh.getLastRow()) {
    fromSh.deleteRow(rowNumber);
  }
  return { ok: true, from: fromTab, to: toTab };
}

function TL_Calendar_scanRows_(tabNames, predicate, limit) {
  const ss = TL_Sheets_getStore_();
  const tabs = tabNames || [TL_Calendar_tabOpen_(), TL_Calendar_tabRevision_()];
  const out = [];
  const max = TL_Calendar_int_(limit, 20);

  for (let t = 0; t < tabs.length; t++) {
    const sh = ss.getSheetByName(tabs[t]);
    if (!sh) continue;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) continue;
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
    for (let i = 0; i < values.length && out.length < max; i++) {
      const data = TL_Calendar_rowValuesToObject_(headers, values[i]);
      const item = { tabName: tabs[t], rowNumber: i + 2, headers: headers, values: values[i], data: data };
      if (!predicate || predicate(item)) out.push(item);
    }
  }

  return out;
}

function TL_Calendar_rowValuesToObject_(headers, row) {
  const out = {};
  for (let i = 0; i < headers.length; i++) {
    out[String(headers[i] || "")] = row[i];
  }
  return out;
}

function TL_Calendar_getSettings_() {
  const settings = (typeof TL_Settings_getAll_ === "function") ? TL_Settings_getAll_() : {};
  return settings || {};
}

function TL_Calendar_setting_(key, fallback) {
  const settings = TL_Calendar_getSettings_();
  const value = settings[String(key || "")];
  return String(value == null || value === "" ? fallback : value).trim();
}

function TL_Calendar_calendarId_() {
  return TL_Calendar_setting_("CALENDAR_ID", "primary");
}

function TL_Calendar_resolveCalendar_(calendarId) {
  const id = String(calendarId || TL_Calendar_calendarId_() || "primary").trim();
  return id === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
}

function TL_Calendar_timeZone_() {
  return String(Session.getScriptTimeZone() || "UTC");
}

function TL_Calendar_parseClock_(value, fallback) {
  const raw = String(value || fallback || "09:00").trim();
  const match = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return { hour: 9, minute: 0 };
  return {
    hour: Math.max(0, Math.min(23, parseInt(match[1], 10))),
    minute: Math.max(0, Math.min(59, parseInt(match[2] || "0", 10)))
  };
}

function TL_Calendar_localDateTime_(date, hour, minute) {
  const d = new Date(date.getTime());
  d.setHours(hour, minute, 0, 0);
  return d;
}

function TL_Calendar_addDays_(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function TL_Calendar_addMinutes_(date, minutes) {
  return new Date(date.getTime() + (Number(minutes || 0) * 60000));
}

function TL_Calendar_now_() {
  return new Date();
}

function TL_Calendar_isWeekend_(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function TL_Calendar_overlaps_(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function TL_Calendar_dateOnlyIso_(date) {
  return date.toISOString().slice(0, 10);
}

function TL_Calendar_parseDateTime_(value) {
  const d = new Date(value);
  if (String(d) === "Invalid Date") throw new Error("Invalid calendar datetime: " + value);
  return d;
}

function TL_Calendar_int_(value, fallback) {
  const n = Number(value);
  const def = Number(fallback || 0);
  if (!isFinite(n) || n <= 0) return def;
  return Math.max(1, Math.floor(n));
}

function TL_Calendar_computeSlotChoices_(availability, meetingMinutes) {
  const out = [];
  const days = (availability && availability.days) || [];
  days.forEach(function(day) {
    (day.slots || []).forEach(function(slot) {
      out.push({
        dayIso: day.dayIso,
        startIso: slot.startIso,
        endIso: slot.endIso,
        calendarId: slot.calendarId || ""
      });
    });
  });
  return out.slice(0, TL_Calendar_int_(meetingMinutes, TL_CALENDAR.DEFAULT_PULL_LIMIT));
}

function TL_Calendar_tabOpen_() { return TL_Config_get_("TL_CFG_TAB_OPEN", "OPEN"); }
function TL_Calendar_tabRevision_() { return TL_Config_get_("TL_CFG_TAB_REVISION", "REVISION"); }
function TL_Calendar_tabArchive_() { return TL_Config_get_("TL_CFG_TAB_ARCHIVE", "ARCHIVE"); }
