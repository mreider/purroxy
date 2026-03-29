#!/bin/bash
cd "$(dirname "$0")"

echo "Building main process..."
npm run build:main

echo "Building renderer..."
npm run build:renderer

echo "Starting app..."
npm run start
