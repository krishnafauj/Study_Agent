// ── RAG Document Manager – Frontend Logic ──

const API = '';
let folders = [];
let currentFolderId = null;
let documents = [];

// ── DOM Elements ──
const $ = (id) => document.getElementById(id);

const folderListEl      = $('folderList');
const folderCountEl     = $('folderCount');
const newFolderInput    = $('newFolderInput');
const createFolderBtn   = $('createFolderBtn');
const emptyStateEl      = $('emptyState');
const folderViewEl      = $('folderView');
const currentFolderName = $('currentFolderName');
const docCountEl        = $('docCount');
const documentGridEl    = $('documentGrid');
const emptyDocsEl       = $('emptyDocs');
const uploadBtn         = $('uploadBtn');
const fileInput         = $('fileInput');
const deleteFolderBtn   = $('deleteFolderBtn');
const uploadProgressEl  = $('uploadProgress');
const uploadProgressFill= $('uploadProgressFill');
const uploadProgressText= $('uploadProgressText');
const toastContainer    = $('toastContainer');

// ── Toast Notifications ──
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
  };

  toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Folder Operations ──
async function loadFolders() {
  try {
    const res = await fetch(`${API}/api/folders`);
    if (!res.ok) throw new Error('Failed to load folders');
    folders = await res.json();
    renderFolders();
  } catch (err) {
    console.error(err);
    showToast('Failed to load folders', 'error');
  }
}

function renderFolders() {
  folderCountEl.textContent = folders.length;

  if (folders.length === 0) {
    folderListEl.innerHTML = `
      <div style="padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No folders yet. Create one above!
      </div>
    `;
    return;
  }

  folderListEl.innerHTML = folders
    .map(
      (f) => `
    <div class="folder-item ${f._id === currentFolderId ? 'active' : ''}" 
         data-id="${f._id}" onclick="selectFolder('${f._id}')">
      <div class="folder-item-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div class="folder-item-info">
        <div class="folder-item-name">${escapeHtml(f.name)}</div>
        <div class="folder-item-meta">${formatDate(f.createdAt)}</div>
      </div>
      <span class="folder-item-badge">${f.documentCount}</span>
    </div>
  `
    )
    .join('');
}

async function createFolder() {
  const name = newFolderInput.value.trim();
  if (!name) {
    showToast('Please enter a folder name', 'warning');
    newFolderInput.focus();
    return;
  }

  try {
    const res = await fetch(`${API}/api/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create folder');

    newFolderInput.value = '';
    showToast(`Folder "${name}" created`, 'success');
    await loadFolders();
    selectFolder(data._id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteFolder() {
  if (!currentFolderId) return;

  const folder = folders.find((f) => f._id === currentFolderId);
  const confirmed = confirm(
    `Delete folder "${folder?.name}"?\nThis will also delete all documents and their embeddings.`
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`${API}/api/folders/${currentFolderId}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete folder');

    showToast(`Folder "${folder?.name}" deleted`, 'success');
    currentFolderId = null;
    showEmptyState();
    await loadFolders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function selectFolder(folderId) {
  currentFolderId = folderId;
  const folder = folders.find((f) => f._id === folderId);

  if (!folder) return;

  // Update sidebar active state
  document.querySelectorAll('.folder-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === folderId);
  });

  // Show folder view
  emptyStateEl.style.display = 'none';
  folderViewEl.style.display = 'flex';
  currentFolderName.textContent = folder.name;

  await loadDocuments(folderId);
}

function showEmptyState() {
  emptyStateEl.style.display = 'flex';
  folderViewEl.style.display = 'none';
}

// ── Document Operations ──
async function loadDocuments(folderId) {
  try {
    const res = await fetch(`${API}/api/folders/${folderId}/documents`);
    if (!res.ok) throw new Error('Failed to load documents');
    documents = await res.json();
    renderDocuments();
  } catch (err) {
    console.error(err);
    showToast('Failed to load documents', 'error');
  }
}

function renderDocuments() {
  docCountEl.textContent = `${documents.length} document${documents.length !== 1 ? 's' : ''}`;

  if (documents.length === 0) {
    documentGridEl.style.display = 'none';
    emptyDocsEl.style.display = 'flex';
    return;
  }

  emptyDocsEl.style.display = 'none';
  documentGridEl.style.display = 'grid';

  documentGridEl.innerHTML = documents
    .map(
      (doc, i) => `
    <div class="doc-card" style="animation-delay: ${i * 0.05}s">
      <div class="doc-card-header">
        <div class="doc-card-icon">PDF</div>
        <div class="doc-card-title">
          <div class="doc-card-name" title="${escapeHtml(doc.fileName)}">${escapeHtml(doc.fileName)}</div>
          <div class="doc-card-size">${formatFileSize(doc.fileSize)}</div>
        </div>
      </div>
      <div class="doc-card-meta">
        <div class="doc-card-meta-item">
          <span class="doc-card-meta-dot ${doc.totalChunks > 0 ? 'success' : 'warning'}"></span>
          ${doc.totalChunks > 0 ? `${doc.totalChunks} chunks` : 'No embeddings'}
        </div>
        <div class="doc-card-meta-item">
          ${formatDate(doc.uploadedAt)}
        </div>
      </div>
      <div class="doc-card-actions">
        <button class="doc-action-btn" onclick="downloadDoc('${doc._id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
        </button>
        <button class="doc-action-btn danger" onclick="deleteDoc('${doc._id}', '${escapeHtml(doc.fileName)}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
          Delete
        </button>
      </div>
    </div>
  `
    )
    .join('');
}

async function uploadFile(file) {
  if (!currentFolderId) return;

  uploadProgressEl.style.display = 'block';
  uploadProgressFill.style.width = '10%';
  uploadProgressText.textContent = `Uploading ${file.name}...`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    uploadProgressFill.style.width = '40%';
    uploadProgressText.textContent = 'Uploading to server...';

    const res = await fetch(`${API}/api/folders/${currentFolderId}/upload`, {
      method: 'POST',
      body: formData,
    });

    uploadProgressFill.style.width = '90%';
    uploadProgressText.textContent = 'Processing...';

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    uploadProgressFill.style.width = '100%';
    uploadProgressText.textContent = 'Done!';

    showToast(data.message || `"${file.name}" uploaded successfully`, 'success');

    // Show warnings from the response
    if (data.warnings) {
      if (data.warnings.s3) showToast(data.warnings.s3, 'warning');
      if (data.warnings.embeddings) showToast(data.warnings.embeddings, 'warning');
    }

    await loadFolders();
    await loadDocuments(currentFolderId);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setTimeout(() => {
      uploadProgressEl.style.display = 'none';
      uploadProgressFill.style.width = '0%';
    }, 1500);
  }
}

async function downloadDoc(docId) {
  try {
    const res = await fetch(`${API}/api/documents/${docId}/download`);
    const data = await res.json();

    if (!res.ok) {
      if (data.error?.includes('S3 not configured')) {
        showToast('S3 not configured – cannot download files', 'warning');
      } else {
        throw new Error(data.error);
      }
      return;
    }

    window.open(data.url, '_blank');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteDoc(docId, fileName) {
  const confirmed = confirm(`Delete "${fileName}"? This will also remove all its vector embeddings.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API}/api/documents/${docId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete document');

    showToast(`"${fileName}" deleted`, 'success');
    await loadFolders();
    await loadDocuments(currentFolderId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Utilities ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Event Listeners ──
createFolderBtn.addEventListener('click', createFolder);

newFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createFolder();
});

deleteFolderBtn.addEventListener('click', deleteFolder);

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    uploadFile(file);
    fileInput.value = ''; // Reset for same file re-upload
  }
});

// ── Init ──
loadFolders();
