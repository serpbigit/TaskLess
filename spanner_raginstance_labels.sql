WITH base AS (
  SELECT
    usage_start_time,
    usage_end_time,
    project.id            AS project_id,
    project.number        AS project_number,
    service.description   AS service_desc,
    sku.description       AS sku_desc,
    location.location     AS loc,
    resource.global_name  AS resource_global_name,
    labels,
    system_labels,
    cost
  FROM dinai-tenant-internal-001.billing_export.gcp_billing_export_resource_v1_01A2B4_00B52F_8E5BC4
  WHERE project.id = 'onelegal-ai'
    AND service.description = 'Cloud Spanner'
    AND resource.global_name = '//spanner.googleapis.com/projects/lb357b7f9d0af2a09p-tp/instances/raginstance'
)
SELECT
  'LABEL' AS label_kind,
  loc,
  sku_desc,
  l.key   AS label_key,
  l.value AS label_value,
  SUM(cost) AS total_cost
FROM base, UNNEST(labels) l
GROUP BY 1,2,3,4,5

UNION ALL

SELECT
  'SYSTEM_LABEL' AS label_kind,
  loc,
  sku_desc,
  sl.key   AS label_key,
  sl.value AS label_value,
  SUM(cost) AS total_cost
FROM base, UNNEST(system_labels) sl
GROUP BY 1,2,3,4,5

ORDER BY total_cost DESC, label_kind, label_key;
