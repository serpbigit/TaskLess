/**
 * TL_Gmail - A0 Gmail ingestion (Important threads -> OPEN tab)
 *
 * Writes to OPEN as "tasks" with:
 * - channel: "email"
 * - kind: "email_thread"
 * - refId: "gmail:thread:<threadId>" (idempotent key)
 * - chunkId: latest message id (best-effort)
 * - draftOrPromptJson: compact thread payload for later AI proposal layer
 *
 * NOTE: This is intake only. No AI. No execution.
 */

function TL_Gmail_defaultQuery_() {
  // Later: read from SETTINGS / config keys.
  return 'is:important newer_than:14d -category:promotions -category:social';
}

function TL_Gmail_pullImportantThreads_A0(opts) {
  const options = opts || {};
  const query = String(options.query || TL_Gmail_defaultQuery_());
  const maxThreads = Number(options.maxThreads || 20);
  const maxMessagesPerThread = Number(options.maxMessagesPerThread || 20);
  const maxCharsPerMessage = Number(options.maxCharsPerMessage || 8000);
  const maxTotalChars = Number(options.maxTotalChars || 20000);

  const nowIso = new Date().toISOString();
  const tabOpen = TL_Config_get_('TL_CFG_TAB_OPEN', 'OPEN');

  const threads = GmailApp.search(query, 0, maxThreads);

  let upserted = 0;
  const touched = [];

  for (let i = 0; i < threads.length; i++) {
    const th = threads[i];
    const threadId = String(th.getId());
    const refId = 'gmail:thread:' + threadId;

    const subject = String(th.getFirstMessageSubject() || '(no subject)');
    const messageCount = th.getMessageCount();

    const msgsAll = th.getMessages();
    const msgs = msgsAll.slice(Math.max(0, msgsAll.length - maxMessagesPerThread)); // last N messages only
    const latestMsg = msgsAll.length ? msgsAll[msgsAll.length - 1] : null;

    const latestMsgId = latestMsg ? String(latestMsg.getId()) : '';
    const latestMsgDateIso = latestMsg ? latestMsg.getDate().toISOString() : '';

    const permalink = 'https://mail.google.com/mail/u/0/#inbox/' + threadId;

    const flat = TL_Gmail_flattenThread_(msgs, maxCharsPerMessage, maxTotalChars);

    // Payload for later AI proposal layer (Secretary Brief)
    const payload = {
      source: 'gmail',
      threadId,
      permalink,
      query,
      subject,
      messageCount,
      latestMsgId,
      latestMsgDateIso,
      flattenedText: flat.text,
      participants: flat.participants,
      truncated: flat.truncated,
      limits: {
        maxThreads,
        maxMessagesPerThread,
        maxCharsPerMessage,
        maxTotalChars
      }
    };

    // Store into OPEN using existing schema
    const rowObj = {
      createdAt: nowIso,
      updatedAt: nowIso,
      userE164: '',               // A0: email intake not tied to WhatsApp user yet
      refId: refId,
      chunkId: latestMsgId,
      title: subject,
      kind: 'email_thread',
      channel: 'email',
      status: 'OPEN',
      askedAt: '',
      answeredAt: '',
      executedAt: '',
      draftOrPromptJson: JSON.stringify(payload),
      lastAction: 'GMAIL_INGEST',
      lastActionAt: nowIso
    };

    TL_Sheets_upsertTask_(tabOpen, rowObj, 'refId', refId);
    upserted++;
    touched.push({ refId, subject, messageCount, latestMsgDateIso, permalink });
  }

  return {
    ok: true,
    query,
    maxThreads,
    upserted,
    touchedSample: touched.slice(0, 5)
  };
}

function TL_Gmail_flattenThread_(messages, maxCharsPerMessage, maxTotalChars) {
  const participants = {};
  const parts = [];
  let total = 0;
  let truncated = false;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const dateIso = m.getDate().toISOString();

    const from = String(m.getFrom() || '');
    const to = String(m.getTo() || '');
    const cc = String(m.getCc() || '');
    const subj = String(m.getSubject() || '');

    // track participants (very simple)
    [from, to, cc].forEach(s => {
      String(s || '').split(',').map(x => x.trim()).filter(Boolean).forEach(p => participants[p] = true);
    });

    let body = String(m.getPlainBody() || '');
    if (body.length > maxCharsPerMessage) {
      body = body.slice(0, maxCharsPerMessage) + '\n...[TRUNCATED_MESSAGE_BODY]...';
      truncated = true;
    }

    const block =
      '---\n' +
      'DATE: ' + dateIso + '\n' +
      'FROM: ' + from + '\n' +
      'TO: ' + to + '\n' +
      (cc ? ('CC: ' + cc + '\n') : '') +
      'SUBJECT: ' + subj + '\n' +
      '\n' + body + '\n';

    if (total + block.length > maxTotalChars) {
      parts.push('\n...[TRUNCATED_THREAD]...\n');
      truncated = true;
      break;
    }

    parts.push(block);
    total += block.length;
  }

  return {
    text: parts.join('\n'),
    participants: Object.keys(participants),
    truncated
  };
}

/**
 * Convenience runner for the Apps Script editor.
 * Safe to run multiple times (upsert by refId).
 */
function TL_Gmail_POC_RunPullImportant() {
  TL_Sheets_bootstrapPOC(); // ensure tabs exist
  return TL_Gmail_pullImportantThreads_A0({ maxThreads: 20 });
}
