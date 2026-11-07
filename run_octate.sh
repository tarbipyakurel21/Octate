#!/usr/bin/env sh
set -eu

docker compose up -d --build

cat <<'EOF'
The CVAT annotation engine is starting at http://localhost:8080.

Open: http://localhost:8080
Upload a video as a task. CVAT splits it into frames, then open the job to annotate.
Local models show up in that job under AI tools.

First run only, create an administrator with:
  docker compose exec cvat_server python manage.py createsuperuser

Local models (detector, segmenter, tracker) are in the annotation workspace under AI tools.
Model gateway health:
  curl http://localhost:8091/health
EOF
