import {
  ExternalHyperlink, ImageRun, Paragraph, TextRun,
  type IRunOptions, type ParagraphChild,
} from 'docx'
import { sanitizeHtml, sanitizeUrl } from './sanitize'
import { readMediaBlob } from './drive'

type GetToken = () => Promise<string>

async function imageRun(element: Element, getToken: GetToken): Promise<ParagraphChild> {
  const alt = element.getAttribute('alt')?.trim() || 'Изображение'
  const src = sanitizeUrl(element.getAttribute('src') ?? undefined)
  if (!src) return new TextRun(alt)
  try {
    const url = new URL(src)
    const fileId = url.searchParams.get('id')
    let blob: Blob
    if (url.hostname === 'drive.google.com' && url.pathname === '/uc' && fileId) {
      blob = await readMediaBlob(await getToken(), fileId)
    } else {
      const response = await fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) throw new Error('Изображение недоступно')
      blob = await response.blob()
    }

    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, 584 / bitmap.width, 760 / bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    try {
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
    } finally {
      bitmap.close()
    }
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error()), 'image/png')
    })
    return new ImageRun({ type: 'png', data: await png.arrayBuffer(), transformation: { width, height },
      altText: { title: alt, name: alt, description: alt } })
  } catch {
    return new ExternalHyperlink({ link: src, children: [new TextRun({ text: alt, style: 'Hyperlink' })] })
  }
}

const marks: Record<string, IRunOptions> = {
  B: { bold: true }, STRONG: { bold: true }, I: { italics: true }, EM: { italics: true },
  U: { underline: {} }, S: { strike: true }, CODE: { font: 'Consolas' },
}

async function inline(node: Node, style: IRunOptions, getToken: GetToken): Promise<ParagraphChild[]> {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').split(/\r?\n/).map((text, i) =>
      new TextRun({ ...style, text, ...(i ? { break: 1 } : {}) }))
  }
  if (!(node instanceof Element)) return []
  if (node.tagName === 'IMG') return [await imageRun(node, getToken)]
  if (node.tagName === 'BR') return [new TextRun({ break: 1 })]
  const link = node.tagName === 'A' && sanitizeUrl(node.getAttribute('href') ?? undefined)
  const next = { ...style, ...marks[node.tagName], ...(link ? { style: 'Hyperlink' } : {}) }
  const children: ParagraphChild[] = []
  for (const child of Array.from(node.childNodes)) children.push(...await inline(child, next, getToken))
  return link ? [new ExternalHyperlink({ link, children })] : children
}

export async function orderBodyParagraphs(html: string, getToken: GetToken): Promise<Paragraph[]> {
  const template = document.createElement('template')
  template.innerHTML = sanitizeHtml(html)
  const paragraphs: Paragraph[] = []
  async function blocks(parent: ParentNode, depth = 0, prefix = '', style: IRunOptions = {}) {
    let runs: ParagraphChild[] = []
    const flush = () => {
      if (!runs.length) return
      if (prefix) runs.unshift(new TextRun(prefix))
      paragraphs.push(new Paragraph({ children: runs, indent: { left: depth * 280 } }))
      runs = []
      prefix = ''
    }
    for (const child of Array.from(parent.childNodes)) {
      const tag = child instanceof Element ? child.tagName : ''
      if (child instanceof Element && (tag === 'OL' || tag === 'UL')) {
        flush()
        for (const [index, li] of Array.from(child.children).entries()) {
          await blocks(li, depth + 1, tag === 'UL' ? '• ' : String(index + 1) + '. ')
        }
      } else if (child instanceof Element && /^(P|H[123]|PRE|BLOCKQUOTE)$/.test(tag)) {
        flush()
        const heading = /^H[123]$/.test(tag)
        await blocks(child, tag === 'BLOCKQUOTE' ? depth + 1 : depth, prefix,
          heading ? { bold: true, size: 26 } : style)
        prefix = ''
      } else if (tag || child.textContent?.trim() || runs.length) {
        runs.push(...await inline(child, style, getToken))
      }
    }
    flush()
  }
  await blocks(template.content)
  return paragraphs
}
