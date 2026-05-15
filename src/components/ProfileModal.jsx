import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'

export default function ProfileModal({ show, onClose }) {
  const { user, updateCustomPhoto, logout } = useAuth()
  const { showToast } = useToast()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState(null)

  // Load avatar via proxy (never expose Telegram URL)
  useEffect(() => {
    if (!show) return
    setAvatarSrc(null)
    if (user?.customPhotoFileId) {
      fetch(`/api/file?file_id=${encodeURIComponent(user.customPhotoFileId)}`)
        .then(r => r.blob())
        .then(b => setAvatarSrc(URL.createObjectURL(b)))
        .catch(() => setAvatarSrc(user?.picture || null))
    } else {
      setAvatarSrc(user?.picture || null)
    }
  }, [show, user?.customPhotoFileId])

  const avatarInitial = user?.name?.charAt(0).toUpperCase() || 'U'

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Gunakan file gambar (JPG, PNG, dll)', 'error'); return
    }
    setUploading(true)
    try {
      await updateCustomPhoto(file, user)
      showToast('Foto profil berhasil diperbarui', 'success')
    } catch {
      showToast('Gagal mengunggah foto, coba lagi', 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleLogout() {
    logout(); onClose()
    showToast('Sampai jumpa!', 'success')
  }

  if (!show) return null

  return (
    <div className="modal show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content">
        <h3>Profil Saya</h3>
        <div className="profile-avatar-upload" onClick={() => !uploading && fileRef.current?.click()}>
          <div
            className="profile-avatar-circle"
            style={avatarSrc ? { backgroundImage: `url('${avatarSrc}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          >
            {!avatarSrc && !uploading && avatarInitial}
            {uploading && <div className="loading-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: 0, borderTopColor: '#fff' }} />}
          </div>
          {!uploading && (
            <div className="profile-avatar-overlay"><i className="fas fa-camera" /></div>
          )}
          <input ref={fileRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={handlePhotoChange} />
        </div>
        <input type="text" value={user?.name || ''} readOnly
          style={{ cursor: 'default', background: '#f8fafc', color: '#536471', marginBottom: 12 }} />
        <input type="email" value={user?.email || ''} readOnly
          style={{ cursor: 'default', background: '#f8fafc', color: '#536471' }} />
        <div className="modal-buttons" style={{ justifyContent: 'space-between', marginTop: 24 }}>
          <button className="modal-btn danger" onClick={handleLogout} disabled={uploading}>
            <i className="fas fa-sign-out-alt" style={{ marginRight: 8 }} />Keluar
          </button>
          <button className="modal-btn cancel" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
