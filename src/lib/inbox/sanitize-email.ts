// Email-specific HTML sanitizer. Broader than sanitizeSopHtml (SOP bodies are
// simple rich text; real emails ship tables, inline styles, images, fonts).
// Output is still rendered inside a sandboxed iframe by the UI — belt & braces.
//
// isomorphic-dompurify drops javascript:/vbscript: URIs and unknown protocols on
// its own; ALLOW_DATA_ATTR:false removes data-* attributes. We additionally hook
// every anchor to open in a new tab with a safe rel.

import DOMPurify from 'isomorphic-dompurify'

let hookInstalled = false

function installLinkHook(): void {
  if (hookInstalled) return
  hookInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Force external links to open safely (no window.opener leakage).
    if ('tagName' in node && (node as Element).tagName === 'A') {
      const el = node as Element
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return ''
  installLinkHook()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'p', 'div', 'span', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'img', 'blockquote', 'pre', 'code',
      'strong', 'b', 'em', 'i', 'u',
      'font', 'center', 'small', 'sub', 'sup',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height',
      'align', 'valign', 'colspan', 'rowspan', 'style',
      'bgcolor', 'color', 'target', 'rel',
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta', 'style'],
    // on* handlers, javascript:/vbscript: URIs and unknown protocols are dropped
    // by DOMPurify; ALLOW_DATA_ATTR:false additionally removes data-* attributes.
    ALLOW_DATA_ATTR: false,
  })
}
