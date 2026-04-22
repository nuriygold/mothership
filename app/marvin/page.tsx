"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type AgentKey = "iceman" | "ruby" | "dispatch"

type StreamEntry = {
  id: string
  role: "user" | "assistant"
  agent?: AgentKey
  content: string
}

const AGENTS: AgentKey[] = ["iceman", "ruby", "dispatch"]

const SESSIONS: Record<AgentKey, string> = {
  iceman: "agent:iceman:marvin",
  ruby: "agent:ruby:marvin",
  dispatch: "agent:dispatch:marvin",
}

const AGENT_LABEL: Record<AgentKey, string> = {
  iceman: "Iceman",
  ruby: "Ruby",
  dispatch: "Dispatch",
}

const AGENT_COLOR: Record<AgentKey, string> = {
  iceman: "#38b8da",
  ruby: "#f472b6",
  dispatch: "#f59e0b",
}

function uid(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`
}

export default function MarvinPage() {
  const [input, setInput] = useState("")
  const [entries, setEntries] = useState<StreamEntry[]>([])
  const [activeAgents, setActiveAgents] = useState<AgentKey[]>([])
  const [error, setError] = useState<string | null>(null)
  const [gateway, setGateway] = useState<"checking" | "up" | "down">("checking")

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeControllersRef = useRef<AbortController[]>([])

  const loading = activeAgents.length > 0

  useEffect(() => {
    fetch("https://mother.nuriy.com/v1/health")
      .then((r) => setGateway(r.ok ? "up" : "down"))
      .catch(() => setGateway("down"))
  }, [])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
  }, [entries, loading])

  useEffect(() => {
    return () => {
      for (const controller of activeControllersRef.current) {
        controller.abort()
      }
      activeControllersRef.current = []
    }
  }, [])

  const activeLabel = useMemo(() => {
    if (activeAgents.length === 0) return ""
    return `Streaming: ${activeAgents.map((a) => AGENT_LABEL[a]).join(" • ")}`
  }, [activeAgents])

  function appendDelta(agent: AgentKey, delta: string) {
    if (!delta) return

    setEntries((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === "assistant" && last.agent === agent) {
        const next = [...prev]
        next[next.length - 1] = { ...last, content: `${last.content}${delta}` }
        return next
      }

      return [
        ...prev,
        {
          id: uid(`assistant:${agent}`),
          role: "assistant",
          agent,
          content: delta,
        },
      ]
    })
  }

  function appendError(agent: AgentKey, msg: string) {
    const content = `Error: ${msg}`
    setEntries((prev) => [
      ...prev,
      {
        id: uid(`assistant:${agent}:error`),
        role: "assistant",
        agent,
        content,
      },
    ])
  }

  async function streamAgent(agent: AgentKey, text: string, controller: AbortController) {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        agent,
        sessionId: SESSIONS[agent],
      }),
      signal: controller.signal,
    })

    if (!res.ok || !res.body) {
      throw new Error(`Request failed: ${res.status}`)
    }

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
          if (evt.error) {
            appendError(agent, String(evt.error))
            break outer
          }
          if (evt.delta) {
            appendDelta(agent, String(evt.delta))
          }
        } catch {
          // Ignore malformed chunks.
        }
      }
    }
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    setError(null)
    setEntries((prev) => [...prev, { id: uid("user"), role: "user", content: text }])

    const controllers = AGENTS.map(() => new AbortController())
    activeControllersRef.current = controllers
    setActiveAgents([...AGENTS])

    await Promise.all(
      AGENTS.map(async (agent, index) => {
        try {
          await streamAgent(agent, text, controllers[index])
        } catch (err: unknown) {
          if ((err as Error)?.name !== "AbortError") {
            appendError(agent, err instanceof Error ? err.message : "Request failed")
          }
        } finally {
          setActiveAgents((prev) => prev.filter((key) => key !== agent))
        }
      })
    )

    activeControllersRef.current = []
    inputRef.current?.focus()
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
      <div
        style={{
          height: "60px",
          display: "flex",
          alignItems: "center",
          paddingLeft: "24px",
          paddingRight: "24px",
          gap: "12px",
          background: "rgba(20,25,35,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1e2235",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "20px", color: "white", fontWeight: 600 }}>🎛️ MARVIN ROUND TABLE</span>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
          {gateway === "up" && "Gateway online"}
          {gateway === "down" && "Gateway offline"}
          {gateway === "checking" && "Checking gateway..."}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {AGENTS.map((agent) => (
            <span
              key={agent}
              style={{
                fontSize: 12,
                border: `1px solid ${AGENT_COLOR[agent]}55`,
                color: AGENT_COLOR[agent],
                borderRadius: 999,
                padding: "4px 8px",
              }}
            >
              {AGENT_LABEL[agent]}
            </span>
          ))}
        </div>
      </div>

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
        {entries.length === 0 && !loading && (
          <div style={{ opacity: 0.5, fontSize: "14px" }}>
            Send one prompt to Iceman, Ruby, and Dispatch. Their responses stream into this shared timeline.
          </div>
        )}

        {entries.map((entry) => {
          const isUser = entry.role === "user"
          const chip = entry.agent ? AGENT_LABEL[entry.agent] : "You"
          const assistantColor = entry.agent ? `${AGENT_COLOR[entry.agent]}22` : "#1e2235"

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
              <span style={{ fontSize: 11, opacity: 0.65 }}>{chip}</span>
              <div
                style={{
                  maxWidth: "86%",
                  padding: "10px 14px",
                  borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: isUser ? "#38b8da" : assistantColor,
                  border: isUser ? "none" : "1px solid #2a3046",
                  fontSize: "15px",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {entry.content}
              </div>
            </div>
          )
        })}

        {loading && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{activeLabel}</div>
        )}

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(255,80,80,0.1)",
              border: "1px solid rgba(255,80,80,0.3)",
              color: "#ff6b6b",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "16px 24px",
          borderTop: "1px solid #1e2235",
          background: "rgba(20,25,35,0.9)",
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          style={{ display: "flex", gap: "10px" }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the roundtable..."
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
              padding: "0 16px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Streaming..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  )
}
