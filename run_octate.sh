#!/usr/bin/env sh
set -eu

docker compose up -d --build

cat <<'EOF'
Octate is starting with the original CVAT interface.

Open: http://localhost:8080

First run only, create an administrator with:
  docker compose exec cvat_server python manage.py createsuperuser

Model gateway health:
  curl http://localhost:8091/health
EOF
