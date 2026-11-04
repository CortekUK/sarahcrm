'use client'

import { SiteForm, type FieldDef } from '@/components/website/forms/SiteForm'
import { INVESTOR_CLASSIFICATIONS, INVESTOR_SELF_CERT_TEXT } from './content'

// The three PITCH forms (brief Forms table). Client-side because the field
// configs carry functions / JSX. All go through /api/enquiries/intake →
// sarah@ with their CRM source tag.

const CITIES = ['London', 'Manchester', 'Either'] as const

const FOUNDER_FIELDS: FieldDef[] = [
  { type: 'heading', name: 'h_company', label: 'Your company' },
  { type: 'text', name: 'company', label: 'Company name', required: true, half: true },
  { type: 'text', name: 'position', label: 'Your role', required: true, half: true },
  {
    type: 'check',
    name: 'uk_registered',
    label: 'UK-registered company',
    required: true,
    text: 'My company is registered in the UK.',
  },
  { type: 'text', name: 'company_number', label: 'Companies House number', half: true },
  { type: 'url', name: 'company_website', label: 'Company website', half: true, placeholder: 'https://' },
  {
    type: 'select',
    name: 'stage',
    label: 'Stage',
    required: true,
    half: true,
    options: ['Pre-revenue', 'Pre-seed', 'Seed', 'Growth stage'],
  },
  { type: 'text', name: 'sector', label: 'Sector', required: true, half: true },
  { type: 'heading', name: 'h_raise', label: 'Your raise' },
  {
    type: 'text',
    name: 'raise_amount',
    label: 'How much are you raising?',
    required: true,
    hint: 'Typical raise £40k to £1.5m.',
  },
  { type: 'textarea', name: 'use_of_funds', label: 'Use of funds', required: true, rows: 3 },
  {
    type: 'select',
    name: 'seis_eis_status',
    label: 'SEIS / EIS status',
    required: true,
    half: true,
    options: ['SEIS eligible', 'EIS eligible', 'SEIS and EIS eligible', 'Not eligible', 'Not sure'],
  },
  {
    type: 'toggle',
    name: 'advance_assurance',
    label: 'SEIS/EIS Advance Assurance',
    half: true,
    options: ['Yes', 'Applied', 'No'],
  },
  { type: 'heading', name: 'h_docs', label: 'Your documents' },
  {
    type: 'note',
    name: 'n_docs',
    text: 'Files are stored privately and only seen by the PITCH team. PDF, PowerPoint, Excel or Word, up to 20MB each.',
  },
  { type: 'file', name: 'deck', label: 'Pitch deck', slot: 'pitch-deck', required: true },
  { type: 'file', name: 'financials', label: 'Financials and forecasts', slot: 'pitch-financials' },
  { type: 'file', name: 'cap_table', label: 'Current cap table', slot: 'pitch-cap-table' },
  { type: 'heading', name: 'h_event', label: 'Your event' },
  { type: 'choice', name: 'preferred_city', label: 'Preferred city', required: true, options: CITIES },
  { type: 'textarea', name: 'message', label: 'Anything else we should know', rows: 3 },
  { type: 'text', name: 'heard_about', label: 'How did you hear about PITCH?' },
]

export function FounderApplicationForm() {
  return (
    <SiteForm
      source="Web – PITCH Founder"
      fields={FOUNDER_FIELDS}
      phoneRequired
      submitLabel="Apply for a place"
      thankYou={{
        title: 'Your application has reached us.',
        nextStep: {
          text: 'While we review it, see what’s coming up.',
          label: 'The events calendar',
          href: '/events',
        },
      }}
    />
  )
}

const INVESTOR_FIELDS: FieldDef[] = [
  {
    type: 'select',
    name: 'investor_profile',
    label: 'Investor profile',
    required: true,
    options: ['Angel or private investor', 'VC or investment fund', 'SEIS and EIS investor', 'Regional backer', 'Other'],
  },
  { type: 'text', name: 'company', label: 'Fund or company (if any)', half: true },
  {
    type: 'select',
    name: 'typical_cheque_size',
    label: 'Typical cheque size',
    required: true,
    half: true,
    options: ['Up to £25k', '£25k to £100k', '£100k to £250k', '£250k to £1m', 'Over £1m'],
  },
  { type: 'text', name: 'sectors', label: 'Preferred sectors', required: true },
  {
    type: 'choice',
    name: 'stage',
    label: 'Stage',
    multiple: true,
    required: true,
    options: ['Pre-revenue', 'Pre-seed', 'Seed', 'Growth stage'],
    columns: 4,
  },
  {
    type: 'choice',
    name: 'structure',
    label: 'Structure',
    multiple: true,
    options: ['Equity', 'SEIS', 'EIS', 'Convertible', 'Debt'],
    columns: 3,
  },
  { type: 'choice', name: 'preferred_city', label: 'Preferred city', required: true, options: CITIES },
  {
    type: 'toggle',
    name: 'join_as',
    label: 'Join',
    options: ['Per event', 'Annual Investor Panel member'],
  },
  {
    type: 'select',
    name: 'investor_classification',
    label: 'Investor classification',
    required: true,
    options: INVESTOR_CLASSIFICATIONS,
  },
  {
    type: 'check',
    name: 'self_certification',
    label: 'Self-certification',
    required: true,
    text: INVESTOR_SELF_CERT_TEXT,
  },
]

export function InvestorApplicationForm() {
  return (
    <SiteForm
      source="Web – PITCH Investor"
      fields={INVESTOR_FIELDS}
      submitLabel="Apply to the Investor Panel"
      thankYou={{
        title: 'Your application has reached us.',
        nextStep: { label: 'The events calendar', href: '/events' },
      }}
    />
  )
}

/** Shown instead of the Investor Panel application until Myerson signs off. */
export function InvestorInterestForm() {
  return (
    <SiteForm
      source="Web – PITCH Investor"
      context={{ request: 'Register interest — Investor Panel (applications not yet open)' }}
      fields={[
        { type: 'text', name: 'company', label: 'Fund or company (if any)' },
        { type: 'textarea', name: 'message', label: 'Anything you’d like us to know', rows: 3 },
      ]}
      submitLabel="Register interest"
      thankYou={{
        title: 'You’re on the list.',
        body: 'We’ll let you know personally as soon as Investor Panel applications open.',
        nextStep: { label: 'The events calendar', href: '/events' },
      }}
    />
  )
}

const PARTNER_FIELDS: FieldDef[] = [
  { type: 'text', name: 'company', label: 'Company', required: true, half: true },
  { type: 'text', name: 'position', label: 'Your role', half: true },
  {
    type: 'choice',
    name: 'tier_of_interest',
    label: 'Tier of interest',
    required: true,
    columns: 2,
    options: ['Headline Partner', 'Co-Partner', 'Supporting Partner', 'Series Headline Partner', 'Podcast partnership'],
  },
  {
    type: 'select',
    name: 'budget',
    label: 'Budget',
    options: ['Up to £5,000', '£5,000 to £10,000', '£10,000 to £25,000', '£25,000 to £100,000', '£100,000+'],
    hint: 'All prices + VAT.',
  },
  { type: 'textarea', name: 'message', label: 'Message', rows: 4 },
]

export function PitchPartnerForm() {
  return (
    <SiteForm
      source="Web – PITCH Sponsor"
      fields={PARTNER_FIELDS}
      submitLabel="Enquire about partnership"
      thankYou={{
        title: 'Your enquiry has reached Sarah.',
        nextStep: { label: 'See all sponsorship', href: '/partner/sponsorship' },
      }}
    />
  )
}
