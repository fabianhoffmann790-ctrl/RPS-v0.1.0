import PageShell from './PageShell'

function StammdatenPage() {
  return (
    <PageShell
      title="Stammdaten"
      subtitle="Verwaltung von Maschinen, Materialien und Verantwortlichkeiten."
      cards={['Maschinen', 'Materialgruppen', 'Benutzerrollen']}
    />
  )
}

export default StammdatenPage
