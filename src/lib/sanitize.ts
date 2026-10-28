import DOMPurify from 'dompurify'

/** Strip HTML tags and control characters for safe plain-text display. */
export function sanitizeText(input: string, maxLen = 50_000): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .slice(0, maxLen)
}

export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return undefined
  return trimmed.slice(0, 2000)
}

const HTML_ALLOW = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'h1',
    'h2',
    'h3',
    'blockquote',
    'code',
    'pre',
    'span',
  ],
  ALLOWED_ATTR: [
    'href',
    'target',
    'rel',
    'src',
    'alt',
    'title',
    'width',
    'height',
    'class',
  ],
  ALLOW_DATA_ATTR: false,
}

/** Sanitize rich-text HTML for TipTap load / display. */
export function sanitizeHtml(input: string, maxLen = 200_000): string {
  const trimmed = input.slice(0, maxLen)
  return DOMPurify.sanitize(trimmed, HTML_ALLOW)
}
