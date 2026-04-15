# Backend configuration for storing Terraform state
# Initialize with: terraform init -backend-config="bucket=YOUR_BUCKET" -backend-config="key=YOUR_KEY"

terraform {
  backend "s3" {
    # bucket         = "slo-events-terraform-state-${var.environment}"
    # key            = "infrastructure/terraform.tfstate"
    # region         = "us-west-2"
    # encrypt        = true
    # dynamodb_table = "slo-events-terraform-locks"
    #
    # Note: Uncomment and configure these values or provide via -backend-config
    # The bucket and DynamoDB table must be created manually before first use
  }
}

# To create the state bucket and DynamoDB table, run:
# aws s3 mb s3://slo-events-terraform-state-${ENVIRONMENT} --region us-west-2
# aws s3api put-bucket-versioning --bucket slo-events-terraform-state-${ENVIRONMENT} --versioning-configuration Status=Enabled
# aws s3api put-bucket-encryption --bucket slo-events-terraform-state-${ENVIRONMENT} --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
# aws dynamodb create-table --table-name slo-events-terraform-locks --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region us-west-2
