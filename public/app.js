// =============================================================
// Cloud File Manager — Client-side JavaScript
// Menangani upload, daftar file, download, hapus, dan status
// =============================================================

(function () {
  'use strict';

  // ----- Elemen DOM -----
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const progressContainer = document.getElementById('progressContainer');
  const progressFilename = document.getElementById('progressFilename');
  const progressPercent = document.getElementById('progressPercent');
  const progressFill = document.getElementById('progressFill');
  const progressStatus = document.getElementById('progressStatus');
  const tableWrapper = document.getElementById('tableWrapper');
  const fileTableBody = document.getElementById('fileTableBody');
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const refreshBtn = document.getElementById('refreshBtn');
  const toastContainer = document.getElementById('toastContainer');

  // ----- Ekstensi gambar yang bisa di-preview -----
  const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  // =============================================================
  // TOAST NOTIFICATION
  // =============================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Hapus setelah animasi selesai
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 4000);
  }

  // =============================================================
  // FORMAT HELPER
  // =============================================================

  // Konversi bytes ke format yang mudah dibaca (KB, MB, GB)
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  // Format tanggal ke locale Indonesia
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Cek apakah file adalah gambar berdasarkan ekstensi
  function isImageFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  }

  // =============================================================
  // HEALTH CHECK — Cek koneksi ke MinIO
  // =============================================================
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();

      if (data.minio === 'connected') {
        statusDot.className = 'status-dot connected';
        statusText.textContent = `MinIO Terhubung — ${data.bucket}`;
      } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'MinIO Terputus';
      }
    } catch {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Server Tidak Merespons';
    }
  }

  // =============================================================
  // DAFTAR FILE — Ambil dan render daftar file dari bucket
  // =============================================================
  async function loadFiles() {
    // Tampilkan loading
    loadingState.classList.add('active');
    tableWrapper.classList.remove('active');
    emptyState.classList.remove('active');

    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Gagal mengambil daftar file');

      const files = await res.json();

      // Sembunyikan loading
      loadingState.classList.remove('active');

      if (files.length === 0) {
        // Tampilkan empty state
        emptyState.classList.add('active');
        tableWrapper.classList.remove('active');
        return;
      }

      // Tampilkan tabel
      tableWrapper.classList.add('active');
      emptyState.classList.remove('active');

      // Render baris tabel
      fileTableBody.innerHTML = files
        .map((file, index) => {
          const isImage = isImageFile(file.name);
          const previewCell = isImage
            ? `<img class="file-thumbnail" src="/api/files/${encodeURIComponent(file.name)}" alt="${file.name}" loading="lazy">`
            : `<div class="file-icon-placeholder">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 2H11L14 5V16H4V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                  <path d="M11 2V5H14" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
                </svg>
              </div>`;

          return `
            <tr style="animation-delay: ${index * 0.05}s">
              <td>${previewCell}</td>
              <td><span class="file-name">${escapeHtml(file.name)}</span></td>
              <td><span class="file-meta">${formatBytes(file.size)}</span></td>
              <td><span class="file-meta">${formatDate(file.lastModified)}</span></td>
              <td>
                <div class="file-actions">
                  <button class="btn btn-icon" title="Download" onclick="window.CFM.downloadFile('${escapeAttr(file.name)}')">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V10M7 10L4 7M7 10L10 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 11V12H12V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="btn btn-danger" title="Hapus" onclick="window.CFM.deleteFile('${escapeAttr(file.name)}')">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 4H11L10.3 12H3.7L3 4Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.5 6.5V9.5M8.5 6.5V9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M2 4H12M5 4V2.5H9V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      loadingState.classList.remove('active');
      emptyState.classList.add('active');
      showToast('Gagal memuat daftar file', 'error');
      console.error('loadFiles error:', err);
    }
  }

  // ----- Escape HTML untuk keamanan XSS -----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Escape untuk atribut onclick
  function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  // =============================================================
  // UPLOAD FILE — Kirim file ke server dengan progress tracking
  // =============================================================
  function uploadFile(file) {
    // Validasi ukuran di client (50 MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      showToast(`File "${file.name}" melebihi batas 50 MB`, 'error');
      return;
    }

    // Tampilkan progress bar
    progressContainer.classList.add('active');
    progressFilename.textContent = file.name;
    progressPercent.textContent = '0%';
    progressFill.style.width = '0%';
    progressStatus.textContent = 'Mengupload...';
    progressStatus.className = 'progress-status';

    const formData = new FormData();
    formData.append('file', file);

    // Gunakan XMLHttpRequest untuk progress tracking
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        progressStatus.textContent = `Mengupload... ${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressStatus.textContent = 'Upload berhasil!';
        progressStatus.className = 'progress-status success';
        showToast(`File "${file.name}" berhasil diupload`, 'success');

        // Refresh daftar file
        loadFiles();

        // Sembunyikan progress setelah beberapa detik
        setTimeout(() => {
          progressContainer.classList.remove('active');
        }, 3000);
      } else {
        let errorMsg = 'Gagal mengupload file';
        try {
          const resp = JSON.parse(xhr.responseText);
          errorMsg = resp.error || errorMsg;
        } catch { /* abaikan parse error */ }

        progressStatus.textContent = errorMsg;
        progressStatus.className = 'progress-status error';
        showToast(errorMsg, 'error');
      }
    });

    xhr.addEventListener('error', () => {
      progressStatus.textContent = 'Koneksi terputus saat upload';
      progressStatus.className = 'progress-status error';
      showToast('Koneksi terputus saat upload', 'error');
    });

    xhr.open('POST', '/api/files');
    xhr.send(formData);
  }

  // =============================================================
  // DOWNLOAD FILE
  // =============================================================
  function downloadFile(name) {
    // Buka di tab baru untuk trigger download
    window.open(`/api/files/${encodeURIComponent(name)}`, '_blank');
  }

  // =============================================================
  // HAPUS FILE — Konfirmasi lalu hapus dari bucket
  // =============================================================
  async function deleteFile(name) {
    const confirmed = confirm(`Yakin ingin menghapus file "${name}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/files/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast(`File "${name}" berhasil dihapus`, 'success');
        loadFiles();
      } else {
        const data = await res.json();
        showToast(data.error || 'Gagal menghapus file', 'error');
      }
    } catch (err) {
      showToast('Gagal menghapus file', 'error');
      console.error('deleteFile error:', err);
    }
  }

  // =============================================================
  // DRAG & DROP HANDLERS
  // =============================================================
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Hanya hapus class jika benar-benar keluar dari dropZone
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  });

  // Klik drop zone juga buka file picker
  dropZone.addEventListener('click', (e) => {
    // Jangan trigger kalau klik tombol di dalam dropZone
    if (e.target.tagName === 'LABEL' || e.target.tagName === 'INPUT') return;
    fileInput.click();
  });

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      uploadFile(fileInput.files[0]);
      fileInput.value = ''; // Reset agar bisa upload file yang sama
    }
  });

  // Tombol refresh
  refreshBtn.addEventListener('click', () => {
    loadFiles();
    checkHealth();
  });

  // =============================================================
  // EXPOSE FUNGSI KE GLOBAL (untuk onclick di HTML)
  // =============================================================
  window.CFM = {
    downloadFile,
    deleteFile,
  };

  // =============================================================
  // INISIALISASI — Jalankan saat halaman dimuat
  // =============================================================
  checkHealth();
  loadFiles();

  // Auto-refresh health setiap 30 detik
  setInterval(checkHealth, 30000);
})();
