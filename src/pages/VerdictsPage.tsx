import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { EffectsEditor } from '../components/EffectsEditor'
import { MasterDetailList } from '../components/MasterDetailList'
import { RichTextEditor } from '../components/RichTextEditor'
import {
  deleteVerdictTurn,
  saveIndicators,
  saveVerdictTurn,
} from '../lib/drive'
import {
  applyEffectsToIndicators,
  committedOrderIds,
  isVerdictLinked,
  linkedOrderIds,
  mergeCreatedMetrics,
  normalizeMetrics,
} from '../schema/metrics'
import {
  emptyOrdersTurn,
  emptyVerdictTurn,
  newId,
  nowIso,
  type VerdictTurn,
} from '../schema/province'
import { Onboarding } from './Onboarding'

export function VerdictsPage() {
  const { binding, data, setData, ensureToken, busy } = useCabinet()
  const [searchParams] = useSearchParams()
  const [turn, setTurn] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const q = searchParams.get('turn')
    if (q == null || q === '') return
    const n = Number(q)
    if (Number.isFinite(n) && n >= 0) setTurn(n)
  }, [searchParams])

  const turnList = useMemo(() => {
    if (!data) return [] as number[]
    const set = new Set<number>()
    for (const o of data.orders) set.add(o.turn)
    for (const v of data.verdicts) set.add(v.turn)
    if (turn) set.add(turn)
    if (data.meta.currentTurn) set.add(data.meta.currentTurn)
    return [...set].sort((a, b) => b - a)
  }, [data, turn])

  const currentTurn = turn || data?.meta.currentTurn || turnList[0] || 1

  if (!binding || !data) return <Onboarding />

  const metrics = normalizeMetrics(data.indicators.metrics)
  const ordersPack =
    data.orders.find((o) => o.turn === currentTurn) ??
    emptyOrdersTurn(currentTurn)
  const pack: VerdictTurn =
    data.verdicts.find((v) => v.turn === currentTurn) ??
    emptyVerdictTurn(currentTurn)
  const alreadyCommitted = committedOrderIds(data.verdicts)
  const takenElsewhere = linkedOrderIds(data.verdicts, currentTurn)
  const selectableOrders = ordersPack.items.filter(
    (item) =>
      !alreadyCommitted.has(item.id) && !takenElsewhere.has(item.id),
  )

  const setPack = (next: VerdictTurn) => {
    const others = data.verdicts.filter((v) => v.turn !== next.turn)
    setData({
      ...data,
      verdicts: [...others, next].sort((a, b) => b.turn - a.turn),
    })
  }

  const toggleOrder = (orderId: string) => {
    if (alreadyCommitted.has(orderId) || takenElsewhere.has(orderId)) return
    const has = pack.orderIds.includes(orderId)
    setPack({
      ...pack,
      orderIds: has
        ? pack.orderIds.filter((id) => id !== orderId)
        : [...pack.orderIds, orderId],
    })
  }

  const selectedOrders = ordersPack.items.filter((item) =>
    pack.orderIds.includes(item.id),
  )
  const canCommit =
    pack.orderIds.every(
      (id) => !alreadyCommitted.has(id) && !takenElsewhere.has(id),
    ) &&
    (pack.effects.length > 0 ||
      selectedOrders.some(
        (item) =>
          (item.effects ?? []).length > 0 ||
          (item.createdMetrics ?? []).length > 0,
      ))

  const saveDraft = async () => {
    setErr(null)
    const token = await ensureToken()
    const next = { ...pack, turn: currentTurn, updatedAt: nowIso() }
    await saveVerdictTurn(token, binding.folderId, next)
    setPack(next)
    setMsg(`Черновик вердикта хода ${currentTurn} сохранён`)
  }

  const commit = async () => {
    setErr(null)
    setMsg(null)
    if (!canCommit) {
      setErr('Нечего фиксировать или выбран уже зафиксированный приказ')
      return
    }

    const orderItems = ordersPack.items.filter((item) =>
      pack.orderIds.includes(item.id),
    )
    const at = nowIso()
    let indicators = data.indicators

    for (const item of orderItems) {
      const created = item.createdMetrics ?? []
      const effects = item.effects ?? []
      if (!created.length && !effects.length) continue

      indicators = mergeCreatedMetrics(indicators, created, {
        kind: 'order',
        title: 'Появился показатель',
        turn: currentTurn,
        orderId: item.id,
        orderTurn: currentTurn,
        at,
      })
      if (effects.length) {
        indicators = applyEffectsToIndicators(indicators, effects, {
          kind: 'order',
          title: item.title || 'Приказ',
          turn: currentTurn,
          orderId: item.id,
          orderTurn: currentTurn,
          at,
        })
      }
    }

    if (pack.effects.length > 0) {
      indicators = applyEffectsToIndicators(indicators, pack.effects, {
        kind: 'verdict',
        title: `Вердикт хода ${currentTurn}`,
        turn: currentTurn,
        verdictTurn: currentTurn,
        at,
      })
    }

    const next: VerdictTurn = {
      ...pack,
      turn: currentTurn,
      effects: [],
      orderIds: [],
      commits: [
        ...pack.commits,
        {
          id: newId('vcm'),
          at,
          orderIds: [...pack.orderIds],
          effects: [...pack.effects],
        },
      ],
      updatedAt: at,
    }

    const token = await ensureToken()
    await saveIndicators(token, binding.folderId, indicators)
    await saveVerdictTurn(token, binding.folderId, next)
    setData({
      ...data,
      indicators,
      verdicts: [
        ...data.verdicts.filter((v) => v.turn !== currentTurn),
        next,
      ].sort((a, b) => b.turn - a.turn),
    })
    setMsg(`Вердикт хода ${currentTurn} зафиксирован`)
  }

  const createTurn = () => {
    const nextTurn =
      Math.max(0, ...turnList, data.meta.currentTurn || 0, turn || 0) + 1
    setTurn(nextTurn)
    if (!data.verdicts.some((v) => v.turn === nextTurn)) {
      setPack(emptyVerdictTurn(nextTurn))
    }
    setErr(null)
  }

  const deleteCurrent = async () => {
    setErr(null)
    setMsg(null)
    if (isVerdictLinked(pack)) {
      setErr('Вердикт нельзя удалить: есть фиксации приказов/эффектов')
      return
    }
    const hasDraft =
      Boolean(pack.body?.trim()) ||
      pack.orderIds.length > 0 ||
      pack.effects.length > 0 ||
      data.verdicts.some((v) => v.turn === currentTurn)
    if (!hasDraft && !data.verdicts.some((v) => v.turn === currentTurn)) {
      setErr('Нечего удалять')
      return
    }
    try {
      const token = await ensureToken()
      await deleteVerdictTurn(token, binding.folderId, currentTurn)
      const nextVerdicts = data.verdicts.filter((v) => v.turn !== currentTurn)
      setData({ ...data, verdicts: nextVerdicts })
      const nextTurn =
        nextVerdicts[0]?.turn ??
        data.orders[0]?.turn ??
        data.meta.currentTurn ??
        1
      setTurn(nextTurn)
      setMsg(`Вердикт хода ${currentTurn} удалён`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка удаления')
    }
  }

  const turnItems = turnList.map((t) => ({ id: String(t) }))
  const canDeleteVerdict = !isVerdictLinked(pack)

  return (
    <div className="page page-wide">
      <div className="panel">
        <h2>Вердикты</h2>

        <MasterDetailList
          items={turnItems}
          selectedId={String(currentTurn)}
          onSelect={(id) => setTurn(Number(id) || 0)}
          onCreate={createTurn}
          createLabel="Новый вердикт"
          emptyLabel="Пока нет ходов"
          renderItemLabel={(id) => `Ход ${id}`}
        >
          <div className="stack">
            <div className="field">
              <label>Ход</label>
              <input
                type="number"
                value={currentTurn}
                onChange={(e) => setTurn(Number(e.target.value) || 0)}
              />
            </div>
            <div className="field">
              <label>Текст вердикта</label>
              <RichTextEditor
                value={pack.body}
                onChange={(body) => setPack({ ...pack, body })}
                folderId={binding.folderId}
                getAccessToken={ensureToken}
              />
            </div>

            <div className="stack">
              <h3>Подкрепить приказы хода</h3>
              {selectableOrders.length === 0 ? (
                <p className="muted">
                  {ordersPack.items.length === 0
                    ? 'В этом ходе ещё нет малых приказов'
                    : 'Нет свободных приказов — занятые другими вердиктами скрыты'}
                </p>
              ) : (
                <ul className="verdict-order-list">
                  {selectableOrders.map((item) => {
                    const checked = pack.orderIds.includes(item.id)
                    return (
                      <li key={item.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOrder(item.id)}
                          />{' '}
                          {item.title || 'Без названия'}
                          {(item.createdMetrics ?? []).length
                            ? ` · +${(item.createdMetrics ?? []).length} показ.`
                            : null}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <EffectsEditor
              effects={pack.effects}
              metrics={metrics}
              onChange={(effects) => setPack({ ...pack, effects })}
            />

            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void saveDraft()}
              >
                Сохранить черновик
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !canCommit}
                onClick={() => void commit()}
              >
                Зафиксировать
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || !canDeleteVerdict}
                title={
                  canDeleteVerdict
                    ? undefined
                    : 'Есть фиксации — удаление недоступно'
                }
                onClick={() => void deleteCurrent()}
              >
                Удалить вердикт
              </button>
            </div>
            {msg ? <p className="ok">{msg}</p> : null}
            {err ? <p className="error">{err}</p> : null}

            {pack.commits.length > 0 ? (
              <div className="stack" style={{ marginTop: '1rem' }}>
                <h3>Фиксации</h3>
                <ul className="muted">
                  {pack.commits.map((c) => (
                    <li key={c.id}>
                      {c.at.slice(0, 19).replace('T', ' ')}: приказов{' '}
                      {c.orderIds.length}, дельт вердикта {c.effects.length}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </MasterDetailList>
      </div>
    </div>
  )
}
