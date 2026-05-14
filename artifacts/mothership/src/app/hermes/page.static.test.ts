import * as assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function run() {
  const source = await readFile('src/app/hermes/page.tsx', 'utf8')

  assert.match(source, /^"use client"/m)
  assert.match(source, /function isValidHermesSessionId\(sessionId: string \| null\): sessionId is string \{[\s\S]*?\^agent:hermes:\[0-9a-fA-F-\]\{36\}\$/)
  assert.match(source, /body: JSON\.stringify\(\{ text, sessionId: activeSessionId, agent: 'hermes' \}\)/)
  assert.match(source, /fetch\(`\/api\/chat\/messages\?sessionId=\$\{encodeURIComponent\(sessionId\)\}`,[\s\S]*?if \(r\.status === 404\) return \{ messages: \[\] \}[\s\S]*?if \(!r\.ok\) throw new Error\(`Failed to load session history \(\$\{r\.status\}\)`\)/)
  assert.match(source, /setLoadedSessions\(\(prev\) => \{\s*if \(!prev\.has\(closedSessionId\)\) return prev\s*const next = new Set\(prev\)\s*next\.delete\(closedSessionId\)/)
  assert.match(source, /if \(done\) \{\s*buf \+= decoder\.decode\(\)\s*\} else if \(value\) \{\s*buf \+= decoder\.decode\(value, \{ stream: true \}\)/)
  assert.match(source, /const cancelActiveRequest = useCallback\(\(sessionToCancel\?: string\) => \{[\s\S]*?active\.controller\.abort\(\)/)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
