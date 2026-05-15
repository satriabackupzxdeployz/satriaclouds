import { useState, useCallback, useEffect, useRef } from 'react'

let _showToast = null

export function useToast() {
  const show = useCallback((msg, type = 'success') => {
    if (_showToast) _showToast(msg, type)
  }, [])
  return { showToast: show }
}

export function ToastProvider() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    _showToast = (msg, type) => {
      clearTimeout(timer.current)
      setToast({ msg, type })
      timer.current = setTimeout(() => setToast(null), 3000)
    }
    return () => { _showToast = null }
  }, [])

  if (!toast) return null

  return (
    <div className={`toast ${toast.type}`}>
      <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`} />
      {toast.msg}
    </div>
  )
}
