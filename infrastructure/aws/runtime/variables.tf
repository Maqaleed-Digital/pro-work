# WO-WC-DEPLOY-001 — variables.

variable "aws_profile" {
  description = "AWS CLI profile (Stage-B build account 822127611052)."
  type        = string
  default     = "maq-stage-b"
}

variable "aws_region" {
  description = "Sovereign-aligned region (confirmed applied for the whole portfolio)."
  type        = string
  default     = "me-central-1"
}

variable "vpc_id" {
  description = "Existing prowork-production VPC (foundation)."
  type        = string
  default     = "vpc-0c14a4f250b918527"
}

variable "domain_name" {
  description = "Public domain for WorkCaptain (DL-067)."
  type        = string
  default     = "workcaptain.ai"
}

variable "image_tag" {
  description = "ECR image tag to deploy (image built from infrastructure/docker/Dockerfile and pushed to the prowork-production repo before apply)."
  type        = string
  default     = "latest"
}

variable "app_port" {
  description = "Container listen port (server.js APP_PORT default)."
  type        = number
  default     = 3010
}

variable "desired_count" {
  description = "ECS service task count."
  type        = number
  default     = 1
}

variable "task_cpu" {
  type    = number
  default = 512
}

variable "task_memory" {
  type    = number
  default = 1024
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "manage_dns_in_route53" {
  description = "Create a Route53 hosted zone for the domain so ACM validation + apex/www records are terraform-managed (then delegate the registrar NS once). If false, see README for the manual external-DNS path."
  type        = bool
  default     = true
}
