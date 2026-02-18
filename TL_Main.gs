/**
 * TL_Main - entrypoints
 */
function doGet() {
  return ContentService.createTextOutput("TaskLess ok").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    const payload = raw ? JSON.parse(raw) : {};
    const env = TL_Parse_envelope_(payload);

    if (TL_Dedupe_seen_(env.msgId)) {
      return _json_({ ok:true, noop:true, reason:"duplicate", msgId: env.msgId });
    }

    return TL_Router_handle_(env);
  } catch (err) {
    return _json_({ ok:false, error:String(err && err.stack ? err.stack : err) });
  }
}

function _json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

