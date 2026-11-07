#!/usr/bin/env sh
set -eu

exec docker compose exec cvat_server python manage.py createsuperuser
