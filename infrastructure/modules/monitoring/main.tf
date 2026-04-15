# Monitoring Module - CloudWatch dashboards and alarms

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# SNS Topic for Alarms
resource "aws_sns_topic" "alarms" {
  name = "${local.name_prefix}-alarms"

  tags = var.tags
}

# SNS Topic Subscription
resource "aws_sns_topic_subscription" "email" {
  count = var.alarm_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      # ECS Service CPU and Memory
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", var.backend_api_service_name, "ClusterName", var.ecs_cluster_name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "Backend API - CPU & Memory"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", var.agent_orchestrator_service_name, "ClusterName", var.ecs_cluster_name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "Agent Orchestrator - CPU & Memory"
        }
      },
      # ALB Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix],
            [".", "RequestCount", ".", "."],
            [".", "HTTPCode_Target_4XX_Count", ".", "."],
            [".", "HTTPCode_Target_5XX_Count", ".", "."],
          ]
          period = 300
          stat   = "Sum"
          region = var.region
          title  = "ALB Metrics"
        }
      },
      # RDS Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.rds_instance_id],
            [".", "DatabaseConnections", ".", "."],
            [".", "FreeableMemory", ".", "."],
            [".", "FreeStorageSpace", ".", "."],
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "RDS Metrics"
        }
      },
      # ElastiCache Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", var.redis_cluster_id],
            [".", "DatabaseMemoryUsagePercentage", ".", "."],
            [".", "NetworkBytesIn", ".", "."],
            [".", "NetworkBytesOut", ".", "."],
          ]
          period = 300
          stat   = "Average"
          region = var.region
          title  = "Redis Metrics"
        }
      },
      # Lambda Metrics
      {
        type = "metric"
        properties = {
          metrics = concat(
            [for name in values(var.lambda_function_names) : ["AWS/Lambda", "Invocations", "FunctionName", name]],
            [for name in values(var.lambda_function_names) : ["AWS/Lambda", "Errors", "FunctionName", name]],
            [for name in values(var.lambda_function_names) : ["AWS/Lambda", "Duration", "FunctionName", name]]
          )
          period = 300
          stat   = "Sum"
          region = var.region
          title  = "Lambda Scrapers"
        }
      },
      # CloudFront Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/CloudFront", "Requests", "DistributionId", var.cloudfront_distribution_id],
            [".", "BytesDownloaded", ".", "."],
            [".", "4xxErrorRate", ".", "."],
            [".", "5xxErrorRate", ".", "."],
          ]
          period = 300
          stat   = "Sum"
          region = "us-east-1"
          title  = "CloudFront Metrics"
        }
      }
    ]
  })
}

# Composite Alarm for Critical System Health
resource "aws_cloudwatch_composite_alarm" "critical_system_health" {
  count = var.environment == "prod" ? 1 : 0

  alarm_name          = "${local.name_prefix}-critical-system-health"
  alarm_description   = "Composite alarm for critical system health issues"
  actions_enabled     = true
  alarm_actions       = [aws_sns_topic.alarms.arn]

  alarm_rule = "ALARM(${aws_cloudwatch_metric_alarm.ecs_backend_api_cpu.alarm_name}) OR ALARM(${aws_cloudwatch_metric_alarm.rds_cpu.alarm_name}) OR ALARM(${aws_cloudwatch_metric_alarm.rds_storage.alarm_name})"

  tags = var.tags
}

# ECS Service Alarms
resource "aws_cloudwatch_metric_alarm" "ecs_backend_api_cpu" {
  alarm_name          = "${local.name_prefix}-ecs-backend-api-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Backend API ECS service high CPU"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ServiceName = var.backend_api_service_name
    ClusterName = var.ecs_cluster_name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_backend_api_memory" {
  alarm_name          = "${local.name_prefix}-ecs-backend-api-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "85"
  alarm_description   = "Backend API ECS service high memory"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    ServiceName = var.backend_api_service_name
    ClusterName = var.ecs_cluster_name
  }

  tags = var.tags
}

# ALB Alarms
resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  alarm_name          = "${local.name_prefix}-alb-high-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "ALB high 5xx error count"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_targets" {
  alarm_name          = "${local.name_prefix}-alb-unhealthy-targets"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "ALB has unhealthy targets"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  alarm_name          = "${local.name_prefix}-alb-high-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "2"
  alarm_description   = "ALB high response time"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  tags = var.tags
}

# RDS Alarms
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name_prefix}-rds-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "RDS high CPU utilization"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.name_prefix}-rds-low-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "10737418240" # 10 GB
  alarm_description   = "RDS low storage space"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name_prefix}-rds-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "RDS high database connections"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  tags = var.tags
}

# ElastiCache Alarms
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${local.name_prefix}-redis-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "Redis high CPU utilization"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    CacheClusterId = var.redis_cluster_id
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
  alarm_description   = "Redis high memory usage"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  tags = var.tags
}

# Lambda Alarms (aggregated)
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.lambda_function_names

  alarm_name          = "${local.name_prefix}-lambda-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Lambda scraper ${each.key} has errors"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = each.value
  }

  tags = var.tags
}

# Log Metric Filters (for application-level errors)
resource "aws_cloudwatch_log_metric_filter" "application_errors" {
  name           = "${local.name_prefix}-application-errors"
  log_group_name = "/ecs/${local.name_prefix}/backend-api"
  pattern        = "[time, request_id, level = ERROR*, ...]"

  metric_transformation {
    name      = "ApplicationErrors"
    namespace = "${local.name_prefix}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "application_errors" {
  alarm_name          = "${local.name_prefix}-application-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ApplicationErrors"
  namespace           = "${local.name_prefix}"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "High application error rate"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  tags = var.tags
}
