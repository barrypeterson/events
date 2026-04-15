variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "slo-events"
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class per environment"
  type        = map(string)
  default = {
    dev     = "db.t4g.micro"
    staging = "db.t4g.small"
    prod    = "db.r6g.large"
  }
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS (GB)"
  type        = map(number)
  default = {
    dev     = 20
    staging = 50
    prod    = 200
  }
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "sloevents"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "sloadmin"
  sensitive   = true
}

variable "db_backup_retention_period" {
  description = "Database backup retention period in days"
  type        = map(number)
  default = {
    dev     = 7
    staging = 14
    prod    = 30
  }
}

# ElastiCache Configuration
variable "redis_node_type" {
  description = "Redis node type per environment"
  type        = map(string)
  default = {
    dev     = "cache.t4g.micro"
    staging = "cache.t4g.small"
    prod    = "cache.r6g.large"
  }
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = map(number)
  default = {
    dev     = 1
    staging = 2
    prod    = 3
  }
}

# ECS Configuration
variable "backend_api_cpu" {
  description = "CPU units for backend API task"
  type        = map(number)
  default = {
    dev     = 256
    staging = 512
    prod    = 1024
  }
}

variable "backend_api_memory" {
  description = "Memory for backend API task (MB)"
  type        = map(number)
  default = {
    dev     = 512
    staging = 1024
    prod    = 2048
  }
}

variable "backend_api_desired_count" {
  description = "Desired number of backend API tasks"
  type        = map(number)
  default = {
    dev     = 1
    staging = 2
    prod    = 3
  }
}

variable "agent_orchestrator_cpu" {
  description = "CPU units for agent orchestrator task"
  type        = map(number)
  default = {
    dev     = 256
    staging = 512
    prod    = 1024
  }
}

variable "agent_orchestrator_memory" {
  description = "Memory for agent orchestrator task (MB)"
  type        = map(number)
  default = {
    dev     = 512
    staging = 1024
    prod    = 2048
  }
}

variable "agent_orchestrator_desired_count" {
  description = "Desired number of agent orchestrator tasks"
  type        = map(number)
  default = {
    dev     = 1
    staging = 1
    prod    = 2
  }
}

# Lambda Configuration
variable "lambda_memory_size" {
  description = "Memory size for Lambda functions (MB)"
  type        = map(number)
  default = {
    dev     = 512
    staging = 1024
    prod    = 2048
  }
}

variable "lambda_timeout" {
  description = "Lambda function timeout (seconds)"
  type        = number
  default     = 300
}

# Scraper Configuration
variable "scrapers" {
  description = "List of scraper configurations"
  type = map(object({
    schedule_expression = string
    description        = string
  }))
  default = {
    "fotmob" = {
      schedule_expression = "rate(5 minutes)"
      description        = "FotMob scores scraper"
    }
    "espn" = {
      schedule_expression = "rate(5 minutes)"
      description        = "ESPN scores scraper"
    }
    "livescore" = {
      schedule_expression = "rate(5 minutes)"
      description        = "LiveScore scraper"
    }
    "onefootball" = {
      schedule_expression = "rate(5 minutes)"
      description        = "OneFootball scraper"
    }
    "mlssoccer" = {
      schedule_expression = "rate(5 minutes)"
      description        = "MLSSoccer.com scraper"
    }
  }
}

# CloudFront Configuration
variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = map(string)
  default = {
    dev     = "PriceClass_100"
    staging = "PriceClass_200"
    prod    = "PriceClass_All"
  }
}

# Domain Configuration
variable "domain_name" {
  description = "Domain name for the application (optional)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for CloudFront (must be in us-east-1)"
  type        = string
  default     = ""
}

# Monitoring Configuration
variable "alarm_email" {
  description = "Email address for CloudWatch alarms"
  type        = string
  default     = ""
}

variable "enable_waf" {
  description = "Enable WAF for CloudFront"
  type        = bool
  default     = true
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
