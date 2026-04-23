"use client"

import { useEffect, useRef, useState } from "react"

type AgentKey = "iceman" | "ruby" | "emerald" | "anchor" | "adrian" | "adobe"

type StreamEntry = {
  id: string
  role: "user" | "assistant"
  agent?: AgentKey
  content: string
}

const AGENTS: AgentKey[] = ["iceman", "ruby", "emerald", "anchor", "adrian", "adobe"]

const SESSIONS: Record<AgentKey, string> = {
  iceman: "agent:iceman:marvin",
  ruby: "agent:ruby:marvin",
  emerald: "agent:emerald:marvin",
  anchor: "agent:anchor:marvin",
  adrian: "agent:adrian:marvin",
  adobe: "agent:adobe:marvin",
}

const DISPATCH_URL: Record<AgentKey, string> = {
  iceman:  "/api/agent",
  ruby:    "/api/v2/ruby/dispatch",
  emerald: "/api/v2/emerald/dispatch",
  anchor:  "/api/v2/anchor/dispatch",
  adrian:  "/api/v2/adrian/dispatch",
  adobe:   "/api/v2/adobe/dispatch",
}

const AGENT_LABEL: Record<AgentKey, string> = {
  iceman: "🧊 Iceman",
  ruby: "🌹 Drizzy",
  emerald: "🍾 Champagne Papi",
  anchor: "🙏 6 God",
  adrian: "🔨 Drake",
  adobe: "📜 Aubrey",
}

const AGENT_EMOJI: Record<AgentKey, string> = {
  iceman: "🧊",
  ruby: "🌹",
  emerald: "🍾",
  anchor: "🙏",
  adrian: "🔨",
  adobe: "📜",
}

const AGENT_COLOR: Record<AgentKey, string> = {
  iceman: "#38b8da",
  ruby: "#f472b6",
  emerald: "#34d399",
  anchor: "#a78bfa",
  adrian: "#fbbf24",
  adobe: "#fb923c",
}

const GATEWAY_COLOR = {
  up: "#4ade80",
  down: "#f87171",
  checking: "#fbbf24",
} as const

const WELCOME_PROMPT =
  "Welcome to Marvin's Room — everyone's here. This is a shared group session. " +
  "Lead with your domain: Iceman owns systems and code, Drizzy owns comms and coordination, " +
  "Champagne Papi owns finance and verification, 6 God owns execution sequencing, " +
  "Drake owns automation and infrastructure, Aubrey owns documents and entity extraction. " +
  "Be expressive in your lane, stay in character, and contribute fully to every prompt."

function uid(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`
}

export default function MarvinPage() {
  const [input, setInput] = useState("")
  const [entries, setEntries] = useState<StreamEntry[]>([])
  const [activeAgents, setActiveAgents] = useState<AgentKey[]>([])
  const [gateway, setGateway] = useState<"checking" | "up" | "down">("checking")
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeControllersRef = useRef<AbortController[]>([])
  const currentTurnIdsRef = useRef<Partial<Record<AgentKey, string>>>({})
  const autoWelcomedRef = useRef(false)

  const loading = activeAgents.length > 0
  const dotColor = GATEWAY_COLOR[gateway]

  // Gateway health — route through our own API so it uses the configured gateway URL
  useEffect(() => {
    fetch("/api/openclaw/health")
      .then((r) => setGateway(r.ok ? "up" : "down"))
      .catch(() => setGateway("down"))
  }, [])

  // Load persistent history on mount, then auto-welcome if the room is brand new
  useEffect(() => {
    async function init() {
      const count = await loadHistory()
      setHistoryLoaded(true)
      if (count === 0 && !autoWelcomedRef.current) {
        autoWelcomedRef.current = true
        await sendText(WELCOME_PROMPT)
      }
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
  }, [entries, loading])

  // Abort any in-flight streams on unmount
  useEffect(() => {
    return () => {
      for (const c of activeControllersRef.current) c.abort()
      activeControllersRef.current = []
    }
  }, [])

  async function loadHistory(): Promise<number> {
    try {
      const perAgent = await Promise.all(
        AGENTS.map(async (agent) => {
          const res = await fetch(
            `/api/chat/messages?sessionId=${encodeURIComponent(SESSIONS[agent])}`
          )
          if (!res.ok) return []
          const { messages } = (await res.json()) as {
            messages: { id: string; role: string; content: string; createdAt: string }[]
          }
          return messages.map((m) => ({ ...m, agentKey: agent }))
        })
      )

      const flat = perAgent.flat()
      flat.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      // Deduplicate user messages that were stored once per agent session
      const seen = new Map<string, boolean>()
      const deduped = flat.filter((m) => {
        if (m.role !== "user") return true
        const bucket = Math.floor(new Date(m.createdAt).getTime() / 5000)
        const key = `${bucket}:${m.content}`
        if (seen.has(key)) return false
        seen.set(key, true)
        return true
      })

      setEntries(
        deduped.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          agent: m.role === "assistant" ? m.agentKey : undefined,
          content: m.content,
        }))
      )

      return deduped.length
    } catch {
      return 0
    }
  }

  function appendDelta(agent: AgentKey, delta: string) {
    if (!delta) return
    setEntries((prev) => {
      const existingId = currentTurnIdsRef.current[agent]
      if (existingId) {
        const idx = prev.findIndex((e) => e.id === existingId)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = { ...next[idx], content: next[idx].content + delta }
          return next
        }
      }
      const id = uid(`assistant:${agent}`)
      currentTurnIdsRef.current[agent] = id
      return [...prev, { id, role: "assistant", agent, content: delta }]
    })
  }

  function appendError(agent: AgentKey, msg: string) {
    setEntries((prev) => [
      ...prev,
      { id: uid(`assistant:${agent}:error`), role: "assistant", agent, content: `Error: ${msg}` },
    ])
  }

  async function streamAgent(agent: AgentKey, text: string, controller: AbortController) {
    const res = await fetch(DISPATCH_URL[agent], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, agent, sessionId: SESSIONS[agent] }),
      signal: controller.signal,
    })

    if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""

    outer: while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const dataStr = trimmed.slice(5).trim()
        if (dataStr === "[DONE]") break outer
        try {
          const evt = JSON.parse(dataStr)
          if (evt.error) { appendError(agent, String(evt.error)); break outer }
          if (evt.delta) appendDelta(agent, String(evt.delta))
        } catch { /* ignore malformed chunk */ }
      }
    }
  }

  // Clear the visible timeline without deleting DB history
  function clear() {
    if (loading) return
    setEntries([])
  }

  async function sendText(text: string) {
    if (!text.trim() || loading) return
    currentTurnIdsRef.current = {}
    setEntries((prev) => [...prev, { id: uid("user"), role: "user", content: text }])

    const controllers = AGENTS.map(() => new AbortController())
    activeControllersRef.current = controllers
    setActiveAgents([...AGENTS])

    await Promise.all(
      AGENTS.map(async (agent, i) => {
        try {
          await streamAgent(agent, text, controllers[i])
        } catch (err: unknown) {
          if ((err as Error)?.name !== "AbortError") {
            appendError(agent, err instanceof Error ? err.message : "Request failed")
          }
        } finally {
          setActiveAgents((prev) => prev.filter((k) => k !== agent))
        }
      })
    )

    activeControllersRef.current = []
    inputRef.current?.focus()
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput("")
    await sendText(text)
  }

  return (
    <div
      style={{
        background: "#0b0f17",
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes marvin-pulse {
          0%, 100% { opacity: 0.9; transform: scale(1.1); }
          50%       { opacity: 0.3; transform: scale(0.8); }
        }
        .marvin-active { animation: marvin-pulse 1.4s ease-in-out infinite; }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          height: "60px",
          display: "flex",
          alignItems: "center",
          paddingLeft: "24px",
          paddingRight: "24px",
          gap: "14px",
          background: "rgba(20,25,35,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1e2235",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "20px", color: "white", fontWeight: 600 }}>
          🕯️ Marvin&rsquo;s Room
        </span>

        {/* Gateway status — dot + single word, both in status color */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: dotColor,
              boxShadow: `0 0 6px ${dotColor}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, color: dotColor, fontWeight: 500 }}>Gateway</span>
        </span>

        <div style={{ flex: 1 }} />

        {/* Glowing emoji icons — pulse while that agent is streaming */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {AGENTS.map((agent) => {
            const isActive = activeAgents.includes(agent)
            return (
              <span
                key={agent}
                title={AGENT_LABEL[agent]}
                className={isActive ? "marvin-active" : undefined}
                style={{
                  fontSize: 20,
                  filter: `drop-shadow(0 0 ${isActive ? "10px" : "4px"} ${AGENT_COLOR[agent]})`,
                  opacity: isActive ? 1 : 0.55,
                  cursor: "default",
                  transition: "opacity 0.3s, filter 0.3s",
                  userSelect: "none",
                }}
              >
                {AGENT_EMOJI[agent]}
              </span>
            )
          })}

          {entries.length > 0 && !loading && (
            <button
              onClick={clear}
              style={{
                fontSize: 12,
                border: "1px solid #2a3046",
                color: "rgba(255,255,255,0.4)",
                background: "transparent",
                borderRadius: 999,
                padding: "4px 10px",
                cursor: "pointer",
                marginLeft: 4,
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
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
        {!historyLoaded && (
          <div style={{ opacity: 0.4, fontSize: 13 }}>Loading session history…</div>
        )}

        {historyLoaded && entries.length === 0 && !loading && (
          <div style={{ opacity: 0.55, fontSize: "14px", lineHeight: 1.7 }}>
            <div style={{ fontSize: 16, color: "#fbbf24", marginBottom: 6 }}>
              🕯️ After hours. All hands.
            </div>
            <div>
              Drop one prompt — the whole room weighs in. Iceman, Drizzy, Champagne Papi,
              6 God, Drake, and Aubrey stream their responses into this shared timeline.
            </div>
          </div>
        )}

        {entries.map((entry) => {
          const isUser = entry.role === "user"
          const chip = entry.agent ? AGENT_LABEL[entry.agent] : "You"
          const bg = entry.agent ? `${AGENT_COLOR[entry.agent]}22` : "#1e2235"

          return (
            <div
              key={entry.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isUser ? "flex-end" : "flex-start",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.6 }}>{chip}</span>
              <div
                style={{
                  maxWidth: "86%",
                  padding: "10px 14px",
                  borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: isUser ? "#38b8da" : bg,
                  border: isUser ? "none" : "1px solid #2a3046",
                  fontSize: "15px",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: isUser ? "#03232e" : "white",
                }}
              >
                {entry.content}
              </div>
            </div>
          )
        })}

        {/* Pulsing emojis for in-flight agents */}
        {loading && (
          <div style={{ display: "flex", gap: 14, alignItems: "center", paddingTop: 6 }}>
            {activeAgents.map((agent) => (
              <span
                key={agent}
                className="marvin-active"
                title={`${AGENT_LABEL[agent]} responding…`}
                style={{
                  fontSize: 24,
                  filter: `drop-shadow(0 0 12px ${AGENT_COLOR[agent]})`,
                  display: "inline-block",
                }}
              >
                {AGENT_EMOJI[agent]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div
        style={{
          padding: "16px 24px",
          borderTop: "1px solid #1e2235",
          background: "rgba(20,25,35,0.9)",
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); void send() }}
          style={{ display: "flex", gap: "10px" }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Drop a prompt…"
            disabled={loading}
            style={{
              flex: 1,
              background: "#131829",
              border: "1px solid #2a3046",
              color: "white",
              borderRadius: "12px",
              padding: "12px 14px",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              background: loading ? "#2a3046" : "#38b8da",
              color: loading ? "rgba(255,255,255,0.6)" : "#03232e",
              border: "none",
              borderRadius: "12px",
              padding: "0 20px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Streaming…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  )
}
