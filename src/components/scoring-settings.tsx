import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { FitScore } from '@/components/job-bits'
import { api, type ScoreParts, type Scoring } from '@/lib/api'

export function ScoringSettings({ onRescored }: { onRescored: () => void }) {
  const [saved, setSaved] = useState<Scoring | null>(null)
  const [draft, setDraft] = useState<Scoring | null>(null)
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    api.scoring().then((s) => {
      setSaved(s)
      setDraft(s)
    })
  }, [])

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])
  if (!draft) return <p className="text-muted-foreground py-10 text-center text-sm">Loading</p>

  const edit = (fn: (d: Scoring) => void) =>
    setDraft((d) => {
      const next = structuredClone(d!)
      fn(next)
      return next
    })

  const save = async () => {
    setBusy(true)
    try {
      await api.saveScoring(draft)
      setSaved(draft)
      setJustSaved(true)
      toast.success('Scoring saved', { description: 'Claude uses your profile and guidance from the next Refresh.' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const rescore = async (scope: 'quick' | 'all') => {
    const { updated } = await api.rescore(scope)
    toast.success(
      scope === 'quick' ? `Updated ${updated} quick score${updated === 1 ? '' : 's'}` : `${updated} roles will be re-scored by Claude on the next Refresh`,
      { description: scope === 'all' ? 'They show quick scores until then.' : undefined },
    )
    setJustSaved(false)
    onRescored()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-muted/60 rounded-lg p-3 text-sm leading-relaxed">
        <p>
          <span className="font-medium">Quick score:</span> added the moment a role is found, from the rules below.
        </p>
        <p>
          <span className="font-medium">Claude score:</span> replaces it on Refresh or the daily run, comparing each role to your profile and guidance, with a
          one-line note. Scores only change sort order. Nothing is hidden.
        </p>
      </div>

      <Section title="Your profile" hint="What Claude compares every role against.">
        <Textarea rows={4} value={draft.profile} onChange={(e) => edit((d) => void (d.profile = e.target.value))} />
      </Section>

      <Section title="Guidance for Claude" hint="How to weigh things. One idea per line works well.">
        <Textarea rows={5} value={draft.claudeGuidance} onChange={(e) => edit((d) => void (d.claudeGuidance = e.target.value))} />
      </Section>

      <Separator />

      <Section title="Quick-score rules" hint="The first role type whose phrase appears in the title wins. Scores are capped at 0 to 100.">
        <div className="flex flex-col gap-2">
          {draft.roles.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input value={r.label} aria-label="Role type name" onChange={(e) => edit((d) => void (d.roles[i].label = e.target.value))} className="h-8 flex-1 font-medium" />
                <Points value={r.points} onChange={(v) => edit((d) => void (d.roles[i].points = v))} />
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.label}`} onClick={() => edit((d) => void d.roles.splice(i, 1))}>
                  <Trash2 />
                </Button>
              </div>
              <Chips
                values={r.match}
                placeholder="Add phrase"
                onChange={(m) => edit((d) => void (d.roles[i].match = m))}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => edit((d) => void d.roles.push({ label: 'New role type', match: [], points: 40 }))}>
              <Plus /> Add role type
            </Button>
            <Row label="Any other role">
              <Points value={draft.otherRolePoints} onChange={(v) => edit((d) => void (d.otherRolePoints = v))} />
            </Row>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Row label="Senior / Sr">
            <Points value={draft.level.senior} onChange={(v) => edit((d) => void (d.level.senior = v))} />
          </Row>
          <Row label="Mid level">
            <Points value={draft.level.mid} onChange={(v) => edit((d) => void (d.level.mid = v))} />
          </Row>
          <Row label="Remote or home area">
            <Points value={draft.locationBonus} onChange={(v) => edit((d) => void (d.locationBonus = v))} />
          </Row>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Domain terms</span>
            <div className="flex items-center gap-3">
              <Row label="Each">
                <Points value={draft.domains.pointsEach} onChange={(v) => edit((d) => void (d.domains.pointsEach = v))} />
              </Row>
              <Row label="Max">
                <Points value={draft.domains.max} onChange={(v) => edit((d) => void (d.domains.max = v))} />
              </Row>
            </div>
          </div>
          <Chips values={draft.domains.terms} placeholder="Add term" onChange={(t) => edit((d) => void (d.domains.terms = t))} />
        </div>

        <TryTitle config={draft} />
      </Section>

      <div className="bg-background/80 sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t px-4 py-3 backdrop-blur">
        <Button onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(saved)}>
            Discard changes
          </Button>
        )}
        {!dirty && justSaved && (
          <>
            <Button variant="outline" onClick={() => rescore('quick')}>
              Update quick scores now
            </Button>
            <Button variant="ghost" onClick={() => rescore('all')}>
              Have Claude re-score everything on next Refresh
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-normal">
      {label}
      {children}
    </Label>
  )
}

function Points({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      min={-100}
      max={100}
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className="h-8 w-16 text-right tabular-nums"
    />
  )
}

function Chips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const v = text.trim().toLowerCase()
    if (v && !values.includes(v)) onChange([...values, v])
    setText('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <span key={v} className="bg-secondary inline-flex h-6 items-center gap-1 rounded-md pr-1 pl-2 text-xs">
          {v}
          <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-foreground rounded">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        className="h-6 w-28 px-2 text-xs"
      />
    </div>
  )
}

function TryTitle({ config }: { config: Scoring }) {
  const [title, setTitle] = useState('Senior Product Designer, Design Systems')
  const [result, setResult] = useState<ScoreParts | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      if (title.trim()) api.previewScore(title, config).then(setResult, () => setResult(null))
      else setResult(null)
    }, 200)
    return () => clearTimeout(t)
  }, [title, config])

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Label htmlFor="try-title" className="text-xs font-medium">
        Try a title
      </Label>
      <div className="flex items-center gap-2">
        <Input id="try-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8" />
        <FitScore score={result?.score ?? null} source="claude" />
      </div>
      {result && result.parts.length > 0 && <Breakdown parts={result.parts} />}
      <p className="text-muted-foreground text-[11px]">Remote and home-area bonuses come from each job's location, so they aren't counted here.</p>
    </div>
  )
}

export function Breakdown({ parts }: { parts: { label: string; points: number }[] }) {
  return (
    <p className="text-muted-foreground text-xs leading-relaxed">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {p.label} <span className="text-foreground tabular-nums">{p.points >= 0 ? `+${p.points}` : p.points}</span>
        </span>
      ))}
    </p>
  )
}
