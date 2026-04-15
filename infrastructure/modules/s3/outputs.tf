output "frontend_bucket_name" {
  description = "Frontend bucket name"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  description = "Frontend bucket ARN"
  value       = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_id" {
  description = "Frontend bucket ID"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_bucket_regional_domain_name" {
  description = "Frontend bucket regional domain name"
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "scraper_artifacts_bucket_name" {
  description = "Scraper artifacts bucket name"
  value       = aws_s3_bucket.scraper_artifacts.id
}

output "scraper_artifacts_bucket_arn" {
  description = "Scraper artifacts bucket ARN"
  value       = aws_s3_bucket.scraper_artifacts.arn
}

output "alb_logs_bucket_name" {
  description = "ALB logs bucket name"
  value       = aws_s3_bucket.alb_logs.id
}

output "alb_logs_bucket_arn" {
  description = "ALB logs bucket ARN"
  value       = aws_s3_bucket.alb_logs.arn
}
