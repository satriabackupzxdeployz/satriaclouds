import { useEffect, useState } from 'react'

export default function FilePreviewModal({ file, getFileUrl, getDownloadUrl, onClose }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!file) return
    setLoading(true); setError(null); setUrl(null)

    // For images: use local thumbnail immediately if available — no network needed
    if (file.type === 'image' && file.localThumb) {
      setUrl(file.localThumb)
      setLoading(false)
      return
    }

    if (file.telegramFileId) {
      getFileUrl(file.telegramFileId)
        .then(u => { setUrl(u); setLoading(false) })
        .catch(() => { setError('Gagal memuat file — coba lagi nanti'); setLoading(false) })
    } else {
      setError('File ini belum punya data penyimpanan')
      setLoading(false)
    }
  }, [file])

  async function handleDownload() {
    if (!file?.telegramFileId) return
    setDownloading(true)
    try {
      const dlUrl = await getDownloadUrl(file)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      if (url) window.open(url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  if (!file) return null

  const isImage = file.type === 'image'
  const isVideo = file.type === 'video'
  const isAudio = file.type === 'audio'

  return (
    <div className="preview-modal show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <button className="preview-close" onClick={onClose}>
        <i className="fas fa-times" />
      </button>

      {loading && (
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" style={{ borderTopColor: '#fff', margin: '0 auto 12px' }} />
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }}>Memuat file...</p>
        </div>
      )}

      {error && <p style={{ color: '#f87171', textAlign: 'center', padding: 20 }}>{error}</p>}

      {!loading && !error && url && (
        <>
          {isImage && (
            <img
              src={url}
              alt={file.name}
              style={{ maxWidth: '90vw', maxHeight: '75vh', borderRadius: 16, objectFit: 'contain' }}
            />
          )}
          {isVideo && (
            <video src={url} controls autoPlay
              style={{ maxWidth: '90vw', maxHeight: '75vh', borderRadius: 16 }} />
          )}
          {isAudio && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                background: 'rgba(29,155,240,.2)', border: '2px solid rgba(29,155,240,.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <i className="fas fa-music" style={{ fontSize: 40, color: '#1d9bf0' }} />
              </div>
              <p style={{ color: '#fff', marginBottom: 24, fontSize: 16, fontWeight: 600 }}>{file.name}</p>
              <audio src={url} controls style={{ width: '100%', maxWidth: 360 }} />
            </div>
          )}
          {!isImage && !isVideo && !isAudio && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: 100, height: 100, borderRadius: 24,
                background: 'rgba(255,255,255,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <i className={`fas ${file.icon}`} style={{ fontSize: 48, color: '#fff' }} />
              </div>
              <p style={{ color: '#fff', marginBottom: 8, fontSize: 16, fontWeight: 600 }}>{file.name}</p>
              <p style={{ color: 'rgba(255,255,255,.5)', marginBottom: 28, fontSize: 13 }}>{file.size}</p>
            </div>
          )}
        </>
      )}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {file.telegramFileId && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                background: downloading ? 'rgba(255,255,255,.15)' : '#1d9bf0',
                border: 'none', color: '#fff', borderRadius: 40, padding: '12px 28px',
                fontSize: 15, fontWeight: 600, cursor: downloading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'Inter,sans-serif', transition: 'background .2s',
              }}
            >
              {downloading
                ? <><div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2, margin: 0, borderTopColor: '#fff' }} />Menyiapkan...</>
                : <><i className="fas fa-download" />Unduh</>
              }
            </button>
          )}
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, letterSpacing: .5 }}>
            {file.name} · Satriaclouds
          </p>
        </div>
      )}
    </div>
  )
}
