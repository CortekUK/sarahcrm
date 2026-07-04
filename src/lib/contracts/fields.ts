// Contract signature fields — the DocuSign "variables" an admin drops into a
// contract at their cursor. Unlike member merge tags ({{first_name}} …, which
// we substitute with real data before sending), these become interactive
// DocuSign tabs the SIGNER fills in.
//
// Author-time the admin inserts a token like [[signature]] wherever they want
// the field. At send time we swap each token for a hidden anchor string (white,
// 1px — invisible in the PDF but present in the text layer) and attach the
// matching DocuSign tab via `anchorString`. DocuSign then drops the real field
// exactly where the token was.

export type ContractFieldTab = 'signHere' | 'initialHere' | 'dateSigned' | 'fullName'

export interface ContractField {
  label: string
  token: string // what the admin inserts in the editor
  anchor: string // hidden anchor text placed in the document
  tab: ContractFieldTab // the DocuSign tab type
  description: string
}

// Only the four fields the client asked for: signature, name, initials, date.
export const CONTRACT_FIELDS: ContractField[] = [
  {
    label: 'Signature',
    token: '[[signature]]',
    anchor: '\\ds_sig\\',
    tab: 'signHere',
    description: 'Where the member signs',
  },
  {
    label: 'Initials',
    token: '[[initials]]',
    anchor: '\\ds_init\\',
    tab: 'initialHere',
    description: 'The member initials here',
  },
  {
    label: 'Printed name',
    token: '[[signed_name]]',
    anchor: '\\ds_name\\',
    tab: 'fullName',
    description: "Auto-filled with the signer's full name",
  },
  {
    label: 'Date signed',
    token: '[[date_signed]]',
    anchor: '\\ds_date\\',
    tab: 'dateSigned',
    description: 'Auto-filled with the date they sign',
  },
]

// Escape a token for use inside a RegExp.
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Wraps an anchor string in an invisible span so it sits in the document's
// text layer (anchorable) without being visible to the signer.
function hiddenAnchor(anchor: string): string {
  return `<span style="color:#ffffff;font-size:1px;line-height:1px;">${anchor}</span>`
}

export interface AnchorInjectionResult {
  html: string
  // Which field tabs are actually present in the document (so we only attach
  // those tabs). `signHere` presence is what makes a document signable.
  presentTabs: ContractFieldTab[]
}

// Replaces every [[field]] token in the HTML with its hidden anchor and reports
// which field types were found. If no signature field was placed, appends a
// default signature + date line so the document is always signable.
export function injectDocuSignAnchors(html: string): AnchorInjectionResult {
  let out = html
  const present = new Set<ContractFieldTab>()

  for (const field of CONTRACT_FIELDS) {
    const re = new RegExp(escapeRe(field.token), 'g')
    if (re.test(out)) {
      present.add(field.tab)
      out = out.replace(new RegExp(escapeRe(field.token), 'g'), hiddenAnchor(field.anchor))
    }
  }

  // Safety net: a document with no signature field can be "completed" without
  // anyone actually signing. If the admin didn't place one, append a standard
  // signature + date block before the end of the document.
  if (!present.has('signHere')) {
    const sig = CONTRACT_FIELDS.find((f) => f.tab === 'signHere')!
    const date = CONTRACT_FIELDS.find((f) => f.tab === 'dateSigned')!
    present.add('signHere')
    present.add('dateSigned')
    const block = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;">
        <tr>
          <td style="padding:8px 24px 0 24px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#3A3530;">
            <div style="margin-bottom:26px;">Signature: ${hiddenAnchor(sig.anchor)}<span style="display:inline-block;border-bottom:1px solid #2C2825;min-width:220px;">&nbsp;</span></div>
            <div>Date: ${hiddenAnchor(date.anchor)}<span style="display:inline-block;border-bottom:1px solid #2C2825;min-width:160px;">&nbsp;</span></div>
          </td>
        </tr>
      </table>`
    // Insert before a closing </body> if present, else append.
    if (/<\/body>/i.test(out)) {
      out = out.replace(/<\/body>/i, `${block}</body>`)
    } else {
      out = `${out}${block}`
    }
  }

  return { html: out, presentTabs: Array.from(present) }
}
