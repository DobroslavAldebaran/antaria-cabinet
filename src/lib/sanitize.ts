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
