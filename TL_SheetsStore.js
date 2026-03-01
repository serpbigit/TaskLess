/**
 * TL_SheetsStore - bounded sheet store + bootstrap helpers (POC)
 * Default store: bound spreadsheet (getActiveSpreadsheet)
 * Optional override: Script Property TL_CFG_STORE_SHEET_ID
 *
 * Tabs we may create:
 * OPEN, PENDING, REVISION, ARCHIVE, AUDIT_LOG, SETTINGS, COMMANDS_INBOX
 */

function TL_Sheets_getStore_() {
  const sheetId = TL_Config_get_("TL_CFG_STORE_SHEET_ID", "");
  if (sheetId) return SpreadsheetApp.openById(sheetId);
  // default to bound sheet
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

function TL_Sheets_bootstrapTabs_() {
  const ss = TL_Sheets_getStore_();

  TL_Sheets_ensureTab_(ss, TL_Config_get_("TL_CFG_TAB_OPEN","OPEN"), TL_Sheets_taskHeaders_());
  TL_Sheets_ensureTab_(ss, TL_Config_get_("TL_CFG_TAB_PENDING","PENDING"), TL_Sheets_taskHeaders_());
  TL_Sheets_ensureTab_(ss, TL_Config_get_("TL_CFG_TAB_REVISION","REVISION"), TL_Sheets_taskHeaders_());
  TL_Sheets_ensureTab_(ss, TL_Config_get_("TL_CFG_TAB_ARCHIVE","ARCHIVE"), TL_Sheets_taskHeaders_());
  TL_Sheets_ensureTab_(ss, TL_Config_get_("TL_CFG_TAB_AUDIT","AUDIT_LOG"), ["ts","actor","eventType","userE164","refId","chunkId","payload"]);
  TL_Sheets_ensureTab_(ss, TL_Config_get_("TL_CFG_TAB_SETTINGS","SETTINGS"), ["key","value"]);

  // Router currently expects this to exist (quick unblock)
  TL_Sheets_ensureTab_(ss, "COMMANDS_INBOX", ["ts","userE164","text","batchVersion","payloadJson"]);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    tabs: ss.getSheets().map(sh => sh.getName())
  };
}

/**
 * Public runner to bootstrap required store tabs.
 * Safe to run multiple times.
 */
function TL_Sheets_bootstrapPOC() {
  return TL_Sheets_bootstrapTabs_();
}

function TL_Sheets_upsertTask_(tabName, rowObj, keyField, keyValue) {
  const ss = TL_Sheets_getStore_();
  const sh = TL_Sheets_ensureTab_(ss, tabName, TL_Sheets_taskHeaders_());
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  const keyCol = headers.indexOf(keyField) + 1;
  if (keyCol <= 0) throw new Error("Key field not found: " + keyField);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    TL_Sheets_appendTask_(sh, headers, rowObj);
    return;
  }

  const keyVals = sh.getRange(2, keyCol, lastRow - 1, 1).getValues().map(r => String(r[0] || ""));
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

  const tabs = [
    TL_Config_get_("TL_CFG_TAB_OPEN","OPEN"),
    TL_Config_get_("TL_CFG_TAB_PENDING","PENDING"),
    TL_Config_get_("TL_CFG_TAB_REVISION","REVISION")
  ];

  const out = [];
  const max = limit || 10;

  tabs.forEach(tab => {
    if (out.length >= max) return;
    const sh = ss.getSheetByName(tab);
    if (!sh) return;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;

    const values = sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues();
    const headers = values[0];

    const idxUser = headers.indexOf("userE164");
    const idxTitle = headers.indexOf("title");
    const idxChunk = headers.indexOf("chunkId");
    const idxRef = headers.indexOf("refId");
    const idxStatus = headers.indexOf("status");

    for (let r = 1; r < values.length && out.length < max; r++) {
      const row = values[r];
      if (String(row[idxUser] || "") !== String(userE164 || "")) continue;
      out.push({
        tab,
        refId: String(row[idxRef] || ""),
        chunkId: String(row[idxChunk] || ""),
        title: String(row[idxTitle] || ""),
        status: String(row[idxStatus] || "")
      });
    }
  });

  return out;
}
