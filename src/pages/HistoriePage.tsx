import PageShell from './PageShell'

function HistoriePage() {
  return (
    <PageShell
      title="Historie"
      subtitle="Rückblick auf Ereignisse, Produktionsmeldungen und Statuswechsel."
      cards={['Ereignisprotokoll', 'Störmeldungen', 'Schichtberichte']}
    />
  )
}

export default HistoriePage
