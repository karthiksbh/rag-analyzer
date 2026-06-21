import { useState, useEffect, useRef } from 'react'
import {
  uploadDoc, getIngestStatus, listDocs, deleteDoc,
  listChats, newChat, getChat, askInChat, renameChat, deleteChat,
  loginWithGoogle, getMe, saveToken, getToken, logout,
} from './api'

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#000', fontFamily: 'var(--font-head)' }}>D</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>DocMind</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Your personal doc Q&amp;A — powered by RAG</p>
      </div>
      <button onClick={loginWithGoogle} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '12px 24px', cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13, transition: 'border-color 0.15s' }}
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
      <p style={{ fontSize: 10, color: 'var(--muted)' }}>your docs are private — no one else can see them</p>
    </div>
  )
}

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

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ addToast, onUploaded }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const pollsRef = useRef({})

  const startPolling = (taskId, filename) => {
    pollsRef.current[taskId] = setInterval(async () => {
      try {
        const data = await getIngestStatus(taskId)
        if (data.status === 'SUCCESS') {
          clearInterval(pollsRef.current[taskId])
          delete pollsRef.current[taskId]
          onUploaded?.()
          addToast(`✓ ${filename} — embeddings ready`)
        } else if (data.status === 'FAILURE') {
          clearInterval(pollsRef.current[taskId])
          delete pollsRef.current[taskId]
          addToast(data.error || `Failed to process ${filename}`, 'error')
        }
      } catch {}
    }, 10000)
  }

  const handle = async (file) => {
    if (!file) return
    try {
      const res = await uploadDoc(file)
      addToast(`📄 ${res.filename} is being processed — we'll notify you when ready`)
      startPolling(res.task_id, res.filename)
    } catch (e) { addToast(e.message, 'error') }
  }

  useEffect(() => () => Object.values(pollsRef.current).forEach(clearInterval), [])
  const onDrop = (e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]) }

  return (
    <div>
      <div onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)} onDrop={onDrop}
        style={{ border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--border2)'}`, borderRadius: 'var(--radius-lg)', padding: '12px 10px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s', background: dragging ? 'rgba(200,245,66,0.04)' : 'transparent' }}
      >
        <p style={{ fontSize: 15, marginBottom: 2 }}>⊕</p>
        <p style={{ fontSize: 10, color: 'var(--muted)' }}>drop or click · PDF TXT MD</p>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => { handle(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}

// ── Doc list ──────────────────────────────────────────────────────────────────

function DocList({ docs, onDelete }) {
  if (!docs.length) return <p style={{ fontSize: 10, color: 'var(--muted)', padding: '4px 0' }}>no docs indexed yet</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {docs.map((doc) => (
        <div key={doc.id ?? doc.filename} style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 5, background: 'var(--bg3)', border: '1px solid var(--border)', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={doc.filename}>
            📄 {doc.filename}
          </span>
          <button onClick={() => onDelete(doc.filename)} title="Delete"
            style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)', fontSize: 11, padding: '1px 5px', lineHeight: 1, flexShrink: 0, transition: 'border-color 0.1s, color 0.1s' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--muted)' }}
          >×</button>
        </div>
      ))}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ chats, activeChatId, docs, onSelectChat, onNewChat, onRefreshChats, onDeleteChat, onDeleteDoc, addToast, onDocsUpdated }) {
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  // FIX: renaming should only refresh the chat list, never create a new chat
  const commitRename = async (chatId) => {
    const trimmed = editTitle.trim()
    setEditingId(null)
    if (!trimmed) return
    try {
      await renameChat(chatId, trimmed)
      onRefreshChats()
    } catch {}
  }

  const handleNewChat = () => {
    const empty = chats.find(c => c.title === 'New Chat' && !c.last_message)
    if (empty) { onSelectChat(empty.id); return }
    onNewChat()
  }

  return (
    <aside style={{ width: 250, flexShrink: 0, background: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 12px' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#000', fontFamily: 'var(--font-head)' }}>D</span>
        </div>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>DocMind</span>
      </div>

      <div style={{ padding: '0 12px 16px' }}>
        <button onClick={handleNewChat} style={{ width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#000', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 12, padding: '8px', cursor: 'pointer', letterSpacing: '0.02em' }}>
          + New Chat
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '0 12px 8px' }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8 }}>Upload doc</p>
          <UploadZone onUploaded={onDocsUpdated} addToast={addToast} />
        </div>

        <div style={{ padding: '8px 12px 12px' }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8 }}>Docs ({docs.length})</p>
          <DocList docs={docs} onDelete={onDeleteDoc} />
        </div>

        <div style={{ height: '1px', background: 'var(--border)', margin: '0 12px 8px' }} />

        <div style={{ padding: '0 12px 6px' }}>
          <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8 }}>Chats</p>
        </div>

        <div style={{ padding: '0 8px', flex: 1 }}>
          {chats.length === 0 && <p style={{ fontSize: 10, color: 'var(--muted)', padding: '0 8px' }}>no chats yet</p>}
          {chats.map(chat => (
            <div key={chat.id}
              onClick={() => { if (editingId !== chat.id) onSelectChat(chat.id) }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', background: activeChatId === chat.id ? 'var(--bg3)' : 'transparent', border: activeChatId === chat.id ? '1px solid var(--border)' : '1px solid transparent', marginBottom: 2, transition: 'background 0.1s' }}
              onMouseOver={e => { if (activeChatId !== chat.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
              onMouseOut={e => { if (activeChatId !== chat.id) e.currentTarget.style.background = 'transparent' }}
            >
              {editingId === chat.id ? (
                <input value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitRename(chat.id) }
                    if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null) }
                  }}
                  onBlur={() => commitRename(chat.id)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 6px', outline: 'none' }}
                />
              ) : (
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chat.title}
                </span>
              )}
              {editingId !== chat.id && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); setEditingId(chat.id); setEditTitle(chat.title) }}
                    title="Rename"
                    style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)', fontSize: 10, padding: '2px 5px', lineHeight: 1, transition: 'border-color 0.1s, color 0.1s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--muted)' }}
                  >✎</button>
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteChat(chat.id) }}
                    title="Delete"
                    style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)', fontSize: 11, padding: '2px 5px', lineHeight: 1, transition: 'border-color 0.1s, color 0.1s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--muted)' }}
                  >×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

// ── Message ───────────────────────────────────────────────────────────────────

function Message({ role, content, sources, cached }) {
  const [showSources, setShowSources] = useState(false)
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4, marginBottom: 20 }}>
      <div style={{ maxWidth: '78%', background: isUser ? 'var(--accent)' : 'var(--bg3)', color: isUser ? '#000' : 'var(--text)', border: isUser ? 'none' : '1px solid var(--border)', borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '10px 14px', fontSize: 13, lineHeight: 1.65, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {content}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '78%' }}>
        {sources?.length > 0 && (
          <button onClick={() => setShowSources(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 10, padding: 0, fontFamily: 'var(--font-mono)' }}>
            {showSources ? '▾' : '▸'} {sources.length} source{sources.length > 1 ? 's' : ''}
          </button>
        )}
        {cached && <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>⚡ cached</span>}
      </div>
      {showSources && (
        <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sources.map((s, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--muted)', padding: '4px 8px', background: 'var(--bg3)', borderRadius: 4, border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
              {s.file} <span style={{ color: 'var(--border2)' }}>dist: {s.distance}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Typing() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 0 16px', alignItems: 'center' }}>
      {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i*0.2}s` }} />)}
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type === 'error' ? 'var(--danger)' : 'var(--accent)', color: t.type === 'error' ? '#fff' : '#000', padding: '10px 16px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'slideIn 0.2s ease', maxWidth: 320 }}>
          {t.message}
        </div>
      ))}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser]           = useState(null)
  const [authState, setAuth]      = useState('loading')
  const [chats, setChats]         = useState([])
  const [activeChatId, setActive] = useState(null)
  const [messages, setMsgs]       = useState([])
  const [docs, setDocs]           = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [toasts, setToasts]       = useState([])
  const bottomRef = useRef()

  const addToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }

  const checkAuth = async () => {
    // Dev mode — skip Google login entirely, go straight into the app
    if (DEV_MODE) {
      try { const me = await getMe(); setUser(me); setAuth('authed') }
      catch { setAuth('guest') }
      return
    }
    if (!getToken()) { setAuth('guest'); return }
    try { const me = await getMe(); setUser(me); setAuth('authed') }
    catch { logout(); setAuth('guest') }
  }

  const fetchChats = async () => {
    try { const d = await listChats(); setChats(d.chats) } catch {}
  }

  const fetchDocs = async () => {
    try { const d = await listDocs(); setDocs(d.documents) } catch {}
  }

  const selectChat = async (chatId) => {
    if (chatId === activeChatId) return
    setActive(chatId)
    try {
      const data = await getChat(chatId)
      setMsgs(data.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources || [], cached: false })))
    } catch { addToast('Failed to load chat', 'error') }
  }

  const handleNewChat = async () => {
    try {
      const chat = await newChat()
      await fetchChats()
      setActive(chat.id)
      setMsgs([])
    } catch { addToast('Failed to create chat', 'error') }
  }

  const handleDeleteChat = async (chatId) => {
    try {
      await deleteChat(chatId)
      await fetchChats()
      if (activeChatId === chatId) { setActive(null); setMsgs([]) }
      addToast('Chat deleted')
    } catch (e) { addToast(e.message, 'error') }
  }

  const handleDeleteDoc = async (filename) => {
    try { await deleteDoc(filename); fetchDocs(); addToast(`Deleted ${filename}`) }
    catch (e) { addToast(e.message, 'error') }
  }

  useEffect(() => { checkAuth() }, [])
  useEffect(() => { if (authState === 'authed' && user) { fetchChats(); fetchDocs() } }, [authState])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  if (!DEV_MODE && window.location.pathname === '/auth/callback') {
    return <AuthCallback onAuth={checkAuth} />
  }

  if (authState === 'loading') return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>loading...</p>
    </div>
  )

  if (authState === 'guest' && !DEV_MODE) return <LoginPage />

  const handleLogout = () => {
    if (DEV_MODE) return
    logout(); setAuth('guest'); setUser(null); setChats([]); setMsgs([])
  }

  const handleSend = async () => {
    const q = input.trim()
    if (!q || loading) return

    let chatId = activeChatId
    if (!chatId) {
      try {
        const chat = await newChat()
        chatId = chat.id
        setActive(chatId)
        await fetchChats()
      } catch { addToast('Failed to create chat', 'error'); return }
    }

    setInput('')
    setMsgs(m => [...m, { role: 'user', content: q, sources: [], cached: false }])
    setLoading(true)

    try {
      const res = await askInChat(chatId, q)
      setMsgs(m => [...m, { role: 'assistant', content: res.answer, sources: res.sources, cached: res.cached }])
      fetchChats()
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: `Error: ${e.message}`, sources: [], cached: false }])
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Toast toasts={toasts} />

      <Sidebar
        chats={chats} activeChatId={activeChatId} docs={docs}
        onSelectChat={selectChat} onNewChat={handleNewChat} onRefreshChats={fetchChats}
        onDeleteChat={handleDeleteChat} onDeleteDoc={handleDeleteDoc}
        addToast={addToast} onDocsUpdated={fetchDocs}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          {!DEV_MODE && (
            <button onClick={handleLogout}
              style={{ background: 'none', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--accent)', fontSize: 10, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono)', transition: 'background 0.15s, color 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#000' }}
              onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--accent)' }}
            >sign out</button>
          )}
          {DEV_MODE && (
            <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border2)', borderRadius: 6, padding: '3px 8px' }}>
              Local Mode
            </span>
          )}
          {user?.picture && (
            <img src={user.picture} alt={user.name} title={user.name}
              style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid var(--border)' }} />
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 12px' }}>
          {!activeChatId && messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, opacity: 0.5 }}>
              <p style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700 }}>Hey {user?.name?.split(' ')[0]} 👋</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Select a chat or start typing to begin</p>
            </div>
          )}
          {messages.map((m, i) => <Message key={i} {...m} />)}
          {loading && <Typing />}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: '16px 24px 24px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: '4px 4px 4px 16px' }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={activeChatId ? 'ask anything from your docs...' : 'start typing to create a new chat...'}
              disabled={loading}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 0' }}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              style={{ background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg)', border: 'none', borderRadius: 8, color: input.trim() && !loading ? '#000' : 'var(--muted)', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 12, padding: '8px 16px', cursor: input.trim() && !loading ? 'pointer' : 'default', transition: 'background 0.15s, color 0.15s', letterSpacing: '0.02em' }}>
              {loading ? '...' : 'ASK'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}