#!/usr/bin/env sh
set -eu

docker compose up -d --build

cat <<'EOF'
Octate is starting. CVAT's workflow is served at http://localhost:8080 with the Octate dashboard bar.

Open: http://localhost:8080
Sign in with the CVAT administrator. Tasks, jobs, and annotation are CVAT's.

First run only, create an administrator with:
  docker compose exec cvat_server python manage.py createsuperuser

Model gateway health:
  curl http://localhost:8091/health
EOF
