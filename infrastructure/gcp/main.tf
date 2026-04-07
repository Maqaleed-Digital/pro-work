# WorkCaptain — GCP Infrastructure Baseline
# infrastructure/gcp/main.tf

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "workcaptain-tfstate"
    prefix = "gcp/core"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ─────────────────────────────────────────────────────────────────────────────
# SERVICES
# ─────────────────────────────────────────────────────────────────────────────
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudtrace.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "aiplatform.googleapis.com",
    "vpcaccess.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# ─────────────────────────────────────────────────────────────────────────────
# VPC + SERVERLESS VPC ACCESS
# ─────────────────────────────────────────────────────────────────────────────
resource "google_compute_network" "workcaptain_vpc" {
  name                    = "workcaptain-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "workcaptain_subnet" {
  name          = "workcaptain-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.workcaptain_vpc.id
}

resource "google_vpc_access_connector" "serverless_connector" {
  name   = "workcaptain-vpcconn"
  region = var.region
  subnet {
    name = google_compute_subnetwork.workcaptain_subnet.name
  }
  min_instances = 2
  max_instances = 10
}

# ─────────────────────────────────────────────────────────────────────────────
# CLOUD SQL
# ─────────────────────────────────────────────────────────────────────────────
resource "google_sql_database_instance" "postgres" {
  name                = "workcaptain-pg"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true

  settings {
    tier              = var.db_tier
    availability_type = "REGIONAL"

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      retained_backups               = 14
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.workcaptain_vpc.id
    }

    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "workcaptain" {
  name     = "workcaptain"
  instance = google_sql_database_instance.postgres.name
}

# ─────────────────────────────────────────────────────────────────────────────
# MEMORYSTORE REDIS
# ─────────────────────────────────────────────────────────────────────────────
resource "google_redis_instance" "cache" {
  name           = "workcaptain-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region
  redis_version  = "REDIS_7_0"

  authorized_network = google_compute_network.workcaptain_vpc.id
}

# ─────────────────────────────────────────────────────────────────────────────
# ARTIFACT REGISTRY
# ─────────────────────────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "registry" {
  location      = var.region
  repository_id = "workcaptain"
  format        = "DOCKER"
  description   = "WorkCaptain container images"
}

# ─────────────────────────────────────────────────────────────────────────────
# PUB/SUB TOPICS
# ─────────────────────────────────────────────────────────────────────────────
locals {
  pubsub_topics = [
    "trust-events",
    "contract-events",
    "agent-task-events",
    "compliance-events",
  ]
}

resource "google_pubsub_topic" "topics" {
  for_each = toset(local.pubsub_topics)
  name     = each.key

  message_retention_duration = "86400s"
}

resource "google_pubsub_subscription" "background_worker_subs" {
  for_each = toset(local.pubsub_topics)
  name     = "${each.key}-background-worker"
  topic    = google_pubsub_topic.topics[each.key].name

  ack_deadline_seconds = 60

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "300s"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# CLOUD STORAGE
# ─────────────────────────────────────────────────────────────────────────────
resource "google_storage_bucket" "evidence" {
  name                        = "${var.project_id}-evidence"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      age = 90
    }
  }
}

resource "google_storage_bucket" "exports" {
  name                        = "${var.project_id}-exports"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}

# ─────────────────────────────────────────────────────────────────────────────
# SERVICE ACCOUNTS
# ─────────────────────────────────────────────────────────────────────────────
locals {
  service_accounts = {
    api_service        = "api-service"
    trust_processor    = "trust-processor"
    agent_orchestrator = "agent-orchestrator"
    background_worker  = "background-worker"
    admin_console      = "admin-console"
  }
}

resource "google_service_account" "services" {
  for_each     = local.service_accounts
  account_id   = each.value
  display_name = "WorkCaptain ${each.value} service account"
}

# ─────────────────────────────────────────────────────────────────────────────
# SECRET MANAGER — placeholder secrets
# ─────────────────────────────────────────────────────────────────────────────
resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password"
  replication { auto {} }
}

resource "google_secret_manager_secret" "redis_auth" {
  secret_id = "redis-auth"
  replication { auto {} }
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "jwt-secret"
  replication { auto {} }
}

# ─────────────────────────────────────────────────────────────────────────────
# CLOUD RUN — api-service
# ─────────────────────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "api_service" {
  name     = "api-service"
  location = var.region

  template {
    service_account = google_service_account.services["api_service"].email

    vpc_access {
      connector = google_vpc_access_connector.serverless_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/workcaptain/api-service:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "ENV"
        value = var.env
      }

      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.cache.host
      }
    }

    scaling {
      min_instance_count = var.env == "production" ? 1 : 0
      max_instance_count = 10
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# CLOUD RUN — trust-processor
# ─────────────────────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "trust_processor" {
  name     = "trust-processor"
  location = var.region

  template {
    service_account = google_service_account.services["trust_processor"].email

    vpc_access {
      connector = google_vpc_access_connector.serverless_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/workcaptain/trust-processor:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "ENV"
        value = var.env
      }
    }

    scaling {
      min_instance_count = var.env == "production" ? 1 : 0
      max_instance_count = 5
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# CLOUD RUN — agent-orchestrator
# ─────────────────────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "agent_orchestrator" {
  name     = "agent-orchestrator"
  location = var.region

  template {
    service_account = google_service_account.services["agent_orchestrator"].email

    vpc_access {
      connector = google_vpc_access_connector.serverless_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/workcaptain/agent-orchestrator:latest"

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }

      env {
        name  = "ENV"
        value = var.env
      }
    }

    scaling {
      min_instance_count = var.env == "production" ? 1 : 0
      max_instance_count = 5
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# CLOUD RUN — background-worker
# ─────────────────────────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "background_worker" {
  name     = "background-worker"
  location = var.region

  template {
    service_account = google_service_account.services["background_worker"].email

    vpc_access {
      connector = google_vpc_access_connector.serverless_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/workcaptain/background-worker:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "ENV"
        value = var.env
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
  }
}
