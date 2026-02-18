/**
 * TL_Gmail - high-frequency Gmail ops (MVP)
 */
function TL_Gmail_search_(query, maxResults) {
  const threads = GmailApp.search(query, 0, maxResults || 10);
  return threads.map(t => ({
    threadId: t.getId(),
    subject: t.getFirstMessageSubject(),
    messageCount: t.getMessageCount(),
    lastUpdated: t.getLastMessageDate().toISOString()
  }));
}

function TL_Gmail_readThread_(threadId, maxMessages) {
  const thread = GmailApp.getThreadById(threadId);
  const msgs = thread.getMessages().slice(-1 * (maxMessages || 5));
  return msgs.map(m => ({
    messageId: m.getId(),
    from: m.getFrom(),
    to: m.getTo(),
    date: m.getDate().toISOString(),
    subject: m.getSubject(),
    body: m.getPlainBody()
  }));
}

function TL_Gmail_createDraft_(to, subject, body) {
  const draft = GmailApp.createDraft(String(to||""), String(subject||""), String(body||""));
  return { draftId: draft.getId() };
}

function TL_Gmail_sendDraft_(draftId) {
  const drafts = GmailApp.getDrafts();
  const d = drafts.find(x => x.getId() === draftId);
  if (!d) throw new Error("Draft not found: " + draftId);
  d.send();
  return { ok: true, sent: true, draftId };
}

function TL_Gmail_deleteDraft_(draftId) {
  const drafts = GmailApp.getDrafts();
  const d = drafts.find(x => x.getId() === draftId);
  if (!d) throw new Error("Draft not found: " + draftId);
  d.moveToTrash();
  return { ok: true, trashed: true, draftId };
}

