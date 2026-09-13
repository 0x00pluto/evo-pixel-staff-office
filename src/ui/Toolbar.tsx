interface Props {
  agentCount: number
  sourcePath: string
  loading: boolean
  error: string | null
  footDebug: boolean
  onRefresh: () => void
  onToggleFootDebug: () => void
}

export function Toolbar({
  agentCount,
  sourcePath,
  loading,
  error,
  footDebug,
  onRefresh,
  onToggleFootDebug,
}: Props) {
  return (
    <header className="hud-panel absolute top-0 right-0 left-0 z-20 flex items-center gap-3 border-b-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm tracking-wide">像素员工办公室</div>
        <div className="truncate text-[11px] text-[var(--hud-text-muted)]" title={sourcePath}>
          {error ? (
            <span className="text-rose-300">{error}</span>
          ) : (
            <>
              {agentCount} agents · {sourcePath || '未加载花名册'}
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleFootDebug}
        className={`hud-btn px-2.5 py-1 text-xs ${footDebug ? 'ring-1 ring-[var(--hud-accent)]' : ''}`}
        title="红=地图碰撞；绿=脚盒(H≈眉)；白十字=脚点；青十字=因果站位；黄菱形=Point POI"
      >
        {footDebug ? '碰撞盒·开' : '碰撞盒'}
      </button>
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
