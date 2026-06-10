# ElastiCache for Redis — replaces the redis:7-alpine container from the local
# docker-compose stack with a managed in-region cache. Interim single-node sizing
# (no replica / no automatic failover) for the me-central-1 anchor; promote to a
# replication group with failover at the Riyadh prod move.

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.app_name}-redis-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Redis from ECS tasks only"
    from_port       = 6379
    to_port         = 6379
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

resource "aws_elasticache_cluster" "main" {
  count = var.enable_runtime ? 1 : 0  # staged: billable, created at app-deploy apply

  cluster_id           = "${var.app_name}-${var.environment}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]
}

output "redis_endpoint" {
  value = var.enable_runtime ? "${aws_elasticache_cluster.main[0].cache_nodes[0].address}:${aws_elasticache_cluster.main[0].cache_nodes[0].port}" : null
}
