terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Configuración para S3 Remote State y DynamoDB Lock
  backend "s3" {
    bucket         = "saas-portfolio-tf-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "saas-portfolio-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "saas-portfolio"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}
