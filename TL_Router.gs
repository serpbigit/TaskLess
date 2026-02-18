/**
 * TL_Router - minimal routing for now.
 * IMPORTANT invariant: free text/voice only generates proposals. Button payloads commit.
 */
function TL_Router_handle_(env) {
  // Normalize
  var from = String(env && env.from ? env.from : "");
  var text = String(env && env.text ? env.text : "");

  // 1) Button payloads would be parsed here later (interactive)
  if (env && env.interactive) {
    TL_Log_append_("USER", "BTN_CLICK", env, "", "");
    return _json_({ ok:true, note:"interactive handling not wired yet", interactive: env.interactive });
  }

  var t = String(text || "").trim();
  var tl = t.toLowerCase();

  // Always-first menu behavior
  if (!t || tl === "hi" || tl === "hello" || tl === "hey" || t === "שלום" || t === "היי") {
    TL_Log_append_("SYSTEM", "MENU_SHOWN", env, "", "");
    return _json_({ ok:true, menu: TL_Menu_text_() });
  }

  // Menu numbers (MVP)
  if (tl === "1") {
    TL_Log_append_("SYSTEM", "MENU_OPT_1", env, "", "");
    return _json_({ ok:true, next:"Send your command now (voice or text). I will propose actions for confirmation." });
  }

  if (tl === "2") {
    TL_Log_append_("SYSTEM", "MENU_OPT_2", env, "", "");
    var tasks = (typeof TL_Sheets_findOpenTasks_ === "function")
      ? TL_Sheets_findOpenTasks_(from, 10)
      : [];
    return _json_({ ok:true, openTasks: tasks });
  }

  if (tl === "3") {
    TL_Log_append_("SYSTEM", "MENU_OPT_3", env, "", "");
    return _json_({ ok:true, future:["Premium features","WhatsApp templates","Google Tasks mirror","Multi-user roles"] });
  }

  // Default: treat as command text -> create TASK row (proposal placeholder)
  var batchId = TL_Router_newBatchId_();
  var taskId  = TL_Router_newTaskId_(batchId);

  var taskObj = {
    taskId: taskId,
    batchId: batchId,
    from: from,
    status: "NEEDS_APPROVAL",
    kind: "PROPOSAL",
    receivedText: text,
    createdAt: (typeof _nowIso_ === "function") ? _nowIso_() : new Date().toISOString(),
    rawEnv: env
  };

  TL_Router_appendTask_(taskObj);

  TL_Log_append_("USER", "TASK_CREATED", { task: taskObj }, taskId, batchId);

  return _json_({
    ok:true,
    batchId: batchId,
    taskId: taskId,
    status: "NEEDS_APPROVAL",
    note: "Task created. Next: wire AI planner to generate proposal card(s) for confirmation.",
    menu: TL_Menu_text_({ batchId: batchId, taskId: taskId })
  });
}

/** Create short deterministic-ish batch id */
function TL_Router_newBatchId_() {
  var d = new Date();
  // yyyymmdd-hhmmss
  var pad = function(n){ return (n < 10 ? "0" : "") + n; };
  return "B" +
    d.getFullYear() +
    pad(d.getMonth()+1) +
    pad(d.getDate()) + "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
}

/** Create task id under batch */
function TL_Router_newTaskId_(batchId) {
  // In POC we keep it simple: one task per message
  return String(batchId).replace(/^B/, "T") + "-1";
}

/**
 * Append a TASK row.
 * If TASKS has headers, we map known columns.
 * Otherwise we append a default fixed schema row.
 */
function TL_Router_appendTask_(taskObj) {
  if (typeof TL_Sheets_appendTask_ === "function") {
    // preferred store-layer API if you add it later
    TL_Sheets_appendTask_(taskObj);
    return;
  }

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("TASKS");
  if (!sh) throw new Error("TASKS sheet not found");

  var lastCol = sh.getLastColumn();
  var headers = [];
  if (sh.getLastRow() >= 1 && lastCol > 0) {
    headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(x){ return String(x||"").trim(); });
  }

  var row = null;

  // Header-mapped insert if headers exist
  if (headers && headers.length && headers.join("").length) {
    row = new Array(headers.length).fill("");

    var set = function(colName, val) {
      var idx = headers.indexOf(colName);
      if (idx >= 0) row[idx] = val;
    };

    set("taskId", taskObj.taskId);
    set("batchId", taskObj.batchId);
    set("from", taskObj.from);
    set("status", taskObj.status);
    set("kind", taskObj.kind);
    set("text", taskObj.receivedText);
    set("createdAt", taskObj.createdAt);
    set("updatedAt", taskObj.createdAt);

    // Store raw json if column exists
    if (headers.indexOf("payloadJson") >= 0) set("payloadJson", _json_(taskObj.rawEnv));
    if (headers.indexOf("rawJson") >= 0) set("rawJson", _json_(taskObj.rawEnv));

    sh.appendRow(row);
    return;
  }

  // Fallback fixed row (no headers defined yet)
  // Columns: createdAt, taskId, batchId, from, status, kind, text, payloadJson
  sh.appendRow([
    taskObj.createdAt,
    taskObj.taskId,
    taskObj.batchId,
    taskObj.from,
    taskObj.status,
    taskObj.kind,
    taskObj.receivedText,
    _json_(taskObj.rawEnv)
  ]);
}
