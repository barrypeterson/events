output "function_names" {
  description = "Map of Lambda function names"
  value       = { for k, v in aws_lambda_function.scrapers : k => v.function_name }
}

output "function_arns" {
  description = "Map of Lambda function ARNs"
  value       = { for k, v in aws_lambda_function.scrapers : k => v.arn }
}

output "function_invoke_arns" {
  description = "Map of Lambda function invoke ARNs"
  value       = { for k, v in aws_lambda_function.scrapers : k => v.invoke_arn }
}

output "security_group_id" {
  description = "Lambda security group ID"
  value       = aws_security_group.lambda.id
}

output "log_group_names" {
  description = "Map of CloudWatch log group names"
  value       = { for k, v in aws_cloudwatch_log_group.scrapers : k => v.name }
}
