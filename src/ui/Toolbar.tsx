import { useRef, useState } from 'react'

interface Props {
  agentCount: number
  sourcePath: string
  loading: boolean
  error: string | null
  footDebug: boolean
  onRefresh: () => void
  onToggleFootDebug: () => void
  onPickCatalog: (file: File) => void
}

function helpClipboardText() {
  const origin = window.location.origin
  return [
    `大屏帮助（含 Agent 指引）：${origin}/help.md#agent`,
    '先 POST /api/catalog；开干 working；做完/卡住 blocked。',
  ].join('\n')
}

export function Toolbar({
  agentCount,
  sourcePath,
  loading,
  error,
  footDebug,
  onRefresh,
  onToggleFootDebug,
  onPickCatalog,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const empty = !error && agentCount === 0
  const [copied, setCopied] = useState(false)

  const copyHelp = async () => {
    const text = helpClipboardText()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for older browsers / insecure context
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <header className="hud-panel absolute top-0 right-0 left-0 z-20 flex items-center gap-3 border-b-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm tracking-wide">像素员工办公室</div>
        <div className="truncate text-[11px] text-[var(--hud-text-muted)]" title={sourcePath}>
          {error ? (
            <span className="text-rose-300">{error}</span>
          ) : empty ? (
            <>
              0 agents · 空办公室 — 点「选择花名册」或{' '}
              <code className="text-[10px]">POST /api/catalog</code>
            </>
          ) : (
            <>
              {agentCount} agents · {sourcePath || '未加载花名册'}
            </>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPickCatalog(file)
        }}
      />
      <button
        type="button"
        onClick={() => void copyHelp()}
        className="hud-btn px-2.5 py-1 text-xs"
        title="复制帮助链接（含 Agent 指引锚点），可贴给 Evo Agent"
      >
        {copied ? '已复制' : '复制帮助'}
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => fileRef.current?.click()}
        className="hud-btn px-2.5 py-1 text-xs"
        title="读取本地 CATALOG.json 并 POST /api/catalog"
      >
        选择花名册
      </button>
      {import.meta.env.DEV ? (
        <button
          type="button"
          onClick={onToggleFootDebug}
          className={`hud-btn px-2.5 py-1 text-xs ${footDebug ? 'ring-1 ring-[var(--hud-accent)]' : ''}`}
          title="红=地图碰撞；绿=脚盒(H≈眉)；白十字=脚点；青十字=因果站位；黄菱形=Point POI"
        >
          {footDebug ? '碰撞盒·开' : '碰撞盒'}
        </button>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={onRefresh}
        className="hud-btn px-2.5 py-1 text-xs"
      >
        {loading ? '刷新中…' : '刷新花名册'}
      </button>
    </header>
  )
}
