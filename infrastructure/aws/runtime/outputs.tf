# WO-WC-DEPLOY-001 — outputs (reachability + the one manual DNS delegation step).

output "alb_dns_name" {
  description = "Public ALB hostname (workcaptain.ai apex/www ALIAS point here)."
  value       = aws_lb.main.dns_name
}

output "route53_nameservers" {
  description = "Delegate the registrar's nameservers for workcaptain.ai to THESE (the one manual step). Then ACM validation + apex/www are fully terraform-managed."
  value       = var.manage_dns_in_route53 ? aws_route53_zone.wc[0].name_servers : []
}

output "acm_certificate_arn" {
  value = aws_acm_certificate.wc.arn
}

output "acm_validation_records" {
  description = "If NOT using Route53 (manage_dns_in_route53=false), add THESE CNAMEs at the external DNS provider to validate the cert."
  value = [for dvo in aws_acm_certificate.wc.domain_validation_options : {
    name  = dvo.resource_record_name
    type  = dvo.resource_record_type
    value = dvo.resource_record_value
  }]
}

output "ecr_image_to_push" {
  description = "Build infrastructure/docker/Dockerfile and push to THIS image:tag before apply (the service has no image otherwise)."
  value       = "${data.aws_ecr_repository.prowork.repository_url}:${var.image_tag}"
}

output "reachability_summary" {
  value = "After apply + image push + registrar NS delegation: https://${var.domain_name} terminates TLS at the ALB (443), forwards to the Fargate app on :${var.app_port}, health-checked at /api/health. Payments remain HYPERPAY_MODE=sandbox (no live charge path)."
}
