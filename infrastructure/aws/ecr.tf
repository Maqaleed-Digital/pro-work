# In-region ECR repository for the WorkCaptain app image.
# Replaces pulling the image from ghcr.io across the public internet: lower pull
# latency from ECS in me-central-1, tighter IAM, and no GitHub-registry coupling.
# (CI would push here instead of / in addition to ghcr.io once the apply lands.)

resource "aws_ecr_repository" "app" {
  name                 = "${var.app_name}-${var.environment}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Keep storage bounded: expire untagged images and cap retained tagged images.
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Retain only the 20 most recent tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha-"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}
