import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { CabinetData } from './drive'
import { orderBodyParagraphs } from './orderBody'
import { findMetric, fixedExpenseEffect, formatMetricValue, isKnownMetricId, METRIC_DEFS, metricDisplayUnit, metricLabel } from '../schema/metrics'
import type { Effect, Metric, OrderItem } from '../schema/province'
import { resolveResponsibleLabel } from '../schema/responsible'

const amount = new Intl.NumberFormat('ru', { useGrouping: false, maximumSignificantDigits: 21 })

function effectText(effect: Effect, metrics: Metric[]): string {
  const id = effect.metricId
  const label = id === 'budget' ? 'Бюджет' : metricLabel(metrics, id)
  const metric = findMetric(metrics, id) ?? { id, unit: undefined }
  const unit = metricDisplayUnit(metric)
  const ratio = metric.unit === '%' || (isKnownMetricId(id) && METRIC_DEFS[id].kind === 'ratio')
  const sign = effect.delta < 0 ? 'расход ' : effect.delta > 0 ? '+' : ''
  const magnitude = Math.abs(effect.delta)
  const value = sign + (ratio ? formatMetricValue({ ...metric, value: magnitude }) : amount.format(magnitude))
  return [label, value, unit].filter(Boolean).join(' ') + (effect.note?.trim() ? ' — ' + effect.note.trim() : '')
}

// Старые приказы могли хранить бюджет отдельной строкой, включая единицу измерения.
function budgetText(budget: string): string {
  const match = budget.trim().match(/^[-−]\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(.*)$/u)
  if (!match) return budget.trim()
  return 'расход ' + match[1].replace(/\s/g, '') + ' ' + (match[2].trim() || 'трон')
}

function field(label: string, text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: label + ' ', bold: true }), new TextRun(text)] })
}

export async function makeOrdersDocx(
  title: string, orders: OrderItem[], data: CabinetData, getToken: () => Promise<string>,
): Promise<Blob> {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
  if (data.meta.provinceName.trim()) children.push(new Paragraph(data.meta.provinceName.trim()))
  for (const order of orders) {
    children.push(new Paragraph({ text: order.title.trim() || 'Без названия', heading: HeadingLevel.HEADING_1 }))
    if (order.goal?.trim()) children.push(field('Цель:', order.goal.trim()))
    if (order.responsible?.trim()) {
      const { label, missing } = resolveResponsibleLabel(order.responsible,
        data.ministries.items, data.characters.items, data.responsibleOthers.items)
      children.push(field('Ответственный:', missing ? order.responsible : label))
    }
    children.push(...await orderBodyParagraphs(order.body, getToken))
    if (order.budget?.trim()) children.push(field('Бюджет', budgetText(order.budget)))
    const expense = fixedExpenseEffect(order)
    if (expense) {
      const metrics = [...data.indicators.metrics, ...order.createdMetrics]
      children.push(new Paragraph(effectText(expense, metrics)))
    }
    if (order.effects.length) {
      const metrics = [...data.indicators.metrics, ...order.createdMetrics]
      children.push(new Paragraph({ children: [new TextRun({ text: 'Изменения показателей', bold: true })], keepNext: true }))
      for (const effect of order.effects) children.push(new Paragraph(effectText(effect, metrics)))
    }
    if (order.expectation?.trim()) children.push(field('Ожидаемый результат:', order.expectation.trim()))
  }
  const font = 'DejaVu Serif'
  return Packer.toBlob(new Document({
    title, creator: 'Antaria Cabinet',
    styles: { default: {
      document: { run: { font, size: 23, color: '181818' }, paragraph: { spacing: { after: 110, line: 280 } } },
      title: { run: { font, size: 40, bold: true, color: '161616' }, paragraph: { keepNext: true } },
      heading1: { run: { font, size: 30, bold: true, color: '181818' },
        paragraph: { keepNext: true, spacing: { before: 240, after: 110 } } },
    } },
    sections: [{ properties: { page: {
      size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 },
    } }, children }],
  }))
}
