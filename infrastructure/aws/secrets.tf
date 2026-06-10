# Secrets Manager — replaces .env-file secret handling. Two secrets:
#   1. DB connection — populated from the Terraform-generated RDS credentials.
#   2. HyperPay keys — container only; the real entity-id / access-token are injected
#      out-of-band (NO real payment credentials are committed to IaC or state here).

resource "aws_secretsmanager_secret" "db" {
  name        = "${var.app_name}/${var.environment}/db"
  description = "WorkCaptain RDS Postgres connection credentials"
}

resource "aws_secretsmanager_secret_version" "db" {
  count = var.enable_runtime ? 1 : 0  # staged: depends on RDS (created at app-deploy apply). The empty secret container above applies now.

  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = aws_db_instance.main[0].address
    port     = aws_db_instance.main[0].port
    dbname   = aws_db_instance.main[0].db_name
    username = aws_db_instance.main[0].username
    password = random_password.db_password.result
  })
}

resource "aws_secretsmanager_secret" "hyperpay" {
  name        = "${var.app_name}/${var.environment}/hyperpay"
  description = "HyperPay API credentials (entity id + access token) — value injected out-of-band, not via Terraform"
}

# Intentionally no aws_secretsmanager_secret_version for hyperpay: the value is set
# manually / via CI secret injection after apply so real keys never enter TF state.

output "db_secret_arn" {
  value = aws_secretsmanager_secret.db.arn
}

output "hyperpay_secret_arn" {
  value = aws_secretsmanager_secret.hyperpay.arn
}
