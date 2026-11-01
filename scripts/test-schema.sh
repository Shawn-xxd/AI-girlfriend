#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
container_id="${SCHEMA_TEST_CONTAINER:-$(docker_local compose ps -q postgres)}"
[ -n "$container_id" ] || { echo '请先启动隔离测试数据库：docker compose up -d --wait'; exit 1; }
node scripts/validate-migrations.cjs
schema_test_db="companion_schema_test_${BASHPID}_${RANDOM}"
docker_local exec "$container_id" psql -v ON_ERROR_STOP=1 -U companion -d postgres -c "CREATE DATABASE $schema_test_db"
trap 'docker_local exec "$container_id" psql -v ON_ERROR_STOP=1 -U companion -d postgres -c "DROP DATABASE $schema_test_db WITH (FORCE)" >/dev/null' EXIT
node scripts/schema-test-bundle.cjs | docker_local exec -i "$container_id" \
  psql -v ON_ERROR_STOP=1 -U companion -d "$schema_test_db"
node scripts/test-chat-concurrency.cjs "$container_id" "$schema_test_db"
