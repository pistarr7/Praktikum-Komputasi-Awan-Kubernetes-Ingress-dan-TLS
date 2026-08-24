# Cloud File Manager ☁️

Aplikasi web untuk mengelola file di **MinIO** (S3-compatible object storage),
didesain untuk di-deploy ke **Kubernetes (k3s)** di belakang NGINX Ingress.

> Tugas Praktikum Komputasi Awan — Semester 6

---

## 🚀 Fitur

- **Upload file** dengan drag-and-drop + progress bar (maks. 50 MB)
- **Daftar file** di bucket: nama, ukuran (human-readable), tanggal upload
- **Download** dan **hapus** file langsung dari browser
- **Preview thumbnail** untuk file gambar (jpg/png/gif/webp)
- **Status koneksi MinIO** real-time (indikator hijau/merah)
- **Kubernetes-ready**: liveness probe (`/healthz`) & readiness probe (`/readyz`)
- **Graceful shutdown** pada sinyal SIGTERM
- Dark theme, responsive (mobile-friendly)

---

## 📦 Tech Stack

| Layer    | Teknologi                       |
| -------- | ------------------------------- |
| Runtime  | Node.js 20                      |
| Backend  | Express                         |
| Storage  | MinIO (via package `minio`)     |
| Upload   | Multer (memoryStorage)          |
| Frontend | HTML + CSS + vanilla JavaScript |

---

## 🛠️ Cara Menjalankan Lokal

### Prasyarat

- **Node.js** ≥ 20
- **MinIO** server yang bisa dijangkau (bisa pakai Docker)

### 1. Jalankan MinIO (jika belum ada)

```bash
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

### 2. Clone & install dependencies

```bash
cd cloud-file-manager
npm install
```

### 3. Konfigurasi environment

```bash
# Salin template
cp .env.example .env

# Edit .env, isi kredensial MinIO
# Contoh untuk MinIO lokal:
#   MINIO_ENDPOINT=localhost
#   MINIO_PORT=9000
#   MINIO_ACCESS_KEY=minioadmin
#   MINIO_SECRET_KEY=minioadmin
```

> ⚠️ **Jangan commit file `.env` yang berisi kredensial asli!**

### 4. Jalankan aplikasi

```bash
# Development (auto-reload saat file berubah)
npm run dev

# Production
npm start
```

Aplikasi berjalan di `http://localhost:3000`

---

## 🐳 Menjalankan dengan Docker Compose (Rekomendasi)

Cara paling mudah — satu perintah menjalankan app + MinIO sekaligus:

```bash
cd cloud-file-manager
docker compose up --build
```

Setelah semua service sehat (tunggu ±15 detik):

| Service              | URL                          |
| -------------------- | ---------------------------- |
| **Cloud File Manager** | http://localhost:3000        |
| **MinIO Console**      | http://localhost:9001        |
| **MinIO API**          | http://localhost:9000        |

Kredensial MinIO default (untuk testing lokal): `minioadmin` / `minioadmin`

Untuk menghentikan semua service:

```bash
docker compose down            # stop & hapus container
docker compose down -v         # juga hapus volume (data MinIO)
```

### Menguji Upload & Download

```bash
# Upload file via curl
curl -F "file=@foto.jpg" http://localhost:3000/api/files

# Lihat daftar file
curl http://localhost:3000/api/files

# Download file (ganti NAMA_FILE dengan nama dari daftar)
curl -OJ http://localhost:3000/api/files/NAMA_FILE

# Hapus file
curl -X DELETE http://localhost:3000/api/files/NAMA_FILE

# Cek health
curl http://localhost:3000/api/health
```

Atau buka `http://localhost:3000` di browser untuk menggunakan UI.

---

## 🏗️ Docker Build untuk ARM64 (Oracle Cloud Ampere A1)

VM Oracle Cloud Ampere A1 menggunakan prosesor **ARM (aarch64)**. Jika kamu
melakukan build di laptop/PC x86_64, image yang dihasilkan tidak akan bisa
berjalan di VM ARM. Kamu perlu **cross-build** menggunakan Docker Buildx:

```bash
# 1. Buat builder multi-platform (sekali saja)
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# 2. Build & push image untuk ARM64
#    Ganti <registry>/<user>/<image> dengan registry kamu
docker buildx build \
  --platform linux/arm64 \
  -t <registry>/<user>/cloud-file-manager:latest \
  --push .
```

**Kenapa perlu buildx?**
Prosesor x86_64 (laptop) dan ARM64 (Ampere A1) punya set instruksi berbeda.
Binary yang dikompilasi untuk x86 tidak bisa berjalan di ARM dan sebaliknya.
Buildx menggunakan QEMU emulation untuk mengkompilasi image di arsitektur
target meskipun host-nya berbeda. Flag `--platform linux/arm64` memastikan
semua binary di dalam image (termasuk `node`, `tini`, dan native addons)
dikompilasi untuk ARM64.

> **Catatan:** Semua dependency npm yang dipakai (`express`, `minio`, `multer`)
> adalah pure-JavaScript — tidak ada native addon yang perlu dikompilasi,
> sehingga aman untuk cross-platform tanpa masalah kompatibilitas.

---

## 🔌 REST API

| Method   | Endpoint           | Keterangan                                 |
| -------- | ------------------ | ------------------------------------------ |
| `GET`    | `/api/health`      | Status kesehatan + koneksi MinIO           |
| `GET`    | `/api/files`       | Daftar semua file di bucket                |
| `POST`   | `/api/files`       | Upload file (multipart, field: `file`)     |
| `GET`    | `/api/files/:name` | Download file                              |
| `DELETE` | `/api/files/:name` | Hapus file dari bucket                     |
| `GET`    | `/healthz`         | Liveness probe (selalu 200)                |
| `GET`    | `/readyz`          | Readiness probe (cek koneksi MinIO)        |

---

## 🌐 Environment Variables

| Variable           | Wajib | Default           | Keterangan                    |
| ------------------ | ----- | ----------------- | ----------------------------- |
| `PORT`             | ❌    | `3000`            | Port aplikasi                 |
| `MINIO_ENDPOINT`   | ❌    | `minio-service`   | Hostname MinIO                |
| `MINIO_PORT`       | ❌    | `9000`            | Port API MinIO                |
| `MINIO_USE_SSL`    | ❌    | `false`           | Gunakan SSL?                  |
| `MINIO_ACCESS_KEY` | ✅    | —                 | Access key MinIO              |
| `MINIO_SECRET_KEY` | ✅    | —                 | Secret key MinIO              |
| `MINIO_BUCKET`     | ❌    | `tugas3`          | Nama bucket                   |

---

## 📁 Struktur Project

```
cloud-file-manager/
├── server.js            # Backend Express (satu file)
├── package.json         # Dependencies & scripts
├── .env.example         # Template environment variables
├── .gitignore           # File yang tidak di-track git
├── .dockerignore        # File yang tidak masuk Docker image
├── Dockerfile           # Multi-stage build (Alpine + tini)
├── docker-compose.yml   # App + MinIO untuk testing lokal
├── README.md            # Dokumentasi (file ini)
└── public/
    ├── index.html       # Halaman utama
    ├── style.css        # Dark theme stylesheet
    └── app.js           # Client-side logic
```
