import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

// ─── Secure session storage using sessionStorage ──────────────────────────────
// sessionStorage is cleared when the browser tab/window is closed, unlike
// localStorage which persists forever. This limits exposure of session data.
// Profile photo IDs (non-sensitive opaque Telegram IDs) use localStorage
// so the avatar persists across re-logins — but NO credentials are stored there.

const SESSION_KEY = 'sc_session'

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeSession(data) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)) } catch {}
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}

// Profile photo ID key — only non-sensitive opaque ID, stored in localStorage
// so avatar persists across re-logins (not a security risk)
function pfpKey(email) {
  return `sc_pfp_${email.replace(/[^a-zA-Z0-9]/g, '_')}`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session from sessionStorage on mount
    const base = readSession()
    if (base?.email) {
      const pfpRaw = localStorage.getItem(pfpKey(base.email))
      const pfp = pfpRaw ? JSON.parse(pfpRaw) : {}
      setUser({ ...base, customPhotoFileId: pfp.fileId || null, customPhotoMsgId: pfp.msgId || null })
    }
    setLoading(false)
  }, [])

  const login = useCallback((userData) => {
    const base = {
      name: userData.name,
      email: userData.email,
      picture: userData.picture || '',
      sub: userData.sub || '',
    }
    // Store only non-sensitive identity data in sessionStorage
    // Cleared automatically when tab closes — no persistent token risk
    writeSession(base)

    const pfpRaw = localStorage.getItem(pfpKey(userData.email))
    const pfp = pfpRaw ? JSON.parse(pfpRaw) : {}
    const u = { ...base, customPhotoFileId: pfp.fileId || null, customPhotoMsgId: pfp.msgId || null }
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    clearSession()
    // sc_pfp_* keys in localStorage are intentionally kept — just opaque IDs, not credentials
    if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect()
  }, [])

  const updateCustomPhoto = useCallback(async (file, currentUser) => {
    const form = new FormData()
    form.append('photo', file, file.name)
    form.append('email', currentUser?.email || 'unknown')
    if (currentUser?.customPhotoMsgId) {
      form.append('oldMessageId', String(currentUser.customPhotoMsgId))
    }

    const res = await fetch('/api/profile', { method: 'POST', body: form })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Upload foto gagal')

    // Store only the opaque file ID — never a URL or token
    const pfp = { fileId: data.fileId, msgId: data.messageId }
    localStorage.setItem(pfpKey(currentUser.email), JSON.stringify(pfp))

    const updated = { ...currentUser, customPhotoFileId: data.fileId, customPhotoMsgId: data.messageId }
    setUser(updated)
    // Update sessionStorage with fresh base (no sensitive data)
    writeSession({
      name: currentUser.name,
      email: currentUser.email,
      picture: currentUser.picture,
      sub: currentUser.sub,
    })
    return updated
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateCustomPhoto }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
