import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FitScore, JobTags, JobTitleLink, OpenPostingButton, locationLabel } from '@/components/job-bits'
import { type Job, timeAgo } from '@/lib/api'
import { cn } from '@/lib/utils'

export type TriageAction = 'interested' | 'referral' | 'applied' | 'dismiss'

const ACTIONS: { action: TriageAction; label: string; key: string }[] = [
  { action: 'interested', label: 'Interested', key: 'i' },
  { action: 'referral', label: 'Looking for referral', key: 'r' },
  { action: 'applied', label: 'Applied', key: 'a' },
  { action: 'dismiss', label: 'Dismiss', key: 'x' },
]

export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('[role="dialog"]')
}

type InboxProps = { jobs: Job[]; onAction: (job: Job, a: TriageAction) => void; onOpen: (job: Job) => void; similarTerms: string[] }

export function Inbox({ jobs, onAction, onOpen, similarTerms }: InboxProps) {
  const [selected, setSelected] = useState(0)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const index = Math.min(selected, Math.max(jobs.length - 1, 0))

  useEffect(() => {
    rowRefs.current[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const job = jobs[index]
      if (e.key === 'j' || e.key === 'ArrowDown') setSelected(Math.min(index + 1, jobs.length - 1))
      else if (e.key === 'k' || e.key === 'ArrowUp') setSelected(Math.max(index - 1, 0))
      else if (!job) return
      else if (e.key === 'o') window.open(job.url, '_blank', 'noopener')
      else if (e.key === 'Enter') onOpen(job)
      else {
        const hit = ACTIONS.find((a) => a.key === e.key)
        if (!hit) return
        onAction(job, hit.action)
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jobs, index, onAction, onOpen])

  if (!jobs.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-20 text-center">
        <p className="font-medium">Inbox zero</p>
        <p className="text-muted-foreground text-sm">Every new role has been triaged. New matches land here after the next run.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="divide-y rounded-xl border">
        {jobs.map((job, i) => (
          <div
            key={job.id}
            ref={(el) => {
              rowRefs.current[i] = el
            }}
            onClick={() => {
              setSelected(i)
              onOpen(job)
            }}
            className={cn(
              'group flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors md:flex-row md:items-center',
              i === index ? 'bg-muted/70' : 'hover:bg-muted/40',
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FitScore score={job.fit_score} source={job.score_source} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <JobTitleLink job={job} />
                  <JobTags job={job} />
                  {similarTo(job, similarTerms) && (
                    <Badge variant="outline" title={`Title mentions "${similarTo(job, similarTerms)}"`}>
                      Similar to roles you kept
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground truncate text-sm">
                  <span className="text-foreground/80">{job.company}</span> · {locationLabel(job)} · found {timeAgo(job.first_seen)}
                  {job.salary && ` · ${job.salary}`}
                </p>
                {job.fit_notes && <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{job.fit_notes}</p>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {ACTIONS.map((a) => (
                <Button
                  key={a.action}
                  size="sm"
                  variant={a.action === 'dismiss' ? 'ghost' : 'outline'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAction(job, a.action)
                  }}
                >
                  {a.label}
                </Button>
              ))}
              <OpenPostingButton job={job} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function similarTo(job: Job, terms: string[]) {
  const text = `${job.title} ${job.tags.join(' ')}`.toLowerCase()
  return terms.find((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
}
