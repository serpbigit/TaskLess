/**
 * TL_Router - minimal routing for now.
 * IMPORTANT invariant: free text/voice only generates proposals. Button payloads commit.
 */
function TL_Router_handle_(env) {
  // 1) Button payloads would be parsed here later (interactive)
  if (env.interactive) {
    TL_Log_append_("USER","BTN_CLICK",env,{});
    return _json_({ ok:true, note:"interactive handling not wired yet", interactive: env.interactive });
  }

  const t = String(env.text||"").trim().toLowerCase();

  // Always-first menu behavior
  if (!t || t === "hi" || t === "hello" || t === "hey" || t === "שלום" || t === "היי") {
    TL_Log_append_("SYSTEM","MENU_SHOWN",env,{});
    return _json_({ ok:true, menu: TL_Menu_text_() });
  }

  // Menu numbers (MVP)
  if (t === "1") return _json_({ ok:true, next:"Send your command now (voice or text). I will propose actions for confirmation." });
  if (t === "2") {
    const tasks = TL_Sheets_findOpenTasks_(env.from, 10);
    return _json_({ ok:true, openTasks: tasks });
  }
  if (t === "3") return _json_({ ok:true, future:["Premium features","WhatsApp templates","Google Tasks mirror","Multi-user roles"] });

  // Default: treat as command text (proposal generation will be wired later to AI)
  TL_Log_append_("USER","USER_MSG",env,{});
  return _json_({
    ok:true,
    note:"Received command text. Next: wire AI planner -> create OPEN tasks + per-task proposal cards.",
    received: env.text
  });
}

