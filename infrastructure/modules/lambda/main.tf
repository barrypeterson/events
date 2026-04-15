# Lambda Module - Scraper functions with EventBridge scheduling

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# Security Group for Lambda functions
resource "aws_security_group" "lambda" {
  name        = "${local.name_prefix}-lambda-sg"
  description = "Security group for Lambda functions"
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
      Name = "${local.name_prefix}-lambda-sg"
    }
  )
}

# CloudWatch Log Groups for Lambda functions
resource "aws_cloudwatch_log_group" "scrapers" {
  for_each = var.scrapers

  name              = "/aws/lambda/${local.name_prefix}-scraper-${each.key}"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = var.tags
}

# Lambda Layer for shared dependencies (optional)
# Note: You would need to create and upload the layer package separately
# resource "aws_lambda_layer_version" "scraper_deps" {
#   filename   = "lambda-layer.zip"
#   layer_name = "${local.name_prefix}-scraper-deps"
#   compatible_runtimes = ["nodejs20.x"]
# }

# Lambda Functions for each scraper
resource "aws_lambda_function" "scrapers" {
  for_each = var.scrapers

  function_name = "${local.name_prefix}-scraper-${each.key}"
  role          = var.lambda_role_arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"

  # Placeholder code - replace with actual deployment package
  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  memory_size = var.memory_size
  timeout     = var.timeout

  environment {
    variables = {
      NODE_ENV         = var.environment
      SCRAPER_TYPE     = each.key
      DATABASE_HOST    = var.db_host
      DATABASE_PORT    = tostring(var.db_port)
      DATABASE_NAME    = var.db_name
      DB_SECRET_ARN    = var.db_secret_arn
      ARTIFACTS_BUCKET = var.artifacts_bucket
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id, var.ecs_security_group_id]
  }

  # layers = [aws_lambda_layer_version.scraper_deps.arn]

  tags = merge(
    var.tags,
    {
      Name        = "${local.name_prefix}-scraper-${each.key}"
      ScraperType = each.key
    }
  )

  depends_on = [aws_cloudwatch_log_group.scrapers]
}

# Placeholder Lambda code (creates empty zip file)
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda_placeholder.zip"

  source {
    content  = <<-EOF
      exports.handler = async (event) => {
        console.log('Placeholder Lambda function - replace with actual code');
        return { statusCode: 200, body: 'OK' };
      };
    EOF
    filename = "index.js"
  }
}

# EventBridge Rules for scheduling
resource "aws_cloudwatch_event_rule" "scraper_schedules" {
  for_each = var.scrapers

  name                = "${local.name_prefix}-scraper-${each.key}-schedule"
  description         = each.value.description
  schedule_expression = each.value.schedule_expression

  tags = var.tags
}

# EventBridge Targets
resource "aws_cloudwatch_event_target" "scraper_targets" {
  for_each = var.scrapers

  rule      = aws_cloudwatch_event_rule.scraper_schedules[each.key].name
  target_id = "lambda"
  arn       = aws_lambda_function.scrapers[each.key].arn
}

# Lambda permissions for EventBridge
resource "aws_lambda_permission" "allow_eventbridge" {
  for_each = var.scrapers

  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scrapers[each.key].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scraper_schedules[each.key].arn
}

# CloudWatch Alarms for Lambda errors
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.scrapers

  alarm_name          = "${local.name_prefix}-scraper-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Alert when Lambda function has errors"

  dimensions = {
    FunctionName = aws_lambda_function.scrapers[each.key].function_name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  for_each = var.scrapers

  alarm_name          = "${local.name_prefix}-scraper-${each.key}-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alert when Lambda function is throttled"

  dimensions = {
    FunctionName = aws_lambda_function.scrapers[each.key].function_name
  }

  tags = var.tags
}

# Lambda Insights (for production)
resource "aws_lambda_function_event_invoke_config" "scrapers" {
  for_each = var.environment == "prod" ? var.scrapers : {}

  function_name = aws_lambda_function.scrapers[each.key].function_name

  maximum_retry_attempts = 1
  maximum_event_age_in_seconds = 3600

  destination_config {
    on_failure {
      destination = var.dead_letter_queue_arn != "" ? var.dead_letter_queue_arn : null
    }
  }
}
