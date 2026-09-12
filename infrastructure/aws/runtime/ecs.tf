# WO-WC-DEPLOY-001 — ECS Fargate cluster, task definition, service.
# Tasks run in PUBLIC subnets with a public IP so they pull from ECR via the IGW
# (no NAT exists in the foundation). They are NOT publicly reachable: the ECS SG
# only admits the app port from the ALB SG. (Private subnets + VPC endpoints is the
# more-locked-down alternative — see README.)

resource "aws_ecs_cluster" "main" {
  name = "workcaptain-production"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/workcaptain"
  retention_in_days = 30
}

# --- IAM: execution role (pull image, write logs, read the two secrets) --------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "workcaptain-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "secrets_read" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.database_url.arn, aws_secretsmanager_secret.admin_api_token.arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "read-runtime-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.secrets_read.json
}

resource "aws_iam_role" "task" {
  name               = "workcaptain-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# --- Task definition -----------------------------------------------------------
resource "aws_ecs_task_definition" "app" {
  family                   = "workcaptain"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "workcaptain"
      image     = "${data.aws_ecr_repository.prowork.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [{ containerPort = var.app_port, protocol = "tcp" }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "APP_PORT", value = tostring(var.app_port) },
        { name = "PORT", value = tostring(var.app_port) },
        { name = "PUBLIC_BASE_URL", value = "https://${var.domain_name}" },
        { name = "CORS_ALLOWED_ORIGINS", value = "https://${var.domain_name}" },
        { name = "PROWORK_DATA_DIR", value = "/data" },
        # G5: payments stay SANDBOX. This deploy makes the SITE reachable; it does
        # NOT enable live payments (no HYPERPAY_MODE=production, no live creds).
        { name = "HYPERPAY_MODE", value = "sandbox" },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "ADMIN_API_TOKEN", valueFrom = aws_secretsmanager_secret.admin_api_token.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }
    }
  ])
}

# --- Service -------------------------------------------------------------------
resource "aws_ecs_service" "app" {
  name            = "workcaptain"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.public.ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "workcaptain"
    container_port   = var.app_port
  }

  depends_on = [aws_lb_listener.https]
}
