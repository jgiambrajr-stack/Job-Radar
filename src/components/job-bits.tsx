import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Job } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Real link so cmd-click / middle-click work. Stops propagation so it never selects or opens the sheet. */
export function JobTitleLink({ job, className }: { job: Job; className?: string }) {
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn('font-medium hover:underline underline-offset-4', className)}
    >
      {job.title}
    </a>
  )
}

export function OpenPostingButton({ job, label = false }: { job: Job; label?: boolean }) {
  const button = (
    <Button variant="ghost" size={label ? 'sm' : 'icon-sm'} asChild onClick={(e) => e.stopPropagation()}>
      <a href={job.url} target="_blank" rel="noreferrer" aria-label="Open posting in a new tab">
        <ExternalLink />
        {label && 'Open posting'}
      </a>
    </Button>
  )
  if (label) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>Open posting (o)</TooltipContent>
    </Tooltip>
  )
}

export function FitScore({ score, source }: { score: number | null; source?: string | null }) {
  if (score == null) return <span className="text-muted-foreground text-xs tabular-nums">--</span>
  const tone =
    score >= 80
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : score >= 60
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
        : 'bg-muted text-muted-foreground'
  const chip = <span className={cn('inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums', tone)}>{score}</span>
  if (source === 'claude') return chip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>Quick score from the title. Claude refines it on the next Refresh.</TooltipContent>
    </Tooltip>
  )
}

export function JobTags({ job }: { job: Job }) {
  return (
    <>
      {job.looking_for_referral && <Badge variant="default">Looking for referral</Badge>}
      {job.tags.map((t) => (
        <Badge key={t} variant="secondary">
          {t}
        </Badge>
      ))}
    </>
  )
}

export function locationLabel(job: Job) {
  const loc = job.location ?? ''
  return job.remote && !/remote/i.test(loc) ? `Remote · ${loc}` : loc
}
