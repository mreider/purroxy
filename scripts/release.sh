#!/bin/bash
set -e

# Usage: ./scripts/release.sh 0.2.0
# Bumps version in package.json, commits, tags, pushes.
# CI builds all platforms, uploads binaries + checksums + version.json.

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.3.0"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: version must be X.Y.Z format"
  exit 1
fi

cd "$(dirname "$0")/.."

CURRENT=$(node -p "require('./package.json').version")
echo "Current version: ${CURRENT}"
echo "New version:     ${VERSION}"
echo ""

# Bump version
npm version "$VERSION" --no-git-tag-version

# Commit and tag
git add package.json package-lock.json
git commit -m "Release v${VERSION}"
git tag -a "v${VERSION}" -m "Release v${VERSION}"

# Push (triggers CI)
git push origin main
git push origin "v${VERSION}"

echo ""
echo "Release v${VERSION} pushed."
echo "CI will build, sign, and upload for all platforms."
echo "Watch: https://github.com/mreider/purroxy/actions"
