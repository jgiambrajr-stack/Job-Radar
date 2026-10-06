import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import { ArrowUpDown, LayoutGrid, Rows3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FitScore, JobTags, JobTitle, OpenPostingButton, locationLabel } from '@/components/job-bits'
import { PIPELINE, STATUS_LABEL, STATUSES, type Job, type Status, daysSince, timeAgo } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = {
  jobs: Job[]
  allJobs: Job[]
  onMove: (job: Job, status: Status) => unknown
  onReorder: (ids: string[]) => void
  onOpen: (job: Job) => void
}

export function Pipeline(props: Props) {
  const [view, setView] = useState<'board' | 'table'>(() => (localStorage.getItem('pipelineView') as 'board' | 'table') ?? 'board')
  const setViewPersist = (v: 'board' | 'table') => {
    setView(v)
    try {
      localStorage.setItem('pipelineView', v)
    } catch {
      // storage unavailable: view just won't persist
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="bg-muted inline-flex rounded-lg p-0.5">
          <Button size="sm" variant={view === 'board' ? 'outline' : 'ghost'} onClick={() => setViewPersist('board')}>
            <LayoutGrid /> Board
          </Button>
          <Button size="sm" variant={view === 'table' ? 'outline' : 'ghost'} onClick={() => setViewPersist('table')}>
            <Rows3 /> Table
          </Button>
        </div>
      </div>
      {view === 'board' ? <Board {...props} /> : <PipelineTable {...props} />}
    </div>
  )
}

// Where a dragged card would land: in this column, just above beforeId (null = end of the column).
type DropSpot = { status: Status; beforeId: string | null }

const CARD = 'card:'

// Placed cards follow your order; cards not placed yet (just arrived) sit on top, best fit first.
const byBoardOrder = (a: Job, b: Job) =>
  a.board_order == null && b.board_order == null
    ? (b.fit_score ?? 0) - (a.fit_score ?? 0)
    : a.board_order == null
      ? -1
      : b.board_order == null
        ? 1
        : a.board_order - b.board_order

// Pick the column under the pointer, then the nearest card in it (or the column itself when it's empty).
const collision: CollisionDetection = (args) => {
  const columns = args.droppableContainers.filter((c) => !String(c.id).startsWith(CARD))
  const [column] = pointerWithin({ ...args, droppableContainers: columns }).concat(rectIntersection({ ...args, droppableContainers: columns }))
  if (!column) return []
  const cards = args.droppableContainers.filter((c) => c.data.current?.status === column.id)
  return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [column]
}

function Board({ jobs, allJobs, onMove, onReorder, onOpen }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [spot, setSpot] = useState<DropSpot | null>(null)
  const [referralOnly, setReferralOnly] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const active = jobs.find((j) => j.id === activeId)
  const headRef = useRef<HTMLDivElement>(null)

  const columns = PIPELINE.map((status) => {
    let col = jobs.filter((j) => j.status === status)
    const total = col.length
    if (status === 'interested' && referralOnly) col = col.filter((j) => j.looking_for_referral)
    col.sort(byBoardOrder)
    return { status, col, total }
  })
  const colOf = (status: Status) => columns.find((c) => c.status === status)!.col

  // Dropping right above or below the card in its own column changes nothing, so no line.
  const isNoop = (s: DropSpot, job: Job) => {
    if (s.status !== job.status) return false
    const col = colOf(s.status)
    const next = col[col.findIndex((j) => j.id === job.id) + 1]?.id ?? null
    return s.beforeId === job.id || s.beforeId === next
  }
  const shownSpot = spot && active && !isNoop(spot, active) ? spot : null

  const track = (e: DragMoveEvent) => {
    const over = e.over
    let next: DropSpot | null = null
    if (over && String(over.id).startsWith(CARD)) {
      const status = over.data.current!.status as Status
      const col = colOf(status)
      const overId = String(over.id).slice(CARD.length)
      const r = e.active.rect.current.translated
      const below = !!r && r.top + r.height / 2 > over.rect.top + over.rect.height / 2
      next = { status, beforeId: below ? (col[col.findIndex((j) => j.id === overId) + 1]?.id ?? null) : overId }
    } else if (over) {
      next = { status: over.id as Status, beforeId: null }
    }
    setSpot((prev) => (prev?.status === next?.status && prev?.beforeId === next?.beforeId ? prev : next))
  }

  const reset = () => {
    setActiveId(null)
    setSpot(null)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const s = spot
    reset()
    const job = jobs.find((j) => j.id === e.active.id)
    if (!job || !s || isNoop(s, job)) return
    // Order the whole column, including cards hidden by filters, so they keep their places.
    const full = allJobs.filter((j) => j.status === s.status && j.id !== job.id).sort(byBoardOrder)
    let at = s.beforeId ? full.findIndex((j) => j.id === s.beforeId) : -1
    if (at < 0) {
      const last = colOf(s.status).filter((j) => j.id !== job.id).at(-1)
      at = last ? full.findIndex((j) => j.id === last.id) + 1 : full.length
    }
    full.splice(at, 0, job)
    // The move clears the saved position on the server, so the order goes after it.
    if (job.status !== s.status) await onMove(job, s.status)
    onReorder(full.map((j) => j.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragMove={track}
      onDragOver={track}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      {/* The page scrolls normally. Column headers are a separate row that sticks to the top of the window;
          the board scrolls sideways and the header row follows it. */}
      {/* One wrapper, so the parent's flex gap doesn't split the header row from the columns. */}
      <div>
        <div className="sticky top-0 z-20 -mx-1 bg-[var(--background)] px-1 pt-2">
          <div ref={headRef} className="overflow-hidden">
            <div className={cn(GRID, 'pr-px')}>
              {columns.map(({ status, col, total }) => (
                <div key={status} className={cn('flex items-center justify-between rounded-t-xl border border-b-0 px-3 pt-3 pb-2 transition-colors', spot?.status === status ? COLUMN_BG_OVER : COLUMN_BG, spot?.status === status && 'border-primary')}>
                  <h3 className="text-sm font-medium">{STATUS_LABEL[status]}</h3>
                  <span className="text-muted-foreground text-xs tabular-nums">{status === 'interested' && referralOnly ? `${col.length} of ${total}` : total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div
          className="overflow-x-auto pb-2"
          onScroll={(e) => {
            if (headRef.current) headRef.current.scrollLeft = e.currentTarget.scrollLeft
          }}
        >
          <div className={GRID}>
            {columns.map(({ status, col }) => {
              const here = shownSpot?.status === status ? shownSpot : null
              return (
                <ColumnBody key={status} status={status} over={spot?.status === status}>
                  {status === 'interested' && (
                    <button
                      onClick={() => setReferralOnly((v) => !v)}
                      className={cn(
                        'mb-1 self-start rounded-md border px-2 py-0.5 text-xs transition-colors',
                        referralOnly ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Looking for referral only
                    </button>
                  )}
                  {col.map((job, i) => (
                    <Card
                      key={job.id}
                      job={job}
                      status={status}
                      onOpen={onOpen}
                      dragging={job.id === activeId}
                      line={here?.beforeId === job.id ? 'before' : here && here.beforeId === null && i === col.length - 1 ? 'after' : null}
                    />
                  ))}
                  {!col.length && (
                    <div className="relative">
                      {here && <DropLine className="top-0" />}
                      <p className="text-muted-foreground py-6 text-center text-xs">Drag cards here</p>
                    </div>
                  )}
                </ColumnBody>
              )
            })}
          </div>
        </div>
      </div>
      <DragOverlay>{active && <CardBody job={active} className="rotate-1 shadow-lg" />}</DragOverlay>
    </DndContext>
  )
}

const GRID = 'grid grid-cols-[repeat(5,minmax(400px,1fr))] gap-3'
// Opaque column tint, so the sticky header hides cards scrolling underneath it.
const COLUMN_BG = 'bg-[color-mix(in_oklab,var(--muted)_45%,var(--background))]'
const COLUMN_BG_OVER = 'bg-[color-mix(in_oklab,var(--muted)_85%,var(--background))]'

function ColumnBody({ status, over, children }: { status: Status; over: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className={cn('flex min-h-[60svh] flex-col gap-2 rounded-b-xl border border-t-0 px-2 pb-2 transition-colors', over ? COLUMN_BG_OVER : COLUMN_BG, over && 'border-primary')}>
      {children}
    </div>
  )
}

// Sits in the 8px gap between cards, so showing it doesn't shift anything.
function DropLine({ className }: { className?: string }) {
  return <div className={cn('bg-primary pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full', className)} />
}

function Card({ job, status, onOpen, dragging, line }: { job: Job; status: Status; onOpen: (j: Job) => void; dragging: boolean; line: 'before' | 'after' | null }) {
  const drag = useDraggable({ id: job.id })
  const drop = useDroppable({ id: CARD + job.id, data: { status } })
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={() => onOpen(job)}
      className="relative touch-none"
    >
      {line === 'before' && <DropLine className="-top-[5px]" />}
      <CardBody job={job} className={cn(dragging && 'opacity-30')} />
      {line === 'after' && <DropLine className="-bottom-[5px]" />}
    </div>
  )
}

function CardBody({ job, className }: { job: Job; className?: string }) {
  const days = daysSince(job.status_changed_at)
  return (
    <div className={cn('bg-card flex cursor-grab flex-col gap-2 rounded-lg border p-3 text-sm active:cursor-grabbing', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <JobTitle job={job} className="line-clamp-2" />
          <p className="text-muted-foreground truncate text-xs">{job.company} · {locationLabel(job)}</p>
        </div>
        <OpenPostingButton job={job} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <FitScore score={job.fit_score} source={job.score_source} />
        <span className="text-muted-foreground text-xs">{days === 0 ? 'moved today' : `${days}d in stage`}</span>
        <JobTags job={job} />
      </div>
    </div>
  )
}

type SortKey = 'fit_score' | 'title' | 'company' | 'status' | 'status_changed_at' | 'first_seen'

function PipelineTable({ jobs, onMove, onOpen }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'fit_score', dir: -1 })
  const rows = useMemo(() => {
    const order = (j: Job) => (sort.key === 'status' ? STATUSES.indexOf(j.status) : (j[sort.key] ?? ''))
    return jobs
      .filter((j) => PIPELINE.includes(j.status))
      .sort((a, b) => {
        const x = order(a)
        const y = order(b)
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
      })
  }, [jobs, sort])

  const Head = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button className="hover:text-foreground inline-flex items-center gap-1" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : -1 }))}>
        {children}
        <ArrowUpDown className={cn('size-3', sort.key === k ? 'opacity-100' : 'opacity-30')} />
      </button>
    </TableHead>
  )

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <Head k="fit_score" className="w-14">Fit</Head>
            <Head k="title">Role</Head>
            <Head k="company">Company</Head>
            <Head k="status" className="w-40">Status</Head>
            <Head k="status_changed_at">In stage</Head>
            <Head k="first_seen">Found</Head>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((job) => (
            <TableRow key={job.id} className="cursor-pointer" onClick={() => onOpen(job)}>
              <TableCell><FitScore score={job.fit_score} source={job.score_source} /></TableCell>
              <TableCell className="max-w-80">
                <div className="flex flex-wrap items-center gap-1.5">
                  <JobTitle job={job} className="truncate" />
                  {job.looking_for_referral && <JobTags job={{ ...job, tags: [] }} />}
                </div>
                <p className="text-muted-foreground truncate text-xs">{locationLabel(job)}</p>
              </TableCell>
              <TableCell>{job.company}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select value={job.status} onValueChange={(v) => onMove(job, v as Status)}>
                  <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.filter((s) => s !== 'new').map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{daysSince(job.status_changed_at)}d</TableCell>
              <TableCell className="text-muted-foreground text-sm">{timeAgo(job.first_seen)}</TableCell>
              <TableCell><OpenPostingButton job={job} /></TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">Nothing in the pipeline yet. Mark roles Interested from the Inbox.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
