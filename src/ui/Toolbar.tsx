interface Props {
  agentCount: number
  sourcePath: string
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export function Toolbar({ agentCount, sourcePath, loading, error, onRefresh }: Props) {
  return (
    <header className="absolute top-0 right-0 left-0 z-20 flex items-center gap-3 border-b border-stone-700/80 bg-stone-950/90 px-3 py-2 text-stone-100 backdrop-blur-sm">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tracking-wide">像素员工办公室</div>
        <div className="truncate text-[11px] text-stone-400" title={sourcePath}>
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
        disabled={loading}
        onClick={onRefresh}
        className="rounded border border-stone-600 bg-stone-900 px-2.5 py-1 text-xs text-stone-200 hover:bg-stone-800 disabled:opacity-50"
      >
        {loading ? '刷新中…' : '刷新花名册'}
      </button>
    </header>
  )
}
