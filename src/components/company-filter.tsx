import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Props = {
  companies: { name: string; count: number }[]
  /** Companies switched off. Stored this way round so newly added companies show by default. */
  hidden: string[]
  onChange: (hidden: string[]) => void
}

export function CompanyFilter({ companies, hidden, onChange }: Props) {
  const [q, setQ] = useState('')
  const shown = companies.filter((c) => !hidden.includes(c.name))
  const label =
    shown.length === companies.length ? 'All companies' : shown.length === 1 ? shown[0].name : `${shown.length} companies`
  const visible = q ? companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : companies

  const toggle = (name: string, only: boolean) => {
    if (only) onChange(companies.map((c) => c.name).filter((n) => n !== name))
    else onChange(hidden.includes(name) ? hidden.filter((n) => n !== name) : [...hidden, name])
  }

  return (
    <Popover onOpenChange={(o) => !o && setQ('')}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('w-36 justify-between font-normal', shown.length !== companies.length && 'border-primary')}>
          <span className="truncate">{label}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">{shown.length} of {companies.length} shown</span>
          <div className="flex gap-3 text-xs">
            <button className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-40" disabled={!hidden.length} onClick={() => onChange([])}>
              Select all
            </button>
            <button
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-40"
              disabled={!shown.length}
              onClick={() => onChange(companies.map((c) => c.name))}
            >
              Clear
            </button>
          </div>
        </div>
        {companies.length > 15 && (
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input placeholder="Find a company" aria-label="Find a company" value={q} onChange={(e) => setQ(e.target.value)} className="h-7 pl-7 text-xs" />
          </div>
        )}
        <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
          {visible.map((c) => {
            const on = !hidden.includes(c.name)
            return (
              <button
                key={c.name}
                aria-pressed={on}
                title="Click to toggle. Alt-click to show only this company."
                onClick={(e) => toggle(c.name, e.altKey)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors',
                  on ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {c.name}
                <span className={cn('tabular-nums', on ? 'opacity-70' : 'opacity-60')}>{c.count}</span>
              </button>
            )
          })}
          {!visible.length && <p className="text-muted-foreground py-2 text-xs">No company matches.</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
