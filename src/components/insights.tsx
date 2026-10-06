import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { OpenPostingButton } from '@/components/job-bits'
import { api, STATUS_LABEL, type Insights as InsightsData, type Job, type TermStat } from '@/lib/api'
import { cn } from '@/lib/utils'

const MIN_TRIAGED = 10

const weeklyConfig = {
  found: { label: 'Found', color: 'var(--chart-1)' },
  dismissed: { label: 'Dismissed', color: 'var(--chart-2)' },
  applied: { label: 'Applied', color: 'var(--chart-3)' },
} satisfies ChartConfig

const fitConfig = {
  picked: { label: 'Kept (interested or further)', color: 'var(--chart-1)' },
  dismissed: { label: 'Dismissed', color: 'var(--chart-2)' },
} satisfies ChartConfig

type Props = { data: InsightsData | null; onTerm: (term: string) => void; onOpen: (id: string) => void }

/** Refetches insights whenever any job's status changes, so the page always matches the board. */
export function useInsights(jobs: Job[]) {
  const [data, setData] = useState<InsightsData | null>(null)
  const version = useMemo(() => jobs.map((j) => j.status + (j.looking_for_referral ? 'r' : '')).join(), [jobs])
  useEffect(() => {
    if (jobs.length) api.insights().then(setData, () => {})
  }, [version]) // eslint-disable-line react-hooks/exhaustive-deps
  return data
}

export function Insights({ data, onTerm, onOpen }: Props) {
  if (!data) return <p className="text-muted-foreground py-20 text-center text-sm">Loading</p>

  const enough = data.triagedCount >= MIN_TRIAGED
  const { stats } = data

  return (
    <div className="@container flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <Stat label="Applied this week" value={stats.appliedThisWeek} />
        <Stat label="Applied total" value={stats.totalApplied} />
        <Stat label="Interview rate" value={stats.totalApplied ? `${stats.interviewRate}%` : '--'} hint="Interviewing ÷ applied" />
        <Stat label="Waiting in Inbox" value={stats.inboxWaiting} />
      </div>

      {data.followUps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Follow up</CardTitle>
            <CardDescription>Applied 14+ days or interviewing 10+ days with no change. Worth a nudge or a status update.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {data.followUps.map((f) => (
              <div key={f.id} onClick={() => onOpen(f.id)} className="hover:bg-muted/40 -mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{f.title}</span>
                  <p className="text-muted-foreground text-xs">
                    {f.company} · {STATUS_LABEL[f.status]} for {f.days} days
                  </p>
                </div>
                <OpenPostingButton job={{ url: f.url } as Job} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>
              Every role found, and how far each one got.{data.declined ? ` ${data.declined} declined along the way.` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel steps={data.funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly activity</CardTitle>
            <CardDescription>
              Last 12 weeks.
              {data.medianHoursToTriage != null && ` You usually triage a new role within ${formatHours(data.medianHoursToTriage)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={weeklyConfig} className="aspect-auto h-56 w-full">
              <BarChart data={data.weeks} barGap={2} barCategoryGap="20%">
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent labelFormatter={(l) => `Week of ${l}`} />} />
                <ChartLegend content={<ChartLegendContent />} />
                {(['found', 'dismissed', 'applied'] as const).map((k) => (
                  <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={[4, 4, 0, 0]} maxBarSize={14} />
                ))}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {!enough ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Triage {MIN_TRIAGED - data.triagedCount} more role{MIN_TRIAGED - data.triagedCount === 1 ? '' : 's'} to see patterns in what you keep and what you pass on.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 @2xl:grid-cols-2">
            <TermCard
              title="You lean toward"
              description="Words in titles you usually mark Interested or further. Click one to find more in the Inbox."
              terms={data.leanToward}
              metric={(t) => t.positiveRate}
              onTerm={onTerm}
            />
            <TermCard
              title="You usually pass on"
              description="Words in titles you mostly dismiss. These still show up; this is just the pattern."
              terms={data.passOn}
              metric={(t) => t.dismissRate}
              onTerm={onTerm}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Does the fit score match your picks?</CardTitle>
              <CardDescription>{fitSentence(data.fit)}</CardDescription>
            </CardHeader>
            {data.fit.pickedCount + data.fit.dismissedCount > 0 && (
              <CardContent>
                <ChartContainer config={fitConfig} className="aspect-auto h-48 w-full">
                  <BarChart data={data.fit.histogram} barGap={2}>
                    <CartesianGrid vertical={false} strokeOpacity={0.5} />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                    <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent labelFormatter={(l) => `Fit score ${l}`} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="picked" fill="var(--color-picked)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="dismissed" fill="var(--color-dismissed)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            )}
          </Card>
        </>
      )}

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By source</CardTitle>
            <CardDescription>Where the roles you act on come from. "Acted on" means Interested or further.</CardDescription>
          </CardHeader>
          <CardContent>
            <SortTable
              rows={data.sources}
              columns={[
                { key: 'source', label: 'Source' },
                { key: 'found', label: 'Found', num: true },
                { key: 'actedOn', label: 'Acted on', num: true },
                { key: 'actedRate', label: 'Rate', num: true, fmt: (v, r) => (r.triaged ? `${v}%` : '--') },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By location</CardTitle>
            <CardDescription>Your areas vs remote, for roles you kept and dismissed.</CardDescription>
          </CardHeader>
          <CardContent>
            <SortTable
              rows={data.locations}
              columns={[
                { key: 'location', label: 'Location' },
                { key: 'found', label: 'Found', num: true },
                { key: 'interested', label: 'Kept', num: true },
                { key: 'dismissed', label: 'Dismissed', num: true },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By company</CardTitle>
          <CardDescription>Apply rate is applied ÷ triaged at that company.</CardDescription>
        </CardHeader>
        <CardContent>
          <SortTable
            rows={data.companies}
            columns={[
              { key: 'company', label: 'Company' },
              { key: 'found', label: 'Found', num: true },
              { key: 'interested', label: 'Interested', num: true },
              { key: 'applied', label: 'Applied', num: true },
              { key: 'interviewing', label: 'Interviewing', num: true },
              { key: 'dismissed', label: 'Dismissed', num: true },
              { key: 'applyRate', label: 'Apply rate', num: true, fmt: (v, r) => (r.interested + r.dismissed ? `${v}%` : '--') },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function Funnel({ steps }: { steps: InsightsData['funnel'] }) {
  const max = Math.max(1, steps[0]?.count ?? 1)
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s) => (
        <Tooltip key={s.step}>
          <TooltipTrigger asChild>
            <div className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{s.step}</span>
              <div className="bg-muted h-3 rounded-full">
                <div className="h-3 rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(s.count ? 2 : 0, (s.count / max) * 100)}%` }} />
              </div>
              <span className="text-right font-medium tabular-nums">{s.count}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {s.step}: {s.count}
            {s.rate != null && ` (${s.rate}% of the step before)`}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function TermCard({ title, description, terms, metric, onTerm }: { title: string; description: string; terms: TermStat[]; metric: (t: TermStat) => number; onTerm: (t: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {terms.length ? (
          <div className="flex flex-col gap-2">
            {terms.map((t) => (
              <button key={t.term} onClick={() => onTerm(t.term)} className="hover:bg-muted/60 -mx-2 grid grid-cols-[1fr_5rem_4.5rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm">
                <span className="truncate font-medium capitalize">{t.term}</span>
                <div className="bg-muted h-2 rounded-full">
                  <div className="bg-foreground/70 h-2 rounded-full" style={{ width: `${metric(t)}%` }} />
                </div>
                <span className="text-muted-foreground text-right text-xs tabular-nums">
                  {metric(t)}% of {t.count}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No clear pattern yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

type Column<R> = { key: keyof R & string; label: string; num?: boolean; fmt?: (v: R[keyof R], row: R) => string }

function SortTable<R extends Record<string, string | number>>({ rows, columns }: { rows: R[]; columns: Column<R>[] }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const sorted = sort ? [...rows].sort((a, b) => (a[sort.key] < b[sort.key] ? -1 : a[sort.key] > b[sort.key] ? 1 : 0) * sort.dir) : rows
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={cn(c.num && 'text-right')}>
              <button
                className="hover:text-foreground inline-flex items-center gap-1"
                onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? (-s.dir as 1 | -1) : c.num ? -1 : 1 }))}
              >
                {c.label}
                <ArrowUpDown className={cn('size-3', sort?.key === c.key ? 'opacity-100' : 'opacity-30')} />
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((r, i) => (
          <TableRow key={i}>
            {columns.map((c) => (
              <TableCell key={c.key} className={cn(c.num && 'text-right tabular-nums', !c.num && 'font-medium')}>
                {c.fmt ? c.fmt(r[c.key], r) : String(r[c.key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function formatHours(h: number) {
  if (h < 1) return 'an hour'
  if (h < 36) return `${Math.round(h)} hours`
  return `${Math.round(h / 24)} days`
}

function fitSentence(f: InsightsData['fit']) {
  if (f.pickedAvg == null || f.dismissedAvg == null) return 'Once scored roles are both kept and dismissed, this compares their fit scores.'
  const gap = f.pickedAvg - f.dismissedAvg
  const verdict =
    gap >= 10 ? 'Scoring is tracking your picks.' : gap > 0 ? 'Scoring roughly tracks your picks, but the gap is small.' : 'Scoring is not matching your picks. Consider updating your profile in Settings → Scoring.'
  return `Roles you kept average ${f.pickedAvg}, dismissed average ${f.dismissedAvg}. ${verdict}`
}
