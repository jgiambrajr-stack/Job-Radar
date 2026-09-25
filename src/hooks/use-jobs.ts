import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, type Job, type JobPatch, type Meta } from '@/lib/api'

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [j, m] = await Promise.all([api.jobs(), api.meta()])
    setJobs(j)
    setMeta(m)
    setLoading(false)
  }, [])

  useEffect(() => {
    reload().catch((e) => toast.error(`Could not load jobs: ${e.message}`))
  }, [reload])

  // Optimistic: update locally first, roll back if the server says no.
  const update = useCallback(async (id: string, patch: JobPatch) => {
    let before: Job | undefined
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== id) return j
        before = j
        return { ...j, ...patch, ...(patch.status && patch.status !== j.status ? { status_changed_at: new Date().toISOString() } : {}) }
      }),
    )
    try {
      await api.updateJob(id, patch)
    } catch (e) {
      if (before) setJobs((prev) => prev.map((j) => (j.id === id ? before! : j)))
      toast.error(`Could not save: ${(e as Error).message}`)
    }
    return before
  }, [])

  return { jobs, meta, loading, reload, update }
}
