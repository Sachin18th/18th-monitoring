# Terraform Main Configuration

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # For production, use an S3/DynamoDB backend
  # backend "s3" {
  #   bucket         = "kpi-monitoring-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-state-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "KPI-Monitoring"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
