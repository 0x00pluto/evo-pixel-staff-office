import type { AgentPersona } from '../catalog/types'
import type { PresenceRecord } from '../presence/types'

interface Props {
  agent: AgentPersona | null
  presence?: PresenceRecord | null
  onClose: () => void
}

function stateLabel(presence: PresenceRecord | null | undefined): string {
  if (!presence || presence.state === 'idle') return '空闲'
  if (presence.state === 'working') return '正在干活'
  return '需要老板'
}

function stateIconSrc(presence: PresenceRecord | null | undefined): string | null {
  if (!presence) return null
  if (presence.state === 'working') return '/assets/hud/gear.svg'
  if (presence.state === 'blocked') return '/assets/hud/email.svg'
  return null
}

/** Local wall time for last presence report; empty if never reported. */
function formatPresenceTime(updatedAt: number): string {
  if (!updatedAt) return ''
  const d = new Date(updatedAt)
  const now = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const time = `${hh}:${mm}`
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return `今天 ${time}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
}

export function AgentCard({ agent, presence, onClose }: Props) {
  if (!agent) return null

  const iconSrc = stateIconSrc(presence)
  const summary = presence?.summary?.trim() ?? ''
  const when = presence ? formatPresenceTime(presence.updatedAt) : ''

  return (
    <aside className="hud-panel absolute top-14 right-3 bottom-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden">
      <header className="flex items-start justify-between gap-2 border-b-2 border-[var(--hud-border)] px-3 py-2">
        <div>
          <div className="text-xs tracking-wide text-[var(--hud-text-muted)] uppercase">Agent</div>
          <h2 className="text-sm leading-snug text-[var(--hud-text)]">{agent.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--hud-text-muted)]">
            <span
              className={`border border-[var(--hud-border)] px-1.5 py-0.5 ${
                agent.lifecycle === 'experiment'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {agent.lifecycle || 'active'}
            </span>
            <span className="truncate">{agent.status}</span>
          </div>
        </div>
        <button type="button" className="hud-btn px-2 py-0.5 text-xs" onClick={onClose}>
          关闭
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-xs leading-relaxed">
        <section>
          <h3 className="mb-1 text-[10px] tracking-wider text-[var(--hud-text-muted)] uppercase">
            此刻
          </h3>
          <p className="flex items-center gap-1.5 text-[var(--hud-text-muted)]">
            {iconSrc ? (
              <img
                src={iconSrc}
                alt=""
                width={14}
                height={14}
                className="inline-block shrink-0"
                aria-hidden
              />
            ) : null}
            <span>{stateLabel(presence)}</span>
          </p>
        </section>

        <section>
          <h3 className="mb-1 text-[10px] tracking-wider text-[var(--hud-text-muted)] uppercase">
            消息
          </h3>
          {summary ? (
            <div className="hud-panel hud-panel--raised space-y-1.5 px-2.5 py-2">
              {when ? (
                <div className="text-[10px] text-[var(--hud-text-muted)]">{when}</div>
              ) : null}
              <p className="break-words whitespace-pre-wrap text-[var(--hud-text)]">{summary}</p>
            </div>
          ) : (
            <p className="text-[var(--hud-text-muted)]">暂无汇报</p>
          )}
        </section>

        {agent.blurb ? (
          <section>
            <h3 className="mb-1 text-[10px] tracking-wider text-[var(--hud-text-muted)] uppercase">
              简介
            </h3>
            <p className="text-[var(--hud-text-muted)]">{agent.blurb}</p>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1 text-[10px] tracking-wider text-[var(--hud-text-muted)] uppercase">
            Owns
          </h3>
          {agent.owns.length ? (
            <ul className="list-disc space-y-1 pl-4 text-[var(--hud-text-muted)]">
              {agent.owns.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--hud-text-muted)]">（无）</p>
          )}
        </section>

        {agent.not ? (
          <section>
            <h3 className="mb-1 text-[10px] tracking-wider text-[var(--hud-text-muted)] uppercase">
              Not
            </h3>
            <p className="text-[var(--hud-text-muted)]">{agent.not}</p>
          </section>
        ) : null}

        {agent.siblings.length ? (
          <section>
            <h3 className="mb-1 text-[10px] tracking-wider text-[var(--hud-text-muted)] uppercase">
              Siblings
            </h3>
            <ul className="space-y-2">
              {agent.siblings.map((s) => (
                <li
                  key={`${s.project}-${s.relation}-${s.capability}`}
                  className="hud-panel hud-panel--raised px-2 py-1.5"
                >
                  <div className="text-[var(--hud-text)]">{s.project}</div>
                  <div className="text-[var(--hud-text-muted)]">
                    {s.relation}
                    {s.capability ? ` · ${s.capability}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1 text-[10px] tracking-wider text-[var(--hud-text-muted)] uppercase">
            Id
          </h3>
          <code className="text-[11px] text-[var(--hud-text-muted)]">{agent.id}</code>
        </section>
      </div>
    </aside>
  )
}
