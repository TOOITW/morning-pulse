#!/bin/bash
# Format and lint Python code

set -e

cd "$(dirname "$0")/../.."

echo "🎨 Running Black formatter..."
poetry run black src/ tests/

echo "🔍 Running mypy type checker..."
poetry run mypy src/

echo "✨ Running Ruff linter..."
poetry run ruff check src/ tests/

echo "✅ All checks passed!"
