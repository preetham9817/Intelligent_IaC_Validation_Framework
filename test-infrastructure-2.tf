# IntelliValidate test file 2
# Intentionally includes insecure and more secure configurations.
# Testing only: do not deploy this configuration.

provider "aws" {
  region = "ap-south-1"
}

resource "aws_s3_bucket" "public_test" {
  bucket = "intellvalidate-public-test-example-123456789"
}

resource "aws_s3_bucket_public_access_block" "public_test" {
  bucket                  = aws_s3_bucket.public_test.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_server_side_encryption_configuration" "public_test" {
  bucket = aws_s3_bucket.public_test.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_security_group" "insecure_ssh" {
  name        = "intellvalidate-test-ssh"
  description = "Intentionally insecure test security group"

  ingress {
    description = "SSH open to the internet for scanner testing"
    from_port   = 22
    to_port     = 22
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

resource "aws_ebs_volume" "encrypted_test" {
  availability_zone = "ap-south-1a"
  size              = 8
  encrypted         = true
  tags = {
    Name = "intellvalidate-encrypted-test"
  }
}

resource "aws_instance" "test_instance" {
  ami           = "ami-0c02fb55956c7d316"
  instance_type = "t3.micro"
  monitoring    = false

  root_block_device {
    encrypted = false
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "optional"
  }

  tags = {
    Name = "intellvalidate-test-instance"
  }
}
