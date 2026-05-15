import { useState, useEffect, useCallback, useRef } from 'react'

export function useFiles(user) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const filesRef = useRef([])

  // Sync from Telegram whenever user logs in
  useEffect(() => {
    if (!user?.email) { setFiles([]); filesRef.current = []; return; }
    syncFromTelegram()
  }, [user?.email])

  const syncFromTelegram = useCallback(async () => {
    if (!user?.email) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sync?email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      if (data.success) {
        setFiles(data.files)
        filesRef.current = data.files
        // Store only the opaque profile photo file ID (not sensitive)
        if (data.profileFileId) {
          localStorage.setItem(
            `sc_pfp_${user.email.replace(/[^a-z0-9]/gi, '_')}`,
            JSON.stringify({ fileId: data.profileFileId, msgId: data.profileMsgId })
          )
        }
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [user?.email])

  const setFilesLocal = useCallback((updater) => {
    setFiles(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      filesRef.current = next
      return next
    })
  }, [])

  const uploadFile = useCallback(async (fileObj, currentPath) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', fileObj, fileObj.name)
      form.append('email', user?.email || 'unknown')
      form.append('path', currentPath)

      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Upload gagal')

      // Generate local thumbnail for images (shown immediately, no network)
      let localThumb = null
      if (fileObj.type.startsWith('image/')) {
        try { localThumb = await makeThumbnail(fileObj) } catch {}
      }

      const newFile = {
        id: String(data.messageId),
        name: data.fileName || fileObj.name,
        type: getFileCategory(fileObj.name, fileObj.type),
        size: data.size || formatBytes(fileObj.size),
        modified: data.modified || 'Baru saja',
        icon: getFileIcon(fileObj.name),
        path: currentPath,
        telegramFileId: data.fileId,
        messageId: data.messageId,
        mimeType: fileObj.type,
        localThumb,
      }

      setFilesLocal(prev => [newFile, ...prev])
      return newFile
    } finally {
      setUploading(false)
    }
  }, [user, setFilesLocal])

  // SECURITY: always pass email so server can verify ownership
  const getFileUrl = useCallback(async (telegramFileId) => {
    if (!user?.email) throw new Error('Tidak ada sesi pengguna')
    const res = await fetch(
      `/api/file?file_id=${encodeURIComponent(telegramFileId)}&email=${encodeURIComponent(user.email)}`
    )
    if (res.status === 403) throw new Error('Akses ditolak — file bukan milik Anda')
    if (!res.ok) throw new Error('Gagal memuat file')
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }, [user?.email])

  // SECURITY: include email in download token request so server can bind token to owner
  const getDownloadUrl = useCallback(async (file) => {
    if (!user?.email) throw new Error('Tidak ada sesi pengguna')
    const res = await fetch('/api/mktoken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: file.telegramFileId,
        fileName: file.name,
        email: user.email,       // bound into HMAC token
      }),
    })
    const data = await res.json()
    if (!data.success) throw new Error('Gagal membuat link unduhan')
    return data.url
  }, [user?.email])

  const renameFile = useCallback((id, newName) => {
    setFilesLocal(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f))
  }, [setFilesLocal])

  // SECURITY: pass email so server verifies ownership before deleting
  const deleteFile = useCallback(async (id) => {
    if (!user?.email) return
    const file = filesRef.current.find(f => f.id === id)
    if (file?.messageId) {
      try {
        await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: file.messageId, email: user.email }),
        })
      } catch {}
    }
    setFilesLocal(prev => prev.filter(f => f.id !== id))
  }, [user?.email, setFilesLocal])

  const deleteFolder = useCallback(async (id) => {
    if (!user?.email) return
    const folder = filesRef.current.find(f => f.id === id)
    const childIds = filesRef.current
      .filter(f => f.path.startsWith(folder ? folder.path + '/' + folder.name : ''))
      .map(f => f.id)
    const allIds = [id, ...childIds]
    for (const f of filesRef.current.filter(f => allIds.includes(f.id))) {
      if (f.messageId) {
        try {
          await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: f.messageId, email: user.email }),
          })
        } catch {}
      }
    }
    setFilesLocal(prev => prev.filter(f => !allIds.includes(f.id)))
  }, [user?.email, setFilesLocal])

  const moveFile = useCallback((ids, targetPath) => {
    setFilesLocal(prev => prev.map(f => ids.includes(f.id) ? { ...f, path: targetPath } : f))
  }, [setFilesLocal])

  const createFolder = useCallback(async (name, currentPath) => {
    const tmpId = 'tmp_' + Date.now()
    const folder = {
      id: tmpId,
      name,
      type: 'folder',
      size: '-',
      modified: 'Baru saja',
      icon: 'fa-folder',
      path: currentPath,
      messageId: null,
    }
    setFilesLocal(prev => [folder, ...prev])
    try {
      const res = await fetch('/api/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: name, path: currentPath, email: user?.email || 'unknown' }),
      })
      const data = await res.json()
      if (data.success && data.messageId) {
        setFilesLocal(prev => prev.map(f =>
          f.id === tmpId ? { ...f, id: String(data.messageId), messageId: data.messageId } : f
        ))
      }
    } catch {}
    return folder
  }, [user, setFilesLocal])

  const compressFile = useCallback((file) => {
    const zip = {
      id: 'zip_' + Date.now(),
      name: file.name.replace(/\.[^/.]+$/, '') + '.zip',
      type: 'zip',
      size: file.size,
      modified: 'Baru saja',
      icon: 'fa-file-zipper',
      path: file.path,
    }
    setFilesLocal(prev => [zip, ...prev])
    return zip
  }, [setFilesLocal])

  return {
    files, loading, uploading,
    syncFromTelegram,
    uploadFile, getFileUrl, getDownloadUrl,
    renameFile, deleteFile, deleteFolder,
    moveFile, createFolder, compressFile,
  }
}

function makeThumbnail(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const MAX = 240
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = reject
    img.src = objectUrl
  })
}

function getFileCategory(name, mime) {
  const ext = (name || '').split('.').pop().toLowerCase()
  if (['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext)) return 'image'
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video'
  if (['mp3','wav','ogg','flac','aac','m4a','opus'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'zip'
  return (mime || '').split('/')[0] || 'file'
}
function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  const m = {
    pdf:'fa-file-pdf',jpg:'fa-file-image',jpeg:'fa-file-image',png:'fa-file-image',gif:'fa-file-image',
    webp:'fa-file-image',svg:'fa-file-image',bmp:'fa-file-image',avif:'fa-file-image',
    mp4:'fa-file-video',mov:'fa-file-video',avi:'fa-file-video',mkv:'fa-file-video',webm:'fa-file-video',
    mp3:'fa-file-audio',wav:'fa-file-audio',ogg:'fa-file-audio',flac:'fa-file-audio',aac:'fa-file-audio',m4a:'fa-file-audio',
    zip:'fa-file-zipper',rar:'fa-file-zipper','7z':'fa-file-zipper',tar:'fa-file-zipper',gz:'fa-file-zipper',
    js:'fa-file-code',ts:'fa-file-code',jsx:'fa-file-code',tsx:'fa-file-code',html:'fa-file-code',
    css:'fa-file-code',json:'fa-file-code',py:'fa-file-code',doc:'fa-file-word',docx:'fa-file-word',
    xls:'fa-file-excel',xlsx:'fa-file-excel',ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint',
    txt:'fa-file-lines',md:'fa-file-lines',
  }
  return m[ext] || 'fa-file'
}
function formatBytes(b) {
  if (!b) return '0 B'
  const k = 1024, s = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i]
}
