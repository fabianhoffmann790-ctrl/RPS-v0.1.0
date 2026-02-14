import PageShell from './PageShell'

function ExportImportPage() {
  return (
    <PageShell
      title="Export-Import"
      subtitle="Schnittstelle für Datenaustausch, Sicherung und Wiederherstellung."
      cards={['CSV-Export', 'Datenimport', 'Backup-Läufe']}
    />
  )
}

export default ExportImportPage
