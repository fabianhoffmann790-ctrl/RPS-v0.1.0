type PageShellProps = {
  title: string
  subtitle: string
  cards: string[]
}

function PageShell({ title, subtitle, cards }: PageShellProps) {
  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-cyan-600/40 bg-slate-800 p-6 shadow-lg shadow-cyan-900/20">
        <h1 className="text-4xl font-black uppercase tracking-wide text-cyan-300 md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-lg text-slate-300">{subtitle}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card}
            className="rounded-2xl border border-slate-600 bg-slate-800 p-6 shadow-md shadow-slate-950"
          >
            <h2 className="text-2xl font-extrabold uppercase text-slate-100">{card}</h2>
            <p className="mt-3 text-slate-300">Platzhalter für Modulinhalt in Milestone 1.</p>
            <button
              type="button"
              className="mt-6 rounded-lg bg-cyan-400 px-5 py-3 text-base font-bold uppercase tracking-wide text-slate-900 hover:bg-cyan-300"
            >
              Öffnen
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default PageShell
