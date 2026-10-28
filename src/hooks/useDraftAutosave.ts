import { useCallback, useEffect, useRef, useState } from 'react'

export type DraftSavePhase = 'idle' | 'saving' | 'saved' | 'draft'

function snap<T>(value: T): string {
  return JSON.stringify(value)
}

/**
 * Debounced Drive draft save: dirty when value ≠ last successful snapshot.
 * Call markSaved(savedValue, kind) after a successful write (manual or auto).
 */
export function useDraftAutosave<T>({
  value,
  resetKey,
  enabled = true,
  delayMs = 1500,
  onSave,
}: {
  value: T
  resetKey: string | number
  enabled?: boolean
  delayMs?: number
  onSave: (value: T) => Promise<void>
}) {
  const [baseline, setBaseline] = useState(() => snap(value))
  const [phase, setPhase] = useState<DraftSavePhase>('idle')
  const valueRef = useRef(value)
  const baselineRef = useRef(baseline)
  const onSaveRef = useRef(onSave)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    baselineRef.current = baseline
  }, [baseline])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    const next = snap(valueRef.current)
    setBaseline(next)
    baselineRef.current = next
    setPhase('idle')
  }, [resetKey])

  const dirty = snap(value) !== baseline

  useEffect(() => {
    if (!enabled || !dirty) return
    const handle = window.setTimeout(() => {
      const current = valueRef.current
      if (snap(current) === baselineRef.current) return
      setPhase('saving')
      void (async () => {
        try {
          await onSaveRef.current(current)
          // Page should call markSaved; if it skipped (concurrent edit), leave dirty and clear "saving".
          setPhase((p) => (p === 'saving' ? 'draft' : p))
        } catch {
          setPhase('idle')
        }
      })()
    }, delayMs)
    return () => window.clearTimeout(handle)
  }, [baseline, delayMs, dirty, enabled, value])

  const markSaved = useCallback((saved: T, kind: 'manual' | 'draft' = 'manual') => {
    const next = snap(saved)
    setBaseline(next)
    baselineRef.current = next
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = null
    }
    if (kind === 'manual') {
      setPhase('saved')
      savedTimerRef.current = setTimeout(() => {
        setPhase((p) => (p === 'saved' ? 'idle' : p))
        savedTimerRef.current = null
      }, 2000)
    } else {
      setPhase('draft')
    }
  }, [])

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    },
    [],
  )

  return { dirty, phase, markSaved, setPhase, valueRef }
}
