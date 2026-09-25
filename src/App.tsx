import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChartColumn, Loader2, RefreshCw, Search, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dismissed } from '@/components/dismissed'
import { Inbox, type TriageAction } from '@/components/inbox'
import { Insights, useInsights } from '@/components/insights'
import { JobSheet } from '@/components/job-sheet'
import { Pipeline } from '@/components/pipeline'
import { SettingsSheet } from '@/components/settings'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useJobs } from '@/hooks/use-jobs'
import { api, PIPELINE, STATUS_LABEL, type Job, type JobPatch, type Status, type SweepState, timeAgo } from '@/lib/api'

type Filters = { q: string; company: string; where: 'all' | 'remote' | 'home'; minFit: string }
// Same rule as inHomeArea in server/filter.ts: any configured term, as a whole word.
const inHome = (location: string | null, terms: string[] = []) =>
  terms.some((t) => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z])`, 'i').test(location ?? ''))

export default function App() {
  const { jobs, meta, loading, reload, update } = useJobs()
  const [tab, setTab] = useState('inbox')
  const [openId, setOpenId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filters, setFilters] = useState<Filters>({ q: '', company: 'all', where: 'all', minFit: '0' })
  const [drawer, setDrawer] = useState<null | 'insights' | 'settings'>(null)
  const [sweep, setSweep] = useState<SweepState>({ state: 'idle' })
  const insights = useInsights(jobs)
  const similarTerms = useMemo(() => insights?.leanToward.map((t) => t.term) ?? [], [insights])

  // Keeps the auto-stopping server alive while a tab is open.
  useEffect(() => {
    api.ping()
    const t = setInterval(api.ping, 30_000)
    return () => clearInterval(t)
  }, [])

  // LinkedIn sweep runs as a background Claude session; poll while it's going.
  useEffect(() => {
    api.sweepStatus().then(setSweep, () => {})
  }, [])
  useEffect(() => {
    if (sweep.state !== 'running') return
    const t = setInterval(async () => {
      const next = await api.sweepStatus()
      if (next.state !== 'running') {
        if (next.state === 'done') toast.success('Refresh finished', { description: next.summary })
        else toast.error('Refresh did not finish', { description: next.summary })
        reload()
      }
      setSweep(next)
    }, 5000)
    return () => clearInterval(t)
  }, [sweep.state, reload])

  const filtered = useMemo(() => {
    const q = filters.q.toLowerCase()
    return jobs.filter(
      (j) =>
        (!q || `${j.title} ${j.company} ${j.location} ${j.notes ?? ''}`.toLowerCase().includes(q)) &&
        (filters.company === 'all' || j.company === filters.company) &&
        (filters.where === 'all' ||
          (filters.where === 'remote' ? j.remote || /remote/i.test(j.location ?? '') : inHome(j.location, meta?.homeArea.terms))) &&
        (j.fit_score ?? 0) >= Number(filters.minFit),
    )
  }, [jobs, filters, meta])

  const inbox = useMemo(
    () => filtered.filter((j) => j.status === 'new').sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1) || b.first_seen.localeCompare(a.first_seen)),
    [filtered],
  )
  const pipeline = useMemo(() => filtered.filter((j) => PIPELINE.includes(j.status)), [filtered])
  const dismissed = useMemo(() => jobs.filter((j) => j.status === 'dismissed'), [jobs])
  const companies = useMemo(() => [...new Set(jobs.map((j) => j.company))].sort(), [jobs])

  const change = useCallback(
    async (job: Job, patch: JobPatch, message: string) => {
      const before = await update(job.id, patch)
      if (!before) return
      const undo: JobPatch = {}
      for (const k of Object.keys(patch) as (keyof JobPatch)[]) (undo as Record<string, unknown>)[k] = before[k]
      toast(message, { description: `${job.title} at ${job.company}`, action: { label: 'Undo', onClick: () => update(job.id, undo) } })
    },
    [update],
  )

  const onTriage = useCallback(
    (job: Job, a: TriageAction) => {
      if (a === 'interested') change(job, { status: 'interested' }, 'Moved to Interested')
      if (a === 'referral') change(job, { status: 'interested', looking_for_referral: true }, 'Interested, looking for referral')
      if (a === 'applied') change(job, { status: 'applied' }, 'Marked Applied')
      if (a === 'dismiss') change(job, { status: 'dismissed' }, 'Dismissed')
    },
    [change],
  )
  const onMove = useCallback((job: Job, status: Status) => change(job, { status }, `Moved to ${STATUS_LABEL[status]}`), [change])
  const onOpen = useCallback((job: Job) => setOpenId(job.id), [])

  // One button: company feeds first (seconds), then the LinkedIn sweep in the background (minutes).
  const refresh = async () => {
    setRefreshing(true)
    try {
      api.startSweep().then(setSweep, () => toast.error('Could not start the Claude part of the refresh'))
      const results = await api.refresh()
      const added = results.reduce((n, r) => n + r.new, 0)
      const failed = results.filter((r) => r.error).map((r) => r.company)
      toast.success(added ? `${added} new role${added === 1 ? '' : 's'} from job feeds` : 'Job feeds checked. Nothing new.', {
        description: [failed.length ? `Could not reach: ${failed.join(', ')}.` : '', 'Claude is now checking LinkedIn and the sites without feeds, then scoring. That takes a few minutes.'].join(' ').trim(),
      })
      await reload()
    } finally {
      setRefreshing(false)
    }
  }

  const showFilters = tab === 'inbox' || tab === 'pipeline'
  const openJob = jobs.find((j) => j.id === openId) ?? null
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div className="mx-auto flex min-h-svh max-w-[1600px] flex-col gap-5 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job Radar</h1>
          <p className="text-muted-foreground text-sm">
            {meta?.lastRun ? `Last checked ${timeAgo(meta.lastRun)}` : "Not checked yet"}
            {!!meta?.errors.length && <span className="text-destructive"> · {meta.errors.map((e) => e.company).join(', ')} failed</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing || sweep.state === 'running'}
            title={sweep.finishedAt && sweep.state !== 'running' ? `Last full refresh ${timeAgo(sweep.finishedAt)}: ${sweep.summary ?? ''}` : undefined}
          >
            {refreshing || sweep.state === 'running' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {refreshing ? 'Checking feeds' : sweep.state === 'running' ? `Claude checking (${timeAgo(sweep.startedAt ?? null).replace(' ago', '') || 'just started'})` : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDrawer('insights')}>
            <ChartColumn /> Insights
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Settings" onClick={() => setDrawer('settings')}>
            <Settings />
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TabsList>
              <TabsTrigger value="inbox">Inbox <Count n={inbox.length} /></TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline <Count n={pipeline.length} /></TabsTrigger>
              <TabsTrigger value="dismissed">Dismissed <Count n={dismissed.length} /></TabsTrigger>
            </TabsList>
            {showFilters && (
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input placeholder="Search" aria-label="Search jobs" value={filters.q} onChange={(e) => set('q', e.target.value)} className="h-8 w-52 pl-8" />
              </div>
            )}
          </div>
          {showFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filters.company} onValueChange={(v) => set('company', v)}>
                <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.where} onValueChange={(v) => set('where', v as Filters['where'])}>
                <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Anywhere</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="home">{meta?.homeArea.label ?? "Home area"}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.minFit} onValueChange={(v) => set('minFit', v)}>
                <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any fit</SelectItem>
                  <SelectItem value="60">Fit 60+</SelectItem>
                  <SelectItem value="80">Fit 80+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-muted-foreground py-20 text-center text-sm">Loading</p>
        ) : (
          <>
            <TabsContent value="inbox"><Inbox jobs={inbox} onAction={onTriage} onOpen={onOpen} similarTerms={similarTerms} /></TabsContent>
            <TabsContent value="pipeline"><Pipeline jobs={pipeline} onMove={onMove} onOpen={onOpen} /></TabsContent>
            <TabsContent value="dismissed">
              <Dismissed jobs={dismissed} onOpen={onOpen} onRestore={(j) => change(j, { status: 'new' }, 'Restored to Inbox')} />
            </TabsContent>
          </>
        )}
      </Tabs>

      <Sheet open={drawer === 'insights'} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:sm:max-w-none">
          <SheetHeader>
            <SheetTitle>Insights</SheetTitle>
            <SheetDescription>Patterns in what you keep, apply to, and pass on. Nothing here hides jobs.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <Insights
              data={insights}
              onOpen={(id) => {
                setDrawer(null)
                setOpenId(id)
              }}
              onTerm={(term) => {
                setDrawer(null)
                setFilters((f) => ({ ...f, q: term }))
                setTab('inbox')
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
      <SettingsSheet open={drawer === 'settings'} onOpenChange={(o) => !o && setDrawer(null)} onChanged={reload} />

      <JobSheet job={openJob} onClose={() => setOpenId(null)} onUpdate={(id, patch) => update(id, patch)} />
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="text-muted-foreground ml-1 text-xs tabular-nums">{n}</span>
}
