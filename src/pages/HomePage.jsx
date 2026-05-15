import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useFiles } from '../hooks/useFiles'
import { useToast } from '../components/Toast'
import ProfileModal from '../components/ProfileModal'
import UploadModal from '../components/UploadModal'
import FilePreviewModal from '../components/FilePreviewModal'

export default function HomePage() {
  const { user } = useAuth()
  const { files, loading: filesLoading, uploading, syncFromTelegram, uploadFile, getFileUrl, getDownloadUrl, renameFile, deleteFile, deleteFolder, moveFile, createFolder, compressFile } = useFiles(user)
  const { showToast } = useToast()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState('root')
  const [activeNav, setActiveNav] = useState('all')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)

  const [showProfile, setShowProfile] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showMove, setShowMove] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [menuState, setMenuState] = useState({ show: false, x: 0, y: 0, file: null })

  const [renameVal, setRenameVal] = useState('')
  const [folderVal, setFolderVal] = useState('Folder Baru')

  const [avatarBlobUrl, setAvatarBlobUrl] = useState(null)
  const avatarInitial = user?.name?.charAt(0).toUpperCase() || 'U'

  useEffect(() => {
    setAvatarBlobUrl(null)
    if (user?.customPhotoFileId) {
      fetch(`/api/file?file_id=${encodeURIComponent(user.customPhotoFileId)}`)
        .then(r => r.blob())
        .then(b => setAvatarBlobUrl(URL.createObjectURL(b)))
        .catch(() => setAvatarBlobUrl(user?.picture || null))
    } else {
      setAvatarBlobUrl(user?.picture || null)
    }
  }, [user?.customPhotoFileId, user?.picture])

  const avatarSrc = avatarBlobUrl

  const filteredFiles = useMemo(() => {
    if (activeNav === 'all') return files.filter(f => f.path === currentPath)
    if (activeNav === 'recent') return [...files].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 20)
    if (activeNav === 'starred') return files.filter(f => f.starred)
    if (activeNav === 'trash') return files.filter(f => f.trashed)
    return files.filter(f => f.path === currentPath)
  }, [files, currentPath, activeNav])

  const folders = useMemo(() => files.filter(f => f.type === 'folder'), [files])

  const usedBytes = useMemo(() => {
    return files.reduce((acc, f) => {
      if (f.type === 'folder') return acc
      const sizeStr = f.size || '0'
      const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i)
      if (!match) return acc
      const val = parseFloat(match[1])
      const unit = (match[2] || 'B').toUpperCase()
      const mult = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 }
      return acc + val * (mult[unit] || 1)
    }, 0)
  }, [files])
  const totalBytes = 15 * 1073741824
  const usedPct = Math.min(100, (usedBytes / totalBytes) * 100).toFixed(1)
  const usedLabel = formatBytes(usedBytes)
  const freeLabel = formatBytes(totalBytes - usedBytes)

  function toggleSidebar() { setSidebarOpen(p => !p) }

  function navigateTo(path) {
    setCurrentPath(path)
    setActiveNav('all')
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }

  function handleNavChange(view) {
    setActiveNav(view)
    if (view === 'all') setCurrentPath('root')
    if (window.innerWidth <= 768) setSidebarOpen(false)
  }

  function toggleSelect(id) {
    setSelectedFiles(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function openContextMenu(e, file) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuState({ show: true, x: rect.left, y: rect.bottom + window.scrollY, file })
  }

  function closeMenu() {
    setMenuState(p => ({ ...p, show: false }))
  }

  function openFile(file) {
    if (!file) return
    if (file.type === 'folder') {
      navigateTo(file.path + '/' + file.name)
    } else if (file.telegramFileId) {
      setActiveFile(file)
      setShowPreview(true)
    } else {
      showToast('File ini belum diunggah ke penyimpanan', 'error')
    }
    closeMenu()
  }

  function startRename(file) {
    setActiveFile(file)
    setRenameVal(file.name)
    setShowRename(true)
    closeMenu()
  }

  function confirmRename() {
    if (renameVal.trim() && activeFile) {
      renameFile(activeFile.id, renameVal.trim())
      showToast('Nama berhasil diubah', 'success')
    }
    setShowRename(false)
  }

  function startDelete(file) {
    setActiveFile(file)
    setShowDelete(true)
    closeMenu()
  }

  async function confirmDelete() {
    if (activeFile) {
      try {
        if (activeFile.type === 'folder') {
          await deleteFolder(activeFile.id)
        } else {
          await deleteFile(activeFile.id)
        }
        showToast(`${activeFile.type === 'folder' ? 'Folder' : 'File'} berhasil dihapus`, 'success')
      } catch {
        showToast('Gagal menghapus, coba lagi', 'error')
      }
    }
    setShowDelete(false)
  }

  function startMove(file) {
    setActiveFile(file)
    setMoveTarget(null)
    setShowMove(true)
    closeMenu()
  }

  function startMoveSelected() {
    if (!selectedFiles.length) { showToast('Pilih file terlebih dahulu', 'error'); return }
    setActiveFile(null)
    setMoveTarget(null)
    setShowMove(true)
  }

  function confirmMove() {
    if (!moveTarget) { showToast('Pilih folder tujuan terlebih dahulu', 'error'); return }
    const ids = activeFile ? [activeFile.id] : selectedFiles
    moveFile(ids, moveTarget)
    setSelectedFiles([])
    setShowMove(false)
    showToast('File berhasil dipindahkan', 'success')
  }

  function handleCompress(file) {
    compressFile(file)
    showToast(`${file.name} berhasil dikompres`, 'success')
    closeMenu()
  }

  async function handleDownload(file) {
    if (!file.telegramFileId) { showToast('File belum tersedia untuk diunduh', 'error'); return }
    closeMenu()
    try {
      const dlUrl = await getDownloadUrl(file)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      showToast('Gagal membuat link unduhan', 'error')
    }
  }

  async function handleUpload(filesList) {
    setShowUpload(false)
    let success = 0
    for (const f of filesList) {
      try {
        await uploadFile(f, currentPath)
        success++
      } catch (err) {
        showToast(`Gagal mengunggah ${f.name}`, 'error')
      }
    }
    if (success) {
      showToast(`${success} file berhasil diunggah`, 'success')
    }
  }

  function handleCreateFolder() {
    if (folderVal.trim()) {
      createFolder(folderVal.trim(), currentPath)
      showToast(`Folder "${folderVal.trim()}" berhasil dibuat`, 'success')
    }
    setShowNewFolder(false)
    setFolderVal('Folder Baru')
  }

  const pathParts = currentPath === 'root' ? [] : currentPath.replace('root/', '').split('/')

  return (
    <>
      <div className="app-container" onClick={closeMenu}>
        <div className="top-bar">
          <div className="top-bar-left">
            <button className="menu-toggle" onClick={e => { e.stopPropagation(); toggleSidebar() }}>
              <i className="fas fa-bars" />
            </button>
            <div className="logo">
              <i className="fas fa-cloud" />
              <span>Satriaclouds</span>
            </div>
          </div>
          <div className="top-bar-right">
            <div
              className="profile-btn"
              onClick={e => { e.stopPropagation(); setShowProfile(true) }}
              style={avatarSrc ? { backgroundImage: `url('${avatarSrc}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
            >
              {!avatarSrc && avatarInitial}
            </div>
          </div>
        </div>

        {(uploading || filesLoading) && (
          <div style={{position:'fixed',top:70,left:0,right:0,zIndex:150,background:'#fff',borderBottom:'1px solid #eef2f6',padding:'10px 20px',display:'flex',alignItems:'center',gap:12}}>
            <div className="loading-spinner" style={{width:20,height:20,borderWidth:3,margin:0,flexShrink:0}} />
            <span style={{fontSize:14,color:'#0f1419',fontWeight:500}}>
              {uploading ? 'Sedang mengunggah file...' : 'Memuat file dari penyimpanan...'}
            </span>
            <div style={{flex:1,height:4,background:'#eef2f6',borderRadius:4,overflow:'hidden',marginLeft:'auto',maxWidth:200}}>
              <div style={{height:'100%',background:'#1d9bf0',borderRadius:4,animation:'progress-indeterminate 1.5s infinite'}} />
            </div>
          </div>
        )}

        {sidebarOpen && (
          <div className="sidebar-overlay active" onClick={toggleSidebar} />
        )}

        <div className={`sidebar${sidebarOpen ? ' active' : ''}`} onClick={e => e.stopPropagation()}>
          <div className="sidebar-header">
            <i className="fas fa-cloud" />
            <h2>Satriaclouds</h2>
          </div>
          <div className="sidebar-content">
            <div className="user-card" onClick={() => { setShowProfile(true); if (window.innerWidth <= 768) setSidebarOpen(false) }}>
              <div
                className="user-avatar-large"
                style={avatarSrc ? { backgroundImage: `url('${avatarSrc}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
              >
                {!avatarSrc && avatarInitial}
              </div>
              <div className="user-info">
                <h3>{user?.name || '-'}</h3>
                <p>{user?.email || '-'}</p>
              </div>
            </div>

            <div className="storage-card">
              <div className="storage-title">
                <i className="fas fa-database" />
                <h4>Penyimpanan</h4>
              </div>
              <div className="storage-bar">
                <div className="storage-used" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="storage-numbers">
                <span>Digunakan {usedLabel}</span>
                <span>Sisa {freeLabel}</span>
              </div>
            </div>

            <div className={`nav-item${activeNav === 'all' ? ' active' : ''}`} onClick={() => handleNavChange('all')}>
              <i className="fas fa-cloud" /><span>Semua File</span>
            </div>
            <div className={`nav-item${activeNav === 'recent' ? ' active' : ''}`} onClick={() => handleNavChange('recent')}>
              <i className="fas fa-clock" /><span>Terbaru</span>
            </div>
            <div className={`nav-item${activeNav === 'starred' ? ' active' : ''}`} onClick={() => handleNavChange('starred')}>
              <i className="fas fa-star" /><span>Berbintang</span>
            </div>
            <div className={`nav-item${activeNav === 'trash' ? ' active' : ''}`} onClick={() => handleNavChange('trash')}>
              <i className="fas fa-trash" /><span>Sampah</span>
            </div>
          </div>
        </div>

        <div className="main-content">
          <div className="path-bar">
            <div className="path-item" onClick={() => navigateTo('root')}>
              <i className="fas fa-home" />
            </div>
            {pathParts.map((part, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-chevron-right path-separator" />
                <div className="path-item">{part}</div>
              </span>
            ))}
            {pathParts.length === 0 && (
              <>
                <i className="fas fa-chevron-right path-separator" />
                <div className="path-item">Semua File</div>
              </>
            )}
          </div>

          <div className="action-bar">
            <button className="action-btn primary" onClick={e => { e.stopPropagation(); setShowUpload(true) }}>
              <i className="fas fa-upload" /><span>Upload</span>
            </button>
            <button className="action-btn" onClick={e => { e.stopPropagation(); setFolderVal('Folder Baru'); setShowNewFolder(true) }}>
              <i className="fas fa-folder-plus" /><span>Folder Baru</span>
            </button>
            <button className="action-btn" onClick={e => { e.stopPropagation(); startMoveSelected() }}>
              <i className="fas fa-arrows-alt" /><span>Pindah</span>
            </button>
          </div>

          <div className="files-grid">
            {filteredFiles.length === 0 ? (
              <div className="empty-state">
                <i className="fas fa-folder-open" />
                <h3>Folder ini masih kosong</h3>
                <p>Unggah file pertama kamu atau buat folder baru untuk mulai mengorganisir</p>
              </div>
            ) : filteredFiles.map(file => (
              <div key={file.id} className="file-item">
                <input
                  type="checkbox"
                  className="file-checkbox"
                  checked={selectedFiles.includes(file.id)}
                  onChange={() => toggleSelect(file.id)}
                />
                <div
                  className="file-icon"
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => openFile(file)}
                  onClick={e => { if (file.type !== 'folder') { e.stopPropagation(); openFile(file) } }}
                >
                  {file.type === 'image' ? (
                    <TelegramThumb localThumb={file.localThumb} fileId={file.telegramFileId} icon={file.icon} getFileUrl={getFileUrl} />
                  ) : (
                    <i className={`fas ${file.icon}`} />
                  )}
                </div>
                <div className="file-details">
                  <div className="file-name">{file.name}</div>
                  <div className="file-info">
                    <span>{file.size}</span>
                    <span>{file.modified}</span>
                  </div>
                </div>
                <button
                  className="file-menu-btn"
                  onClick={e => { e.stopPropagation(); openContextMenu(e, file) }}
                >
                  <i className="fas fa-ellipsis-v" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {menuState.show && (
        <div
          className="dropdown-menu"
          style={{ top: menuState.y, left: menuState.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="menu-item" onClick={() => openFile(menuState.file)}>
            <i className="fas fa-folder-open" /><span>Buka</span>
          </div>
          <div className="menu-item" onClick={() => startRename(menuState.file)}>
            <i className="fas fa-edit" /><span>Ubah Nama</span>
          </div>
          <div className="menu-item" onClick={() => handleDownload(menuState.file)}>
            <i className="fas fa-download" /><span>Unduh</span>
          </div>
          <div className="menu-divider" />
          <div className="menu-item" onClick={() => startMove(menuState.file)}>
            <i className="fas fa-arrows-alt" /><span>Pindah</span>
          </div>
          <div className="menu-item" onClick={() => handleCompress(menuState.file)}>
            <i className="fas fa-file-zipper" /><span>Kompres</span>
          </div>
          <div className="menu-divider" />
          <div className="menu-item danger" onClick={() => startDelete(menuState.file)}>
            <i className="fas fa-trash" /><span>Hapus</span>
          </div>
        </div>
      )}

      <ProfileModal show={showProfile} onClose={() => setShowProfile(false)} />

      <UploadModal
        show={showUpload}
        onClose={() => setShowUpload(false)}
        onUpload={handleUpload}
      />

      {showPreview && (
        <FilePreviewModal
          file={activeFile}
          getFileUrl={getFileUrl}
          getDownloadUrl={getDownloadUrl}
          onClose={() => { setShowPreview(false); setActiveFile(null) }}
        />
      )}

      {showRename && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowRename(false) }}>
          <div className="modal-content">
            <h3>Ubah Nama</h3>
            <input
              type="text"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmRename()}
              autoFocus
            />
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowRename(false)}>Batal</button>
              <button className="modal-btn confirm" onClick={confirmRename}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowDelete(false) }}>
          <div className="modal-content">
            <h3>Hapus File</h3>
            <p style={{ color: '#536471', marginBottom: 24 }}>
              Yakin ingin menghapus <strong>{activeFile?.name}</strong>? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowDelete(false)}>Batal</button>
              <button className="modal-btn danger" onClick={confirmDelete}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      {showMove && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowMove(false) }}>
          <div className="modal-content">
            <h3>Pindahkan ke</h3>
            <div className="folder-list">
              <div
                className={`folder-item${moveTarget === 'root' ? ' selected' : ''}`}
                onClick={() => setMoveTarget('root')}
              >
                <i className="fas fa-folder" /> Semua File
              </div>
              {folders.map(f => (
                <div
                  key={f.id}
                  className={`folder-item${moveTarget === f.path + '/' + f.name ? ' selected' : ''}`}
                  onClick={() => setMoveTarget(f.path + '/' + f.name)}
                >
                  <i className="fas fa-folder" /> {f.name}
                </div>
              ))}
            </div>
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowMove(false)}>Batal</button>
              <button className="modal-btn confirm" onClick={confirmMove}>Pindah</button>
            </div>
          </div>
        </div>
      )}

      {showNewFolder && (
        <div className="modal show" onClick={e => { if (e.target === e.currentTarget) setShowNewFolder(false) }}>
          <div className="modal-content">
            <h3>Buat Folder Baru</h3>
            <input
              type="text"
              value={folderVal}
              onChange={e => setFolderVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              autoFocus
            />
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowNewFolder(false)}>Batal</button>
              <button className="modal-btn confirm" onClick={handleCreateFolder}>Buat</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TelegramThumb({ localThumb, fileId, cachedUrl, icon, getFileUrl }) {
  // localThumb is a data URL saved at upload time — always works, never expires
  const [src, setSrc] = useState(localThumb || null)
  const attempted = useRef(!!localThumb)

  useEffect(() => {
    // Only fetch from Telegram if no local thumb (e.g. old uploads before this fix)
    if (attempted.current || !fileId) return
    attempted.current = true
    getFileUrl(fileId, cachedUrl).then(setSrc).catch(() => {})
  }, [fileId])

  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 12, display: 'block', margin: '0 auto' }}
        onError={() => setSrc(null)}
      />
    )
  }
  return <i className={`fas ${icon}`} />
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const s = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + s[i]
}
