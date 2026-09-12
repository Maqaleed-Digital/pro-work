# WO-WC-DEPLOY-001 — runtime security groups (correct rules, self-contained).
# (The foundation also has prowork-alb/ecs/rds SGs; these runtime SGs carry the
#  exact rules this tier needs so the plan is fully reasoned about in one place.)

resource "aws_security_group" "alb" {
  name        = "workcaptain-runtime-alb"
  description = "WorkCaptain ALB: public 80/443 in"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP (redirected to HTTPS)"
    from_port   = 80
    to_port     = 80
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

resource "aws_security_group" "ecs" {
  name        = "workcaptain-runtime-ecs"
  description = "WorkCaptain app tasks: only ALB may reach the app port"
  vpc_id      = var.vpc_id

  ingress {
    description     = "app port from ALB only"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    description = "outbound (ECR pull, secrets, RDS)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name        = "workcaptain-runtime-rds"
  description = "WorkCaptain RDS: only app tasks may reach 5432"
  vpc_id      = var.vpc_id

  ingress {
    description     = "postgres from app tasks only"
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
