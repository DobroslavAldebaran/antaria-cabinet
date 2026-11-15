// A deterministic React hook host for lifecycle tests without a DOM dependency.
// Effects run after each render, with the same dependency/cleanup ordering as React.
export function createHookHarness(hook, initialProps) {
  const slots = []
  let props = initialProps
  let cursor = 0
  let queued = false
  let rendering = false
  let mounted = true
  let result
  let effects = []
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const requestRender = () => {
    if (!mounted) return
    queued = true
    queueMicrotask(flush)
  }
  const runtime = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) {
        const slot = { value: typeof initial === 'function' ? initial() : initial }
        slot.set = (next) => {
          const value = typeof next === 'function' ? next(slot.value) : next
          if (Object.is(slot.value, value) || !mounted) return
          slot.value = value
          requestRender()
        }
        slots[index] = slot
      }
      return [slots[index].value, slots[index].set]
    },
    useRef(initial) {
      const index = cursor++
      slots[index] ??= { current: initial }
      return slots[index]
    },
    useEffect(effect, deps) {
      const index = cursor++
      const previous = slots[index]
      if (previous && sameDeps(previous.deps, deps)) return
      slots[index] = { deps, cleanup: previous?.cleanup }
      effects.push(() => {
        slots[index].cleanup?.()
        slots[index].cleanup = effect()
      })
    },
    useCallback(callback, deps) {
      const index = cursor++
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { deps, callback }
      return slots[index].callback
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { deps, value: factory() }
      return slots[index].value
    },
  }
  function flush() {
    if (!mounted || rendering) return
    rendering = true
    let renders = 0
    try {
      while (queued) {
        if (++renders > 50) throw new Error('Hook exceeded 50 renders')
        queued = false
        cursor = 0
        effects = []
        globalThis.__draftHookRuntime = runtime
        result = hook(props)
        effects.forEach((effect) => effect())
      }
    } finally {
      rendering = false
    }
  }
  const harness = {
    get result() { return result },
    render(patch = {}) {
      props = { ...props, ...patch }
      queued = true
      flush()
    },
    async settle() {
      // Flush promise continuations and the state updates they schedule.
      for (let i = 0; i < 8; i++) { await Promise.resolve(); flush() }
    },
    unmount() {
      mounted = false
      slots.forEach((slot) => slot.cleanup?.())
    },
  }
  harness.render()
  return harness
}

export function createVirtualBrowser() {
  const original = { window: globalThis.window, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  const jobs = new Map()
  const events = new EventTarget()
  let nextId = 0
  let now = 0
  const setTimeout = (callback, delay = 0, ...args) => {
    const id = ++nextId
    jobs.set(id, { at: now + Number(delay), callback: () => callback(...args) })
    return id
  }
  const clearTimeout = (id) => jobs.delete(id)
  globalThis.setTimeout = setTimeout
  globalThis.clearTimeout = clearTimeout
  globalThis.window = {
    setTimeout, clearTimeout,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  }
  return {
    restore() {
      globalThis.window = original.window
      globalThis.setTimeout = original.setTimeout
      globalThis.clearTimeout = original.clearTimeout
      delete globalThis.__draftHookRuntime
    },
    async advance(ms, harness) {
      const until = now + ms
      let callbacks = 0
      while (true) {
        const next = [...jobs.entries()].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        if (++callbacks > 100) throw new Error('Timer loop exceeded 100 callbacks')
        const [id, job] = next
        now = job.at
        jobs.delete(id)
        job.callback()
        await harness.settle()
      }
      now = until
      await harness.settle()
    },
    dispatch(type) { events.dispatchEvent(new Event(type)) },
  }
}
