import type { AgentPersona } from '../catalog/types'

interface Props {
  agent: AgentPersona | null
  onClose: () => void
}

export function AgentCard({ agent, onClose }: Props) {
  if (!agent) return null

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
