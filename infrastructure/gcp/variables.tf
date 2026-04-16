variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "Primary GCP region"
  type        = string
  default     = "me-central1"
}

variable "env" {
  description = "Deployment environment: dev | staging | production"
  type        = string
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-g1-small"
}

variable "enable_load_balancer" {
  type    = bool
  default = false
}

variable "enable_cloud_armor" {
  type    = bool
  default = false
}

variable "restrict_public_access" {
  type    = bool
  default = false
}

variable "cloud_armor_policy_name" {
  type    = string
  default = "workcaptain-nonprod-baseline"
}

variable "lb_domain_name" {
  type    = string
  default = "nonprod.workcaptain.local"
}

variable "internal_alpha_enabled" {
  type    = bool
  default = false
}

variable "real_runtime_cutover" {
  type    = bool
  default = false
}
