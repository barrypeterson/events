# SLO Events Platform - AWS Infrastructure

Complete Terraform infrastructure for deploying the SLO Events Platform on AWS.

## Architecture Overview

```
                                    ┌─────────────────────┐
                                    │   CloudFront CDN    │
                                    │   + WAF Protection  │
                                    └──────────┬──────────┘
                                               │
                        ┌──────────────────────┴──────────────────────┐
                        │                                              │
                ┌───────▼────────┐                          ┌─────────▼────────┐
                │   S3 Bucket    │                          │  Application     │
                │  (Frontend)    │                          │  Load Balancer   │
                └────────────────┘                          └─────────┬────────┘
                                                                      │
                                                            ┌─────────▼─────────┐
                                                            │   ECS Cluster     │
                                                            │                   │
                                                            │  ┌─────────────┐  │
                                                            │  │ Backend API │  │
                                                            │  │  (Fargate)  │  │
                                                            │  └──────┬──────┘  │
                                                            │         │         │
                                                            │  ┌──────▼──────┐  │
                                                            │  │   Agent     │  │
                                                            │  │Orchestrator │  │
                                                            │  └──────┬──────┘  │
                                                            └─────────┼─────────┘
                                                                      │
                        ┌─────────────────────────────────────────────┼─────────────┐
                        │                                             │             │
                ┌───────▼────────┐                ┌──────────────────▼───┐ ┌───────▼────────┐
                │  RDS PostgreSQL│                │  ElastiCache Redis   │ │  Lambda        │
                │  (pgvector)    │                │  (Multi-AZ)          │ │  Scrapers (5)  │
                │  (Multi-AZ)    │                └──────────────────────┘ └───────┬────────┘
                └────────────────┘                                                  │
                                                                           ┌────────▼────────┐
                                                                           │   S3 Bucket     │
                                                                           │   (Artifacts)   │
                                                                           └─────────────────┘

                        ┌───────────────────────────────────────────────────────┐
                        │              Monitoring & Logging                      │
                        │  CloudWatch Dashboards | Alarms | Logs | SNS Alerts  │
                        └───────────────────────────────────────────────────────┘
```

## Infrastructure Components

### Networking (VPC Module)
- **VPC**: Multi-AZ VPC with CIDR 10.0.0.0/16
- **Subnets**:
  - 3 Public subnets (one per AZ)
  - 3 Private subnets (one per AZ)
- **NAT Gateways**:
  - Single NAT for dev/staging
  - Multi-AZ NAT for production
- **VPC Endpoints**: S3 endpoint for cost optimization
- **Flow Logs**: Enabled for production environments

### Compute (ECS Module)
- **ECS Cluster**: Fargate-based container orchestration
- **Services**:
  - Backend API (3000 port, ALB integrated)
  - Agent Orchestrator (background worker)
- **Auto Scaling**: CPU and memory-based scaling policies
- **Capacity Providers**: Mix of Fargate and Fargate Spot (prod)

### Database (RDS Module)
- **Engine**: PostgreSQL 16.6 with pgvector extension
- **Multi-AZ**: Enabled for production
- **Backups**: Automated daily backups (7-30 days retention)
- **Encryption**: At-rest encryption enabled
- **Performance Insights**: Enabled for production
- **Instance Classes**:
  - Dev: db.t4g.micro
  - Staging: db.t4g.small
  - Prod: db.r6g.large

### Caching (ElastiCache Module)
- **Engine**: Redis 7.1
- **Multi-AZ**: Automatic failover for production
- **Encryption**: At-rest and in-transit encryption
- **Nodes**:
  - Dev: 1 node (cache.t4g.micro)
  - Staging: 2 nodes (cache.t4g.small)
  - Prod: 3 nodes (cache.r6g.large)

### Storage (S3 Module)
- **Frontend Bucket**: Static website hosting
- **Scraper Artifacts**: Raw data storage with lifecycle policies
- **ALB Logs**: Access logs for load balancer
- **Encryption**: AES256 server-side encryption
- **Versioning**: Enabled on all buckets
- **Lifecycle Policies**: Automated transition to cheaper storage classes

### CDN (CloudFront Module)
- **Distribution**: Global CDN with custom domain support
- **Origins**:
  - S3 for frontend static assets
  - ALB for API requests
- **Caching**: Optimized cache behaviors for API and static content
- **SSL**: ACM certificate support
- **WAF**: Rate limiting and AWS managed rules
- **Security**: Origin Access Control for S3

### Serverless (Lambda Module)
- **Functions**: 5 scraper functions (FotMob, ESPN, LiveScore, OneFootball, MLSSoccer)
- **Runtime**: Node.js 20.x
- **VPC Integration**: Private subnet deployment for database access
- **Scheduling**: EventBridge rules for periodic execution (5 min intervals)
- **Memory**: 512MB-2GB based on environment
- **Timeout**: 300 seconds

### IAM (IAM Module)
- **ECS Task Execution Role**: Pull images, read secrets
- **ECS Task Role**: Application-level permissions (S3, CloudWatch)
- **Lambda Execution Role**: VPC, database, S3 access
- **Least Privilege**: Scoped permissions per service

### Monitoring (Monitoring Module)
- **CloudWatch Dashboard**: Unified view of all metrics
- **Alarms**:
  - ECS: High CPU/memory
  - ALB: High error rates, unhealthy targets
  - RDS: High CPU, low storage, high connections
  - Redis: High CPU/memory
  - Lambda: Errors and throttling
  - CloudFront: High error rates
- **SNS Notifications**: Email alerts for critical issues
- **Log Groups**: Centralized logging for all services

## Prerequisites

1. **AWS Account**: Active AWS account with appropriate permissions
2. **Terraform**: Version >= 1.6.0
3. **AWS CLI**: Configured with credentials
4. **S3 Backend**: State storage bucket (see backend.tf)
5. **Docker Images**: Backend API and Agent Orchestrator images pushed to ECR

## Deployment Instructions

### Step 1: Initial Setup

```bash
# Clone the repository
cd infrastructure/

# Create terraform.tfvars from example
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values
vim terraform.tfvars
```

### Step 2: Configure State Backend

```bash
# Create S3 bucket for Terraform state
export ENVIRONMENT=dev  # or staging/prod
aws s3 mb s3://slo-events-terraform-state-${ENVIRONMENT} --region us-west-2

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket slo-events-terraform-state-${ENVIRONMENT} \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket slo-events-terraform-state-${ENVIRONMENT} \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name slo-events-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-west-2
```

### Step 3: Initialize Terraform

```bash
# Initialize with backend configuration
terraform init \
  -backend-config="bucket=slo-events-terraform-state-${ENVIRONMENT}" \
  -backend-config="key=infrastructure/terraform.tfstate" \
  -backend-config="region=us-west-2" \
  -backend-config="encrypt=true" \
  -backend-config="dynamodb_table=slo-events-terraform-locks"
```

### Step 4: Plan and Apply

```bash
# Review the plan
terraform plan -var-file=terraform.tfvars

# Apply the infrastructure
terraform apply -var-file=terraform.tfvars

# Save outputs
terraform output -json > outputs.json
```

### Step 5: Deploy Application

```bash
# Build and push Docker images to ECR
# (Adjust image URIs in ECS module variables)

# Update ECS services with new task definitions
aws ecs update-service \
  --cluster slo-events-${ENVIRONMENT}-cluster \
  --service slo-events-${ENVIRONMENT}-backend-api \
  --force-new-deployment

aws ecs update-service \
  --cluster slo-events-${ENVIRONMENT}-cluster \
  --service slo-events-${ENVIRONMENT}-agent-orchestrator \
  --force-new-deployment
```

### Step 6: Deploy Lambda Functions

```bash
# Package and deploy Lambda functions
cd ../apps/scrapers/
npm run build

# Update Lambda functions
for scraper in fotmob espn livescore onefootball mlssoccer; do
  zip -r ${scraper}.zip dist/
  aws lambda update-function-code \
    --function-name slo-events-${ENVIRONMENT}-scraper-${scraper} \
    --zip-file fileb://${scraper}.zip
done
```

### Step 7: Deploy Frontend

```bash
# Build frontend
cd ../web/
npm run build

# Sync to S3
aws s3 sync dist/ s3://slo-events-${ENVIRONMENT}-frontend-$(aws sts get-caller-identity --query Account --output text)/

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"
```

## Environment Configuration

### Development (dev)
```hcl
environment = "dev"
db_instance_class = "db.t4g.micro"
redis_node_type = "cache.t4g.micro"
backend_api_desired_count = 1
enable_waf = false
```

### Staging (staging)
```hcl
environment = "staging"
db_instance_class = "db.t4g.small"
redis_node_type = "cache.t4g.small"
backend_api_desired_count = 2
enable_waf = true
```

### Production (prod)
```hcl
environment = "prod"
db_instance_class = "db.r6g.large"
redis_node_type = "cache.r6g.large"
backend_api_desired_count = 3
enable_waf = true
```

## Cost Estimates

### Development Environment (~$150/month)
- ECS Fargate: $30
- RDS (db.t4g.micro): $15
- ElastiCache (cache.t4g.micro): $12
- NAT Gateway: $35
- S3 + CloudFront: $10
- Lambda: $5
- Data Transfer: $20
- CloudWatch: $10
- Misc (ALB, etc.): $13

### Staging Environment (~$300/month)
- ECS Fargate: $60
- RDS (db.t4g.small): $30
- ElastiCache (cache.t4g.small): $25
- NAT Gateway: $35
- S3 + CloudFront: $20
- Lambda: $10
- Data Transfer: $40
- CloudWatch: $20
- Misc (ALB, WAF, etc.): $60

### Production Environment (~$800-1200/month)
- ECS Fargate: $200-300
- RDS (db.r6g.large, Multi-AZ): $350
- ElastiCache (cache.r6g.large, Multi-AZ): $200
- NAT Gateway (3x): $105
- S3 + CloudFront: $50
- Lambda: $20
- Data Transfer: $100
- CloudWatch: $50
- Misc (ALB, WAF, etc.): $100

## Security Best Practices

1. **Network Isolation**: All databases and compute in private subnets
2. **Encryption**: At-rest and in-transit encryption everywhere
3. **Secrets Management**: AWS Secrets Manager for credentials
4. **IAM Roles**: Least privilege access policies
5. **Security Groups**: Restrictive ingress/egress rules
6. **WAF**: Rate limiting and OWASP top 10 protection
7. **MFA**: Enable MFA delete on S3 buckets (manual step)
8. **CloudTrail**: Enable for audit logging (manual step)
9. **GuardDuty**: Enable for threat detection (manual step)

## Disaster Recovery

### Backup Strategy
- **RDS**: Automated daily backups with 7-30 days retention
- **Point-in-Time Recovery**: Enabled on RDS
- **S3 Versioning**: All buckets have versioning enabled
- **Cross-Region Replication**: Configure for production (manual step)
- **Terraform State**: Versioned and encrypted in S3

### Recovery Procedures

#### Database Recovery
```bash
# Restore from automated backup
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier slo-events-prod-postgres \
  --target-db-instance-identifier slo-events-prod-postgres-restored \
  --restore-time 2024-01-01T12:00:00Z

# Or restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier slo-events-prod-postgres-restored \
  --db-snapshot-identifier slo-events-prod-final-snapshot-2024-01-01
```

#### Service Recovery
```bash
# Restart ECS services
aws ecs update-service \
  --cluster slo-events-prod-cluster \
  --service slo-events-prod-backend-api \
  --force-new-deployment

# Scale up if needed
aws ecs update-service \
  --cluster slo-events-prod-cluster \
  --service slo-events-prod-backend-api \
  --desired-count 5
```

#### Infrastructure Recovery
```bash
# Full infrastructure rebuild from Terraform
terraform destroy -target=module.ecs  # Selective destroy if needed
terraform apply -target=module.ecs    # Rebuild specific module
```

### RTO and RPO Targets
- **RTO (Recovery Time Objective)**:
  - Dev: 4 hours
  - Staging: 2 hours
  - Production: 1 hour
- **RPO (Recovery Point Objective)**:
  - Dev: 24 hours
  - Staging: 4 hours
  - Production: 15 minutes (with automated backups)

## Maintenance

### Regular Tasks
- **Monthly**: Review CloudWatch dashboards and cost reports
- **Quarterly**: Update Terraform provider versions
- **Quarterly**: Review and rotate secrets
- **Annually**: Renew SSL certificates (if not using ACM)

### Updates
```bash
# Update Terraform providers
terraform init -upgrade

# Update application dependencies
# (Build new Docker images and update ECS)

# Update Lambda runtime
# (Modify lambda module and apply)

# Database maintenance
# (Handled automatically during maintenance window)
```

## Troubleshooting

### ECS Tasks Not Starting
```bash
# Check task definition
aws ecs describe-task-definition --task-definition slo-events-prod-backend-api

# Check service events
aws ecs describe-services \
  --cluster slo-events-prod-cluster \
  --services slo-events-prod-backend-api

# Check CloudWatch logs
aws logs tail /ecs/slo-events-prod/backend-api --follow
```

### Database Connection Issues
```bash
# Check security group rules
aws ec2 describe-security-groups --group-ids sg-xxxxx

# Test connectivity from ECS task
aws ecs execute-command \
  --cluster slo-events-prod-cluster \
  --task <task-id> \
  --container backend-api \
  --interactive \
  --command "/bin/bash"

# Inside container:
psql -h <rds-endpoint> -U sloadmin -d sloevents
```

### Lambda Timeout Issues
```bash
# Check Lambda logs
aws logs tail /aws/lambda/slo-events-prod-scraper-fotmob --follow

# Increase timeout
terraform apply -var="lambda_timeout=600"

# Check VPC NAT Gateway
aws ec2 describe-nat-gateways
```

### CloudFront Cache Issues
```bash
# Invalidate cache
DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"

# Check origin health
aws cloudfront get-distribution --id ${DISTRIBUTION_ID}
```

## Module Reference

| Module | Resources | Purpose |
|--------|-----------|---------|
| vpc | VPC, Subnets, NAT, IGW | Network foundation |
| iam | Roles, Policies | Access management |
| rds | PostgreSQL, Security Groups | Database |
| elasticache | Redis cluster | Caching layer |
| s3 | Buckets, Lifecycle policies | Object storage |
| ecs | Cluster, Services, Tasks | Container orchestration |
| lambda | Functions, EventBridge | Serverless scrapers |
| cloudfront | Distribution, WAF | CDN and security |
| monitoring | Dashboards, Alarms, SNS | Observability |

## Support

For issues or questions:
1. Check CloudWatch dashboards first
2. Review CloudWatch Logs for application errors
3. Check SNS email notifications for alarm details
4. Review Terraform plan output for infrastructure changes

## Contributing

1. Make changes in a feature branch
2. Test in dev environment first
3. Run `terraform fmt` and `terraform validate`
4. Create pull request with plan output
5. Apply to staging after review
6. Apply to production after staging validation

## License

MIT License - See LICENSE file for details
