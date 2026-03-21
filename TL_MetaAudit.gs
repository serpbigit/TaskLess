/**
 * TL_MetaAudit.gs
 *
 * Read-only Meta Business Portfolio inventory via Graph API.
 *
 * Script Properties used:
 * - TL_META_ACCESS_TOKEN      : preferred access token with business_management
 * - TL_SYSTEM_TOKEN           : fallback token for POC
 * - TL_META_BUSINESS_IDS      : comma/newline-separated business IDs
 * - TL_META_GRAPH_VERSION     : optional, default "v20.0"
 *
 * Logs:
 * - LOG via TL_Audit_append_
 *
 * Output:
 * - JSON summary of all requested businesses and their dependencies
 */

function TL_MetaAudit_saveConfig_(accessToken, businessIdsText, graphVersion) {
  if (!accessToken) throw new Error("Missing accessToken");
  if (!businessIdsText) throw new Error("Missing businessIdsText");

  TL_Config_set_("TL_META_ACCESS_TOKEN", String(accessToken).trim());
  TL_Config_set_("TL_META_BUSINESS_IDS", String(businessIdsText).trim());
  TL_Config_set_("TL_META_GRAPH_VERSION", String(graphVersion || "v20.0").trim());

  return {
    ok: true,
    graphVersion: TL_Config_get_("TL_META_GRAPH_VERSION", "v20.0"),
    businessIds: TL_MetaAudit_getBusinessIds_()
  };
}

function TL_MetaAudit_getConfig_() {
  var token = TL_Config_get_("TL_META_ACCESS_TOKEN", "");
  if (!token) token = TL_Config_get_("TL_SYSTEM_TOKEN", ""); // POC fallback

  var graphVersion = TL_Config_get_("TL_META_GRAPH_VERSION", "v20.0");
  var businessIds = TL_MetaAudit_getBusinessIds_();

  return {
    accessToken: token,
    graphVersion: graphVersion,
    businessIds: businessIds
  };
}

function TL_MetaAudit_getBusinessIds_() {
  var raw = TL_Config_get_("TL_META_BUSINESS_IDS", "");
  return String(raw || "")
    .split(/[\n,\r]+/)
    .map(function(v) { return String(v || "").trim(); })
    .filter(function(v) { return !!v; });
}

function TL_MetaAudit_run() {
  var cfg = TL_MetaAudit_getConfig_();

  if (!cfg.accessToken) {
    throw new Error("Missing Script Property TL_META_ACCESS_TOKEN (or fallback TL_SYSTEM_TOKEN)");
  }
  if (!cfg.businessIds.length) {
    throw new Error("Missing Script Property TL_META_BUSINESS_IDS");
  }

  var startedAt = new Date().toISOString();
  TL_Audit_append_("TL_MetaAudit", "meta_audit_started", {
    graphVersion: cfg.graphVersion,
    businessIds: cfg.businessIds
  });

  var out = {
    ok: true,
    actor: "TL_MetaAudit",
    startedAt: startedAt,
    graphVersion: cfg.graphVersion,
    businessIds: cfg.businessIds,
    businesses: []
  };

  for (var i = 0; i < cfg.businessIds.length; i++) {
    var businessId = cfg.businessIds[i];
    var businessSummary = TL_MetaAudit_fetchBusinessSummary_(businessId, cfg.accessToken, cfg.graphVersion);
    out.businesses.push(businessSummary);

    TL_Audit_append_("TL_MetaAudit", "meta_audit_business_complete", {
      businessId: businessId,
      businessName: (((businessSummary || {}).business || {}).name || ""),
      hadErrors: !!(businessSummary && businessSummary.errors && businessSummary.errors.length),
      errorCount: (businessSummary && businessSummary.errors) ? businessSummary.errors.length : 0
    });
  }

  out.completedAt = new Date().toISOString();

  TL_Audit_append_("TL_MetaAudit", "meta_audit_completed", {
    businessCount: out.businesses.length,
    completedAt: out.completedAt
  });

  return JSON.stringify(out, null, 2);
}

function TL_MetaAudit_fetchBusinessSummary_(businessId, accessToken, graphVersion) {
  var errors = [];

  var business = TL_MetaAudit_fetch_(
    "/" + businessId,
    {
      fields: "id,name,verification_status,created_time,primary_page{id,name}"
    },
    accessToken,
    graphVersion
  );
  if (business.error) errors.push({ edge: "business", error: business.error });

  var ownedBusinesses = TL_MetaAudit_fetch_(
    "/" + businessId + "/owned_businesses",
    { fields: "id,name,verification_status" },
    accessToken,
    graphVersion
  );
  if (ownedBusinesses.error) errors.push({ edge: "owned_businesses", error: ownedBusinesses.error });

  var clientBusinesses = TL_MetaAudit_fetch_(
    "/" + businessId + "/client_businesses",
    { fields: "id,name,verification_status" },
    accessToken,
    graphVersion
  );
  if (clientBusinesses.error) errors.push({ edge: "client_businesses", error: clientBusinesses.error });

  var ownedApps = TL_MetaAudit_fetch_(
    "/" + businessId + "/owned_apps",
    { fields: "id,name,app_type,link" },
    accessToken,
    graphVersion
  );
  if (ownedApps.error) errors.push({ edge: "owned_apps", error: ownedApps.error });

  var systemUsers = TL_MetaAudit_fetch_(
    "/" + businessId + "/system_users",
    { fields: "id,name,role" },
    accessToken,
    graphVersion
  );
  if (systemUsers.error) errors.push({ edge: "system_users", error: systemUsers.error });

  var ownedWabas = TL_MetaAudit_fetch_(
    "/" + businessId + "/owned_whatsapp_business_accounts",
    { fields: "id,name,currency,account_review_status,message_template_namespace" },
    accessToken,
    graphVersion
  );
  if (ownedWabas.error) errors.push({ edge: "owned_whatsapp_business_accounts", error: ownedWabas.error });

  var wabaSummaries = [];
  var wabas = TL_MetaAudit_data_(ownedWabas);

  for (var i = 0; i < wabas.length; i++) {
    var waba = wabas[i];

    var phones = TL_MetaAudit_fetch_(
      "/" + waba.id + "/phone_numbers",
      { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,status" },
      accessToken,
      graphVersion
    );
    if (phones.error) {
      errors.push({
        edge: "phone_numbers",
        parentWabaId: waba.id,
        error: phones.error
      });
    }

    wabaSummaries.push({
      waba: waba,
      phone_numbers: TL_MetaAudit_data_(phones)
    });
  }

  return {
    requestedBusinessId: businessId,
    business: business.error ? null : business,
    owned_businesses: TL_MetaAudit_data_(ownedBusinesses),
    client_businesses: TL_MetaAudit_data_(clientBusinesses),
    owned_apps: TL_MetaAudit_data_(ownedApps),
    system_users: TL_MetaAudit_data_(systemUsers),
    owned_whatsapp_business_accounts: wabaSummaries,
    errors: errors
  };
}

function TL_MetaAudit_fetch_(path, params, accessToken, graphVersion) {
  var baseUrl = "https://graph.facebook.com/" + encodeURIComponent(graphVersion || "v20.0") + path;
  var query = TL_MetaAudit_toQueryString_(params || {});
  var url = baseUrl + (query ? ("?" + query) : "");

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + accessToken
    }
  });

  var code = res.getResponseCode();
  var text = res.getContentText();

  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return {
      error: {
        type: "parse_error",
        message: "Non-JSON response from Graph API",
        status: code,
        raw: text
      }
    };
  }

  if (code < 200 || code >= 300 || json.error) {
    return {
      error: {
        status: code,
        body: json
      }
    };
  }

  return json;
}

function TL_MetaAudit_data_(obj) {
  if (!obj || obj.error) return [];
  if (Object.prototype.toString.call(obj.data) === "[object Array]") return obj.data;
  return [];
}

function TL_MetaAudit_toQueryString_(obj) {
  var parts = [];
  for (var k in obj) {
    if (!obj.hasOwnProperty(k)) continue;
    if (obj[k] === null || obj[k] === undefined || obj[k] === "") continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(obj[k])));
  }
  return parts.join("&");
}


function TL_MetaAudit_runAndLog() {
  var out = TL_MetaAudit_run();
  Logger.log(out);
  return out;
}





