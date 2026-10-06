import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { JobTitle, OpenPostingButton, locationLabel } from '@/components/job-bits'
import { type Job, timeAgo } from '@/lib/api'

export function Dismissed({ jobs, onRestore, onOpen }: { jobs: Job[]; onRestore: (job: Job) => void; onOpen: (job: Job) => void }) {
  const [q, setQ] = useState('')
  const needle = q.toLowerCase()
  const rows = jobs
    .filter((j) => !needle || `${j.title} ${j.company}`.toLowerCase().includes(needle))
    .sort((a, b) => b.status_changed_at.localeCompare(a.status_changed_at))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">Dismissed roles stay here and never come back from future scans. Restore one to send it back to the Inbox.</p>
        <Input placeholder="Search dismissed" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-60" />
      </div>
      <div className="divide-y rounded-xl border">
        {rows.map((job) => (
          <div key={job.id} onClick={() => onOpen(job)} className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <JobTitle job={job} className="text-muted-foreground" />
              <p className="text-muted-foreground truncate text-xs">
                {job.company} · {locationLabel(job)} · dismissed {timeAgo(job.status_changed_at)}
              </p>
            </div>
            <OpenPostingButton job={job} />
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                onRestore(job)
              }}
            >
              Restore
            </Button>
          </div>
        ))}
        {!rows.length && <p className="text-muted-foreground py-10 text-center text-sm">{q ? 'No matches.' : 'Nothing dismissed yet.'}</p>}
      </div>
    </div>
  )
}
