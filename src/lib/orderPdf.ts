import { Ream } from 'reamkit'
import regularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif.ttf?url'
import boldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf?url'
import italicUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif-Italic.ttf?url'
import boldItalicUrl from 'dejavu-fonts-ttf/ttf/DejaVuSerif-BoldItalic.ttf?url'

async function readFont(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Не удалось загрузить шрифт для PDF')
  return new Uint8Array(await response.arrayBuffer())
}

export async function docxToPdf(docx: Blob): Promise<Blob> {
  const [regular, bold, italic, boldItalic] = await Promise.all(
    [regularUrl, boldUrl, italicUrl, boldItalicUrl].map(readFont),
  )
  const document = Ream.parse(new Uint8Array(await docx.arrayBuffer()))
  const pdf = await document.convert('pdf', { fonts: { regular, bold, italic, boldItalic } })
  return new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })
}
