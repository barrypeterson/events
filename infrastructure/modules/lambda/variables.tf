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

variable "private_subnet_ids" {
  description = "Private subnet IDs for Lambda functions"
  type        = list(string)
}

variable "lambda_role_arn" {
  description = "Lambda execution role ARN"
  type        = string
}

variable "memory_size" {
  description = "Memory size for Lambda functions (MB)"
  type        = number
}

variable "timeout" {
  description = "Timeout for Lambda functions (seconds)"
  type        = number
}

variable "scrapers" {
  description = "Map of scraper configurations"
  type = map(object({
    schedule_expression = string
    description        = string
  }))
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

variable "artifacts_bucket" {
  description = "S3 bucket for scraper artifacts"
  type        = string
}

variable "ecs_security_group_id" {
  description = "ECS security group ID for database access"
  type        = string
}

variable "dead_letter_queue_arn" {
  description = "ARN of SQS queue for failed Lambda invocations"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
