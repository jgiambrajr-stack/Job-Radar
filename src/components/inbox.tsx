import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FitScore, JobTags, JobTitle, OpenPostingButton, locationLabel } from '@/components/job-bits'
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

type InboxProps = {
  jobs: Job[]
  onAction: (job: Job, a: TriageAction) => void
  onOpen: (job: Job) => void
  onRead: (job: Job, read: boolean) => void
  onMarkAllRead: (jobs: Job[]) => void
  similarTerms: string[]
}

export function Inbox({ jobs: all, onAction, onOpen, onRead, onMarkAllRead, similarTerms }: InboxProps) {
  const [unreadOnly, setUnreadOnly] = useState(() => {
    try {
      return localStorage.getItem('inboxUnreadOnly') === '1'
    } catch {
      return false
    }
  })
  const toggleUnreadOnly = () => {
    setUnreadOnly(!unreadOnly)
    try {
      localStorage.setItem('inboxUnreadOnly', unreadOnly ? '0' : '1')
    } catch {
      // storage unavailable: the toggle just won't persist
    }
  }
  // Read state is captured when the toggle is switched on, so a job you just opened doesn't vanish from under you.
  const [keep, setKeep] = useState<Set<string>>(new Set())
  const jobs = unreadOnly ? all.filter((j) => !j.read_at || keep.has(j.id)) : all
  const unread = all.filter((j) => !j.read_at)
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
      else if (e.key === 'o') {
        window.open(job.url, '_blank', 'noopener')
        if (!job.read_at) onRead(job, true)
      } else if (e.key === 'Enter') onOpen(job)
      else if (e.key === 'u') onRead(job, !job.read_at)
      else {
        const hit = ACTIONS.find((a) => a.key === e.key)
        if (!hit) return
        onAction(job, hit.action)
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jobs, index, onAction, onOpen, onRead])

  if (!all.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-20 text-center">
        <p className="font-medium">Inbox zero</p>
        <p className="text-muted-foreground text-sm">Every new role has been triaged. New matches land here after the next run.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (!unreadOnly) setKeep(new Set())
            toggleUnreadOnly()
          }}
          className={cn(
            'rounded-md border px-2 py-0.5 text-xs transition-colors',
            unreadOnly ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Unread only
        </button>
        <span className="text-muted-foreground text-xs tabular-nums">{unread.length} unread</span>
        {!!unread.length && (
          <button className="text-muted-foreground hover:text-foreground ml-auto text-xs underline-offset-2 hover:underline" onClick={() => onMarkAllRead(unread)}>
            Mark all read
          </button>
        )}
      </div>
      {!jobs.length ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-16 text-center">
          <p className="font-medium">All caught up</p>
          <p className="text-muted-foreground text-sm">Nothing unread. Turn off Unread only to see the {all.length} you've already looked at.</p>
        </div>
      ) : (
      <div className="divide-y rounded-xl border">
        {jobs.map((job, i) => (
          <div
            key={job.id}
            ref={(el) => {
              rowRefs.current[i] = el
            }}
            onClick={() => {
              setSelected(i)
              if (unreadOnly) setKeep((k) => new Set(k).add(job.id))
              onOpen(job)
            }}
            className={cn(
              'group flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors md:flex-row md:items-center',
              i === index ? 'bg-muted/70' : 'hover:bg-muted/40',
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span aria-hidden className={cn('mt-2.5 -ml-1.5 size-1.5 shrink-0 rounded-full', job.read_at ? 'bg-transparent' : 'bg-primary')} />
              <FitScore score={job.fit_score} source={job.score_source} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <JobTitle job={job} className={job.read_at ? 'text-foreground/85 font-normal' : 'font-semibold'} />
                  {!job.read_at && <Badge>New</Badge>}
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
              <OpenPostingButton job={job} onOpened={() => !job.read_at && onRead(job, true)} />
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

function similarTo(job: Job, terms: string[]) {
  const text = `${job.title} ${job.tags.join(' ')}`.toLowerCase()
  return terms.find((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
}
