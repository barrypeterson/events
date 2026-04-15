output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "backend_api_service_name" {
  description = "Backend API service name"
  value       = aws_ecs_service.backend_api.name
}

output "backend_api_service_arn" {
  description = "Backend API service ARN"
  value       = aws_ecs_service.backend_api.id
}

output "agent_orchestrator_service_name" {
  description = "Agent Orchestrator service name"
  value       = aws_ecs_service.agent_orchestrator.name
}

output "agent_orchestrator_service_arn" {
  description = "Agent Orchestrator service ARN"
  value       = aws_ecs_service.agent_orchestrator.id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID"
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metrics"
  value       = aws_lb.main.arn_suffix
}

output "target_group_arn" {
  description = "Target group ARN"
  value       = aws_lb_target_group.backend_api.arn
}

output "target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch metrics"
  value       = aws_lb_target_group.backend_api.arn_suffix
}

output "ecs_security_group_id" {
  description = "ECS tasks security group ID"
  value       = aws_security_group.ecs_tasks.id
}

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}
