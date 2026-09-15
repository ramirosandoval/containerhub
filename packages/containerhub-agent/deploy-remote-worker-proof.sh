#!/usr/bin/env bash
set -euo pipefail

agent_stack_name='containerhub-agent'
agent_service_name='containerhub-agent_agent'
agent_network_name='containerhub-agent-network'
proof_service_name='containerhub-remote-proof'
worker_name="${WORKER_NAME:-debianvm}"
pki_directory="${CONTAINERHUB_AGENT_PKI_DIR:-$HOME/containerhub-agent-pki}"

usage() {
  cat <<'EOF'
Usage:
  deploy-remote-worker-proof.sh init
  deploy-remote-worker-proof.sh deploy REGISTRY_IMAGE BACKEND_SERVICE
  deploy-remote-worker-proof.sh cleanup

Examples:
  deploy-remote-worker-proof.sh init
  deploy-remote-worker-proof.sh deploy registry.example/containerhub-agent:20260910 containerhub_back
  deploy-remote-worker-proof.sh cleanup

The backend service must already be deployed in Swarm with the agent mTLS
network, secrets and environment variables described in TLS.md.
Optional environment variables:
  WORKER_NAME=debianvm
  CONTAINERHUB_AGENT_PKI_DIR=$HOME/containerhub-agent-pki
  PROOF_IMAGE=alpine:3.20
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

require_manager() {
  docker info --format '{{.Swarm.ControlAvailable}}' | grep -qx 'true' || fail 'run this command from a Swarm manager'
}

require_ready_worker() {
  docker node ls --format '{{.Hostname}}\t{{.Status}}' | grep -qx "${worker_name}"$'\tReady' || fail "worker ${worker_name} is not Ready"
}

create_network_if_missing() {
  docker network inspect "$agent_network_name" >/dev/null 2>&1 || docker network create --driver overlay "$agent_network_name" >/dev/null
}

create_secret_if_missing() {
  local secret_name="$1"
  local source_file="$2"
  docker secret inspect "$secret_name" >/dev/null 2>&1 || docker secret create "$secret_name" "$source_file" >/dev/null
}

initialize_tls_secrets() {
  local required_secrets=(
    containerhub-agent-ca.pem
    containerhub-agent-server-cert.pem
    containerhub-agent-server-key.pem
    containerhub-agent-client-cert.pem
    containerhub-agent-client-key.pem
  )
  local existing_secret_count=0
  local secret_name

  for secret_name in "${required_secrets[@]}"; do
    docker secret inspect "$secret_name" >/dev/null 2>&1 && ((existing_secret_count += 1))
  done

  if ((existing_secret_count == ${#required_secrets[@]})); then
    return
  fi
  ((existing_secret_count == 0)) || fail 'some agent TLS secrets already exist; complete or remove the set manually'

  require_command openssl
  install -d -m 700 "$pki_directory"
  [[ ! -e "$pki_directory/ca-key.pem" ]] || fail "refusing to overwrite existing PKI: $pki_directory"

  (
    cd "$pki_directory"
    umask 077
    openssl req -x509 -newkey rsa:4096 -sha256 -nodes -days 3650 \
      -subj '/CN=ContainerHub Agent CA' \
      -keyout ca-key.pem \
      -out ca.pem
    openssl req -new -newkey rsa:2048 -sha256 -nodes \
      -subj '/CN=containerhub-agent' \
      -addext 'subjectAltName=DNS:containerhub-agent' \
      -addext 'extendedKeyUsage=serverAuth' \
      -keyout server-key.pem \
      -out server.csr
    openssl x509 -req -sha256 -days 825 \
      -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
      -copy_extensions copy -out server-cert.pem
    openssl req -new -newkey rsa:2048 -sha256 -nodes \
      -subj '/CN=containerhub-back' \
      -addext 'extendedKeyUsage=clientAuth' \
      -keyout client-key.pem \
      -out client.csr
    openssl x509 -req -sha256 -days 825 \
      -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
      -copy_extensions copy -out client-cert.pem
    openssl verify -CAfile ca.pem server-cert.pem client-cert.pem
    rm server.csr client.csr ca.srl
  )

  create_secret_if_missing containerhub-agent-ca.pem "$pki_directory/ca.pem"
  create_secret_if_missing containerhub-agent-server-cert.pem "$pki_directory/server-cert.pem"
  create_secret_if_missing containerhub-agent-server-key.pem "$pki_directory/server-key.pem"
  create_secret_if_missing containerhub-agent-client-cert.pem "$pki_directory/client-cert.pem"
  create_secret_if_missing containerhub-agent-client-key.pem "$pki_directory/client-key.pem"
}

require_backend_agent_configuration() {
  local backend_service_name="$1"
  local backend_specification network_id required_value
  local required_values=(
    containerhub-agent-ca.pem
    containerhub-agent-client-cert.pem
    containerhub-agent-client-key.pem
    CONTAINERHUB_AGENT_CA_FILE=/run/secrets/containerhub-agent-ca.pem
    CONTAINERHUB_AGENT_CLIENT_CERT_FILE=/run/secrets/containerhub-agent-client-cert.pem
    CONTAINERHUB_AGENT_CLIENT_KEY_FILE=/run/secrets/containerhub-agent-client-key.pem
    CONTAINERHUB_AGENT_HOST=containerhub-agent
    CONTAINERHUB_AGENT_SERVER_NAME=containerhub-agent
    CONTAINERHUB_AGENT_PORT=9997
  )

  docker service inspect "$backend_service_name" >/dev/null 2>&1 || fail "backend service does not exist: $backend_service_name"
  network_id="$(docker network inspect --format '{{.Id}}' "$agent_network_name")"
  backend_specification="$(docker service inspect "$backend_service_name")"
  grep -Fq "$network_id" <<<"$backend_specification" || fail "backend service is not attached to $agent_network_name"

  for required_value in "${required_values[@]}"; do
    grep -Fq "$required_value" <<<"$backend_specification" || fail "backend service is missing: $required_value"
  done
}

require_agent_prerequisites() {
  local required_secrets=(
    containerhub-agent-ca.pem
    containerhub-agent-server-cert.pem
    containerhub-agent-server-key.pem
    containerhub-agent-client-cert.pem
    containerhub-agent-client-key.pem
  )
  local secret_name

  docker network inspect "$agent_network_name" >/dev/null 2>&1 || fail "missing network: $agent_network_name; run init first"
  for secret_name in "${required_secrets[@]}"; do
    docker secret inspect "$secret_name" >/dev/null 2>&1 || fail "missing secret: $secret_name; run init first"
  done
}

wait_for_running_task() {
  local service_name="$1"
  local expected_node_name="$2"
  local attempt

  for attempt in $(seq 1 30); do
    if docker service ps --no-trunc --format '{{.Node}}\t{{.CurrentState}}' "$service_name" | grep -q "^${expected_node_name}"$'\tRunning'; then
      return
    fi
    sleep 2
  done

  docker service ps "$service_name" >&2 || true
  fail "service $service_name did not become Running on $expected_node_name"
}

deploy() {
  local agent_image="$1"
  local backend_service_name="$2"
  local repository_root

  [[ -n "$agent_image" ]] || fail 'REGISTRY_IMAGE is required'
  [[ -n "$backend_service_name" ]] || fail 'BACKEND_SERVICE is required'
  repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

  require_command docker
  require_manager
  require_ready_worker
  require_agent_prerequisites
  require_backend_agent_configuration "$backend_service_name"

  docker build -f "$repository_root/packages/containerhub-agent/Dockerfile" -t "$agent_image" "$repository_root"
  docker push "$agent_image"
  CONTAINERHUB_AGENT_IMAGE="$agent_image" docker stack deploy --with-registry-auth \
    -c "$repository_root/packages/containerhub-agent/stack.yml" "$agent_stack_name"
  wait_for_running_task "$agent_service_name" "$worker_name"

  docker service inspect "$proof_service_name" >/dev/null 2>&1 && fail "proof service already exists: $proof_service_name"
  docker service create --name "$proof_service_name" \
    --constraint "node.hostname == $worker_name" \
    --restart-condition none \
    "${PROOF_IMAGE:-alpine:3.20}" sh -c 'while true; do sleep 3600; done' >/dev/null
  wait_for_running_task "$proof_service_name" "$worker_name"

  printf 'Ready. Open Nodes, then test terminal, stats and ghosts for %s on %s.\n' "$proof_service_name" "$worker_name"
}

initialize() {
  require_command docker
  require_manager
  create_network_if_missing
  initialize_tls_secrets
  printf 'Created or verified %s and the five mTLS Docker secrets. Configure and deploy the backend service, then run deploy.\n' "$agent_network_name"
}

cleanup() {
  require_command docker
  require_manager
  docker service inspect "$proof_service_name" >/dev/null 2>&1 && docker service rm "$proof_service_name" >/dev/null
  docker stack rm "$agent_stack_name"
  printf 'Removed proof service and agent stack. Network, Docker secrets and PKI were preserved.\n'
}

case "${1:-}" in
  init)
    [[ $# -eq 1 ]] || { usage >&2; exit 2; }
    initialize
    ;;
  deploy)
    [[ $# -eq 3 ]] || { usage >&2; exit 2; }
    deploy "$2" "$3"
    ;;
  cleanup)
    [[ $# -eq 1 ]] || { usage >&2; exit 2; }
    cleanup
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
