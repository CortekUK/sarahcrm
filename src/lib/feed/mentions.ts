// @mention helpers shared by the feed inputs and renderers.
//
// Stored format (what the server saves and validates): `@[Display Name](profile-uuid)`.
// In inputs we show plain `@Display Name` and keep a side list of
// { id, name } picks; on submit `toTokens` turns every `@Name` that matches a
// pick back into its token. Editing an existing post starts from
// `fromTokens`, so the round-trip is lossless. If the user mangles a name it
// simply stays plain text (the server would not link it anyway).

export interface MentionPick {
  id: string
  name: string
}

const TOKEN_RE = /@\[([^\]\n]{1,80})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi

/** Names can't contain the token delimiters or line breaks. */
export const cleanMentionName = (name: string) => name.replace(/[[\]()\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Member'

/** Stored body → input text + picks. */
export function fromTokens(body: string): { text: string; picks: MentionPick[] } {
  const picks: MentionPick[] = []
  const text = body.replace(TOKEN_RE, (_all, name: string, id: string) => {
    if (!picks.some((p) => p.id === id.toLowerCase())) picks.push({ id: id.toLowerCase(), name })
    return `@${name}`
  })
  return { text, picks }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Input text + picks → stored body. Longest names first so "Ann Lee" beats "Ann". */
export function toTokens(text: string, picks: MentionPick[]): string {
  if (!picks.length) return text
  const byName = new Map<string, string>()
  for (const p of [...picks].sort((a, b) => b.name.length - a.name.length)) if (!byName.has(p.name)) byName.set(p.name, p.id)
  const names = [...byName.keys()].map(escapeRe)
  // `@Name` not followed by another name character (so "@Ann Leeds" ≠ "@Ann Lee").
  const re = new RegExp(`@(${names.join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
  return text.replace(re, (_all, name: string) => `@[${name}](${byName.get(name)})`)
}

export type RichSegment = { type: 'text'; text: string } | { type: 'mention'; name: string; id: string }

/** Split a stored body into text and mention segments for rendering. */
export function segments(body: string): RichSegment[] {
  const out: RichSegment[] = []
  let last = 0
  for (const m of body.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ type: 'text', text: body.slice(last, at) })
    out.push({ type: 'mention', name: m[1], id: m[2].toLowerCase() })
    last = at + m[0].length
  }
  if (last < body.length) out.push({ type: 'text', text: body.slice(last) })
  return out
}

/** Plain text (`@Name`) — for previews. */
export const plainText = (body: string) => body.replace(TOKEN_RE, (_a, name: string) => `@${name}`)

/**
 * The `@query` being typed at the caret, if any: `@` at the start or after
 * whitespace, followed by up to 30 non-space characters.
 */
export function activeQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(before)
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

/**
 * Pixel position of the caret inside a textarea (relative to the textarea's
 * box), via a hidden mirror div with the same text metrics.
 */
export function caretPosition(ta: HTMLTextAreaElement, index: number): { left: number; top: number; height: number } {
  const style = window.getComputedStyle(ta)
  const div = document.createElement('div')
  const props = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
    'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'wordSpacing', 'textIndent', 'tabSize',
  ] as const
  for (const p of props) div.style[p] = style[p]
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.overflowWrap = 'break-word'
  div.style.top = '0'
  div.style.left = '-9999px'
  div.textContent = ta.value.slice(0, index)
  const span = document.createElement('span')
  span.textContent = ta.value.slice(index) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4
  const pos = { left: span.offsetLeft, top: span.offsetTop - ta.scrollTop, height: lineHeight }
  document.body.removeChild(div)
  return pos
}
