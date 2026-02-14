import { useAppStore } from '../store/appStore'

function HistoriePage() {
  const { state } = useAppStore()

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Historie</h1>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <ul className="space-y-2">
          {[...state.history].reverse().map((event) => (
            <li key={event.id} className="rounded border border-slate-700 bg-slate-900/70 p-3 text-sm">
              <span className="font-bold text-cyan-300">{event.type}</span> · {event.message}
              <div className="text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default HistoriePage
