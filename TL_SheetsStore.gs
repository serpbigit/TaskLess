/**
 * TL_SheetsStore - Storage layer for TaskLess POC.
 *
 * IMPORTANT:
 * - If TL_CFG_STORE_SHEET_ID is NOT set, we default to the *bound* spreadsheet.
 * - This unblocks local POC without extra configuration.
 *
 * POC Tabs (current target):
 * - SETTINGS
 * - TASKS
 * - CONTACTS
 * - AUDIT_LOG
 * - COMMANDS_INBOX
 * - EVENTS_LOG
 * - OUTBOX_QUEUE
 * - ERRORS
 */
function TL_Sheets_getStore_() {
  const sheetId = String(TL_Config_get_("TL_CFG_STORE_SHEET_ID", "") || "").trim();
  if (sheetId) return SpreadsheetApp.openById(sheetId);

  // Default to bound spreadsheet for POC
  return SpreadsheetApp.getActiveSpreadsheet();
}

function TL_Sheets_ensureTab_(ss, tabName, headers) {
  let sh = ss.getSheetByName(tabName);
  if (!sh) sh = ss.insertSheet(tabName);

  if (headers && headers.length) {
    const lastCol = Math.max(1, sh.getLastColumn());
    const firstRow = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    const hasHeader = firstRow.join("|").includes(headers[0]);
    if (!hasHeader) {
      sh.clear();
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function TL_Sheets_taskHeaders_() {
  return [
    "createdAt","updatedAt","userE164",
    "refId","chunkId","title","kind","channel",
    "status","askedAt","answeredAt","executedAt",
    "draftOrPromptJson","lastAction","lastActionAt"
  ];
}

/**
 * Bootstraps the bound spreadsheet to the minimal POC schema.
 * Safe to run repeatedly.
 */
function TL_Sheets_bootstrapPOC_() {
  const ss = TL_Sheets_getStore_();
  if (!ss) throw new Error("No spreadsheet store available");

  // Existing tabs we already saw in bound sheet
  TL_Sheets_ensureTab_(ss, "TASKS", TL_Sheets_taskHeaders_());
  TL_Sheets_ensureTab_(ss, "CONTACTS", ["key","valueJson","updatedAt"]);
  TL_Sheets_ensureTab_(ss, "SETTINGS", ["key","value"]);
  TL_Sheets_ensureTab_(ss, "AUDIT_LOG", ["ts","actor","eventType","payloadJson"]);

  // New POC router tabs required for webhook routing
  TL_Sheets_ensureTab_(ss, "COMMANDS_INBOX", ["ts","userId","text","rawJson"]);
  TL_Sheets_ensureTab_(ss, "EVENTS_LOG", ["ts","type","ref","payloadJson"]);
  TL_Sheets_ensureTab_(ss, "OUTBOX_QUEUE", ["ts","to","type","payloadJson","status"]);
  TL_Sheets_ensureTab_(ss, "ERRORS", ["ts","where","error","payloadJson"]);

  return { ok:true, spreadsheetId:ss.getId(), spreadsheetName:ss.getName() };
}

/**
 * Backward-compatible bootstrap (older naming).
 * Keep it, but point it to POC bootstrap for now.
 */
function TL_Sheets_bootstrapTabs_() {
  return TL_Sheets_bootstrapPOC_();
}

function TL_Sheets_upsertTask_(tabName, rowObj, keyField, keyValue) {
  const ss = TL_Sheets_getStore_();
  if (!ss) throw new Error("No spreadsheet store available");

  const sh = TL_Sheets_ensureTab_(ss, tabName, TL_Sheets_taskHeaders_());
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const keyCol = headers.indexOf(keyField) + 1;
  if (keyCol <= 0) throw new Error("Key field not found: " + keyField);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    TL_Sheets_appendTask_(sh, headers, rowObj);
    return;
  }

  const keyVals = sh.getRange(2, keyCol, lastRow-1, 1).getValues().map(r => String(r[0] || ""));
  const idx = keyVals.indexOf(String(keyValue));
  if (idx === -1) {
    TL_Sheets_appendTask_(sh, headers, rowObj);
    return;
  }

  const rowNumber = 2 + idx;
  TL_Sheets_writeTaskRow_(sh, headers, rowNumber, rowObj);
}

function TL_Sheets_appendTask_(sh, headers, rowObj) {
  const row = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ""));
  sh.appendRow(row);
}

function TL_Sheets_writeTaskRow_(sh, headers, rowNumber, rowObj) {
  const row = headers.map(h => (rowObj[h] !== undefined ? rowObj[h] : ""));
  sh.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function TL_Sheets_findOpenTasks_(userE164, limit) {
  const ss = TL_Sheets_getStore_();
  if (!ss) return [];

  // POC tabs for tasks
  const tabs = ["TASKS"];
  const out = [];
  const max = limit || 10;

  tabs.forEach(tab => {
    if (out.length >= max) return;
    const sh = ss.getSheetByName(tab);
    if (!sh) return;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const values = sh.getRange(1,1,lastRow,sh.getLastColumn()).getValues();
    const headers = values[0];
    const idxUser = headers.indexOf("userE164");
    const idxTitle = headers.indexOf("title");
    const idxChunk = headers.indexOf("chunkId");
    const idxRef = headers.indexOf("refId");
    const idxStatus = headers.indexOf("status");

    for (let r=1; r<values.length && out.length<max; r++) {
      const row = values[r];
      if (String(row[idxUser]||"") !== String(userE164||"")) continue;
      out.push({
        tab,
        refId: String(row[idxRef]||""),
        chunkId: String(row[idxChunk]||""),
        title: String(row[idxTitle]||""),
        status: String(row[idxStatus]||"")
      });
    }
  });

  return out;
}
