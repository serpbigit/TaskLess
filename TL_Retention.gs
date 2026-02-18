/**
 * TL_Retention - prune ARCHIVE + AUDIT_LOG rows older than 30 days.
 * Run daily via time trigger.
 */
function TL_Retention_prune30Days_() {
  const ss = TL_Sheets_getStore_();
  if (!ss) return;

  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const tabs = [
    TL_Config_get_("TL_CFG_TAB_ARCHIVE","ARCHIVE"),
    TL_Config_get_("TL_CFG_TAB_AUDIT","AUDIT_LOG")
  ];

  tabs.forEach(tab => {
    const sh = ss.getSheetByName(tab);
    if (!sh) return;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;

    const values = sh.getRange(2,1,lastRow-1,1).getValues(); // createdAt/ts assumed in col 1
    const toDelete = [];
    for (let i=0;i<values.length;i++){
      const v = values[i][0];
      const ts = (v instanceof Date) ? v.getTime() : Date.parse(String(v||""));
      if (ts && ts < cutoff) toDelete.push(2+i);
    }
    // delete from bottom to top
    toDelete.reverse().forEach(r => sh.deleteRow(r));
  });
}

