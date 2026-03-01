-- Trace all costs that are tagged as RAG Engine billing,
-- and show which resource_global_name / service / sku is responsible.
SELECT
  project.id AS project_id,
  project.number AS project_number,
  service.description AS service_desc,
  sku.description AS sku_desc,
  location.location AS loc,
  resource.global_name AS resource_global_name,
  resource.name AS resource_name,
  SUM(cost) AS total_cost
FROM dinai-tenant-internal-001.billing_export.gcp_billing_export_resource_v1_01A2B4_00B52F_8E5BC4,
UNNEST(system_labels) sl
WHERE project.id = 'onelegal-ai'
  AND sl.key = 'spanner.googleapis.com/is_rag_engine_billing'
  AND sl.value = 'True'
GROUP BY 1,2,3,4,5,6,7
ORDER BY total_cost DESC;
