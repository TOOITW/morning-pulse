#!/bin/bash

# Phase 1: Setup
git add package.json package-lock.json turbo.json .gitignore README.md
git add .env.example docker-compose.yml
git add .github/

# Apps/Web - Next.js Application
git add apps/web/package.json
git add apps/web/prisma/
git add apps/web/src/lib/db/
git add apps/web/src/lib/utils/
git add apps/web/src/lib/ingest/
git add apps/web/src/lib/services/
git add apps/web/src/lib/ranking/
git add apps/web/src/lib/queue/
git add apps/web/src/lib/email/
git add apps/web/src/lib/scheduler/
git add apps/web/src/lib/observability/

# Services/NLP-Py - Python Workers
git add services/nlp-py/pyproject.toml
git add services/nlp-py/README.md
git add services/nlp-py/.gitignore
git add services/nlp-py/src/
git add services/nlp-py/scripts/
git add services/nlp-py/tests/

# Scripts
git add scripts/

# Specs (if modified)
git add specs/

echo "✅ All files staged for commit"
echo ""
echo "You can now commit with:"
echo "git commit -F COMMIT_MESSAGE.md"
