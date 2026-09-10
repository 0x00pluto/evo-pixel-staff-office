import type { NameplateView } from '../game/types'

interface Props {
  plates: NameplateView[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function NameplateLayer({ plates, selectedId, onSelect }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {plates.map((p) =>
        p.visible ? (
          <button
            key={p.id}
            type="button"
            className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-full rounded-sm border px-1.5 py-0.5 text-left shadow-sm transition-opacity ${
              selectedId === p.id
                ? 'border-amber-300 bg-stone-900/95'
                : 'border-stone-600 bg-stone-950/85 hover:border-stone-400'
            }`}
            style={{ left: p.screenX, top: p.screenY }}
            onClick={() => onSelect(p.id)}
          >
            <div className="flex items-center gap-1">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  p.lifecycle === 'experiment' ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <span className="max-w-40 truncate text-[11px] font-medium text-stone-100">
                {p.name}
              </span>
            </div>
            <div className="max-w-44 truncate text-[10px] text-stone-400">{p.status}</div>
          </button>
        ) : null,
      )}
    </div>
  )
}
