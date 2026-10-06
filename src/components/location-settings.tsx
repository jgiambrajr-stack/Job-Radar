import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Chips, Section } from '@/components/scoring-settings'
import { api, type LocationRules } from '@/lib/api'
import type { LocationVerdict } from '@/lib/location'
import { cn } from '@/lib/utils'

export function LocationSettings({ onSaved }: { onSaved: () => void }) {
  const [saved, setSaved] = useState<LocationRules | null>(null)
  const [draft, setDraft] = useState<LocationRules | null>(null)
  const [busy, setBusy] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    api.locations().then((l) => {
      setSaved(l)
      setDraft(l)
    })
  }, [])
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])
  if (!draft) return <p className="text-muted-foreground py-10 text-center text-sm">Loading</p>

  const edit = (fn: (d: LocationRules) => void) =>
    setDraft((d) => {
      const next = structuredClone(d!)
      fn(next)
      return next
    })

  const save = async () => {
    setBusy(true)
    try {
      await api.saveLocations(draft)
      setSaved(draft)
      setJustSaved(true)
      onSaved()
      toast.success('Locations saved', { description: 'New scans use these areas. Roles already on your board stay.' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const recheck = async () => {
    setBusy(true)
    try {
      const results = await api.refresh()
      const added = results.reduce((n, r) => n + r.new, 0)
      toast.success(added ? `${added} new role${added === 1 ? '' : 's'} match your locations` : 'Feeds checked. Nothing new for these locations.')
      setJustSaved(false)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="bg-muted/60 rounded-lg p-3 text-sm leading-relaxed">
        A role is kept if it's in one of your areas, or if it's remote and remote roles are on. This decides which roles get added at all, so roles
        outside these places never reach your Inbox.
      </p>

      <Section title="Areas" hint="A role matches an area when its location mentions any of these places. Short codes like wa match only as whole words.">
        <div className="flex flex-col gap-2">
          {draft.areas.map((a, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input value={a.name} aria-label="Area name" onChange={(e) => edit((d) => void (d.areas[i].name = e.target.value))} className="h-8 flex-1 font-medium" />
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.name}`} onClick={() => edit((d) => void d.areas.splice(i, 1))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Places that count</span>
                <Chips values={a.match} placeholder="Add city or state" onChange={(m) => edit((d) => void (d.areas[i].match = m))} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Except when it says</span>
                <Chips values={a.exclude ?? []} placeholder="e.g. washington, dc" onChange={(x) => edit((d) => void (d.areas[i].exclude = x))} />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => edit((d) => void d.areas.push({ name: 'New area', match: [], exclude: [] }))}
          >
            <Plus /> Add area
          </Button>
        </div>
      </Section>

      <Section title="Remote roles" hint="Remote roles are kept no matter which areas you've set.">
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <Toggle
            id="remote"
            label="Include remote roles"
            checked={draft.includeRemote}
            onChange={(v) => edit((d) => void (d.includeRemote = v))}
          />
          <Toggle
            id="remote-us"
            label="Only remote roles open to the US"
            hint="Skips roles like 'Remote, UK' or 'Remote - India'. Plain 'Remote' is kept."
            checked={draft.remoteUSOnly}
            disabled={!draft.includeRemote}
            onChange={(v) => edit((d) => void (d.remoteUSOnly = v))}
          />
          {draft.includeRemote && draft.remoteUSOnly && (
            <div>
              <button onClick={() => setShowAdvanced((v) => !v)} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs">
                <ChevronDown className={cn('size-3 transition-transform', showAdvanced && 'rotate-180')} />
                Places that mean outside the US ({draft.nonUSMarkers.length})
              </button>
              {showAdvanced && (
                <div className="mt-2">
                  <Chips values={draft.nonUSMarkers} placeholder="Add country or city" onChange={(m) => edit((d) => void (d.nonUSMarkers = m))} />
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <TryLocation config={draft} />

      <p className="text-muted-foreground text-xs">
        The LinkedIn searches Claude runs live in <code>config/linkedin.json</code>. If you add a new area, ask Claude to add matching LinkedIn searches.
      </p>

      <div className="bg-background/80 sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t px-4 py-3 backdrop-blur">
        <Button onClick={save} disabled={!dirty || busy}>
          {busy && dirty ? 'Saving' : 'Save'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(saved)}>
            Discard changes
          </Button>
        )}
        {!dirty && justSaved && (
          <Button variant="outline" onClick={recheck} disabled={busy}>
            {busy ? 'Checking feeds' : 'Check company feeds now'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Toggle({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn('flex items-center justify-between gap-4', disabled && 'opacity-50')}>
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

function TryLocation({ config }: { config: LocationRules }) {
  const [location, setLocation] = useState('Remote - Canada')
  const [result, setResult] = useState<LocationVerdict | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      if (location.trim()) api.previewLocation(location, config).then(setResult, () => setResult(null))
      else setResult(null)
    }, 200)
    return () => clearTimeout(t)
  }, [location, config])

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Label htmlFor="try-loc" className="text-xs font-medium">
        Try a location
      </Label>
      <div className="flex items-center gap-3">
        <Input id="try-loc" value={location} onChange={(e) => setLocation(e.target.value)} className="h-8" placeholder="e.g. Bellevue, WA" />
        {result && (
          <span
            className={cn(
              'shrink-0 rounded-md px-2 py-1 text-xs font-medium',
              result.ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
            )}
          >
            {result.ok ? 'Kept' : 'Skipped'}
          </span>
        )}
      </div>
      {result && <p className="text-muted-foreground text-xs">{result.reason}</p>}
    </div>
  )
}
