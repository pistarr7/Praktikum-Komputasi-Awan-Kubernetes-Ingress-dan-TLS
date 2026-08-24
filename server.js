// =============================================================
// Cloud File Manager — Backend Server
// Aplikasi Express untuk mengelola file di MinIO object storage
// Tugas Praktikum Komputasi Awan
// =============================================================

const express = require('express');
const multer = require('multer');
const Minio = require('minio');
const path = require('path');

// =============================================================
// 1. KONFIGURASI — Baca dari environment variable
// =============================================================
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'minio-service';
const MINIO_PORT = parseInt(process.env.MINIO_PORT, 10) || 9000;
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'tugas3';

// Validasi kredensial wajib
if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  console.error('==========================================================');
  console.error('ERROR: MINIO_ACCESS_KEY dan MINIO_SECRET_KEY wajib diisi!');
  console.error('Pastikan environment variable sudah di-set sebelum menjalankan aplikasi.');
  console.error('Lihat file .env.example untuk daftar variabel yang diperlukan.');
  console.error('==========================================================');
  process.exit(1);
}

// =============================================================
// 2. INISIALISASI MINIO CLIENT
// =============================================================
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

// =============================================================
// 3. INISIALISASI EXPRESS & MULTER
// =============================================================
const app = express();

// Batas upload 50 MB menggunakan memoryStorage (file disimpan di RAM)
const UPLOAD_LIMIT = 50 * 1024 * 1024; // 50 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMIT },
});

// =============================================================
// 4. MIDDLEWARE — Logger request ke stdout
// =============================================================
app.use((req, res, next) => {
  const start = Date.now();
  // Catat waktu selesai respons
  res.on('finish', () => {
    const durasi = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durasi}ms`);
  });
  next();
});

// Serve file statis dari folder public/
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================
// 5. HELPER — Sanitasi nama file
// =============================================================
function sanitizeFileName(originalName) {
  // Ambil hanya basename, buang path traversal
  let name = path.basename(originalName);

  // Hapus karakter path traversal yang tersisa
  name = name.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');

  // Ganti spasi dengan dash
  name = name.replace(/\s+/g, '-');

  // Hapus karakter yang tidak aman untuk URL/S3
  name = name.replace(/[^a-zA-Z0-9._-]/g, '');

  // Jika nama kosong setelah sanitasi, beri nama default
  if (!name || name === '') {
    name = 'file';
  }

  // Tambahkan prefix timestamp agar unik
  return `${Date.now()}-${name}`;
}

// =============================================================
// 6. HELPER — Cek koneksi MinIO
// =============================================================
async function isMinioReachable() {
  try {
    await minioClient.bucketExists(MINIO_BUCKET);
    return true;
  } catch {
    return false;
  }
}

// =============================================================
// 7. KUBERNETES PROBES
// =============================================================

// Liveness probe — selalu 200, TIDAK menyentuh MinIO
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

// Readiness probe — cek apakah MinIO bisa dijangkau
app.get('/readyz', async (_req, res) => {
  const reachable = await isMinioReachable();
  if (reachable) {
    res.status(200).send('ok');
  } else {
    res.status(503).send('MinIO tidak dapat dijangkau');
  }
});

// =============================================================
// 8. REST API ROUTES
// =============================================================

// GET /api/health — Status kesehatan aplikasi + koneksi MinIO
app.get('/api/health', async (_req, res) => {
  const reachable = await isMinioReachable();
  const statusCode = reachable ? 200 : 503;
  res.status(statusCode).json({
    status: reachable ? 'healthy' : 'unhealthy',
    minio: reachable ? 'connected' : 'disconnected',
    bucket: MINIO_BUCKET,
  });
});

// GET /api/files — Daftar semua file di bucket
app.get('/api/files', async (_req, res) => {
  try {
    const files = [];
    const stream = minioClient.listObjectsV2(MINIO_BUCKET, '', true);

    // Kumpulkan semua objek dari stream
    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        files.push({
          name: obj.name,
          size: obj.size,
          lastModified: obj.lastModified,
        });
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    // Urutkan file terbaru di atas
    files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json(files);
  } catch (err) {
    console.error('Gagal mengambil daftar file:', err.message);
    res.status(500).json({ error: 'Gagal mengambil daftar file dari storage' });
  }
});

// POST /api/files — Upload file baru ke bucket
app.post('/api/files', (req, res) => {
  // Gunakan multer sebagai middleware inline untuk menangkap error ukuran
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Ukuran file melebihi batas maksimum (${UPLOAD_LIMIT / 1024 / 1024} MB)`,
        });
      }
      console.error('Error upload:', err.message);
      return res.status(400).json({ error: 'Gagal memproses file upload' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file yang dikirim. Gunakan field name "file".' });
    }

    try {
      const sanitizedName = sanitizeFileName(req.file.originalname);
      const buffer = req.file.buffer;
      const contentType = req.file.mimetype || 'application/octet-stream';

      // Upload ke MinIO
      await minioClient.putObject(MINIO_BUCKET, sanitizedName, buffer, buffer.length, {
        'Content-Type': contentType,
      });

      console.log(`File berhasil diupload: ${sanitizedName} (${buffer.length} bytes)`);

      res.status(201).json({
        message: 'File berhasil diupload',
        name: sanitizedName,
        size: buffer.length,
      });
    } catch (uploadErr) {
      console.error('Gagal upload ke MinIO:', uploadErr.message);
      res.status(500).json({ error: 'Gagal menyimpan file ke storage' });
    }
  });
});

// GET /api/files/:name — Download file dari bucket
app.get('/api/files/:name', async (req, res) => {
  const fileName = req.params.name;

  try {
    // Cek apakah file ada
    const stat = await minioClient.statObject(MINIO_BUCKET, fileName);

    // Set header untuk download
    res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    // Stream file ke response
    const stream = await minioClient.getObject(MINIO_BUCKET, fileName);
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'NotFound' || err.code === 'NoSuchKey') {
      res.status(404).json({ error: `File "${fileName}" tidak ditemukan` });
    } else {
      console.error('Gagal download file:', err.message);
      res.status(500).json({ error: 'Gagal mengunduh file dari storage' });
    }
  }
});

// DELETE /api/files/:name — Hapus file dari bucket
app.delete('/api/files/:name', async (req, res) => {
  const fileName = req.params.name;

  try {
    // Cek apakah file ada sebelum menghapus
    await minioClient.statObject(MINIO_BUCKET, fileName);

    // Hapus file
    await minioClient.removeObject(MINIO_BUCKET, fileName);
    console.log(`File berhasil dihapus: ${fileName}`);

    res.json({ message: `File "${fileName}" berhasil dihapus` });
  } catch (err) {
    if (err.code === 'NotFound' || err.code === 'NoSuchKey') {
      res.status(404).json({ error: `File "${fileName}" tidak ditemukan` });
    } else {
      console.error('Gagal menghapus file:', err.message);
      res.status(500).json({ error: 'Gagal menghapus file dari storage' });
    }
  }
});

// =============================================================
// 9. ERROR HANDLER GLOBAL
// =============================================================
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Terjadi kesalahan internal server' });
});

// =============================================================
// 10. STARTUP — Inisialisasi bucket & jalankan server
// =============================================================
async function startServer() {
  // Pastikan bucket ada, buat jika belum
  try {
    const exists = await minioClient.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(MINIO_BUCKET);
      console.log(`Bucket "${MINIO_BUCKET}" berhasil dibuat.`);
    } else {
      console.log(`Bucket "${MINIO_BUCKET}" sudah ada.`);
    }
  } catch (err) {
    console.error(`Gagal menginisialisasi bucket "${MINIO_BUCKET}":`, err.message);
    console.error('Aplikasi tetap berjalan, akan retry saat ada request.');
  }

  // Jalankan server di 0.0.0.0 agar bisa diakses dari luar container
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================================');
    console.log(`Cloud File Manager berjalan di http://0.0.0.0:${PORT}`);
    console.log(`MinIO: ${MINIO_ENDPOINT}:${MINIO_PORT} (SSL: ${MINIO_USE_SSL})`);
    console.log(`Bucket: ${MINIO_BUCKET}`);
    console.log('==========================================================');
  });

  // Graceful shutdown — Kubernetes mengirim SIGTERM saat pod dihapus
  process.on('SIGTERM', () => {
    console.log('SIGTERM diterima. Menutup server...');
    server.close(() => {
      console.log('Server ditutup dengan aman.');
      process.exit(0);
    });
  });
}

startServer();
