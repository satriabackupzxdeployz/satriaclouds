import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'

const GOOGLE_CLIENT_ID = '985264654829-bodgusqn3q90v7e0h0b2e3ug4l03v0ov.apps.googleusercontent.com'

export default function LoginPage() {
  const { user, login } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (user) {
      navigate('/home', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    function initGoogle() {
      if (!window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      })
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 340,
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'left',
      })
    }

    if (window.google?.accounts?.id) {
      initGoogle()
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          initGoogle()
        }
      }, 200)
      return () => clearInterval(interval)
    }
  }, [])

  function handleCredentialResponse(response) {
    try {
      const userData = parseJwt(response.credential)
      if (!userData) throw new Error('Token tidak valid')
      login({
        name: userData.name || 'Pengguna Google',
        email: userData.email || '',
        picture: userData.picture || '',
        sub: userData.sub || '',
      })
      showToast(`Selamat datang, ${userData.name}!`, 'success')
      navigate('/home', { replace: true })
    } catch {
      showToast('Login gagal. Silakan coba lagi.', 'error')
    }
  }

  function parseJwt(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      return JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')))
    } catch { return null }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <i className="fas fa-cloud" />
        </div>
        <h1>Satriaclouds</h1>
        <p className="login-subtitle">Website storage 15 gb gratis buat nyimpen dokumen, foto, video, dll secara gratis :)</p>

        <div id="googleSignInContainer" ref={containerRef} />

        <div className="login-features">
          <div className="feature-item">
            <i className="fas fa-lock" />
            <span>Aman</span>
          </div>
          <div className="feature-item">
            <i className="fas fa-bolt" />
            <span>Cepat</span>
          </div>
          <div className="feature-item">
            <i className="fas fa-database" />
            <span>15GB</span>
          </div>
        </div>
      </div>
    </div>
  )
}
