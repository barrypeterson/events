output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = module.rds.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = module.rds.database_name
}

output "rds_secret_arn" {
  description = "ARN of the secret containing RDS credentials"
  value       = module.rds.secret_arn
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.elasticache.redis_endpoint
  sensitive   = true
}

output "redis_port" {
  description = "Redis port"
  value       = module.elasticache.redis_port
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = module.ecs.cluster_arn
}

output "backend_api_service_name" {
  description = "Backend API ECS service name"
  value       = module.ecs.backend_api_service_name
}

output "agent_orchestrator_service_name" {
  description = "Agent Orchestrator ECS service name"
  value       = module.ecs.agent_orchestrator_service_name
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.ecs.alb_dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID"
  value       = module.ecs.alb_zone_id
}

output "alb_url" {
  description = "ALB URL"
  value       = "http://${module.ecs.alb_dns_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront.domain_name
}

output "cloudfront_url" {
  description = "CloudFront URL"
  value       = "https://${module.cloudfront.domain_name}"
}

output "s3_frontend_bucket" {
  description = "S3 bucket for frontend assets"
  value       = module.s3.frontend_bucket_name
}

output "s3_scraper_artifacts_bucket" {
  description = "S3 bucket for scraper artifacts"
  value       = module.s3.scraper_artifacts_bucket_name
}

output "lambda_function_names" {
  description = "Lambda function names"
  value       = module.lambda.function_names
}

output "lambda_function_arns" {
  description = "Lambda function ARNs"
  value       = module.lambda.function_arns
}

output "monitoring_dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = module.monitoring.dashboard_url
}

output "sns_topic_arn" {
  description = "SNS topic ARN for alarms"
  value       = module.monitoring.sns_topic_arn
}

# Deployment Information
output "deployment_info" {
  description = "Deployment information"
  value = {
    environment         = var.environment
    region             = var.region
    cloudfront_url     = "https://${module.cloudfront.domain_name}"
    alb_url            = "http://${module.ecs.alb_dns_name}"
    database_endpoint  = module.rds.endpoint
    redis_endpoint     = module.elasticache.redis_endpoint
    ecs_cluster        = module.ecs.cluster_name
    frontend_bucket    = module.s3.frontend_bucket_name
    lambda_functions   = module.lambda.function_names
  }
}
