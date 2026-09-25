import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, type Company, timeAgo } from '@/lib/api'

const ADAPTER_LABEL: Record<string, string> = {
  'claude-browse': 'Claude browses',
  greenhouse: 'Greenhouse feed',
  ashby: 'Ashby feed',
  lever: 'Lever feed',
  workday: 'Workday feed',
  amazon: 'Amazon feed',
  eightfold: 'Eightfold feed',
  jibe: 'iCIMS feed',
  linkedin: 'Claude in Chrome',
}

function LastChecked({ company: c }: { company: Company }) {
  if (c.last_error?.startsWith('Rate limited')) {
    return (
      <span className="text-amber-700 dark:text-amber-400" title="This site blocked too many requests. Claude browses it on each Refresh until the pause ends.">
        {c.last_error.replace('Rate limited, retrying after', 'Paused until')}
      </span>
    )
  }
  if (c.last_error) {
    return <span className="text-destructive" title={c.last_error}>Failed {timeAgo(c.last_checked)}</span>
  }
  if (c.last_checked) return <>{timeAgo(c.last_checked)}</>
  return <>{c.adapter === 'claude-browse' || c.adapter === 'linkedin' ? 'On next Refresh' : 'Not yet'}</>
}

export function Companies({ onChanged }: { onChanged: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const load = useCallback(() => api.companies().then(setCompanies), [])
  useEffect(() => {
    load()
  }, [load])

  const toggle = async (c: Company, enabled: boolean) => {
    setCompanies((cs) => cs.map((x) => (x.name === c.name ? { ...x, enabled } : x)))
    await api.toggleCompany(c.name, enabled)
  }
  const remove = async (c: Company) => {
    if (!confirm(`Stop tracking ${c.name}? Jobs already found stay on the board.`)) return
    await api.removeCompany(c.name)
    load()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Feeds are read by a script in seconds. "Claude browses" companies are checked by the daily Claude routine, along with the LinkedIn catch-all.
        </p>
        <AddCompanyDialog
          onAdded={() => {
            load()
            onChanged()
          }}
        />
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="min-w-44">Last checked</TableHead>
              <TableHead className="text-right">Active jobs</TableHead>
              <TableHead className="w-24 text-right">Tracking</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.name} className={c.enabled ? '' : 'opacity-50'}>
                <TableCell className="font-medium">
                  {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">{c.name}</a> : c.name}
                  {c.note && <p className="text-muted-foreground text-xs font-normal">{c.note}</p>}
                </TableCell>
                <TableCell>
                  <Badge variant={c.adapter === 'claude-browse' ? 'outline' : 'secondary'}>{ADAPTER_LABEL[c.adapter] ?? c.adapter}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  <LastChecked company={c} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.jobs}</TableCell>
                <TableCell className="text-right">
                  {!c.builtin && <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c, v)} />}
                </TableCell>
                <TableCell>
                  {!c.builtin && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function AddCompanyDialog({ onAdded, trigger }: { onAdded: () => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { company, test } = await api.addCompany(name, url)
      if (company.adapter === 'claude-browse') {
        toast.success(`Added ${company.name}`, { description: 'No public job feed found, so the Claude routine will browse this page on each run.' })
      } else {
        toast.success(`Added ${company.name} via ${ADAPTER_LABEL[company.adapter]}`, {
          description: `Found ${test?.fetched ?? 0} open roles, ${test?.matched ?? 0} match your criteria.`,
        })
      }
      setOpen(false)
      setName('')
      setUrl('')
      onAdded()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <Button size="sm">
            <Plus /> Add company
          </Button>
        )}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Add a company</DialogTitle>
              <DialogDescription>
                Paste their careers or job-board page. If it runs on Greenhouse, Ashby, Lever, Workday, or iCIMS, it gets checked by script on every run. Otherwise Claude browses it.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="co-name">Company</Label>
              <Input id="co-name" placeholder="Linear" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="co-url">Careers URL</Label>
              <Input id="co-url" type="url" placeholder="https://linear.app/careers" value={url} onChange={(e) => setUrl(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>{busy ? 'Checking their job feed...' : 'Add and check now'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
