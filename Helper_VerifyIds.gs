function Helper_VerifyIds_SimpleOwnerCheck() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TL_SYSTEM_TOKEN');
  const phoneId = "1018098851384724";
  
  const options = {
    method: "get",
    headers: { "Authorization": `Bearer ${token}` },
    muteHttpExceptions: true
  };

  // We only ask for the most basic ownership field
  const url = `https://graph.facebook.com/v21.0/${phoneId}?fields=account_id`;
  
  const res = UrlFetchApp.fetch(url, options);
  Logger.log("Response: " + res.getContentText());
}
