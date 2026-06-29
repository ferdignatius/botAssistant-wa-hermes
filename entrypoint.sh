#!/bin/sh
# entrypoint.sh — Dijalankan oleh dumb-init sebelum Node.js app dimulai
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶  WA Gateway — Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Jalankan migrasi database (idempotent, aman dijalankan tiap restart)
echo "[1/2] Running Prisma database migration..."
node_modules/.bin/prisma migrate deploy

echo "[2/2] Starting application server..."
exec node dist/index.js
