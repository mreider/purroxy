#!/bin/bash
# Build, deploy, and test purroxy.com
# Usage: ./scripts/deploy.sh

set -e
cd "$(dirname "$0")/.."

echo ""
echo "Building..."
npm run build

echo ""
echo "Deploying..."
wrangler pages deploy dist --project-name purroxy-web --commit-dirty=true

echo ""
echo "Waiting for deploy to propagate..."
sleep 5

echo ""
./scripts/test-deploy.sh https://purroxy.com
