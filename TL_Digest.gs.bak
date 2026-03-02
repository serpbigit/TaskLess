/**
 * TL_Digest - A0 digest builder (Email-only, no execution)
 * Produces a WhatsApp-ready "Secretary Brief" text from OPEN rows.
 */

function TL_Digest_buildEmailSecretaryBrief_A0(opts) {
  const options = opts || {};
  const maxItems = Number(options.maxItems || 8);

  const ss = TL_Sheets_getStore_();
  const sh = ss.getSheetByName(TL_Config_get_("TL_CFG_TAB_OPEN","OPEN"));
  if (!sh) return { ok:false, error:"OPEN tab not found" };

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok:true, text:"Secretary Brief — 0 items\n(OPEN is empty)" };

  const values = sh.getRange(1,1,lastRow,sh.getLastColumn()).getValues();
  const headers = values[0];

  const idx = {};
  headers.forEach((h,i)=> idx[h]=i);

  // newest first by createdAt (string ISO)
  const rows = values.slice(1)
    .filter(r => String(r[idx.channel]||"") === "email" && String(r[idx.status]||"") === "OPEN")
    .sort((a,b)=> String(b[idx.createdAt]||"").localeCompare(String(a[idx.createdAt]||"")))
    .slice(0, maxItems);

  if (!rows.length) return { ok:true, text:"Secretary Brief — 0 email items\n(No OPEN email rows found)" };

  const lines = [];
  lines.push(`Secretary Brief — ${rows.length} Email Items`);
  lines.push("");

  for (let i=0;i<rows.length;i++) {
    const r = rows[i];
    const title = String(r[idx.title]||"");
    const payloadJson = String(r[idx.draftOrPromptJson]||"{}");
    let payload = {};
    try { payload = JSON.parse(payloadJson); } catch(e) { payload = {}; }

    const triage = TL_Digest_triageEmail_(payload);
    const oneLine = TL_Digest_summarizeEmail_(payload);

    lines.push(`${i+1}) [${triage}] ${oneLine}`);
    lines.push(`   Subject: ${title}`);

    if (payload && payload.permalink) lines.push(`   Link: ${payload.permalink}`);

    const suggestion = TL_Digest_suggestNextStep_(triage, payload);
    if (suggestion) lines.push(`   Suggested: ${suggestion}`);

    lines.push("");
  }

  lines.push("Reply with: 1,2 to mark as handled | 'open 1' | 'ignore 2'");
  return { ok:true, text: lines.join("\n") };
}

function TL_Digest_triageEmail_(payload) {
  const subject = String(payload.subject||"");
  const flat = String(payload.flattenedText||"");
  const fromLine = (flat.match(/FROM:\s*(.*)/i)||[])[1] || "";
  const toLine = (flat.match(/TO:\s*(.*)/i)||[])[1] || "";

  const from = fromLine.toLowerCase();
  const subj = subject.toLowerCase();

  // NOT_MINE heuristic (Hebrew greeting to someone else)
  if (flat.includes("היי רמי") || flat.includes("הי רמי")) return "NOT_MINE";

  // FYI heuristics
  if (from.includes("noreply") || from.includes("no-reply")) return "FYI";
  if (subj.includes("newsletter") || subj.includes("update") || subj.includes("notification")) return "FYI";
  if (subj.includes("receipt") || subj.includes("invoice")) return "FYI";

  // ACTION heuristic: direct ask / question
  if (flat.includes("?")) return "ACTION";
  if (/please|can you|confirm|approve|action advised|action required/i.test(flat)) {
    // If it’s "action advised" from a system sender, still likely FYI
    if (from.includes("google") || from.includes("microsoft") || from.includes("noreply") || from.includes("no-reply")) return "FYI";
    return "ACTION";
  }

  // If you're only in CC and not directly addressed, default FYI (best effort)
  if (toLine && !toLine.toLowerCase().includes("reuven")) return "FYI";

  return "FYI";
}

function TL_Digest_summarizeEmail_(payload) {
  const subject = String(payload.subject||"(no subject)");
  const fromLine = (String(payload.flattenedText||"").match(/FROM:\s*(.*)/i)||[])[1] || "";
  const from = fromLine ? fromLine.replace(/<.*?>/g,"").trim() : "Unknown sender";

  // ultra-compact: "Sender — subject"
  return `${from} — ${subject}`;
}

function TL_Digest_suggestNextStep_(triage, payload) {
  if (triage === "FYI") return "No action needed. Archive/ignore.";
  if (triage === "NOT_MINE") return "No action. Optionally forward to intended recipient.";
  if (triage === "WAITING") return "No action now. Set follow-up reminder.";
  if (triage === "SCHEDULE") return "Propose times + prepare calendar hold (needs confirmation).";
  if (triage === "ACTION") return "Draft a short reply for approval (next phase).";
  return "";
}

function TL_Digest_POC_RunEmailBrief() {
  return TL_Digest_buildEmailSecretaryBrief_A0({ maxItems: 8 });
}
