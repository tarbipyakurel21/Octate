#!/usr/bin/env sh
set -eu

docker compose up -d --build

cat <<'EOF'
Octate is starting at http://localhost:8080.

Upload a video as a task. The CVAT server splits it into frames; then open the
job to annotate it in the Octate editor. Detect runs the local instrument model.

First run only, create an administrator with:
  docker compose exec cvat_server python manage.py createsuperuser

Model gateway health:
  curl http://localhost:8091/health
EOF
