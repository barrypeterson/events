output "redis_endpoint" {
  description = "Redis endpoint"
  value       = var.num_cache_nodes > 1 ? aws_elasticache_replication_group.main[0].primary_endpoint_address : aws_elasticache_cluster.main[0].cache_nodes[0].address
}

output "redis_port" {
  description = "Redis port"
  value       = 6379
}

output "cluster_id" {
  description = "Redis cluster ID"
  value       = var.num_cache_nodes > 1 ? aws_elasticache_replication_group.main[0].id : aws_elasticache_cluster.main[0].id
}

output "security_group_id" {
  description = "Security group ID for Redis"
  value       = aws_security_group.redis.id
}
