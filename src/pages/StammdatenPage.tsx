import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAppStore } from '../store/appStore'

function StammdatenPage() {
  const { state, addMachine } = useAppStore()
  const [machine, setMachine] = useState('')

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const result = addMachine(machine)
    if (result.ok) setMachine('')
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Stammdaten</h1>
      </div>

      <form onSubmit={onSubmit} className="flex gap-3 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <input
          className="flex-1 rounded bg-slate-700 px-3 py-2"
          placeholder="Neue Maschine"
          value={machine}
          onChange={(event) => setMachine(event.target.value)}
        />
        <button type="submit" className="rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-900">
          Maschine hinzufügen
        </button>
      </form>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <p className="mb-2 font-semibold">Maschinen</p>
        <ul className="list-inside list-disc text-slate-300">
          {state.masterdata.machines.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default StammdatenPage
