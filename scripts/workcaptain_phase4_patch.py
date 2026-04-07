#!/usr/bin/env python3
from pathlib import Path

repo_root = Path("/opt/prowork")
vars_tf = repo_root / "infrastructure/gcp/variables.tf"
main_tf = repo_root / "infrastructure/gcp/main.tf"

vars_text = vars_tf.read_text()
main_text = main_tf.read_text()

vars_block = """
variable "internal_alpha_enabled" {
  type    = bool
  default = false
}

variable "real_runtime_cutover" {
  type    = bool
  default = false
}
""".strip()

if 'variable "internal_alpha_enabled"' not in vars_text:
    vars_tf.write_text(vars_text.rstrip() + "\n\n" + vars_block + "\n")

main_append = """
output "internal_alpha_enabled" {
  value = var.internal_alpha_enabled
}

output "real_runtime_cutover" {
  value = var.real_runtime_cutover
}
""".strip()

if 'output "internal_alpha_enabled"' not in main_text:
    main_tf.write_text(main_text.rstrip() + "\n\n" + main_append + "\n")

print("PATCH_STATUS=PASS")
