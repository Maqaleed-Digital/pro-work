# WO-WC-DEPLOY-001 — WorkCaptain runtime tier (me-central-1).
# PLAN ONLY in this WO. terraform apply is Sponsor-gated (EA-001/DL-078).
#
# Stands up the runtime tier (ECS service + ALB + ACM/HTTPS + RDS) on the EXISTING
# $0-idle networking foundation (vpc-0c14a4f250b918527 / prowork-production). The
# us-east-1 scaffold at infrastructure/aws/main.tf is DISCARDED — not used here.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # Local state for plan review; a remote backend (S3+DynamoDB) is wired at apply.
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  default_tags {
    tags = {
      Project   = "workcaptain"
      ManagedBy = "terraform"
      Tier      = "runtime"
      WO        = "WO-WC-DEPLOY-001"
    }
  }
}
