import { useRef, useState } from 'react'

export default function UploadModal({ show, onClose, onUpload }) {
  const fileRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(filesList) {
    if (!filesList?.length) return
    onUpload(Array.from(filesList))
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  if (!show) return null

  return (
    <div className="modal show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-content">
        <h3>Unggah File</h3>
        <div
          className="upload-area"
          style={dragOver ? { background: '#e6f0ff', borderColor: '#1d9bf0' } : {}}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <i className="fas fa-cloud-upload-alt" />
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Klik atau seret file ke sini</p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Semua jenis file didukung</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        <div className="modal-buttons">
          <button className="modal-btn cancel" onClick={onClose}>Batal</button>
        </div>
      </div>
    </div>
  )
}
