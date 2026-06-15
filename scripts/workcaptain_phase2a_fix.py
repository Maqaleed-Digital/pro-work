#!/usr/bin/env python3
import re
from pathlib import Path

repo_root = Path("/opt/prowork")
main_tf = repo_root / "infrastructure/gcp/main.tf"
activate_sh = repo_root / "scripts/workcaptain_gcp_nonprod_activate.sh"

main_text = main_tf.read_text()
orig_main_text = main_text

# --- helpers ---
def find_resource_block(text: str, resource_type: str, resource_name: str):
    pattern = re.compile(rf'resource\s+"{re.escape(resource_type)}"\s+"{re.escape(resource_name)}"\s*\{{')
    m = pattern.search(text)
    if not m:
        return None
    start = m.start()
    brace_start = text.find("{", m.end() - 1)
    depth = 0
    i = brace_start
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1
        i += 1
    raise RuntimeError(f"Unclosed resource block: {resource_type}.{resource_name}")

def replace_resource_block(text: str, resource_type: str, resource_name: str, new_block: str):
    loc = find_resource_block(text, resource_type, resource_name)
    if not loc:
        raise RuntimeError(f"Missing resource block: {resource_type}.{resource_name}")
    start, end = loc
    return text[:start] + new_block + text[end:]

def remove_named_block(body: str, block_name: str):
    pattern = re.compile(rf'(^\s*{re.escape(block_name)}\s*\{{)', re.MULTILINE)
    m = pattern.search(body)
    if not m:
        return body
    brace_start = body.find("{", m.end() - 1)
    depth = 0
    i = brace_start
    while i < len(body):
        if body[i] == "{":
            depth += 1
        elif body[i] == "}":
            depth -= 1
            if depth == 0:
                start = m.start()
                end = i + 1
                while end < len(body) and body[end] in "\r\n":
                    end += 1
                return body[:start] + body[end:]
        i += 1
    raise RuntimeError(f"Unclosed nested block: {block_name}")

def ensure_depends_on_item(block_text: str, item: str):
    if item in block_text:
        return block_text
    if re.search(r'^\s*depends_on\s*=\s*\[', block_text, re.MULTILINE):
        return re.sub(
            r'(^\s*depends_on\s*=\s*\[)([^\]]*)(\])',
            lambda m: m.group(1) + m.group(2).rstrip() + (", " if m.group(2).strip() else "") + item + m.group(3),
            block_text,
            count=1,
            flags=re.MULTILINE | re.DOTALL,
        )
    insert_after = re.search(r'(^\s*project\s*=\s*.*$)', block_text, re.MULTILINE)
    if insert_after:
        idx = insert_after.end()
        return block_text[:idx] + f'\n  depends_on = [{item}]' + block_text[idx:]
    header_end = block_text.find("{") + 1
    return block_text[:header_end] + f'\n  depends_on = [{item}]' + block_text[header_end:]

# --- detect existing network resource ---
net_match = re.search(r'resource\s+"google_compute_network"\s+"([^"]+)"\s*\{', main_text)
if not net_match:
    raise RuntimeError("Could not find google_compute_network resource in infrastructure/gcp/main.tf")
network_resource_name = net_match.group(1)

# --- add service networking API resource if missing ---
if 'resource "google_project_service" "servicenetworking"' not in main_text:
    main_text += f"""

resource "google_project_service" "servicenetworking" {{
  project            = var.project_id
  service            = "servicenetworking.googleapis.com"
  disable_on_destroy = false
}}

"""

# --- add private service access resources if missing ---
if 'resource "google_compute_global_address" "private_service_range"' not in main_text:
    main_text += f"""
resource "google_compute_global_address" "private_service_range" {{
  project       = var.project_id
  name          = "workcaptain-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.{network_resource_name}.id
}}

resource "google_service_networking_connection" "private_vpc_connection" {{
  network                 = google_compute_network.{network_resource_name}.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]
  depends_on              = [google_project_service.servicenetworking]
}}

"""

# --- patch Cloud SQL postgres resource depends_on ---
postgres_loc = find_resource_block(main_text, "google_sql_database_instance", "postgres")
if not postgres_loc:
    raise RuntimeError("Missing google_sql_database_instance.postgres block")
p_start, p_end = postgres_loc
postgres_block = main_text[p_start:p_end]
postgres_block = ensure_depends_on_item(postgres_block, "google_service_networking_connection.private_vpc_connection")
main_text = main_text[:p_start] + postgres_block + main_text[p_end:]

# --- patch secrets to regional secrets ---
secret_names = ["db_password", "redis_auth", "jwt_secret"]
for secret_name in secret_names:
    loc = find_resource_block(main_text, "google_secret_manager_secret", secret_name)
    if not loc:
        loc = find_resource_block(main_text, "google_secret_manager_regional_secret", secret_name)
        if not loc:
            raise RuntimeError(f"Missing secret resource for {secret_name}")
        existing_type = "google_secret_manager_regional_secret"
    else:
        existing_type = "google_secret_manager_secret"

    start, end = loc
    block = main_text[start:end]
    body = block[block.find("{")+1:block.rfind("}")]
    body = remove_named_block(body, "replication")
    if re.search(r'^\s*location\s*=', body, re.MULTILINE) is None:
        secret_id_match = re.search(r'(^\s*secret_id\s*=.*$)', body, re.MULTILINE)
        if secret_id_match:
            idx = secret_id_match.end()
            body = body[:idx] + "\n  location = var.region" + body[idx:]
        else:
            body = "\n  location = var.region" + body
    new_block = f'resource "google_secret_manager_regional_secret" "{secret_name}" {{{body}\n}}'
    main_text = main_text[:start] + new_block + main_text[end:]

# patch all references and version resource types
main_text = main_text.replace('google_secret_manager_secret_version"', 'google_secret_manager_regional_secret_version"')
for secret_name in secret_names:
    main_text = main_text.replace(
        f"google_secret_manager_secret.{secret_name}.",
        f"google_secret_manager_regional_secret.{secret_name}."
    )

if main_text == orig_main_text:
    raise RuntimeError("No changes were applied to infrastructure/gcp/main.tf")

main_tf.write_text(main_text)

# --- patch activation script ---
act_text = activate_sh.read_text()
orig_act_text = act_text

if 'RUN_STATUS="FAIL"' not in act_text:
    marker = 'mkdir -p "$RUN_DIR"\n'
    inject = '''mkdir -p "$RUN_DIR"

RUN_STATUS="FAIL"
finalize_manifest() {
  {
    echo "RUN_DIR=$RUN_DIR"
    echo "STATUS=$RUN_STATUS"
    echo "PHASE=WORKCAPTAIN-PHASE-2-GCP-NONPROD-ACTIVATION"
    echo "PROJECT_ID=$PROJECT_ID"
    echo "REGION=$REGION"
    echo "ENV=$ENV"
    echo "STATE_BUCKET=$STATE_BUCKET"
    echo "ARTIFACT_REGISTRY=$AR_REPO"
  } > "$RUN_DIR/manifest.txt"
}
trap finalize_manifest EXIT
'''
    act_text = act_text.replace(marker, inject, 1)

if 'servicenetworking.googleapis.com' not in act_text or 'services_enable.txt' not in act_text:
    marker = 'gcloud billing projects describe "$PROJECT_ID" > "$RUN_DIR/billing_describe.txt" 2>&1\n'
    inject = '''gcloud billing projects describe "$PROJECT_ID" > "$RUN_DIR/billing_describe.txt" 2>&1

echo "=== REQUIRED SERVICES ===" | tee "$RUN_DIR/services_enable_status.txt"
gcloud services enable \\
  servicenetworking.googleapis.com \\
  secretmanager.googleapis.com \\
  --project="$PROJECT_ID" > "$RUN_DIR/services_enable.txt" 2>&1
echo "SERVICES_ENABLE_STATUS=PASS" | tee -a "$RUN_DIR/services_enable_status.txt"
'''
    act_text = act_text.replace(marker, inject, 1)

if 'terraform import -input=false google_artifact_registry_repository.registry' not in act_text:
    marker = '''(
  cd "$TF_ROOT"
  terraform validate
) > "$RUN_DIR/validate.txt" 2>&1

'''
    inject = '''(
  cd "$TF_ROOT"
  terraform validate
) > "$RUN_DIR/validate.txt" 2>&1

if gcloud artifacts repositories describe "$AR_REPO" \\
  --project="$PROJECT_ID" \\
  --location="$REGION" >/dev/null 2>&1; then
  (
    cd "$TF_ROOT"
    terraform import -input=false google_artifact_registry_repository.registry "projects/$PROJECT_ID/locations/$REGION/repositories/$AR_REPO"
  ) > "$RUN_DIR/artifact_registry_import.txt" 2>&1 || true
fi

'''
    act_text = act_text.replace(marker, inject, 1)

# remove old PASS manifest block and replace with RUN_STATUS update
old_manifest = '''{
  echo "RUN_DIR=$RUN_DIR"
  echo "STATUS=PASS"
  echo "PHASE=WORKCAPTAIN-PHASE-2-GCP-NONPROD-ACTIVATION"
  echo "PROJECT_ID=$PROJECT_ID"
  echo "REGION=$REGION"
  echo "ENV=$ENV"
  echo "STATE_BUCKET=$STATE_BUCKET"
  echo "ARTIFACT_REGISTRY=$AR_REPO"
} > "$RUN_DIR/manifest.txt"

echo "ACTIVATION_RUN_DIR=$RUN_DIR"
echo "ACTIVATION_STATUS=PASS"
'''
new_manifest = '''RUN_STATUS="PASS"

echo "ACTIVATION_RUN_DIR=$RUN_DIR"
echo "ACTIVATION_STATUS=PASS"
'''
act_text = act_text.replace(old_manifest, new_manifest, 1)

if act_text == orig_act_text:
    raise RuntimeError("No changes were applied to scripts/workcaptain_gcp_nonprod_activate.sh")

activate_sh.write_text(act_text)

print("PATCH_STATUS=PASS")
print(f"NETWORK_RESOURCE={network_resource_name}")
