#!/usr/bin/env python3
from pathlib import Path

repo_root = Path("/opt/prowork")
main_tf = repo_root / "infrastructure/gcp/main.tf"
text = main_tf.read_text()

required_vars_block = '''
variable "enable_load_balancer" {
  type    = bool
  default = false
}

variable "enable_cloud_armor" {
  type    = bool
  default = false
}

variable "restrict_public_access" {
  type    = bool
  default = false
}

variable "cloud_armor_policy_name" {
  type    = string
  default = "workcaptain-nonprod-baseline"
}

variable "lb_domain_name" {
  type    = string
  default = "nonprod.workcaptain.local"
}
'''

vars_tf = repo_root / "infrastructure/gcp/variables.tf"
vars_text = vars_tf.read_text()
if 'variable "enable_load_balancer"' not in vars_text:
    vars_tf.write_text(vars_text.rstrip() + "\n\n" + required_vars_block.strip() + "\n")

append_block = '''
resource "google_compute_security_policy" "workcaptain_nonprod_baseline" {
  count = var.enable_cloud_armor ? 1 : 0

  project = var.project_id
  name    = var.cloud_armor_policy_name

  rule {
    action   = "allow"
    priority = 2147483647
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "default allow baseline for nonprod"
  }
}

output "cloud_armor_policy_name" {
  value = var.enable_cloud_armor ? google_compute_security_policy.workcaptain_nonprod_baseline[0].name : null
}
'''

if 'resource "google_compute_security_policy" "workcaptain_nonprod_baseline"' not in text:
    main_tf.write_text(text.rstrip() + "\n\n" + append_block.strip() + "\n")

secret_contract = repo_root / "FND/WORKCAPTAIN_SECRET_CONTRACT.md"
if not secret_contract.exists():
    secret_contract.write_text("""# WORKCAPTAIN SECRET CONTRACT

Status: ACTIVE

Required runtime secrets:
- DB_PASSWORD
- REDIS_AUTH
- JWT_SECRET

Rules:
- never commit real values
- provision through Secret Manager only
- nonprod values separated from future prod values
""")

observability_doc = repo_root / "FND/WORKCAPTAIN_OBSERVABILITY_BASELINE.md"
if not observability_doc.exists():
    observability_doc.write_text("""# WORKCAPTAIN OBSERVABILITY BASELINE

Status: ACTIVE

Minimum nonprod observability:
- Cloud Run service status checks
- request/error visibility
- Cloud SQL instance visibility
- Redis instance visibility
- Artifact Registry visibility
- IAM/access policy evidence

Dashboards and alerts:
- scaffold in this phase
- tune in later phases
""")

print("PATCH_STATUS=PASS")
