import type { EditorBlock } from '@/lib/templates/editor-types'

// Keep only well-formed blocks (an object `content`, recursively for
// columns/conditional children) so a half-built block can't crash the
// renderer (e.g. "Cannot read properties of undefined (reading 'fontSize')").
export function cleanBlocks(input: unknown): EditorBlock[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (b): b is EditorBlock =>
        !!b &&
        typeof b === 'object' &&
        typeof (b as EditorBlock).type === 'string' &&
        !!(b as EditorBlock).content &&
        typeof (b as EditorBlock).content === 'object',
    )
    .map((b) => {
      const c = { ...b.content }
      for (const key of ['leftBlocks', 'rightBlocks', 'centerBlocks', 'children']) {
        if (Array.isArray(c[key])) c[key] = cleanBlocks(c[key])
      }
      return { ...b, content: c }
    })
}
