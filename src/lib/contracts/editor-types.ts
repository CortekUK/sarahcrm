// Settings for the contract builder — a slimmed copy of the email template
// settings. Contracts don't have a subject/preheader/from-name (they aren't
// emails); they carry a name, a document type, and the shared theme knobs.

import type { TemplateTheme } from '@/lib/templates/editor-types'

export interface ContractSettings {
  name: string
  docType: string
  theme?: TemplateTheme
}

export const defaultContractSettings: ContractSettings = {
  name: 'Untitled contract',
  docType: 'contract',
}

export const CONTRACT_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'membership_agreement', label: 'Membership agreement' },
  { value: 'nda', label: 'NDA' },
  { value: 'introducer_agreement', label: 'Introducer / commission agreement' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
]
