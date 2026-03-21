function TL_TestEmailInbox_RunAll() {
  return {
    build_inbox_record: TL_TestEmailInbox_BuildInboxRecordRun(),
    parse_snapshot: TL_TestEmailInbox_ParseSnapshotRun()
  };
}

function TL_TestEmailInbox_BuildInboxRecordRun() {
  const payload = {
    refId: "gmail:thread:123",
    threadId: "123",
    subject: "Quick TaskLess thought",
    latestMsgId: "abc",
    latestMsgDateIso: "2026-03-21T12:00:00.000Z",
    ownerEmail: "owner@example.com",
    senderEmail: "sender@example.com",
    contactId: "CI_123",
    participants: ["sender@example.com", "owner@example.com"],
    flattenedText: "Hello from email.",
    permalink: "https://mail.google.com/mail/u/0/#imp/123",
    ownerInboundCount: 1
  };
  const row = TL_Email_buildInboxRecord_(payload, "2026-03-21T12:01:00.000Z");
  return {
    ok: row.record_id === "gmail:thread:123" &&
      row.channel === "email" &&
      row.message_type === "email_thread" &&
      row.contact_id === "CI_123" &&
      row.thread_id === "123" &&
      row.thread_subject === "Quick TaskLess thought" &&
      row.external_url.indexOf("#imp/123") !== -1,
    row: row
  };
}

function TL_TestEmailInbox_ParseSnapshotRun() {
  const payload = {
    refId: "gmail:thread:999",
    threadId: "999",
    subject: "Subject",
    latestMsgId: "msg_999",
    latestMsgDateIso: "2026-03-21T13:00:00.000Z",
    ownerEmail: "owner@example.com",
    senderEmail: "sender@example.com",
    contactId: "CI_999",
    participants: ["sender@example.com", "owner@example.com"],
    flattenedText: "Body text",
    permalink: "https://mail.google.com/mail/u/0/#imp/999"
  };
  const values = TL_WEBHOOK.INBOX_HEADERS.map(function(header) {
    switch (header) {
      case "timestamp": return "2026-03-21T13:00:00.000Z";
      case "record_id": return "gmail:thread:999";
      case "channel": return "email";
      case "record_class": return "communication";
      case "sender": return "sender@example.com";
      case "receiver": return "owner@example.com";
      case "message_id": return "msg_999";
      case "message_type": return "email_thread";
      case "text": return "Body text";
      case "contact_id": return "CI_999";
      case "raw_payload_ref": return JSON.stringify(payload);
      case "execution_status": return "email_pulled";
      case "thread_id": return "999";
      case "thread_subject": return "Subject";
      case "latest_message_at": return "2026-03-21T13:00:00.000Z";
      case "external_url": return "https://mail.google.com/mail/u/0/#imp/999";
      case "participants_json": return JSON.stringify(["sender@example.com", "owner@example.com"]);
      default: return "";
    }
  });
  const snapshot = TL_Email_inboxValuesToSnapshot_(values, 5);
  return {
    ok: snapshot.refId === "gmail:thread:999" &&
      snapshot.threadId === "999" &&
      snapshot.senderEmail === "sender@example.com" &&
      snapshot.payload.contactId === "CI_999" &&
      snapshot.payload.subject === "Subject",
    snapshot: snapshot
  };
}
