import { useEffect, useState } from 'react'
import { Plus, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FitScore, JobTags, locationLabel } from '@/components/job-bits'
import { Breakdown } from '@/components/scoring-settings'
import { api, CONTACT_LABEL, CONTACT_STATUSES, STATUS_LABEL, STATUSES, type Contact, type ContactStatus, type Job, type JobPatch, type JobScore, linkedInPeopleSearch, timeAgo } from '@/lib/api'

type ContactActions = {
  add: (jobId: string, c: { name: string; url?: string }) => Promise<void>
  update: (c: Contact, patch: Partial<Pick<Contact, 'name' | 'url' | 'status'>>) => Promise<void>
  remove: (c: Contact) => Promise<void>
}

export function JobSheet({ job, onClose, onUpdate, contacts }: { job: Job | null; onClose: () => void; onUpdate: (id: string, patch: JobPatch) => void; contacts: ContactActions }) {
  const [notes, setNotes] = useState('')
  const [score, setScore] = useState<JobScore | null>(null)
  useEffect(() => {
    setScore(null)
    if (job) api.jobScore(job.id).then(setScore, () => {})
  }, [job?.id, job?.fit_score]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setNotes(job?.notes ?? '')
  }, [job?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={!!job} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {job && (
          <>
            <SheetHeader className="gap-1.5 pb-4">
              <p className="text-muted-foreground text-sm">{job.company}</p>
              <SheetTitle className="pr-6 text-lg leading-snug">{job.title}</SheetTitle>
              <SheetDescription>
                {locationLabel(job)} · via {job.source} · found {timeAgo(job.first_seen)}
                {job.posted_at && ` · posted ${timeAgo(job.posted_at)}`}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <FitScore score={job.fit_score} source={job.score_source} />
                <JobTags job={job} />
              </div>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={job.url} target="_blank" rel="noreferrer">Open posting</a>
                </Button>
                <Select value={job.status} onValueChange={(v) => onUpdate(job.id, { status: v as Job['status'] })}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {job.salary && <Field label="Compensation"><p className="text-sm">{job.salary}</p></Field>}
              <Field label={score?.source === 'claude' ? `Score ${job.fit_score} · from Claude` : `Score ${job.fit_score ?? '--'} · quick score`}>
                {score?.source === 'claude' ? (
                  <p className="text-sm leading-relaxed">{job.fit_notes ?? 'Claude scored this without a note.'}</p>
                ) : (
                  <>
                    {score && <Breakdown parts={score.rules.parts} />}
                    <p className="text-muted-foreground text-xs">Claude replaces this with a considered score and a note on the next Refresh. Edit the rules in Settings → Scoring.</p>
                  </>
                )}
              </Field>
              {job.description_snippet && (
                <Field label="Snippet"><p className="text-muted-foreground text-sm leading-relaxed">{job.description_snippet}</p></Field>
              )}
              {new Date(job.last_seen).getTime() < Date.now() - 3 * 86400000 && (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                  Not seen in a scan since {timeAgo(job.last_seen)}. It may be closed.
                </p>
              )}

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="referral">Looking for referral</Label>
                  <p className="text-muted-foreground text-xs">Flag it so you remember to find someone at {job.company}.</p>
                </div>
                <Switch
                  id="referral"
                  checked={job.looking_for_referral}
                  onCheckedChange={(v) => onUpdate(job.id, { looking_for_referral: v, ...(v && job.status === 'new' ? { status: 'interested' } : {}) })}
                />
              </div>
              {job.looking_for_referral && <ReferralContacts job={job} actions={contacts} />}

              <Field label="Notes">
                <Textarea
                  rows={5}
                  placeholder="Recruiter name, interview dates, anything to remember"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => notes !== (job.notes ?? '') && onUpdate(job.id, { notes: notes || null })}
                />
              </Field>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ReferralContacts({ job, actions }: { job: Job; actions: ContactActions }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const add = async () => {
    if (!name.trim()) return
    await actions.add(job.id, { name, url })
    setName('')
    setUrl('')
  }
  return (
    <div className="flex flex-col gap-3">
      {!!job.contacts.length && (
        <div className="divide-y rounded-md border">
          {job.contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1.5 pr-1 pl-3">
              <div className="min-w-0 flex-1">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline underline-offset-4">{c.name}</a>
                ) : (
                  <p className="truncate text-sm font-medium">{c.name}</p>
                )}
                {c.messaged_at && <p className="text-muted-foreground text-xs">Messaged {shortDate(c.messaged_at)}</p>}
              </div>
              <Select value={c.status} onValueChange={(v) => actions.update(c, { status: v as ContactStatus })}>
                <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{CONTACT_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.name}`} onClick={() => actions.remove(c)}>
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <div className="flex gap-2">
          <Input placeholder="Name and role" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            <Plus /> Add
          </Button>
        </div>
        <Input placeholder="LinkedIn profile URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
      </form>
      <Button variant="outline" size="sm" className="self-start" asChild>
        <a href={linkedInPeopleSearch(job.company)} target="_blank" rel="noreferrer">
          <Users /> Find people at {job.company}
        </a>
      </Button>
    </div>
  )
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</span>
      {children}
    </div>
  )
}
