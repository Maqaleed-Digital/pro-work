# Additional variables for WO-WC-AWS-02 gap-fill (me-central-1 interim landing zone).
# Core variables (aws_region, environment, app_name) remain declared in main.tf.

variable "domain_name" {
  description = "Public hostname for the ALB HTTPS listener / ACM cert. PLACEHOLDER until the Sponsor sets the real WorkCaptain domain; DNS validation is wired out-of-band once the hosted zone exists."
  type        = string
  default     = "workcaptain.example.com"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type. Interim single-node sizing for the me-central-1 anchor."
  type        = string
  default     = "cache.t3.micro"
}

# WO-WC-AWS-02 REVISED: gates the billable always-on resources (NAT gateway, RDS,
# ElastiCache, ALB + listeners, and the RDS-derived DB secret version). Foundation
# apply runs with this false so nothing always-on bills while there is no app. Flip to
# true at the app-deploy apply, once branch-truth confirms the deploy target.
variable "enable_runtime" {
  description = "Create the billable always-on runtime tier (NAT/RDS/ElastiCache/ALB). False = zero-idle foundation only."
  type        = bool
  default     = false
}
