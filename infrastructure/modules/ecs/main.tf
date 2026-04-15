# ECS Module - Container orchestration for backend API and agent orchestrator

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.environment == "prod" ? "enabled" : "disabled"
  }

  tags = var.tags
}

# ECS Cluster Capacity Providers (for Fargate)
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = var.environment == "prod" ? ["FARGATE", "FARGATE_SPOT"] : ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = var.environment == "prod" ? 50 : 100
    base              = 1
  }

  dynamic "default_capacity_provider_strategy" {
    for_each = var.environment == "prod" ? [1] : []
    content {
      capacity_provider = "FARGATE_SPOT"
      weight            = 50
    }
  }
}

# Security Group for ECS Tasks
resource "aws_security_group" "ecs_tasks" {
  name        = "${local.name_prefix}-ecs-tasks-sg"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

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
      Name = "${local.name_prefix}-ecs-tasks-sg"
    }
  )
}

# Security Group for ALB
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    description = "Allow HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
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
      Name = "${local.name_prefix}-alb-sg"
    }
  )
}

# Allow ALB to communicate with ECS tasks
resource "aws_security_group_rule" "ecs_tasks_from_alb" {
  type                     = "ingress"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  security_group_id        = aws_security_group.ecs_tasks.id
  description              = "Allow traffic from ALB"
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "prod"
  enable_http2              = true
  enable_cross_zone_load_balancing = true

  access_logs {
    bucket  = var.alb_logs_bucket != "" ? var.alb_logs_bucket : null
    enabled = var.alb_logs_bucket != ""
  }

  tags = merge(
    var.tags,
    {
      Name = "${local.name_prefix}-alb"
    }
  )
}

# Target Group for Backend API
resource "aws_lb_target_group" "backend_api" {
  name        = "${local.name_prefix}-backend-api-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(
    var.tags,
    {
      Name = "${local.name_prefix}-backend-api-tg"
    }
  )
}

# ALB Listener (HTTP)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend_api.arn
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "backend_api" {
  name              = "/ecs/${local.name_prefix}/backend-api"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "agent_orchestrator" {
  name              = "/ecs/${local.name_prefix}/agent-orchestrator"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = var.tags
}

# ECS Task Definition - Backend API
resource "aws_ecs_task_definition" "backend_api" {
  family                   = "${local.name_prefix}-backend-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.backend_api_cpu
  memory                   = var.backend_api_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name  = "backend-api"
      image = var.backend_api_image
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = "3000"
        },
        {
          name  = "DATABASE_HOST"
          value = var.db_host
        },
        {
          name  = "DATABASE_PORT"
          value = tostring(var.db_port)
        },
        {
          name  = "DATABASE_NAME"
          value = var.db_name
        },
        {
          name  = "REDIS_HOST"
          value = var.redis_host
        },
        {
          name  = "REDIS_PORT"
          value = tostring(var.redis_port)
        }
      ]
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${var.db_secret_arn}:database_url::"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend_api.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = var.tags
}

# ECS Service - Backend API
resource "aws_ecs_service" "backend_api" {
  name            = "${local.name_prefix}-backend-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend_api.arn
  desired_count   = var.backend_api_desired_count

  launch_type = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend_api.arn
    container_name   = "backend-api"
    container_port   = 3000
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  enable_execute_command = var.environment != "prod"

  tags = var.tags

  depends_on = [aws_lb_listener.http]
}

# Auto Scaling for Backend API
resource "aws_appautoscaling_target" "backend_api" {
  max_capacity       = var.backend_api_desired_count * 3
  min_capacity       = var.backend_api_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend_api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "backend_api_cpu" {
  name               = "${local.name_prefix}-backend-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend_api.resource_id
  scalable_dimension = aws_appautoscaling_target.backend_api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend_api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

resource "aws_appautoscaling_policy" "backend_api_memory" {
  name               = "${local.name_prefix}-backend-api-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend_api.resource_id
  scalable_dimension = aws_appautoscaling_target.backend_api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend_api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = 80.0
  }
}

# ECS Task Definition - Agent Orchestrator
resource "aws_ecs_task_definition" "agent_orchestrator" {
  family                   = "${local.name_prefix}-agent-orchestrator"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.agent_orchestrator_cpu
  memory                   = var.agent_orchestrator_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name  = "agent-orchestrator"
      image = var.agent_orchestrator_image
      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "DATABASE_HOST"
          value = var.db_host
        },
        {
          name  = "DATABASE_PORT"
          value = tostring(var.db_port)
        },
        {
          name  = "DATABASE_NAME"
          value = var.db_name
        },
        {
          name  = "REDIS_HOST"
          value = var.redis_host
        },
        {
          name  = "REDIS_PORT"
          value = tostring(var.redis_port)
        }
      ]
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${var.db_secret_arn}:database_url::"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.agent_orchestrator.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = var.tags
}

# ECS Service - Agent Orchestrator
resource "aws_ecs_service" "agent_orchestrator" {
  name            = "${local.name_prefix}-agent-orchestrator"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.agent_orchestrator.arn
  desired_count   = var.agent_orchestrator_desired_count

  launch_type = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  enable_execute_command = var.environment != "prod"

  tags = var.tags
}

# Auto Scaling for Agent Orchestrator
resource "aws_appautoscaling_target" "agent_orchestrator" {
  max_capacity       = var.agent_orchestrator_desired_count * 2
  min_capacity       = var.agent_orchestrator_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.agent_orchestrator.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "agent_orchestrator_cpu" {
  name               = "${local.name_prefix}-agent-orchestrator-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.agent_orchestrator.resource_id
  scalable_dimension = aws_appautoscaling_target.agent_orchestrator.scalable_dimension
  service_namespace  = aws_appautoscaling_target.agent_orchestrator.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

data "aws_region" "current" {}
