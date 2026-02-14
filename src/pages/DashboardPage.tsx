import PageShell from './PageShell'

function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      subtitle="Zentrale Übersicht für Kennzahlen, offene Aufgaben und Schichtstatus."
      cards={['Anlagenstatus', 'Auftragslage', 'Tagesziele']}
    />
  )
}

export default DashboardPage
