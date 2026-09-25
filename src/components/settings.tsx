import { Check } from 'lucide-react'
import { useTheme } from 'next-themes'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Companies } from '@/components/companies'
import { ScoringSettings } from '@/components/scoring-settings'
import { cn } from '@/lib/utils'

export function SettingsSheet({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:sm:max-w-none">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Which companies get checked, how roles are scored, and how the dashboard looks.</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="companies" className="gap-4 px-4 pb-6">
          <TabsList>
            <TabsTrigger value="companies">Companies</TabsTrigger>
            <TabsTrigger value="scoring">Scoring</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>
          <TabsContent value="companies" className="overflow-x-auto">
            <Companies onChanged={onChanged} />
          </TabsContent>
          <TabsContent value="scoring">
            <ScoringSettings onRescored={onChanged} />
          </TabsContent>
          <TabsContent value="appearance">
            <ThemePicker />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

// Mini dashboard illustrations use fixed colors that mirror each theme's tokens, so they read correctly whatever theme is active.
const PALETTES = {
  light: { bg: '#f2f4f8', card: '#fafbfd', line: '#dcdfe4', text: '#24272b', muted: '#b9bdc3', chip: '#2a78d6' },
  dark: { bg: '#1a1c1f', card: '#232527', line: '#34363a', text: '#dcdee1', muted: '#5d6166', chip: '#3987e5' },
}

function Preview({ mode }: { mode: 'light' | 'dark' }) {
  const p = PALETTES[mode]
  return (
    <svg viewBox="0 0 120 76" className="h-full w-full" aria-hidden>
      <rect width="120" height="76" fill={p.bg} />
      <rect x="10" y="9" width="40" height="6" rx="2" fill={p.text} />
      <rect x="92" y="9" width="18" height="6" rx="2" fill={p.muted} />
      {[24, 46].map((y) => (
        <g key={y}>
          <rect x="10" y={y} width="100" height="18" rx="3" fill={p.card} stroke={p.line} />
          <rect x="15" y={y + 5} width="9" height="8" rx="2" fill={p.chip} opacity="0.85" />
          <rect x="29" y={y + 5} width="44" height="3.5" rx="1.5" fill={p.text} />
          <rect x="29" y={y + 11} width="30" height="3" rx="1.5" fill={p.muted} />
        </g>
      ))}
    </svg>
  )
}

const OPTIONS = [
  { value: 'system', label: 'System', hint: 'Match your Mac' },
  { value: 'light', label: 'Light', hint: 'Soft off-white' },
  { value: 'dark', label: 'Dark', hint: 'Soft charcoal' },
] as const

function ThemePicker() {
  const { theme = 'system', setTheme } = useTheme()
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Theme</h3>
        <p className="text-muted-foreground text-xs">System follows your Mac's light or dark setting.</p>
      </div>
      <RadioGroup value={theme} onValueChange={setTheme} className="grid max-w-xl grid-cols-3 gap-3" aria-label="Theme">
        {OPTIONS.map((o) => {
          const selected = theme === o.value
          return (
            <label key={o.value} className="group flex cursor-pointer flex-col gap-2">
              <RadioGroupItem value={o.value} className="sr-only" />
              <div
                className={cn(
                  'relative aspect-[120/76] overflow-hidden rounded-lg border transition-shadow',
                  selected ? 'ring-primary ring-2 ring-offset-2 ring-offset-[var(--background)]' : 'group-hover:ring-border group-hover:ring-2',
                )}
              >
                {o.value === 'system' ? (
                  <>
                    <div className="absolute inset-0">
                      <Preview mode="light" />
                    </div>
                    <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
                      <Preview mode="dark" />
                    </div>
                  </>
                ) : (
                  <Preview mode={o.value} />
                )}
                {selected && (
                  <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full">
                    <Check className="size-3" />
                  </span>
                )}
              </div>
              <div className="leading-tight">
                <p className={cn('text-sm', selected ? 'font-medium' : 'text-muted-foreground')}>{o.label}</p>
                <p className="text-muted-foreground text-xs">{o.hint}</p>
              </div>
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}
