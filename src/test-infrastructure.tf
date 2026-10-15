terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

# Test IoT gateway
resource "aws_instance" "iot_gateway" {
  ami           = "ami-12345678"
  instance_type = "t2.micro"

  subnet_id = "subnet-12345678"

  tags = {
    Name = "IoT-Gateway"
    Environment = "production"
  }
}

# Intentionally permissive security group
resource "aws_security_group" "iot_gateway" {
  name = "iot-gateway-security"

  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Test storage bucket
resource "aws_s3_bucket" "manufacturing_data" {
  bucket = "intellvalidate-test-manufacturing-data"
}