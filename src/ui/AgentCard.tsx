import type { AgentPersona } from '../catalog/types'

interface Props {
  agent: AgentPersona | null
  onClose: () => void
}

export function AgentCard({ agent, onClose }: Props) {
  if (!agent) return null

  return (
    <aside className="absolute top-14 right-3 bottom-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-md border border-stone-600 bg-stone-950/95 text-stone-100 shadow-xl backdrop-blur-sm">
      <header className="flex items-start justify-between gap-2 border-b border-stone-700 px-3 py-2">
        <div>
          <div className="text-xs tracking-wide text-stone-400 uppercase">Agent</div>
          <h2 className="text-sm leading-snug font-semibold text-stone-50">{agent.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
            <span
              className={`rounded px-1.5 py-0.5 ${
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
        <button
          type="button"
          className="rounded border border-stone-600 px-2 py-0.5 text-xs text-stone-300 hover:bg-stone-800"
          onClick={onClose}
        >
          关闭
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-xs leading-relaxed">
        {agent.blurb ? (
          <section>
            <h3 className="mb-1 text-[10px] tracking-wider text-stone-500 uppercase">简介</h3>
            <p className="text-stone-300">{agent.blurb}</p>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1 text-[10px] tracking-wider text-stone-500 uppercase">Owns</h3>
          {agent.owns.length ? (
            <ul className="list-disc space-y-1 pl-4 text-stone-300">
              {agent.owns.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className="text-stone-500">（无）</p>
          )}
        </section>

        {agent.not ? (
          <section>
            <h3 className="mb-1 text-[10px] tracking-wider text-stone-500 uppercase">Not</h3>
            <p className="text-stone-400">{agent.not}</p>
          </section>
        ) : null}

        {agent.siblings.length ? (
          <section>
            <h3 className="mb-1 text-[10px] tracking-wider text-stone-500 uppercase">Siblings</h3>
            <ul className="space-y-2">
              {agent.siblings.map((s) => (
                <li
                  key={`${s.project}-${s.relation}-${s.capability}`}
                  className="rounded border border-stone-800 bg-stone-900/60 px-2 py-1.5"
                >
                  <div className="font-medium text-stone-200">{s.project}</div>
                  <div className="text-stone-500">
                    {s.relation}
                    {s.capability ? ` · ${s.capability}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="mb-1 text-[10px] tracking-wider text-stone-500 uppercase">Id</h3>
          <code className="text-[11px] text-stone-400">{agent.id}</code>
        </section>
      </div>
    </aside>
  )
}
