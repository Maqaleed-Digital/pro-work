output "api_service_url" {
  description = "Cloud Run api-service URL"
  value       = google_cloud_run_v2_service.api_service.uri
}

output "trust_processor_url" {
  description = "Cloud Run trust-processor URL"
  value       = google_cloud_run_v2_service.trust_processor.uri
}

output "agent_orchestrator_url" {
  description = "Cloud Run agent-orchestrator URL"
  value       = google_cloud_run_v2_service.agent_orchestrator.uri
}

output "db_connection_name" {
  description = "Cloud SQL connection name"
  value       = google_sql_database_instance.postgres.connection_name
}

output "redis_host" {
  description = "Memorystore Redis host"
  value       = google_redis_instance.cache.host
}

output "evidence_bucket" {
  description = "Evidence pack storage bucket"
  value       = google_storage_bucket.evidence.name
}

output "registry_url" {
  description = "Artifact Registry URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/workcaptain"
}
