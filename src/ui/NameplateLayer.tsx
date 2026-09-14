import type { NameplateView } from '../game/types'
import {
  bubbleOpacity,
  type PresenceBubble,
} from '../presence/liveLock'

interface Props {
  plates: NameplateView[]
  selectedId: string | null
  bubbles?: PresenceBubble[]
  /** Wall clock for bubble hold / fade opacity. */
  nowMs?: number
  onSelect: (id: string) => void
}

/** Live presence marker: idle = none; working = gear; blocked = mail. */
function PresenceMarker({ presence }: { presence: NameplateView['presence'] }) {
  if (presence === 'working') {
    return (
      <img
        className="hud-presence-icon"
        src="/assets/hud/gear.svg"
        alt=""
        width={14}
        height={14}
        aria-hidden
      />
    )
  }
  if (presence === 'blocked') {
    return (
      <img
        className="hud-presence-icon"
        src="/assets/hud/email.svg"
        alt=""
        width={14}
        height={14}
        aria-hidden
      />
    )
  }
  return null
}

export function NameplateLayer({
  plates,
  selectedId,
  bubbles = [],
  nowMs = 0,
  onSelect,
}: Props) {
  const plateById = new Map(plates.map((p) => [p.id, p]))

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
              <PresenceMarker presence={p.presence} />
              <span className="max-w-40 truncate text-[11px] text-white">{p.name}</span>
            </div>
          </button>
        ) : null,
      )}
      {bubbles.map((b) => {
        const plate = plateById.get(b.id)
        if (!plate?.visible) return null
        const opacity = bubbleOpacity(b, nowMs)
        if (opacity <= 0) return null
        return (
          <div
            key={`bubble-${b.id}`}
            className="hud-presence-bubble absolute z-40 text-[10px] leading-snug"
            style={{
              left: plate.screenX,
              top: plate.screenY - 10,
              opacity,
            }}
            aria-hidden
          >
            {b.text}
          </div>
        )
      })}
    </div>
  )
}
