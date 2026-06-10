terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "prowork-terraform-state"
    key    = "production/terraform.tfstate"
    region = "me-central-1"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "ProWork"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

variable "aws_region" {
  default = "me-central-1"
}

variable "environment" {
  default = "production"
}

variable "app_name" {
  default = "prowork"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.21"  # pin to the 5.x line — compatible with the aws ~> 5.0 provider pin below (unpinned resolved to 6.x and broke init)

  name = "${var.app_name}-${var.environment}"
  cidr = "10.0.0.0/16"
  
  # 2-AZ (a + c). me-central-1b is dropped: CreateSubnet wedges indefinitely there for
  # this account (no subnet lands even in the default VPC), despite the AZ reporting
  # "available". 2-AZ is adequate for the interim anchor; revisit 3-AZ at the Riyadh move.
  azs             = ["${var.aws_region}a", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.103.0/24"]
  
  enable_nat_gateway = var.enable_runtime  # staged: NAT bills ~$38/mo, created at app-deploy apply
  single_nat_gateway = true                # cost-optimized: one shared NAT, not one per AZ
  
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "ecs" {
  name_prefix = "${var.app_name}-ecs-"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port       = 3010
    to_port         = 3010
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.app_name}-rds-"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  count = var.enable_runtime ? 1 : 0  # staged: billable, created at app-deploy apply

  identifier = "${var.app_name}-${var.environment}"

  engine         = "postgres"
  engine_version = "16.1"
  # Interim anchor sizing per DL-097: single-AZ db.t3.medium. Revisit (multi-AZ / larger
  # class) at the Riyadh regional move; not production-HA yet.
  instance_class = "db.t3.medium"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true

  db_name  = "prowork"
  username = "prowork"
  password = random_password.db_password.result

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 7
  skip_final_snapshot     = true  # interim anchor; flip to false before Riyadh prod cutover

  multi_az = false  # interim single-AZ; enable for prod HA at Riyadh move
}

resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"

  # Container Insights left at the account default (disabled) for the interim: the
  # "enabled" setting makes CreateCluster wedge from this environment (me-central-1
  # control-plane long-call). It also carries CloudWatch cost. Re-enable at the
  # Riyadh move (or via `aws ecs update-cluster-settings`) once runtime exists.
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.app_name}-alb-"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "main" {
  count = var.enable_runtime ? 1 : 0  # staged: billable, created at app-deploy apply

  name               = "${var.app_name}-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

resource "aws_lb_target_group" "api" {
  name        = "${var.app_name}-api-${var.environment}"
  port        = 3010
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"
  
  health_check {
    path                = "/api/admin/health"
    healthy_threshold   = 2
    unhealthy_threshold = 10
    timeout             = 5
    interval            = 30
  }
}

resource "aws_lb_listener" "http" {
  count = var.enable_runtime ? 1 : 0  # staged with the ALB

  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

output "alb_dns_name" {
  value = one(aws_lb.main[*].dns_name)
}

output "db_endpoint" {
  value     = one(aws_db_instance.main[*].endpoint)
  sensitive = true
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}
