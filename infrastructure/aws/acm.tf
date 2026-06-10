# ACM certificate + ALB HTTPS:443 listener.
#
# Both are GATED behind enable_runtime (i.e. NOT in the zero-idle foundation). Reason:
# var.domain_name is a placeholder (workcaptain.example.com), and ACM fast-FAILS a cert
# for an IANA-reserved domain it cannot DNS-validate — which would taint the resource and
# force a replace on every plan. The cert can only stabilize once the Sponsor sets a real
# domain + Route 53 hosted zone. So it lands with the runtime tier, when a real domain
# exists; at that point add the validation CNAMEs (and an aws_acm_certificate_validation
# resource) so the HTTPS listener has a validated cert to bind.

resource "aws_acm_certificate" "main" {
  count = var.enable_runtime ? 1 : 0  # deferred: needs a real domain (placeholder fast-fails)

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "https" {
  count = var.enable_runtime ? 1 : 0  # staged with the ALB + validated cert

  load_balancer_arn = aws_lb.main[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main[0].arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

output "acm_certificate_arn" {
  value = one(aws_acm_certificate.main[*].arn)
}
