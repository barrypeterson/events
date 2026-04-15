# ElastiCache Module - Redis cluster

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# Subnet Group for ElastiCache
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(
    var.tags,
    {
      Name = "${local.name_prefix}-redis-subnet-group"
    }
  )
}

# Parameter Group for Redis
resource "aws_elasticache_parameter_group" "main" {
  name   = "${local.name_prefix}-redis7-params"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = var.tags
}

# Security Group for Redis
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.allowed_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    var.tags,
    {
      Name = "${local.name_prefix}-redis-sg"
    }
  )
}

# Redis Replication Group (for multi-AZ with automatic failover)
resource "aws_elasticache_replication_group" "main" {
  count = var.num_cache_nodes > 1 ? 1 : 0

  replication_group_id       = "${local.name_prefix}-redis"
  replication_group_description = "Redis cluster for ${local.name_prefix}"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.main.name

  num_cache_clusters = var.num_cache_nodes

  # Multi-AZ with automatic failover
  automatic_failover_enabled = true
  multi_az_enabled          = true

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled        = false # Set to true if you need password authentication

  # Maintenance and backup
  maintenance_window         = "sun:05:00-sun:06:00"
  snapshot_window           = "03:00-04:00"
  snapshot_retention_limit  = var.environment == "prod" ? 7 : 1

  # Auto minor version upgrade
  auto_minor_version_upgrade = true

  # Notifications
  notification_topic_arn = var.sns_topic_arn != "" ? var.sns_topic_arn : null

  tags = merge(
    var.tags,
    {
      Name = "${local.name_prefix}-redis"
    }
  )

  lifecycle {
    ignore_changes = [engine_version]
  }
}

# Single Redis Cluster (for dev environment)
resource "aws_elasticache_cluster" "main" {
  count = var.num_cache_nodes == 1 ? 1 : 0

  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.main.name
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Maintenance and backup
  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_window         = "03:00-04:00"
  snapshot_retention_limit = 1

  tags = merge(
    var.tags,
    {
      Name = "${local.name_prefix}-redis"
    }
  )

  lifecycle {
    ignore_changes = [engine_version]
  }
}

# CloudWatch alarms
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name_prefix}-redis-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors Redis CPU utilization"

  dimensions = {
    CacheClusterId = var.num_cache_nodes > 1 ? aws_elasticache_replication_group.main[0].id : aws_elasticache_cluster.main[0].id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${local.name_prefix}-redis-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis memory usage"

  dimensions = {
    CacheClusterId = var.num_cache_nodes > 1 ? aws_elasticache_replication_group.main[0].id : aws_elasticache_cluster.main[0].id
  }

  tags = var.tags
}
