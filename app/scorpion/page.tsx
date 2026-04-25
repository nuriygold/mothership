"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChatTabs } from "@/components/ui/chat-tabs"
import { formatChatTimestamp } from "@/lib/chat/format-chat-timestamp"

const TerminalView = dynamic(() => import('@/components/ui/terminal-view'), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: '#0b0f17' }} />,
})

const TUI_URL_KEY = 'scorpion-tui-url'

type Mode = 'chat' | 'tui'
type Message = { role: 'user' | 'assistant'; content: string; ts: string }

export default function Scorpion() {
  const [mode, setMode] = useState<Mode>('chat')
  const [tuiUrl, setTuiUrl] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messagesBySession, setMessagesBySession] = useState<Record<string, Message[]>>({})
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gateway, setGateway] = useState<'checking' | 'up' | 'down'>('checking')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setTuiUrl(localStorage.getItem(TUI_URL_KEY) ?? '')
    const params = new URLSearchParams(window.location.search)
    const sid = params.get('session')
    if (sid?.startsWith('agent:scorpion:')) setSessionId(sid)
  }, [])

  const messages = sessionId ? (messagesBySession[sessionId] ?? []) : []

  useEffect(() => {
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  useEffect(() => {
    fetch("https://mother.nuriy.com/v1/health")
      .then(r => setGateway(r.ok ? 'up' : 'down'))
      .catch(() => setGateway('down'))
  }, [])

  function saveTuiUrl(url: string) {
    setTuiUrl(url)
    if (typeof window !== 'undefined') localStorage.setItem(TUI_URL_KEY, url)
  }

  const handleSessionChange = useCallback((sid: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('session', sid)
    window.history.replaceState({}, '', url.toString())
    setSessionId(sid)
    setInput('')
    setError(null)
    setLoading(false)
    inputRef.current?.focus()
  }, [])

  const handleSessionClose = useCallback((closedSessionId: string) => {
    setMessagesBySession((prev) => {
      if (!(closedSessionId in prev)) return prev
      const next = { ...prev }
      delete next[closedSessionId]
      return next
    })
  }, [])

  async function send() {
    const activeSessionId = sessionId
    if (!input.trim() || loading || !activeSessionId) return

    const text = input.trim()
    const userTs = new Date().toISOString()
    setInput("")
    setError(null)
    setLoading(true)
    setMessagesBySession((prev) => ({
      ...prev,
      [activeSessionId]: [...(prev[activeSessionId] ?? []), { role: 'user', content: text, ts: userTs }],
    }))

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId: activeSessionId, agent: 'scorpion' }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let assistantContent = ''
      let assistantAdded = false
      const assistantTs = new Date().toISOString()

      outer: while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const dataStr = trimmed.slice(5).trim()
          if (dataStr === '[DONE]') break outer
          try {
            const evt = JSON.parse(dataStr)
            if (evt.error) { setError(evt.error); break outer }
            if (evt.delta) {
              assistantContent += evt.delta
              if (!assistantAdded) {
                setMessagesBySession((prev) => ({
                  ...prev,
                  [activeSessionId]: [...(prev[activeSessionId] ?? []), { role: 'assistant', content: assistantContent, ts: assistantTs } as Message],
                }))
                assistantAdded = true
              } else {
                setMessagesBySession((prev) => {
                  const current = prev[activeSessionId] ?? []
                  const nextMessages =
                    current.length > 0
                      ? [...current.slice(0, -1), { role: 'assistant', content: assistantContent, ts: assistantTs } as Message]
                      : [{ role: 'assistant', content: assistantContent, ts: assistantTs } as Message]
                  return { ...prev, [activeSessionId]: nextMessages }
                })
              }
            }
          } catch (_) {}
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const robot = gateway === 'up' ? '🤖' : gateway === 'down' ? '⚠️' : '⏳'

  return (
    <div style={{
      background: "#0b0f17",
      minHeight: "100vh",
      width: "100%",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        height: "60px",
        display: "flex",
        alignItems: "center",
        paddingLeft: "24px",
        paddingRight: "16px",
        gap: "12px",
        background: "rgba(20,25,35,0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1e2235",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "20px", color: "white", fontWeight: 600 }}>
          {robot} 🦂 SCORPION
        </span>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
          {gateway === 'up' && 'Gateway online'}
          {gateway === 'down' && 'Gateway offline'}
          {gateway === 'checking' && 'Checking gateway…'}
        </span>
        <div style={{ flex: 1 }} />
        {/* Mode toggle */}
        <div style={{ display: 'flex', border: '1px solid #2a2f45', borderRadius: 8, overflow: 'hidden' }}>
          {(['chat', 'tui'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? 'rgba(56,184,218,0.15)' : 'transparent',
                color: mode === m ? '#38b8da' : 'rgba(255,255,255,0.4)',
                border: 'none',
                borderRight: m === 'chat' ? '1px solid #2a2f45' : 'none',
                padding: '5px 14px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {m === 'tui' ? 'TUI' : 'Chat'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'tui' ? (
        <>
          {/* TUI URL config */}
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid #1e2235',
            background: 'rgba(15,19,28,0.9)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 0, fontFamily: 'monospace' }}>TUI</span>
            <input
              type="text"
              value={tuiUrl}
              onChange={e => saveTuiUrl(e.target.value)}
              placeholder="wss://mother.nuriy.com/ws"
              style={{
                flex: 1,
                background: '#151826',
                border: '1px solid #2a2f45',
                borderRadius: 6,
                color: 'white',
                padding: '5px 8px',
                fontSize: 12,
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
          </div>
          {/* Terminal */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <TerminalView serverUrl={tuiUrl} token="" sessionId={sessionId} />
          </div>
        </>
      ) : (
        <>
          {/* Chat tabs */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e2235", background: "rgba(20,25,35,0.7)" }}>
            <ChatTabs
              agent="scorpion"
              sessionId={sessionId}
              onSessionChange={handleSessionChange}
              onSessionClose={handleSessionClose}
            />
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              color: "white",
            }}
          >
            {messages.length === 0 && !loading && (
              <div style={{ opacity: 0.5, fontSize: "14px" }}>
                Type a message below to talk to Scorpion.
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: "82%",
                  padding: "10px 14px",
                  borderRadius: m.role === 'user' ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: m.role === 'user' ? "#38b8da" : "#1a1f30",
                  fontSize: "14px",
                  lineHeight: 1.55,
                }}>
                  {m.role === 'user' ? (
                    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</span>
                  ) : (
                    <div className="md-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
                <div style={{
                  marginTop: 4,
                  fontSize: 10,
                  color: "rgba(255,255,255,0.34)",
                  fontFamily: "monospace",
                  textAlign: m.role === 'user' ? 'right' : 'left',
                  width: '100%',
                }}>
                  {formatChatTimestamp(m.ts)}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: 'flex-start' }}>
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "12px 12px 12px 2px",
                  background: "#1a1f30",
                  fontSize: "14px",
                  color: "rgba(255,255,255,0.5)",
                }}>
                  <span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>●</span>
                  {" "}
                  <span style={{ animation: "pulse 1.2s ease-in-out 0.2s infinite" }}>●</span>
                  {" "}
                  <span style={{ animation: "pulse 1.2s ease-in-out 0.4s infinite" }}>●</span>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(255,80,80,0.1)",
                border: "1px solid rgba(255,80,80,0.3)",
                color: "#ff6b6b",
                fontSize: "13px",
              }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "16px 24px",
            borderTop: "1px solid #1e2235",
            background: "rgba(20,25,35,0.9)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                onInput={e => {
                  const t = e.currentTarget
                  t.style.height = "auto"
                  t.style.height = `${Math.min(t.scrollHeight, 160)}px`
                }}
                disabled={loading || !sessionId}
                rows={1}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  border: "1px solid #2a2f45",
                  borderRadius: "8px",
                  background: "#151826",
                  color: "white",
                  fontSize: "14px",
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                  maxHeight: "160px",
                  overflowY: "auto",
                  fontFamily: "inherit",
                }}
                autoFocus
                placeholder="Message Scorpion…"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim() || !sessionId}
                style={{
                  background: loading ? "#2a2f45" : "#38b8da",
                  color: "white",
                  fontSize: "14px",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 18px",
                  cursor: loading || !input.trim() || !sessionId ? "default" : "pointer",
                  opacity: !input.trim() || !sessionId ? 0.45 : 1,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {loading ? "…" : "Send"}
              </button>
            </div>
            {sessionId && (
              <div style={{ marginTop: "6px", fontSize: "11px", color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                {sessionId}
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.25} 50%{opacity:1} }
        .md-body { font-size: 14px; line-height: 1.6; word-break: break-word; }
        .md-body p { margin: 0 0 10px; }
        .md-body p:last-child { margin: 0; }
        .md-body code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; font-family: "IBM Plex Mono",monospace; font-size: 12.5px; }
        .md-body pre { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 12px 14px; overflow-x: auto; margin: 8px 0; }
        .md-body pre code { background: none; padding: 0; }
        .md-body ul,.md-body ol { padding-left: 20px; margin: 6px 0; }
        .md-body li { margin: 3px 0; }
        .md-body h1,.md-body h2,.md-body h3 { margin: 12px 0 6px; font-weight: 600; }
        .md-body blockquote { border-left: 3px solid #38b8da; margin: 0; padding: 2px 0 2px 12px; color: rgba(255,255,255,0.65); }
        .md-body a { color: #38b8da; text-decoration: none; }
        .md-body a:hover { text-decoration: underline; }
        .md-body table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .md-body th,.md-body td { border: 1px solid rgba(255,255,255,0.12); padding: 5px 10px; text-align: left; font-size: 13px; }
        .md-body th { background: rgba(255,255,255,0.05); }
        .md-body hr { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 12px 0; }
      `}</style>
    </div>
  )
}
