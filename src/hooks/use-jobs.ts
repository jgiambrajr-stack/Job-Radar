import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, type Contact, type Job, type JobPatch, type Meta } from '@/lib/api'

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
        const { read, ...rest } = patch
        return {
          ...j,
          ...rest,
          ...(read !== undefined ? { read_at: read ? (j.read_at ?? new Date().toISOString()) : null } : {}),
          ...(patch.status && patch.status !== j.status ? { status_changed_at: new Date().toISOString(), board_order: null } : {}),
        }
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

  const markAllRead = useCallback(async (ids: string[]) => {
    let before: Job[] = []
    const ts = new Date().toISOString()
    const set = new Set(ids)
    setJobs((prev) => {
      before = prev
      return prev.map((j) => (set.has(j.id) && !j.read_at ? { ...j, read_at: ts } : j))
    })
    try {
      await api.markRead(ids)
    } catch (e) {
      setJobs(before)
      toast.error(`Could not save: ${(e as Error).message}`)
    }
  }, [])

  // Card order within a board column: index in ids becomes board_order.
  const reorder = useCallback(async (ids: string[]) => {
    let before: Job[] = []
    setJobs((prev) => {
      before = prev
      const pos = new Map(ids.map((id, i) => [id, i]))
      return prev.map((j) => (pos.has(j.id) ? { ...j, board_order: pos.get(j.id)! } : j))
    })
    try {
      await api.reorder(ids)
    } catch (e) {
      setJobs(before)
      toast.error(`Could not save order: ${(e as Error).message}`)
    }
  }, [])

  // Referral contacts: save first, then put the server's row into that job's list.
  const setContacts = useCallback((jobId: string, fn: (cs: Contact[]) => Contact[], flag?: boolean) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, contacts: fn(j.contacts), ...(flag ? { looking_for_referral: true } : {}) } : j)))
  }, [])
  const addContact = useCallback(
    async (jobId: string, c: { name: string; url?: string }) => {
      try {
        const saved = await api.addContact(jobId, c)
        setContacts(jobId, (cs) => [...cs, saved], true)
      } catch (e) {
        toast.error(`Could not add: ${(e as Error).message}`)
      }
    },
    [setContacts],
  )
  const updateContact = useCallback(
    async (c: Contact, patch: Partial<Pick<Contact, 'name' | 'url' | 'status'>>) => {
      try {
        const saved = await api.updateContact(c.id, patch)
        setContacts(c.job_id, (cs) => cs.map((x) => (x.id === c.id ? saved : x)))
      } catch (e) {
        toast.error(`Could not save: ${(e as Error).message}`)
      }
    },
    [setContacts],
  )
  const removeContact = useCallback(
    async (c: Contact) => {
      try {
        await api.removeContact(c.id)
        setContacts(c.job_id, (cs) => cs.filter((x) => x.id !== c.id))
      } catch (e) {
        toast.error(`Could not remove: ${(e as Error).message}`)
      }
    },
    [setContacts],
  )

  return { jobs, meta, loading, reload, update, markAllRead, reorder, addContact, updateContact, removeContact }
}
