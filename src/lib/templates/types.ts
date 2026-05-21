export interface Template {
  id: string
  name: string
  subject: string
  preheader: string | null
  body_html: string
  body_json: Record<string, unknown> | null
  theme: Record<string, unknown> | null
  category: 'automation' | 'campaign' | 'transactional'
  from_name_type: 'sender' | 'fixed'
  fixed_from_name: string | null
  fixed_from_email: string | null
  attachments: unknown[]
  is_draft: boolean
  created_by_id: string | null
  created_at: string
  updated_at: string
}

export interface TemplateFilters {
  search?: string
  category?: Template['category'] | 'all'
}

export interface CreateTemplateInput {
  name: string
  subject: string
  body_html: string
  body_json?: Record<string, unknown> | null
  theme?: Record<string, unknown> | null
  category: Template['category']
  from_name_type: Template['from_name_type']
  fixed_from_name?: string
  fixed_from_email?: string
  created_by_id?: string
  is_draft?: boolean
}
