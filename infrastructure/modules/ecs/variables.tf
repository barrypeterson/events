variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "task_execution_role_arn" {
  description = "ECS task execution role ARN"
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN"
  type        = string
}

variable "backend_api_cpu" {
  description = "CPU units for backend API"
  type        = number
}

variable "backend_api_memory" {
  description = "Memory for backend API (MB)"
  type        = number
}

variable "backend_api_desired_count" {
  description = "Desired count for backend API"
  type        = number
}

variable "backend_api_image" {
  description = "Docker image for backend API"
  type        = string
  default     = "nginx:latest" # Placeholder - replace with actual image
}

variable "agent_orchestrator_cpu" {
  description = "CPU units for agent orchestrator"
  type        = number
}

variable "agent_orchestrator_memory" {
  description = "Memory for agent orchestrator (MB)"
  type        = number
}

variable "agent_orchestrator_desired_count" {
  description = "Desired count for agent orchestrator"
  type        = number
}

variable "agent_orchestrator_image" {
  description = "Docker image for agent orchestrator"
  type        = string
  default     = "nginx:latest" # Placeholder - replace with actual image
}

variable "db_host" {
  description = "Database host"
  type        = string
}

variable "db_port" {
  description = "Database port"
  type        = number
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_secret_arn" {
  description = "ARN of the secret containing database credentials"
  type        = string
}

variable "redis_host" {
  description = "Redis host"
  type        = string
}

variable "redis_port" {
  description = "Redis port"
  type        = number
}

variable "alb_logs_bucket" {
  description = "S3 bucket for ALB logs"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
