.PHONY: help init plan apply destroy fmt validate clean

# Environment variables
ENV ?= dev
REGION ?= us-west-2
STATE_BUCKET ?= slo-events-terraform-state-$(ENV)
STATE_KEY ?= infrastructure/terraform.tfstate
LOCK_TABLE ?= slo-events-terraform-locks

help: ## Show this help message
	@echo 'Usage: make [target] ENV=<environment>'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Environments: dev, staging, prod'
	@echo 'Example: make plan ENV=dev'

init: ## Initialize Terraform with backend configuration
	@echo "Initializing Terraform for $(ENV) environment..."
	terraform init \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="key=$(STATE_KEY)" \
		-backend-config="region=$(REGION)" \
		-backend-config="encrypt=true" \
		-backend-config="dynamodb_table=$(LOCK_TABLE)"

plan: ## Run terraform plan
	@echo "Planning Terraform changes for $(ENV) environment..."
	terraform plan -var="environment=$(ENV)" -var="region=$(REGION)"

apply: ## Apply terraform changes
	@echo "Applying Terraform changes for $(ENV) environment..."
	terraform apply -var="environment=$(ENV)" -var="region=$(REGION)"

destroy: ## Destroy terraform resources (use with caution!)
	@echo "WARNING: This will destroy all resources in $(ENV) environment!"
	@read -p "Are you sure? Type '$(ENV)' to confirm: " confirm && [ "$$confirm" = "$(ENV)" ]
	terraform destroy -var="environment=$(ENV)" -var="region=$(REGION)"

fmt: ## Format terraform files
	@echo "Formatting Terraform files..."
	terraform fmt -recursive

validate: ## Validate terraform configuration
	@echo "Validating Terraform configuration..."
	terraform validate

clean: ## Clean terraform temporary files
	@echo "Cleaning temporary files..."
	find . -type d -name ".terraform" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.tfstate.backup" -delete
	find . -type f -name ".terraform.lock.hcl" -delete
	find . -type f -name "lambda_placeholder.zip" -delete

output: ## Show terraform outputs
	@echo "Terraform outputs for $(ENV) environment:"
	terraform output -json | jq '.'

refresh: ## Refresh terraform state
	@echo "Refreshing Terraform state for $(ENV) environment..."
	terraform refresh -var="environment=$(ENV)" -var="region=$(REGION)"

show: ## Show terraform state
	terraform show

state-list: ## List resources in terraform state
	terraform state list

setup-backend: ## Create S3 bucket and DynamoDB table for backend
	@echo "Creating backend resources for $(ENV) environment..."
	aws s3 mb s3://$(STATE_BUCKET) --region $(REGION) || echo "Bucket already exists"
	aws s3api put-bucket-versioning --bucket $(STATE_BUCKET) --versioning-configuration Status=Enabled
	aws s3api put-bucket-encryption --bucket $(STATE_BUCKET) \
		--server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
	aws dynamodb create-table --table-name $(LOCK_TABLE) \
		--attribute-definitions AttributeName=LockID,AttributeType=S \
		--key-schema AttributeName=LockID,KeyType=HASH \
		--billing-mode PAY_PER_REQUEST --region $(REGION) || echo "Table already exists"
	@echo "Backend resources created successfully!"

cost: ## Estimate infrastructure costs (requires infracost)
	@which infracost > /dev/null || (echo "infracost not installed. Visit https://www.infracost.io/docs/" && exit 1)
	infracost breakdown --path . --terraform-var-file terraform.tfvars

upgrade: ## Upgrade terraform providers
	@echo "Upgrading Terraform providers..."
	terraform init -upgrade

workspace-new: ## Create new terraform workspace
	@echo "Creating workspace: $(ENV)"
	terraform workspace new $(ENV) || terraform workspace select $(ENV)

workspace-list: ## List terraform workspaces
	terraform workspace list

workspace-select: ## Select terraform workspace
	@echo "Selecting workspace: $(ENV)"
	terraform workspace select $(ENV)

deploy-full: init plan ## Full deployment (init + plan, then prompts for apply)
	@read -p "Apply these changes? [y/N]: " confirm && [ "$$confirm" = "y" ] && make apply || echo "Aborted"
