# Main Terraform configuration for SLO Events Platform
# This file orchestrates all modules to create the complete infrastructure

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.additional_tags
  )
}

# VPC Module - Creates networking foundation
module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  tags               = local.common_tags
}

# IAM Module - Creates all IAM roles and policies
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
  region       = var.region
  tags         = local.common_tags
}

# RDS Module - PostgreSQL database with pgvector
module "rds" {
  source = "./modules/rds"

  project_name              = var.project_name
  environment               = var.environment
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  db_name                   = var.db_name
  db_username               = var.db_username
  instance_class            = var.db_instance_class[var.environment]
  allocated_storage         = var.db_allocated_storage[var.environment]
  backup_retention_period   = var.db_backup_retention_period[var.environment]
  allowed_security_group_id = module.ecs.ecs_security_group_id
  tags                      = local.common_tags

  depends_on = [module.vpc]
}

# ElastiCache Module - Redis cluster
module "elasticache" {
  source = "./modules/elasticache"

  project_name              = var.project_name
  environment               = var.environment
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  node_type                 = var.redis_node_type[var.environment]
  num_cache_nodes           = var.redis_num_cache_nodes[var.environment]
  allowed_security_group_id = module.ecs.ecs_security_group_id
  tags                      = local.common_tags

  depends_on = [module.vpc]
}

# S3 Module - Storage buckets
module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
  region       = var.region
  tags         = local.common_tags
}

# ECS Module - Container orchestration
module "ecs" {
  source = "./modules/ecs"

  project_name               = var.project_name
  environment                = var.environment
  vpc_id                     = module.vpc.vpc_id
  public_subnet_ids          = module.vpc.public_subnet_ids
  private_subnet_ids         = module.vpc.private_subnet_ids
  backend_api_cpu            = var.backend_api_cpu[var.environment]
  backend_api_memory         = var.backend_api_memory[var.environment]
  backend_api_desired_count  = var.backend_api_desired_count[var.environment]
  agent_orchestrator_cpu     = var.agent_orchestrator_cpu[var.environment]
  agent_orchestrator_memory  = var.agent_orchestrator_memory[var.environment]
  agent_orchestrator_desired_count = var.agent_orchestrator_desired_count[var.environment]

  # Task execution role
  task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  task_role_arn          = module.iam.ecs_task_role_arn

  # Database connection
  db_host     = module.rds.endpoint
  db_port     = module.rds.port
  db_name     = module.rds.database_name
  db_secret_arn = module.rds.secret_arn

  # Redis connection
  redis_host = module.elasticache.redis_endpoint
  redis_port = module.elasticache.redis_port

  tags = local.common_tags

  depends_on = [module.vpc, module.rds, module.elasticache, module.iam]
}

# Lambda Module - Scraper functions
module "lambda" {
  source = "./modules/lambda"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  lambda_role_arn     = module.iam.lambda_execution_role_arn
  memory_size         = var.lambda_memory_size[var.environment]
  timeout             = var.lambda_timeout
  scrapers            = var.scrapers

  # Database connection
  db_host       = module.rds.endpoint
  db_port       = module.rds.port
  db_name       = module.rds.database_name
  db_secret_arn = module.rds.secret_arn

  # S3 bucket for artifacts
  artifacts_bucket = module.s3.scraper_artifacts_bucket_name

  # Security group for Lambda
  ecs_security_group_id = module.ecs.ecs_security_group_id

  tags = local.common_tags

  depends_on = [module.vpc, module.rds, module.s3, module.iam]
}

# CloudFront Module - CDN and API gateway
module "cloudfront" {
  source = "./modules/cloudfront"

  project_name        = var.project_name
  environment         = var.environment
  frontend_bucket_id  = module.s3.frontend_bucket_id
  frontend_bucket_arn = module.s3.frontend_bucket_arn
  frontend_bucket_regional_domain_name = module.s3.frontend_bucket_regional_domain_name
  alb_dns_name        = module.ecs.alb_dns_name
  price_class         = var.cloudfront_price_class[var.environment]
  domain_name         = var.domain_name
  acm_certificate_arn = var.acm_certificate_arn
  enable_waf          = var.enable_waf
  tags                = local.common_tags

  depends_on = [module.s3, module.ecs]
}

# Monitoring Module - CloudWatch dashboards and alarms
module "monitoring" {
  source = "./modules/monitoring"

  project_name                     = var.project_name
  environment                      = var.environment
  region                           = var.region
  alarm_email                      = var.alarm_email

  # ECS resources
  ecs_cluster_name                 = module.ecs.cluster_name
  backend_api_service_name         = module.ecs.backend_api_service_name
  agent_orchestrator_service_name  = module.ecs.agent_orchestrator_service_name
  alb_arn_suffix                   = module.ecs.alb_arn_suffix
  target_group_arn_suffix          = module.ecs.target_group_arn_suffix

  # RDS resources
  rds_instance_id                  = module.rds.instance_id

  # ElastiCache resources
  redis_cluster_id                 = module.elasticache.cluster_id

  # Lambda resources
  lambda_function_names            = module.lambda.function_names

  # CloudFront resources
  cloudfront_distribution_id       = module.cloudfront.distribution_id

  tags = local.common_tags

  depends_on = [module.ecs, module.rds, module.elasticache, module.lambda, module.cloudfront]
}
