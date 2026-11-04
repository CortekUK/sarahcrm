// Sanitiser for HTML injected into the ADMIN editing canvas (email template
// builder + contract builder). Block HTML — especially the "Custom HTML" block
// and AI-written text — is user/AI controlled and is rendered straight into the
// CRM page, so it must never carry script: on* handlers, javascript: URIs,
// <script>, <iframe>, forms etc. are stripped (same library as the inbox and
// SOP sanitisers). Layout markup (tables, inline styles, classes, images) is
// kept so the canvas still looks like the email. The preview panes render in a
// sandboxed iframe separately.

import DOMPurify from 'isomorphic-dompurify'

export function sanitizeCanvasHtml(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
      'form', 'input', 'button', 'select', 'textarea', 'option',
      'link', 'meta', 'base', 'style', 'svg', 'math', 'noscript', 'template',
    ],
    FORBID_ATTR: ['srcdoc', 'formaction', 'action', 'ping'],
    ALLOW_DATA_ATTR: false,
  })
}
