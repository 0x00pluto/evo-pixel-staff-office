import type { NameplateView } from '../game/types'

interface Props {
  plates: NameplateView[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function NameplateLayer({ plates, selectedId, onSelect }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-visible">
      {plates.map((p) =>
        p.visible ? (
          <button
            key={p.id}
            type="button"
            className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-full hud-nameplate px-1.5 py-0.5 text-left ${
              selectedId === p.id ? 'hud-nameplate--selected z-30' : 'z-10'
            }`}
            style={{ left: p.screenX, top: p.screenY }}
            onClick={() => onSelect(p.id)}
          >
            <div className="flex items-center gap-1">
              <span
                className={`hud-dot ${
                  p.lifecycle === 'experiment' ? 'hud-dot--experiment' : 'hud-dot--active'
                }`}
              />
              <span className="max-w-40 truncate text-[11px] text-white">{p.name}</span>
            </div>
          </button>
        ) : null,
      )}
    </div>
  )
}
