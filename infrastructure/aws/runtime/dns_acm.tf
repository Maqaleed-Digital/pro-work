# WO-WC-DEPLOY-001 — Route53 zone + ACM certificate + DNS validation.
#
# No Route53 zone exists for workcaptain.ai today (DNS is external). Recommended
# path (manage_dns_in_route53=true): terraform creates the hosted zone; the ONLY
# manual step is delegating the registrar's nameservers to the zone NS records
# (output `route53_nameservers`). Then ACM validation, the apex ALIAS, and the www
# record are all terraform-managed and HTTPS works end-to-end.

resource "aws_route53_zone" "wc" {
  count = var.manage_dns_in_route53 ? 1 : 0
  name  = var.domain_name
}

resource "aws_acm_certificate" "wc" {
  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation records (only when the zone is terraform-managed).
resource "aws_route53_record" "cert_validation" {
  for_each = var.manage_dns_in_route53 ? {
    for dvo in aws_acm_certificate.wc.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  zone_id = aws_route53_zone.wc[0].zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

# Waits for the cert to be ISSUED before the 443 listener can use it.
resource "aws_acm_certificate_validation" "wc" {
  count                   = var.manage_dns_in_route53 ? 1 : 0
  certificate_arn         = aws_acm_certificate.wc.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Public DNS → ALB (apex ALIAS + www).
resource "aws_route53_record" "apex" {
  count   = var.manage_dns_in_route53 ? 1 : 0
  zone_id = aws_route53_zone.wc[0].zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  count   = var.manage_dns_in_route53 ? 1 : 0
  zone_id = aws_route53_zone.wc[0].zone_id
  name    = "www.${var.domain_name}"
  type    = "A"
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
