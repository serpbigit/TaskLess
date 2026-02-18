/**
 * TL_Calendar - high-frequency Calendar ops (MVP)
 */
function TL_Calendar_createEvent_(title, startIso, endIso, options) {
  const calId = (options && options.calendarId) ? options.calendarId : "primary";
  const cal = CalendarApp.getCalendarById(calId);
  const start = new Date(startIso);
  const end = new Date(endIso);
  const ev = cal.createEvent(String(title||""), start, end, {
    description: options && options.description ? String(options.description) : "",
    location: options && options.location ? String(options.location) : ""
  });
  return { eventId: ev.getId(), htmlLink: ev.getHtmlLink ? ev.getHtmlLink() : "" };
}

function TL_Calendar_search_(query, startIso, endIso, options) {
  const calId = (options && options.calendarId) ? options.calendarId : "primary";
  const cal = CalendarApp.getCalendarById(calId);
  const start = startIso ? new Date(startIso) : new Date(Date.now() - 7*24*60*60*1000);
  const end = endIso ? new Date(endIso) : new Date(Date.now() + 30*24*60*60*1000);

  const events = cal.getEvents(start, end, { search: String(query||"") });
  return events.slice(0, (options && options.maxResults) ? options.maxResults : 20).map(ev => ({
    eventId: ev.getId(),
    title: ev.getTitle(),
    start: ev.getStartTime().toISOString(),
    end: ev.getEndTime().toISOString(),
    location: ev.getLocation(),
    description: ev.getDescription()
  }));
}

function TL_Calendar_deleteEvent_(eventId, options) {
  const calId = (options && options.calendarId) ? options.calendarId : "primary";
  const cal = CalendarApp.getCalendarById(calId);
  const ev = cal.getEventById(eventId);
  if (!ev) throw new Error("Event not found: " + eventId);
  ev.deleteEvent();
  return { ok: true, deleted: true, eventId };
}

