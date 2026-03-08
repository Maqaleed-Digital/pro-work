#!/bin/bash
set -euo pipefail

ENVIRONMENT="${1:-staging}"
AWS_REGION="${AWS_REGION:-us-east-1}"
APP_NAME="prowork"

echo "=== ProWork Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"

RED='33[0;31m'
GREEN='33[0;32m'
YELLOW='33[1;33m'
NC='33[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_prerequisites() {
    log_info "Checking prerequisites..."
    command -v aws >/dev/null 2>&1 || { log_error "AWS CLI not installed"; exit 1; }
    command -v docker >/dev/null 2>&1 || { log_error "Docker not installed"; exit 1; }
    command -v terraform >/dev/null 2>&1 || { log_error "Terraform not installed"; exit 1; }
    aws sts get-caller-identity >/dev/null 2>&1 || { log_error "AWS credentials not configured"; exit 1; }
    log_info "Prerequisites OK"
}

build_and_push() {
    log_info "Building Docker image..."
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    IMAGE="${REGISTRY}/${APP_NAME}:${ENVIRONMENT}-$(git rev-parse --short HEAD)"
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REGISTRY
    docker build -t $IMAGE -f infrastructure/docker/Dockerfile .
    docker push $IMAGE
    log_info "Image pushed: $IMAGE"
    echo $IMAGE
}

deploy_infrastructure() {
    log_info "Deploying infrastructure..."
    cd infrastructure/aws
    terraform init -upgrade
    terraform workspace select $ENVIRONMENT || terraform workspace new $ENVIRONMENT
    terraform plan -var="environment=$ENVIRONMENT" -out=tfplan
    terraform apply tfplan
    cd ../..
    log_info "Infrastructure deployed"
}

update_ecs_service() {
    local image=$1
    log_info "Updating ECS service..."
    TASK_DEF=$(aws ecs describe-services \
        --cluster ${APP_NAME}-${ENVIRONMENT} \
        --services ${APP_NAME}-api \
        --query 'services[0].taskDefinition' \
        --output text)

    aws ecs register-task-definition \
        --cli-input-json "$(aws ecs describe-task-definition \
            --task-definition $TASK_DEF \
            --query 'taskDefinition' | \
            jq --arg IMAGE "$image" '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')"

    aws ecs update-service \
        --cluster ${APP_NAME}-${ENVIRONMENT} \
        --service ${APP_NAME}-api \
        --force-new-deployment

    log_info "ECS service updated"
}

wait_for_deployment() {
    log_info "Waiting for deployment to stabilize..."
    aws ecs wait services-stable \
        --cluster ${APP_NAME}-${ENVIRONMENT} \
        --services ${APP_NAME}-api
    log_info "Deployment complete!"
}

health_check() {
    log_info "Running health check..."
    ALB_DNS=$(terraform -chdir=infrastructure/aws output -raw alb_dns_name)
    for i in {1..30}; do
        if curl -sf "http://${ALB_DNS}/api/admin/health" >/dev/null; then
            log_info "Health check passed!"
            return 0
        fi
        log_warn "Health check attempt $i failed, retrying..."
        sleep 10
    done
    log_error "Health check failed"
    return 1
}

main() {
    check_prerequisites

    case "${2:-deploy}" in
        infra)
            deploy_infrastructure
            ;;
        deploy)
            IMAGE=$(build_and_push)
            deploy_infrastructure
            update_ecs_service $IMAGE
            wait_for_deployment
            health_check
            ;;
        rollback)
            log_warn "Rolling back to previous task definition..."
            aws ecs update-service \
                --cluster ${APP_NAME}-${ENVIRONMENT} \
                --service ${APP_NAME}-api \
                --force-new-deployment
            wait_for_deployment
            ;;
        *)
            echo "Usage: $0 <environment> [infra|deploy|rollback]"
            exit 1
            ;;
    esac
}

main "$@"
