# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:18-bullseye-slim AS builder

WORKDIR /app

COPY package*.json ./
# Menggunakan npm ci untuk konsistensi lockfile
RUN npm ci

COPY prisma ./prisma/
# Generate Prisma Client di stage builder
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:18-bullseye-slim AS production

# Install dumb-init + Chromium
# (fonts-ipafont-gothic & fonts-wqy-zenhei untuk render emoji/karakter khusus WA)
# apt secara otomatis menarik seluruh shared libraries Chromium — tidak perlu eksplisit
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

# Konfigurasi Environment Puppeteer
# CATATAN: binaryTargets Prisma dikonfigurasi di prisma/schema.prisma, bukan di sini
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Copy package files dan install hanya production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# ── Prisma: Copy engine binaries + client ──────────────────────────────────
# Salin engine biner yang sudah di-generate di builder (openssl 3.x / bullseye)
COPY --from=builder /app/node_modules/.prisma        ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Salin Prisma CLI dari builder agar entrypoint.sh bisa menjalankan
# `prisma migrate deploy` tanpa perlu prisma di dependencies produksi
COPY --from=builder /app/node_modules/prisma         ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma    ./node_modules/.bin/prisma

# ── App artifacts ──────────────────────────────────────────────────────────
# Copy hasil compile dan skema database
COPY --from=builder /app/dist   ./dist
COPY --from=builder /app/prisma ./prisma

# ── Permission & Security ──────────────────────────────────────────────────
# Buat direktori mount-point volume SEBELUM ganti USER agar Docker
# menginisialisasi named volume dengan kepemilikan node (bukan root).
# Ini mencegah EACCES error saat container pertama kali dijalankan.
RUN mkdir -p .wwebjs_auth .wwebjs_cache \
    && chown -R node:node /app

# Copy entrypoint script dengan kepemilikan node
COPY --chown=node:node entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Jalankan container dengan user non-root demi keamanan
USER node

EXPOSE 3001

# dumb-init sebagai PID 1 agar Chromium zombie processes dibersihkan
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
# entrypoint.sh menjalankan prisma migrate deploy lalu node dist/index.js
CMD ["./entrypoint.sh"]
