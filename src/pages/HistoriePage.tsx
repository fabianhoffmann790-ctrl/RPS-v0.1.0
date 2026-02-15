import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'

const WORK_START_HOUR = 6
const WORK_END_HOUR = 22
const MINUTES_IN_HOUR = 60
const ZOOM_LEVELS = [15, 30, 60] as const

type ZoomLevel = (typeof ZOOM_LEVELS)[number]

interface TimelineBlock {
  id: string
  orderNo: string
  title: string
  lineName: string
  start: Date
  end: Date
}

const isValidDate = (value: Date): boolean => Number.isFinite(value.getTime())

const parseDateValue = (value?: string): Date | null => {
  if (!value) return null

  const localMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (localMatch) {
    const [, year, month, day, hour, minute] = localMatch
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
      0,
    )
    return isValidDate(date) ? date : null
  }

  const parsed = new Date(value)
  return isValidDate(parsed) ? parsed : null
}

const toLocalDisplay = (value?: string): string => {
  const date = parseDateValue(value)
  return date ? date.toLocaleString() : 'Zeit unbekannt'
}

const pxPerMinuteByZoom: Record<ZoomLevel, number> = {
  15: 3,
  30: 2,
  60: 1,
}

function HistoriePage() {
  const { state } = useAppStore()
  const [zoom, setZoom] = useState<ZoomLevel>(30)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)

  const timelineData = useMemo(() => {
    const parseWarnings: string[] = []
    const blocks: TimelineBlock[] = []

    for (const order of state.orders) {
      const start = parseDateValue(order.fillStart)
      const end = parseDateValue(order.fillEnd)

      if (!start || !end) {
        if (order.fillStart || order.fillEnd) {
          parseWarnings.push(`Auftrag ${order.orderNo}: FillStart/FillEnd ungültig oder unvollständig.`)
        }
        continue
      }

      if (end.getTime() <= start.getTime()) {
        parseWarnings.push(`Auftrag ${order.orderNo}: FillEnd liegt nicht nach FillStart.`)
        continue
      }

      blocks.push({
        id: order.id,
        orderNo: order.orderNo,
        title: order.title,
        lineName: order.lineName,
        start,
        end,
      })
    }

    blocks.sort((a, b) => a.start.getTime() - b.start.getTime())

    const anchor = blocks[0]?.start ?? new Date()
    const workStart = new Date(anchor)
    workStart.setHours(WORK_START_HOUR, 0, 0, 0)

    const workEnd = new Date(anchor)
    workEnd.setHours(WORK_END_HOUR, 0, 0, 0)

    if (workEnd.getTime() <= workStart.getTime()) {
      workEnd.setDate(workEnd.getDate() + 1)
    }

    return {
      blocks,
      parseWarnings,
      workStart,
      workEnd,
    }
  }, [state.orders])

  const totalMinutes = Math.max(
    (timelineData.workEnd.getTime() - timelineData.workStart.getTime()) / 60_000,
    (WORK_END_HOUR - WORK_START_HOUR) * MINUTES_IN_HOUR,
  )
  const pxPerMinute = pxPerMinuteByZoom[zoom]
  const timelineWidth = totalMinutes * pxPerMinute

  const minuteOffset = (date: Date) => (date.getTime() - timelineData.workStart.getTime()) / 60_000

  const nowIndicator = useMemo(() => {
    const now = new Date()
    const offset = (now.getTime() - timelineData.workStart.getTime()) / 60_000
    return {
      visible: offset >= 0 && offset <= totalMinutes,
      leftPx: Math.min(Math.max(offset * pxPerMinute, 0), timelineWidth),
    }
  }, [totalMinutes, pxPerMinute, timelineWidth, timelineData.workStart])

  const jumpToNow = () => {
    if (!timelineScrollRef.current || !nowIndicator.visible) return
    const viewportWidth = timelineScrollRef.current.clientWidth
    const target = Math.max(nowIndicator.leftPx - viewportWidth / 2, 0)
    timelineScrollRef.current.scrollTo({ left: target, behavior: 'smooth' })
  }

  useEffect(() => {
    jumpToNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const gridLines = Array.from({ length: Math.floor(totalMinutes / zoom) + 1 }, (_, index) => {
    const minutes = index * zoom
    const left = minutes * pxPerMinute
    const labelDate = new Date(timelineData.workStart.getTime() + minutes * 60_000)
    const label = isValidDate(labelDate)
      ? labelDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '--:--'

    return { left, label }
  })

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
              <div className="text-xs text-slate-400">{toLocalDisplay(event.timestamp)}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-cyan-300">Timeline (06:00–22:00)</h2>
          <div className="flex items-center gap-3">
            <label htmlFor="timeline-zoom" className="text-sm text-slate-300">
              Zoom
            </label>
            <select
              id="timeline-zoom"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value) as ZoomLevel)}
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm"
            >
              {ZOOM_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level} min
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={jumpToNow}
              className="rounded bg-cyan-500 px-3 py-1 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
            >
              Jump to now
            </button>
          </div>
        </div>

        {timelineData.parseWarnings.length > 0 ? (
          <div className="mb-3 rounded border border-amber-500/60 bg-amber-950/60 p-3 text-sm text-amber-100">
            <p className="font-semibold">Warnung: Ungültige Zeitdaten erkannt.</p>
            <ul className="mt-1 list-disc pl-5">
              {timelineData.parseWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div ref={timelineScrollRef} className="overflow-x-auto rounded border border-slate-700 bg-slate-900 p-2">
          <div className="relative h-48" style={{ width: `${timelineWidth}px`, minWidth: '100%' }}>
            {gridLines.map((line) => (
              <div key={`${line.left}-${line.label}`} className="absolute inset-y-0" style={{ left: `${line.left}px` }}>
                <div className="h-full border-l border-slate-700/80" />
                <div className="absolute -top-1 -translate-x-1/2 text-[10px] text-slate-400">{line.label}</div>
              </div>
            ))}

            {nowIndicator.visible ? (
              <div className="absolute inset-y-0 z-20 border-l-2 border-red-400" style={{ left: `${nowIndicator.leftPx}px` }}>
                <span className="absolute -top-5 -translate-x-1/2 rounded bg-red-500 px-1 text-[10px] font-semibold text-slate-950">
                  Jetzt
                </span>
              </div>
            ) : null}

            {timelineData.blocks.length ? (
              timelineData.blocks.map((block, index) => {
                const startOffset = minuteOffset(block.start)
                const endOffset = minuteOffset(block.end)
                const leftPx = Math.max(startOffset * pxPerMinute, 0)
                const widthPx = Math.max((endOffset - startOffset) * pxPerMinute, 4)
                const lane = index % 4

                return (
                  <div
                    key={block.id}
                    className="absolute z-10 rounded border border-cyan-300/50 bg-cyan-500/20 px-2 py-1 text-xs"
                    style={{
                      left: `${leftPx}px`,
                      top: `${28 + lane * 34}px`,
                      width: `${widthPx}px`,
                    }}
                    title={`${block.orderNo} · ${block.lineName}`}
                  >
                    <div className="truncate font-semibold text-cyan-200">{block.orderNo}</div>
                    <div className="truncate text-slate-200">{block.title}</div>
                  </div>
                )
              })
            ) : (
              <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">
                Keine darstellbaren FillStart/FillEnd-Daten vorhanden.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default HistoriePage
