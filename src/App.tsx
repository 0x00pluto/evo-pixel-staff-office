import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentPersona, CatalogPayload } from './catalog/types'
import { createOfficeGame } from './game/createGame'
import type { NameplateView, OfficeGameHandle } from './game/types'
import {
  bubbleStillVisible,
  nextPresenceBubbles,
  type PresenceBubble,
} from './presence/liveLock'
import type { PresenceRecord, PresenceSnapshot } from './presence/types'
import { AgentCard } from './ui/AgentCard'
import { NameplateLayer } from './ui/NameplateLayer'
import { Toolbar } from './ui/Toolbar'

const PRESENCE_POLL_MS = 1_500
const PRESENCE_POLL_HIDDEN_MS = 8_000

async function fetchCatalog(refresh = false): Promise<CatalogPayload> {
  const url = refresh ? '/api/catalog?refresh=1' : '/api/catalog'
  const res = await fetch(url)
  const data = (await res.json()) as CatalogPayload & { error?: string }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

async function fetchPresence(): Promise<PresenceRecord[]> {
  const res = await fetch('/api/presence')
  const data = (await res.json()) as PresenceSnapshot & { error?: string }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data.agents ?? []
}

async function postPresenceIdle(id: string): Promise<void> {
  await fetch('/api/presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, state: 'idle' }),
  })
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<OfficeGameHandle | null>(null)
  const agentsRef = useRef<AgentPersona[]>([])
  const presenceRef = useRef<Map<string, PresenceRecord>>(new Map())
  const shownSummaryRef = useRef<Map<string, string>>(new Map())

  const [agents, setAgents] = useState<AgentPersona[]>([])
  const [sourcePath, setSourcePath] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AgentPersona | null>(null)
  const [plates, setPlates] = useState<NameplateView[]>([])
  const [footDebug, setFootDebug] = useState(false)
  const [presenceById, setPresenceById] = useState<Map<string, PresenceRecord>>(
    () => new Map(),
  )
  const [bubbles, setBubbles] = useState<PresenceBubble[]>([])
  const [bubbleNowMs, setBubbleNowMs] = useState(() => Date.now())

  const applyPresenceSnapshot = useCallback((records: PresenceRecord[]) => {
    const next = new Map<string, PresenceRecord>()
    const changes: Array<{ id: string; text: string }> = []
    for (const r of records) {
      next.set(r.id, r)
      const display = r.summary.trim()
      const prevShown = shownSummaryRef.current.get(r.id) ?? ''
      if (display && display !== prevShown) {
        changes.push({ id: r.id, text: display })
        shownSummaryRef.current.set(r.id, display)
      } else if (!display && prevShown) {
        // Cleared summary: update last-shown so a later same text can bubble again.
        shownSummaryRef.current.set(r.id, '')
      }
    }
    presenceRef.current = next
    setPresenceById(next)
    gameRef.current?.applyPresence(records)
    if (changes.length) {
      const now = Date.now()
      setBubbles((prev) => nextPresenceBubbles(prev, changes, now))
    }
  }, [])

  const applyPayload = useCallback((payload: CatalogPayload) => {
    agentsRef.current = payload.agents
    setAgents(payload.agents)
    setSourcePath(payload.sourcePath)
    setSelected((prev) =>
      prev ? (payload.agents.find((a) => a.id === prev.id) ?? null) : null,
    )
    gameRef.current?.reloadAgents(payload.agents)
  }, [])

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true)
      setError(null)
      try {
        const payload = await fetchCatalog(refresh)
        applyPayload(payload)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [applyPayload],
  )

  const selectAgent = useCallback(async (agent: AgentPersona | null) => {
    setSelected(agent)
    if (!agent) return
    const live = presenceRef.current.get(agent.id)
    if (live?.state === 'blocked') {
      try {
        await postPresenceIdle(agent.id)
        const records = await fetchPresence()
        applyPresenceSnapshot(records)
      } catch {
        /* ack best-effort; next poll will converge */
      }
    }
  }, [applyPresenceSnapshot])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)
      setAssetsError(null)
      try {
        const payload = await fetchCatalog(false)
        if (cancelled) return
        applyPayload(payload)
        gameRef.current = createOfficeGame(host, payload.agents, {
          onSelect: (agent) => {
            void selectAgent(agent)
          },
          onNameplates: (next) => setPlates(next),
          onAssetsError: (message) => {
            if (!cancelled) setAssetsError(message)
          },
        })
        try {
          const records = await fetchPresence()
          if (!cancelled) applyPresenceSnapshot(records)
        } catch {
          /* presence optional at boot */
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      gameRef.current?.destroy()
      gameRef.current = null
    }
    // selectAgent / apply* are stable enough; mount once for Phaser lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Presence poll (1–2s when visible; slower when hidden).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      try {
        const records = await fetchPresence()
        if (!cancelled) applyPresenceSnapshot(records)
      } catch {
        /* ignore transient poll errors */
      }
      if (cancelled) return
      const delay = document.hidden ? PRESENCE_POLL_HIDDEN_MS : PRESENCE_POLL_MS
      timer = setTimeout(() => {
        void tick()
      }, delay)
    }

    void tick()
    const onVis = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [applyPresenceSnapshot])

  // Expire / fade sparse bubbles (tick often enough for smooth opacity).
  useEffect(() => {
    if (!bubbles.length) return
    const id = setInterval(() => {
      const now = Date.now()
      setBubbleNowMs(now)
      setBubbles((prev) => prev.filter((b) => bubbleStillVisible(b, now)))
    }, 80)
    return () => clearInterval(id)
  }, [bubbles.length])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1B2A41]">
      <Toolbar
        agentCount={agents.length}
        sourcePath={sourcePath}
        loading={loading}
        error={error}
        footDebug={footDebug}
        onRefresh={() => void load(true)}
        onToggleFootDebug={() => {
          setFootDebug((prev) => {
            const next = !prev
            gameRef.current?.setFootDebug(next)
            return next
          })
        }}
      />
      <div className="absolute inset-0 top-10">
        <div ref={hostRef} className="absolute inset-0" />
        <NameplateLayer
          plates={plates}
          selectedId={selected?.id ?? null}
          bubbles={bubbles}
          nowMs={bubbleNowMs}
          onSelect={(id) => {
            const agent = agentsRef.current.find((a) => a.id === id) ?? null
            void selectAgent(agent)
          }}
        />
        {assetsError ? (
          <div
            role="alert"
            className="hud-panel hud-panel--danger absolute inset-x-4 top-4 z-30 mx-auto max-w-xl px-4 py-3 text-sm"
          >
            <div className="tracking-wide">地图 / 素材无法加载</div>
            <p className="mt-1 text-xs leading-relaxed text-rose-200/90">{assetsError}</p>
            <p className="mt-2 text-[10px] text-rose-300/80">
              检查 public/assets/maps（company-25 / world-map JSON + tilesets）与 characters.png；切图目标须在地图注册表中。
            </p>
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-2 left-3 z-20 text-[10px] text-stone-500">
          拖拽移动相机 · 滚轮缩放 · 点击小人查看详情 · 黄灯点击已读灭灯
        </div>
      </div>
      <AgentCard
        agent={selected}
        presence={selected ? (presenceById.get(selected.id) ?? null) : null}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
