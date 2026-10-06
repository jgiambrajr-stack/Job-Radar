import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Job } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Plain text: a click falls through to the row or card, which opens the job sheet. The arrow button opens the posting. */
export function JobTitle({ job, className }: { job: Job; className?: string }) {
  return <span className={cn('font-medium', className)}>{job.title}</span>
}

export function OpenPostingButton({ job, label = false, onOpened }: { job: Job; label?: boolean; onOpened?: () => void }) {
  const button = (
    <Button
      variant="ghost"
      size={label ? 'sm' : 'icon-sm'}
      asChild
      onClick={(e) => {
        e.stopPropagation()
        onOpened?.()
      }}
    >
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
      {job.looking_for_referral && <Badge variant="default">{referralSummary(job)}</Badge>}
      {job.tags.map((t) => (
        <Badge key={t} variant="secondary">
          {t}
        </Badge>
      ))}
    </>
  )
}

/** "Looking for referral" until you add people, then where things stand with them. */
function referralSummary(job: Job) {
  const cs = job.contacts
  if (!cs.length) return 'Looking for referral'
  if (cs.some((c) => c.status === 'referred')) return 'Referred'
  const messaged = cs.filter((c) => c.status !== 'found').length
  const replied = cs.filter((c) => c.status === 'replied').length
  return [`Referral · ${cs.length} ${cs.length === 1 ? 'person' : 'people'}`, messaged && `${messaged} messaged`, replied && `${replied} replied`].filter(Boolean).join(', ')
}

export function locationLabel(job: Job) {
  const loc = job.location ?? ''
  return job.remote && !/remote/i.test(loc) ? `Remote · ${loc}` : loc
}
