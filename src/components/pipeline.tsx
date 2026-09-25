import { useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ArrowUpDown, LayoutGrid, Rows3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FitScore, JobTags, JobTitleLink, OpenPostingButton, locationLabel } from '@/components/job-bits'
import { PIPELINE, STATUS_LABEL, STATUSES, type Job, type Status, daysSince, timeAgo } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = { jobs: Job[]; onMove: (job: Job, status: Status) => void; onOpen: (job: Job) => void }

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

function Board({ jobs, onMove, onOpen }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<Status | null>(null)
  const [referralOnly, setReferralOnly] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const active = jobs.find((j) => j.id === activeId)
  const headRef = useRef<HTMLDivElement>(null)

  const columns = PIPELINE.map((status) => {
    let col = jobs.filter((j) => j.status === status)
    const total = col.length
    if (status === 'interested' && referralOnly) col = col.filter((j) => j.looking_for_referral)
    col.sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    return { status, col, total }
  })

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    setOverId(null)
    const job = jobs.find((j) => j.id === e.active.id)
    const to = e.over?.id as Status | undefined
    if (job && to && to !== job.status) onMove(job, to)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragOver={(e) => setOverId((e.over?.id as Status) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOverId(null)
      }}
    >
      {/* The page scrolls normally. Column headers are a separate row that sticks to the top of the window;
          the board scrolls sideways and the header row follows it. */}
      {/* One wrapper, so the parent's flex gap doesn't split the header row from the columns. */}
      <div>
        <div className="sticky top-0 z-20 -mx-1 bg-[var(--background)] px-1 pt-2">
          <div ref={headRef} className="overflow-hidden">
            <div className={cn(GRID, 'pr-px')}>
              {columns.map(({ status, col, total }) => (
                <div key={status} className={cn('flex items-center justify-between rounded-t-xl border border-b-0 px-3 pt-3 pb-2 transition-colors', overId === status ? COLUMN_BG_OVER : COLUMN_BG, overId === status && 'border-primary')}>
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
            {columns.map(({ status, col }) => (
              <ColumnBody key={status} status={status} over={overId === status}>
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
                {col.map((job) => (
                  <Card key={job.id} job={job} onOpen={onOpen} dragging={job.id === activeId} />
                ))}
                {!col.length && <p className="text-muted-foreground py-6 text-center text-xs">Drag cards here</p>}
              </ColumnBody>
            ))}
          </div>
        </div>
      </div>
      <DragOverlay>{active && <CardBody job={active} className="rotate-1 shadow-lg" />}</DragOverlay>
    </DndContext>
  )
}

const GRID = 'grid grid-cols-[repeat(4,minmax(400px,1fr))] gap-3'
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

function Card({ job, onOpen, dragging }: { job: Job; onOpen: (j: Job) => void; dragging: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: job.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(job)} className={cn('touch-none', dragging && 'opacity-30')}>
      <CardBody job={job} />
    </div>
  )
}

function CardBody({ job, className }: { job: Job; className?: string }) {
  const days = daysSince(job.status_changed_at)
  return (
    <div className={cn('bg-card flex cursor-grab flex-col gap-2 rounded-lg border p-3 text-sm active:cursor-grabbing', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <JobTitleLink job={job} className="line-clamp-2" />
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
                  <JobTitleLink job={job} className="truncate" />
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
