# =============================================================
# Cloud File Manager — Dockerfile
# Multi-stage build untuk image sekecil mungkin
# Target: linux/arm64 (Oracle Cloud Ampere A1)
# =============================================================

# ---- Stage 1: Builder ----
# Install dependency produksi saja di stage terpisah
FROM node:20-alpine AS builder

WORKDIR /build

# Salin file manifest dulu (layer caching: hanya re-install kalau
# package.json atau package-lock.json berubah)
COPY package.json package-lock.json ./

# --omit=dev: jangan install devDependencies
# --ignore-scripts: skip postinstall scripts untuk keamanan
RUN npm ci --omit=dev --ignore-scripts

# ---- Stage 2: Runtime ----
# Image final yang akan di-deploy
FROM node:20-alpine AS runtime

# Install tini — init ringan yang meneruskan sinyal (SIGTERM)
# dengan benar ke proses child. Tanpa ini, Node.js di PID 1
# tidak akan menerima SIGTERM dari Kubernetes.
RUN apk add --no-cache tini

# Buat user non-root untuk keamanan (jangan jalankan sebagai root)
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Salin dependency dari stage builder
COPY --from=builder /build/node_modules ./node_modules

# Salin source code aplikasi (hanya file yang dibutuhkan)
COPY package.json ./
COPY server.js ./
COPY public/ ./public/

# Ganti kepemilikan ke user non-root
RUN chown -R app:app /app

# Jalankan sebagai user non-root
USER app

# Port default aplikasi
EXPOSE 3000

# Healthcheck: cek liveness endpoint setiap 30 detik
# wget digunakan karena curl tidak tersedia di Alpine secara default
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Gunakan tini sebagai entrypoint agar SIGTERM diteruskan ke Node.js
ENTRYPOINT ["/sbin/tini", "--"]

# Jalankan aplikasi
CMD ["node", "server.js"]
