import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentPersona, CatalogPayload } from './catalog/types'
import { createOfficeGame } from './game/createGame'
import type { NameplateView, OfficeGameHandle } from './game/types'
import { AgentCard } from './ui/AgentCard'
import { NameplateLayer } from './ui/NameplateLayer'
import { Toolbar } from './ui/Toolbar'

async function fetchCatalog(refresh = false): Promise<CatalogPayload> {
  const url = refresh ? '/api/catalog?refresh=1' : '/api/catalog'
  const res = await fetch(url)
  const data = (await res.json()) as CatalogPayload & { error?: string }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<OfficeGameHandle | null>(null)
  const agentsRef = useRef<AgentPersona[]>([])

  const [agents, setAgents] = useState<AgentPersona[]>([])
  const [sourcePath, setSourcePath] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AgentPersona | null>(null)
  const [plates, setPlates] = useState<NameplateView[]>([])

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
          onSelect: (agent) => setSelected(agent),
          onNameplates: (next) => setPlates(next),
          onAssetsError: (message) => {
            if (!cancelled) setAssetsError(message)
          },
        })
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
  }, [applyPayload])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1a1f2b] text-stone-100">
      <Toolbar
        agentCount={agents.length}
        sourcePath={sourcePath}
        loading={loading}
        error={error}
        onRefresh={() => void load(true)}
      />
      <div className="absolute inset-0 top-10">
        <div ref={hostRef} className="absolute inset-0" />
        <NameplateLayer
          plates={plates}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            const agent = agentsRef.current.find((a) => a.id === id) ?? null
            setSelected(agent)
          }}
        />
        {assetsError ? (
          <div
            role="alert"
            className="absolute inset-x-4 top-4 z-30 mx-auto max-w-xl rounded-md border border-rose-500/60 bg-rose-950/95 px-4 py-3 text-sm text-rose-100 shadow-lg"
          >
            <div className="font-semibold tracking-wide">地图 / 素材无法加载</div>
            <p className="mt-1 text-xs leading-relaxed text-rose-200/90">{assetsError}</p>
            <p className="mt-2 text-[10px] text-rose-300/80">
              检查 public/assets/maps（company-25 / outside-stub JSON + tilesets）与 characters.png；切图目标须在地图注册表中。
            </p>
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-2 left-3 z-20 text-[10px] text-stone-500">
          拖拽移动相机 · 滚轮缩放 · 点击小人查看详情
        </div>
      </div>
      <AgentCard agent={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
