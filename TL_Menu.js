/**
 * TL_Menu.gs
 * POC shim: Router expects TL_Menu_text_ to render a human-readable menu string.
 * For now we keep it minimal and deterministic (no buttons yet).
 */
function TL_Menu_text_(ctx) {
  var lines = [];
  lines.push("TaskLess POC");
  if (ctx && ctx.batchId) lines.push("Batch: " + ctx.batchId);
  if (ctx && ctx.taskId) lines.push("Task: " + ctx.taskId);
  lines.push("");
  lines.push("Menu:");
  lines.push("1) Approve");
  lines.push("2) Modify");
  lines.push("3) Cancel");
  return lines.join("\n");
}
