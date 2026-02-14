import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAppStore } from '../store/appStore'

function DashboardPage() {
  const { state, createOrder, assignOrder, moveOrder, reportIst, unassignOrder } = useAppStore()
  const [orderNo, setOrderNo] = useState('')
  const [title, setTitle] = useState('')

  const onCreateOrder = (event: FormEvent) => {
    event.preventDefault()
    const result = createOrder({ orderNo, title })
    if (result.ok) {
      setOrderNo('')
      setTitle('')
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Dashboard · Aufträge</h1>
        <p className="mt-2 text-slate-300">Neuen Auftrag anlegen und einfache Statusaktionen ausführen.</p>
      </div>

      <form onSubmit={onCreateOrder} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800 p-5 md:grid-cols-4">
        <input
          className="rounded bg-slate-700 px-3 py-2"
          placeholder="Auftragsnummer"
          value={orderNo}
          onChange={(event) => setOrderNo(event.target.value)}
        />
        <input
          className="rounded bg-slate-700 px-3 py-2 md:col-span-2"
          placeholder="Titel"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className="rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-900">
          Auftrag erstellen
        </button>
      </form>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="mb-3 text-xl font-semibold">Auftragsliste ({state.orders.length})</h2>
        <div className="space-y-3">
          {state.orders.map((order) => {
            const assignment = state.assignments.find((item) => item.orderId === order.id)
            return (
              <article key={order.id} className="rounded border border-slate-700 bg-slate-900/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {order.orderNo} · {order.title}
                    </p>
                    <p className="text-sm text-slate-300">
                      Status: {order.status} · IST: {order.actualQuantity} · Maschine: {assignment?.machine ?? '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => moveOrder(order.id, 'planned')}
                      className="rounded bg-slate-700 px-2 py-1"
                    >
                      Move planned
                    </button>
                    <button
                      type="button"
                      onClick={() => assignOrder(order.id, state.masterdata.machines[0])}
                      className="rounded bg-slate-700 px-2 py-1"
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      onClick={() => unassignOrder(order.id)}
                      className="rounded bg-slate-700 px-2 py-1"
                    >
                      Unassign
                    </button>
                    <button
                      type="button"
                      onClick={() => reportIst(order.id, order.actualQuantity + 1)}
                      className="rounded bg-slate-700 px-2 py-1"
                    >
                      IST +1
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
          {state.orders.length === 0 ? <p className="text-sm text-slate-400">Noch keine Aufträge vorhanden.</p> : null}
        </div>
      </div>
    </section>
  )
}

export default DashboardPage
