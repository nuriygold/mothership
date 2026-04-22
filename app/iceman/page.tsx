"use client"

import { useState, useEffect } from "react"

export default function Iceman() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gateway, setGateway] = useState<'checking'|'up'|'down'>('checking')

  function newSession() {
    const id = Math.random().toString(36).slice(2,8)
    const url = `/iceman/chat?session=agent:iceman:${id}`
    window.open(url, '_blank')
  }

  async function send() {
    if (!input.trim() || loading) return

    setError(null)
    setLoading(true)

    const userText = input
    setMessages(m => [...m, { role: "🧊 you", text: userText }])

    try {
      const res = await fetch("https://mother.nuriy.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer 8bcb9a096d688cd87406486da0c68e1a51708425975870bc",
          "x-openclaw-agent-id": "iceman"
        },
        body: JSON.stringify({ model: "openclaw", input: userText })
      })

      if (!res.ok) {
        throw new Error("Request failed: " + res.status)
      }

      const data = await res.json()

      let reply = "No reply from agent."

      if (data?.output_text) {
        reply = data.output_text
      } else if (data?.output?.[0]?.content?.[0]?.text) {
        reply = data.output[0].content[0].text
      } else if (data?.error) {
        reply = "API error: " + JSON.stringify(data.error)
      }

      // streaming style typing effect
      let current = ""
      for (const ch of reply) {
        current += ch
        setMessages(m => {
          const last = m[m.length-1]
          if (last && last.role === "🤖 iceman" && last.text === current.slice(0,-1)) {
            return [...m.slice(0,-1), { role: "🤖 iceman", text: current }]
          }
          return [...m, { role: "🤖 iceman", text: current }]
        })
        await new Promise(r => setTimeout(r, 8))
      }
    } catch (err: any) {
      setError(err.message || "Request failed")
    } finally {
      setLoading(false)
      setInput("")
    }
  }

  useEffect(() => {
    async function checkGateway() {
      try {
        const r = await fetch("https://mother.nuriy.com/v1/health")
        if (r.ok) setGateway('up')
        else setGateway('down')
      } catch {
        setGateway('down')
      }
    }
    checkGateway()
  }, [])

  const robot = gateway === 'up' ? '🤖' : gateway === 'down' ? '⚠️' : '⏳'

  return (
    <div style={{
      background: "#0b0f17",
      minHeight: "100vh",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch"
    }}>
      <div style={{
        height: "70px",
        display: "flex",
        alignItems: "center",
        paddingLeft: "24px",
        fontSize: "22px",
        color: "white",
        background: "rgba(20,25,35,0.85)",
        backdropFilter: "blur(12px)"
      }}>
        {robot} 🧊 ICEMAN
        <span style={{ marginLeft: "10px", fontSize: "12px", opacity: 0.6 }}>
          Mothership Builder Interface
        </span>
        <span style={{marginLeft:"12px",fontSize:"12px",opacity:0.7}}>
          {gateway==='up' && 'Gateway online'}
          {gateway==='down' && 'Gateway offline'}
          {gateway==='checking' && 'Checking gateway…'}
        </span>
        <button
          onClick={newSession}
          style={{
            marginLeft: "20px",
            background: "#2a2f45",
            border: "1px solid #3c425e",
            color: "white",
            padding: "6px 10px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px"
          }}
        >
          + New Session
        </button>
      </div>

      <div style={{
        flex: 1,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        color: "white"
      }}>
        <div style={{
          background: "rgba(40,45,60,0.7)",
          borderRadius: "8px",
          padding: "24px",
          minHeight: "300px",
          overflowY: "auto",
          boxShadow: "0 2px 18px 0 #100f1e70"
        }}>
          {error && (
            <div style={{ color: "#ff6b6b", marginBottom: 10 }}>
              Error: {error}
            </div>
          )}
          {messages.length === 0 ? (
            <div style={{ opacity: 0.7 }}>
              Type a message below &amp; hit send to talk to Iceman.
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} style={{
                marginBottom: "12px",
                borderBottom: "1px solid #2223",
                paddingBottom: "6px"
              }}>
                <strong>{m.role}:</strong> {m.text}
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") send() }}
            style={{
              flex: 1,
              padding: "11px 14px",
              border: "none",
              borderRadius: "4px",
              background: "#232434",
              color: "white",
              fontSize: "18px"
            }}
            autoFocus
            placeholder="Say something to Iceman…"
          />
          <button
            onClick={send}
            disabled={loading}
            style={{
              background: "#38b8da",
              color: "white",
              fontSize: "18px",
              border: "none",
              borderRadius: "4px",
              padding: "10px 18px",
              cursor: "pointer",
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}
