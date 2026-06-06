import { useState, useEffect, useRef } from 'react'
import {
  uploadDoc, getIngestStatus, sendChat, listDocs, deleteDoc,
  loginWithGoogle, getMe, saveToken, getToken, logout,
} from './api'

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage() {
  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', gap: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: 'var(--accent)',
          display: 'grid', placeItems: 'center', margin: '0 auto 16px',
        }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#000', fontFamily: 'var(--font-head)' }}>D</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>
          DocMind
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
          Your personal doc Q&amp;A
        </p>
      </div>
      <button onClick={loginWithGoogle} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 10, padding: '12px 24px', cursor: 'pointer',
        color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13,
        transition: 'border-color 0.15s',
      }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border2)'}
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.6 0-14.2 4.3-17.7 10.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.3C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-8H6.1C9.5 36.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.4 4.3-4.4 5.7l6.2 5.3C41 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
        </svg>
        Continue with Google
      </button>
      <p style={{ fontSize: 10, color: 'var(--muted)' }}>your docs are private — no one else can see them (not even us!)</p>
    </div>
  )
}

// ── Auth callback ─────────────────────────────────────────────────────────────

function AuthCallback({ onAuth }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')
    if (token) { saveToken(token); window.history.replaceState({}, '', '/'); onAuth() }
  }, [])
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>signing you in...</p>
    </div>
  )
}

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo({ user, onLogout }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 16px' }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: 'var(--accent)',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#000', fontFamily: 'var(--font-head)' }}>D</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>DocMind</p>
      </div>
      {user && (
        <button onClick={onLogout} style={{
          background: 'none', border: '1px solid var(--accent)', borderRadius: 6,
          color: 'var(--accent)', fontSize: 10, padding: '3px 9px', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', flexShrink: 0, transition: 'background 0.15s, color 0.15s',
        }}
          onMouseOver={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#000' }}
          onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--accent)' }}
        >
          Sign out
        </button>
      )}
    </div>
  )
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ addToast, onUploaded }) {
  const [dragging, setDragging]   = useState(false)
  const [processing, setProcessing] = useState(false)
  const inputRef = useRef()
  const pollRef  = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const startPolling = (taskId, filename) => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await getIngestStatus(taskId)
        if (data.status === 'SUCCESS') {
          stopPolling()
          setProcessing(false)
          onUploaded?.()
          addToast(`✓ ${filename} — embeddings created, doc ready`)
        } else if (data.status === 'FAILURE') {
          stopPolling()
          setProcessing(false)
          addToast(data.error || `Failed to process ${filename}`, 'error')
        }
      } catch {
        // network blip — keep polling
      }
    }, 10000)
  }

  const handle = async (file) => {
    if (!file) return

    if (processing) {
      addToast('A doc is still being processed. Try again in a moment.', 'error')
      return
    }

    try {
      // wait for API response first — only toast on success
      const res = await uploadDoc(file)
      setProcessing(true)
      startPolling(res.task_id, res.filename)
      addToast(`📄 ${res.filename} uploaded — processing in background, we'll notify you when ready`)
    } catch (e) {
      // e.message already contains the backend detail e.g. "already indexed"
      addToast(e.message, 'error')
    }
  }

  useEffect(() => () => stopPolling(), [])

  const onDrop = (e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `1.5px dashed ${dragging ? 'var(--accent)' : processing ? 'var(--accent)' : 'var(--border2)'}`,
          borderRadius: 'var(--radius-lg)', padding: '18px 12px', textAlign: 'center',
          cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
          background: dragging ? 'rgba(200,245,66,0.04)' : 'transparent',
        }}
      >
        {processing ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)',
                  animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s`,
                }}/>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>processing...</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 18, marginBottom: 4 }}>⊕</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Drop or click to upload</p>
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>PDF · TXT · MD</p>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.txt,.md" hidden
        onChange={(e) => { handle(e.target.files[0]); e.target.value = '' }} />
      <style>{`@keyframes pulse { 0%,80%,100%{opacity:.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}

// ── Doc list ──────────────────────────────────────────────────────────────────

function DocList({ docs, onDelete }) {
  if (!docs.length) return (
    <p style={{ padding: '0 20px', fontSize: 11, color: 'var(--muted)' }}>no docs indexed yet</p>
  )
  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {docs.map((doc) => (
        <div key={doc.id ?? doc.filename} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', borderRadius: 'var(--radius)',
          background: 'var(--bg3)', border: '1px solid var(--border)', gap: 8,
        }}>
          <span style={{
            fontSize: 11, color: 'var(--text)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }} title={doc.filename}>
            📄 {doc.filename}
          </span>
          <button onClick={() => onDelete(doc.filename)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0,
          }} title="Delete">×</button>
        </div>
      ))}
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'var(--danger)' : 'var(--accent)',
          color: t.type === 'error' ? '#fff' : '#000',
          padding: '10px 16px', borderRadius: 8,
          fontFamily: 'var(--font-mono)', fontSize: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          animation: 'slideIn 0.2s ease', maxWidth: 320,
        }}>
          {t.message}
        </div>
      ))}
      <style>{`@keyframes slideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  )
}

// ── Message ───────────────────────────────────────────────────────────────────

function Message({ role, content, sources }) {
  const [showSources, setShowSources] = useState(false)
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4, marginBottom: 20 }}>
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'var(--accent)' : 'var(--bg3)',
        color: isUser ? '#000' : 'var(--text)',
        border: isUser ? 'none' : '1px solid var(--border)',
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: '10px 14px', fontSize: 13, lineHeight: 1.65,
        fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {content}
      </div>
      {sources?.length > 0 && (
        <div style={{ maxWidth: '78%' }}>
          <button onClick={() => setShowSources(v => !v)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 10, padding: 0, fontFamily: 'var(--font-mono)',
          }}>
            {showSources ? '▾' : '▸'} {sources.length} source{sources.length > 1 ? 's' : ''}
          </button>
          {showSources && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sources.map((s, i) => (
                <div key={i} style={{
                  fontSize: 10, color: 'var(--muted)', padding: '4px 8px',
                  background: 'var(--bg3)', borderRadius: 4, border: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {s.file} <span style={{ color: 'var(--border2)' }}>dist: {s.distance}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Typing() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 0 16px', alignItems: 'center' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)',
          animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s`,
        }}/>
      ))}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser]       = useState(null)
  const [authState, setAuth]  = useState('loading')
  const [docs, setDocs]       = useState([])
  const [messages, setMsgs]   = useState([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts]   = useState([])
  const bottomRef = useRef()

  const addToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }

  const checkAuth = async () => {
    if (!getToken()) { setAuth('guest'); return }
    try { const me = await getMe(); setUser(me); setAuth('authed') }
    catch { logout(); setAuth('guest') }
  }

  const fetchDocs = async () => {
    try { const d = await listDocs(); setDocs(d.documents) } catch {}
  }

  useEffect(() => { checkAuth() }, [])

  useEffect(() => {
    if (authState === 'authed' && user) {
      fetchDocs()
      setMsgs([{
        role: 'assistant',
        content: `Hey ${user.name.split(' ')[0]} 👋 Upload a doc on the left, then ask me anything about it.`
      }])
    }
  }, [authState])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback onAuth={checkAuth} />
  }

  if (authState === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>loading...</p>
      </div>
    )
  }

  if (authState === 'guest') return <LoginPage />

  const handleLogout = () => { logout(); setAuth('guest'); setUser(null); setMsgs([]) }

  const handleDelete = async (filename) => {
    try { await deleteDoc(filename); fetchDocs(); addToast(`Deleted ${filename}`) }
    catch (e) { addToast(e.message, 'error') }
  }

  const handleSend = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', content: q }])
    setLoading(true)
    try {
      const res = await sendChat(q)
      setMsgs(m => [...m, { role: 'assistant', content: res.answer, sources: res.sources }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Toast toasts={toasts} />

      <aside style={{
        width: 260, flexShrink: 0, background: 'var(--bg2)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Logo user={user} onLogout={handleLogout} />

        <div style={{ padding: '0 20px 10px' }}>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 10 }}>
            Upload doc
          </p>
        </div>

        <UploadZone onUploaded={fetchDocs} addToast={addToast} />

        <div style={{ padding: '16px 20px 10px' }}>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 10 }}>
            Your docs
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <DocList docs={docs} onDelete={handleDelete} />
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            {docs.length} doc{docs.length !== 1 ? 's' : ''} indexed
          </span>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          padding: '18px 28px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: docs.length ? 'var(--accent)' : 'var(--muted)' }}/>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 600 }}>
            {docs.length ? `${docs.length} doc${docs.length > 1 ? 's' : ''} ready` : 'no docs loaded'}
          </span>
          {user?.picture && (
            <img src={user.picture} alt={user.name} style={{
              width: 28, height: 28, borderRadius: '50%', marginLeft: 'auto',
              border: '1px solid var(--border)',
            }}/>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 12px' }}>
          {messages.map((m, i) => <Message key={i} {...m} />)}
          {loading && <Typing />}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: '16px 24px 24px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', gap: 10, background: 'var(--bg3)',
            border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: '4px 4px 4px 16px',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="ask anything from your docs..."
              disabled={loading}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 0',
              }}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} style={{
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg)',
              border: 'none', borderRadius: 8,
              color: input.trim() && !loading ? '#000' : 'var(--muted)',
              fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 12, padding: '8px 16px',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              transition: 'background 0.15s, color 0.15s', letterSpacing: '0.02em',
            }}>
              {loading ? '...' : 'ASK'}
            </button>
          </div>
          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, paddingLeft: 4 }}>
            enter to send · answers grounded in your docs only
          </p>
        </div>
      </main>
    </div>
  )
}