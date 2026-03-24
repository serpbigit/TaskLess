function TL_TestBossTurnReadOnly_RunAll() {
  return {
    ai_analysis: TL_TestBossTurnReadOnly_AiAnalysisRun(),
    menu_analysis: TL_TestBossTurnReadOnly_MenuAnalysisRun()
  };
}

function TL_TestBossTurnReadOnly_AiAnalysisRun() {
  const result = TL_AI_AnalyzeBossReadOnlyTurn_({
    boss_turn: {
      message_text: "show me what needs attention"
    },
    policy: {
      retrieval_budget_max: 2
    }
  }, {
    analysisFn: function() {
      return {
        summary_kind: "attention",
        retrieval_focus: ["recent_records", "recent_contacts", "recent_records"],
        reply_preamble: "מראה לך מה צריך תשומת לב עכשיו.",
        confidence: 0.93
      };
    }
  });

  return {
    ok: result.summary_kind === "attention" &&
      result.retrieval_focus.length === 2 &&
      result.retrieval_focus[0] === "recent_records" &&
      result.retrieval_focus[1] === "recent_contacts" &&
      result.reply_preamble === "מראה לך מה צריך תשומת לב עכשיו." &&
      result.confidence === 0.93,
    result: result
  };
}

function TL_TestBossTurnReadOnly_MenuAnalysisRun() {
  const result = TL_Menu_AnalyzeReadOnlySummaryIntent_({
    summary_kind: "pending",
    confidence: 0.7,
    parameters: {
      query: "what needs attention"
    }
  }, "972500000999", {
    text: "what needs attention"
  }, {
    packetFn: function(turn) {
      return {
        boss_turn: {
          message_text: turn.message_text
        },
        policy: {
          retrieval_budget_max: 2
        }
      };
    },
    analysisFn: function(packet) {
      return {
        summary_kind: packet && packet.boss_turn && packet.boss_turn.message_text.indexOf("attention") !== -1
          ? "attention"
          : "pending",
        retrieval_focus: ["recent_records"],
        reply_preamble: "מראה לך מה צריך תשומת לב עכשיו.",
        confidence: 0.95
      };
    }
  });

  return {
    ok: result.summary_kind === "attention" &&
      result.retrieval_focus.length === 1 &&
      result.retrieval_focus[0] === "recent_records" &&
      result.reply_preamble === "מראה לך מה צריך תשומת לב עכשיו." &&
      result.packet &&
      result.packet.boss_turn &&
      result.packet.boss_turn.message_text === "what needs attention",
    result: result
  };
}
