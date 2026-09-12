# WO-WC-DEPLOY-001 — read the EXISTING foundation (reuse, never recreate).

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_vpc" "prowork" {
  id = var.vpc_id
}

# Foundation subnets are tagged prowork-production-{public,private}-<az>.
data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
  filter {
    name   = "tag:Name"
    values = ["prowork-production-public-*"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
  filter {
    name   = "tag:Name"
    values = ["prowork-production-private-*"]
  }
}

# Existing ECR repo (image is built/pushed here before apply).
data "aws_ecr_repository" "prowork" {
  name = "prowork-production"
}
