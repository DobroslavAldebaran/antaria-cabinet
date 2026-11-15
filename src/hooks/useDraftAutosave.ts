import { useCallback, useEffect, useRef, useState } from 'react'

export type DraftSavePhase = 'idle' | 'saving' | 'saved' | 'draft' | 'error'

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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const [pending, setPending] = useState(false)
  const valueRef = useRef(value)
  const baselineRef = useRef(baseline)
  const onSaveRef = useRef(onSave)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scopeRef = useRef(resetKey)
  const inFlightRef = useRef(false)
  const failedRef = useRef<{ snapshot: string; retryVersion: number } | null>(null)
  const mountedRef = useRef(true)

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
    scopeRef.current = resetKey
    const next = snap(valueRef.current)
    setBaseline(next)
    baselineRef.current = next
    setPhase('idle')
    setSaveError(null)
    failedRef.current = null
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [resetKey])

  const dirty = snap(value) !== baseline

  useEffect(() => {
    if (!enabled || !dirty || inFlightRef.current) return
    const failed = failedRef.current
    if (failed?.snapshot === snap(value) && failed.retryVersion === retryVersion) return
    const handle = window.setTimeout(() => {
      const current = valueRef.current
      if (snap(current) === baselineRef.current) return
      const scope = resetKey
      const save = onSaveRef.current
      inFlightRef.current = true
      setPending(true)
      setSaveError(null)
      setPhase('saving')
      void (async () => {
        try {
          await save(current)
          if (!mountedRef.current || scopeRef.current !== scope) return
          // Only mark the current value saved when the page acknowledged it.
          setPhase((p) => p === 'saving'
            ? snap(valueRef.current) === baselineRef.current ? 'draft' : 'idle'
            : p)
        } catch (e) {
          if (!mountedRef.current || scopeRef.current !== scope) return
          // A multi-file save may have written part of the value. The previous
          // baseline is no longer a known Drive state, even if the user reverts.
          baselineRef.current = ''
          setBaseline('')
          failedRef.current = { snapshot: snap(current), retryVersion }
          setSaveError(e instanceof Error ? e.message : 'Ошибка автосохранения')
          setPhase('error')
        } finally {
          inFlightRef.current = false
          if (mountedRef.current) setPending(false)
        }
      })()
    }, delayMs)
    return () => window.clearTimeout(handle)
  }, [baseline, delayMs, dirty, enabled, value, resetKey, retryVersion, pending])

  const retryAutosave = useCallback(() => {
    failedRef.current = null
    setRetryVersion((v) => v + 1)
  }, [])

  const markDirty = useCallback(() => {
    // Used when restoring a browser draft whose Drive baseline is unknown.
    baselineRef.current = ''
    setBaseline('')
    setPhase('idle')
    retryAutosave()
  }, [retryAutosave])

  useEffect(() => {
    window.addEventListener('online', retryAutosave)
    window.addEventListener('antaria:drive-access-restored', retryAutosave)
    return () => {
      window.removeEventListener('online', retryAutosave)
      window.removeEventListener('antaria:drive-access-restored', retryAutosave)
    }
  }, [retryAutosave])

  const markSaved = useCallback((saved: T, kind: 'manual' | 'draft' = 'manual') => {
    if (!mountedRef.current || scopeRef.current !== resetKey) return
    const next = snap(saved)
    setBaseline(next)
    baselineRef.current = next
    failedRef.current = null
    setSaveError(null)
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
  }, [resetKey])

  useEffect(
    () => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      }
    },
    [],
  )

  return { dirty, phase, markSaved, markDirty, setPhase, valueRef, saveError, retryAutosave }
}
