export type BlockType =
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'video'
  | 'social'
  | 'html'
  | 'columns'
  | 'conditional'
  | 'sarah_signature'
  | 'file'

export interface EditorBlock {
  id: string
  type: BlockType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: Record<string, any>
}

export type BlockContent =
  | TextBlockContent
  | ImageBlockContent
  | ButtonBlockContent
  | DividerBlockContent
  | SpacerBlockContent
  | VideoBlockContent
  | SocialBlockContent
  | HTMLBlockContent
  | ColumnsBlockContent
  | ConditionalBlockContent
  | SarahSignatureBlockContent
  | FileBlockContent

export interface TextBlockContent {
  html: string
  alignment: 'left' | 'center' | 'right'
  fontSize: 'small' | 'normal' | 'large' | 'xlarge'
  // Optional per-block font override (a CSS font stack from EMAIL_FONTS).
  // Empty / undefined means "inherit the template's default font".
  fontFamily?: string
  paddingTop: number
  paddingBottom: number
  backgroundColor?: string
}

export interface ImageBlockContent {
  src: string
  alt: string
  linkUrl?: string
  alignment: 'left' | 'center' | 'right'
  width: string // '100', '75', '50', '25', 'auto'
  paddingTop: number
  paddingBottom: number
}

export interface ButtonBlockContent {
  text: string
  url: string
  backgroundColor: string
  textColor: string
  borderRadius: number
  width: 'auto' | 'full' | '50' | '75'
  alignment: 'left' | 'center' | 'right'
  paddingTop: number
  paddingBottom: number
  paddingX?: number
  paddingY?: number
}

export interface DividerBlockContent {
  style: 'solid' | 'dashed' | 'dotted'
  color: string
  thickness: number
  width: string
  paddingTop: number
  paddingBottom: number
}

export interface SpacerBlockContent {
  height: number
}

export interface VideoBlockContent {
  url: string
  thumbnailUrl?: string
  width: number | 'full'
  alignment: 'left' | 'center' | 'right'
}

export interface SocialBlockContent {
  platforms: {
    facebook: { enabled: boolean; url: string }
    twitter: { enabled: boolean; url: string }
    instagram: { enabled: boolean; url: string }
    linkedin: { enabled: boolean; url: string }
    youtube: { enabled: boolean; url: string }
    tiktok: { enabled: boolean; url: string }
    threads: { enabled: boolean; url: string }
    flickr: { enabled: boolean; url: string }
  }
  style: 'coloured' | 'monochrome'
  alignment: 'left' | 'center' | 'right'
}

export interface HTMLBlockContent {
  code: string
}

export interface ColumnsBlockContent {
  columns: 2 | 3
  columnWidths: number[]
  gap: number
  leftBlocks: EditorBlock[]
  rightBlocks: EditorBlock[]
  centerBlocks?: EditorBlock[]
  paddingTop: number
  paddingBottom: number
}

export interface ConditionalBlockContent {
  conditionField: 'member_email' | 'member_name' | 'event_type'
  conditionOperator: 'equals' | 'not_equals' | 'contains'
  conditionValue: string
  children: EditorBlock[]
  paddingTop: number
  paddingBottom: number
}

// The Club's sender signature block. Renders the current admin's name /
// title / email / phone / website with the Sarah Restrick brand mark below.
// The legal confidentiality footer and "by Sarah Restrick" line are baked in
// and always render — branding is shipped with every email.
export interface SarahSignatureBlockContent {
  // Optional sign-off line above the name — defaults to "Warm regards,"
  showSignOff?: boolean
  signOff?: string
  showName: boolean
  showTitle: boolean
  showEmail: boolean
  showPhone: boolean
  showWebsite: boolean
  alignment: 'left' | 'center' | 'right'
  // Three independently-colourable regions:
  //   textColor             — variable details (name, title, email, phone, website)
  //   companyTextColor      — "The Club by Sarah Restrick" brand line
  //   confidentialityColor  — the confidentiality disclaimer paragraph
  textColor?: string | null
  companyTextColor?: string | null
  confidentialityColor?: string | null
  paddingTop: number
  paddingBottom: number
}

export interface FileBlockContent {
  fileName: string
  fileUrl: string
  fileSize: number
  fileType: string
  alignment: 'left' | 'center' | 'right'
  paddingTop: number
  paddingBottom: number
}

// Per-template theme controlling the parts of the email that live OUTSIDE
// the block tree — the header strip, the footer strip, page bg, body bg.
// All fields are optional; when undefined we render The Club defaults.
export interface TemplateTheme {
  headerBgColor?: string
  headerTextColor?: string
  footerBgColor?: string
  footerTextColor?: string
  footerLinkColor?: string
  pageBgColor?: string
  bodyBgColor?: string
  // Default font for the whole email body. Individual text blocks can
  // override it. Empty / undefined falls back to the brand body font.
  fontFamily?: string
}

// Curated, email-safe font stacks. Email clients (especially Outlook)
// only reliably render web-safe fonts, so we offer a fixed list of stacks
// rather than a free-text box — each value is a full fallback chain. The
// two brand fonts (Playfair / DM Sans) degrade gracefully to web-safe
// fonts where the web font isn't available.
export const EMAIL_FONTS: { label: string; value: string }[] = [
  { label: 'Brand serif (Playfair)', value: "'Playfair Display', Georgia, 'Times New Roman', serif" },
  { label: 'Brand sans (DM Sans)', value: "'DM Sans', Arial, Helvetica, sans-serif" },
  { label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman (serif)', value: "'Times New Roman', Times, serif" },
  { label: 'Garamond (serif)', value: "Garamond, 'Times New Roman', serif" },
  { label: 'Arial (sans-serif)', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica (sans-serif)', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana (sans-serif)', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma (sans-serif)', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS (sans-serif)', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: 'Courier New (monospace)', value: "'Courier New', Courier, monospace" },
]

// The brand body default used when neither the block nor the template
// specifies a font.
export const DEFAULT_EMAIL_FONT = "'DM Sans', Arial, Helvetica, sans-serif"

export interface TemplateSettings {
  name: string
  subject: string
  preheader: string
  fromNameType: 'sender' | 'fixed'
  fixedFromName: string
  fixedFromEmail: string
  category: 'automation' | 'campaign' | 'transactional'
  theme?: TemplateTheme
}

export interface EmailTemplateData {
  id?: string
  name: string
  subject: string
  preheader: string
  fromNameType: 'sender' | 'fixed'
  fixedFromName?: string
  fixedFromEmail?: string
  category: 'automation' | 'campaign' | 'transactional'
  blocks: EditorBlock[]
}

export interface EditorState {
  blocks: EditorBlock[]
  settings: TemplateSettings
}

export const defaultTemplateSettings: TemplateSettings = {
  name: 'Untitled Template',
  subject: '',
  preheader: '',
  fromNameType: 'sender',
  fixedFromName: '',
  fixedFromEmail: '',
  category: 'campaign',
}

// Brand defaults reflect Sarah Restrick's palette: warm cream backgrounds
// with gold accents (#B8975A) rather than IFG's slate-blue.
export const defaultBlockContent: Record<BlockType, BlockContent> = {
  text: {
    html: '<p>Enter your text here...</p>',
    alignment: 'left',
    fontSize: 'normal',
    paddingTop: 10,
    paddingBottom: 10,
  } as TextBlockContent,
  image: {
    src: '',
    alt: '',
    alignment: 'center',
    width: '100',
    paddingTop: 10,
    paddingBottom: 10,
  } as ImageBlockContent,
  button: {
    text: 'Click Here',
    url: '',
    backgroundColor: '#B8975A',
    textColor: '#ffffff',
    borderRadius: 9999,
    width: 'auto',
    alignment: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingX: 24,
    paddingY: 12,
  } as ButtonBlockContent,
  divider: {
    style: 'solid',
    color: '#E5E0D8',
    thickness: 1,
    width: '100',
    paddingTop: 10,
    paddingBottom: 10,
  } as DividerBlockContent,
  spacer: {
    height: 20,
  } as SpacerBlockContent,
  video: {
    url: '',
    alignment: 'center',
    width: 'full',
  } as VideoBlockContent,
  social: {
    platforms: {
      facebook: { enabled: true, url: '' },
      twitter: { enabled: false, url: '' },
      instagram: { enabled: true, url: '' },
      linkedin: { enabled: true, url: '' },
      youtube: { enabled: false, url: '' },
      tiktok: { enabled: false, url: '' },
      threads: { enabled: false, url: '' },
      flickr: { enabled: false, url: '' },
    },
    style: 'monochrome',
    alignment: 'center',
  } as SocialBlockContent,
  html: {
    code: '<!-- Custom HTML here -->',
  } as HTMLBlockContent,
  columns: {
    columns: 2,
    columnWidths: [50, 50],
    gap: 20,
    leftBlocks: [],
    rightBlocks: [],
    paddingTop: 10,
    paddingBottom: 10,
  } as ColumnsBlockContent,
  conditional: {
    conditionField: 'member_email',
    conditionOperator: 'equals',
    conditionValue: '',
    children: [],
    paddingTop: 0,
    paddingBottom: 0,
  } as ConditionalBlockContent,
  sarah_signature: {
    showSignOff: true,
    signOff: 'Warm regards,',
    showName: true,
    showTitle: true,
    showEmail: true,
    showPhone: false,
    showWebsite: true,
    alignment: 'left',
    paddingTop: 20,
    paddingBottom: 10,
  } as SarahSignatureBlockContent,
  file: {
    fileName: '',
    fileUrl: '',
    fileSize: 0,
    fileType: '',
    alignment: 'left',
    paddingTop: 10,
    paddingBottom: 10,
  } as FileBlockContent,
}

// Merge tags reflect The Club's domain: members, events, introductions,
// the sender (admin), and Sarah Restrick herself. Members are people who
// hold a membership; events have a name, date, venue; introductions match
// two members together.
export const templateVariables = [
  // Member (recipient) fields
  { label: 'First Name', value: '{{first_name}}', description: "Member's first name", category: 'member' },
  { label: 'Last Name', value: '{{last_name}}', description: "Member's last name", category: 'member' },
  { label: 'Email', value: '{{email}}', description: "Member's email", category: 'member' },
  { label: 'Phone', value: '{{phone}}', description: "Member's phone", category: 'member' },
  { label: 'Membership Tier', value: '{{membership_tier}}', description: "Member's tier", category: 'member' },
  { label: 'Company Name', value: '{{company_name}}', description: "Member's company", category: 'member' },

  // Event fields
  { label: 'Event Name', value: '{{event_name}}', description: 'Name of the event', category: 'event' },
  { label: 'Event Date', value: '{{event_date}}', description: 'Date of the event', category: 'event' },
  { label: 'Event Time', value: '{{event_time}}', description: 'Time of the event', category: 'event' },
  { label: 'Venue Name', value: '{{venue_name}}', description: 'Where the event is held', category: 'event' },
  { label: 'Dress Code', value: '{{dress_code}}', description: 'Dress code for the event', category: 'event' },

  // Introduction fields
  { label: 'Other Member Name', value: '{{other_member_name}}', description: 'The member being introduced', category: 'intro' },
  { label: 'Introduction Note', value: '{{introduction_note}}', description: 'Note attached to the introduction', category: 'intro' },

  // Sender (admin) fields
  { label: 'Sender Name', value: '{{sender_name}}', description: 'Name of the admin sending', category: 'sender' },
  { label: 'Sender Title', value: '{{sender_title}}', description: 'Title of the sender', category: 'sender' },
  { label: 'Sender Email', value: '{{sender_email}}', description: 'Email of the sender', category: 'sender' },
  { label: 'Sender Phone', value: '{{sender_phone}}', description: 'Phone of the sender', category: 'sender' },
  { label: 'Booking Link', value: '{{booking_link}}', description: 'Booking / scheduling link', category: 'sender' },

  // Sponsor fields — used by the per-sponsor event invite. The booking link
  // resolves to that sponsor's personalised /events/<slug>?s=<token> URL.
  { label: 'Sponsor Booking Link', value: '{{sponsor_booking_link}}', description: "This sponsor's personalised event booking link", category: 'sponsor' },
  { label: 'Sponsor Name', value: '{{sponsor_name}}', description: 'Name of the sponsor / their contact', category: 'sponsor' },
  { label: 'Sponsor Company', value: '{{sponsor_company}}', description: "The sponsor's company", category: 'sponsor' },
  { label: 'Sponsor Price', value: '{{sponsor_price}}', description: "The sponsor's event ticket price", category: 'sponsor' },

  // Misc
  { label: 'Month Name', value: '{{month_name}}', description: 'Current month label (e.g. "March")', category: 'misc' },
]

export const templateVariableCategories = {
  member: 'Member',
  event: 'Event',
  intro: 'Introduction',
  sender: 'Sender',
  sponsor: 'Sponsor',
  misc: 'Other',
} as const

export const sampleContacts = [
  { id: '1', first_name: 'Charlotte', last_name: 'Hayes', email: 'charlotte@example.com' },
  { id: '2', first_name: 'James', last_name: 'Whitfield', email: 'james@example.com' },
  { id: '3', first_name: 'Olivia', last_name: 'Pearce', email: 'olivia@example.com' },
]
