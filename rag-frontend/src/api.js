const BASE = '/api'

const authHeaders = () => {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function loginWithGoogle() { window.location.href = `${BASE}/auth/google` }
export function saveToken(token)  { localStorage.setItem('token', token) }
export function getToken()        { return localStorage.getItem('token') }
export function logout()          { localStorage.removeItem('token') }

export async function getMe() {
  const res = await fetch(`${BASE}/auth/me`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

// ── Chats ─────────────────────────────────────────────────────────────────────

export async function listChats() {
  const res = await fetch(`${BASE}/chat`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch chats')
  return res.json()
}

export async function newChat(title = 'New Chat') {
  const res = await fetch(`${BASE}/chat/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to create chat')
  return res.json()
}

export async function getChat(chatId) {
  const res = await fetch(`${BASE}/chat/${chatId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch chat')
  return res.json()
}

export async function askInChat(chatId, question) {
  const res = await fetch(`${BASE}/chat/${chatId}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Chat failed')
  }
  return res.json()
}

export async function renameChat(chatId, title) {
  const res = await fetch(`${BASE}/chat/${chatId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to rename chat')
  return res.json()
}

export async function deleteChat(chatId) {
  const res = await fetch(`${BASE}/chat/${chatId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete chat')
  return res.json()
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export async function uploadDoc(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/ingest`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function getIngestStatus(taskId) {
  const res = await fetch(`${BASE}/ingest/status/${taskId}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to get status')
  return res.json()
}

// ── Docs ──────────────────────────────────────────────────────────────────────

export async function listDocs() {
  const res = await fetch(`${BASE}/embedded-docs`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch docs')
  return res.json()
}

export async function deleteDoc(filename) {
  const res = await fetch(`${BASE}/embedded-docs/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Delete failed')
  }
  return res.json()
}