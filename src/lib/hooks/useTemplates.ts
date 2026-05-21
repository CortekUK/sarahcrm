'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database'
import type { Template, TemplateFilters, CreateTemplateInput } from '@/lib/templates/types'

// EditorBlock content has an open `Record<string, any>` shape that doesn't
// formally fit the generated Json index-signature type. Cast at the boundary
// so the supabase calls compile; Postgres stores JSONB without caring.
function toJson<T>(value: T): Json {
  return value as unknown as Json
}

export function useTemplates(filters?: TemplateFilters) {
  const supabase = createClient()
  return useQuery<Template[]>({
    queryKey: ['templates', filters],
    queryFn: async () => {
      let query = supabase
        .from('email_templates')
        .select('*')
        .order('updated_at', { ascending: false })
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`)
      }
      if (filters?.category && filters.category !== 'all') {
        query = query.eq('category', filters.category)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as Template[]
    },
  })
}

export function useTemplate(templateId: string | null) {
  const supabase = createClient()
  return useQuery<Template | null>({
    queryKey: ['template', templateId],
    queryFn: async () => {
      if (!templateId) return null
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single()
      if (error) throw error
      return data as unknown as Template
    },
    enabled: !!templateId,
  })
}

export function useCreateTemplate() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (template: CreateTemplateInput) => {
      const insertRow = {
        ...template,
        body_json: template.body_json ? toJson(template.body_json) : null,
        theme: template.theme ? toJson(template.theme) : null,
      }
      const { data, error } = await supabase
        .from('email_templates')
        .insert(insertRow)
        .select()
        .single()
      if (error) throw error
      return data as unknown as Template
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

export function useUpdateTemplate() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Template> }) => {
      const updateRow: Record<string, unknown> = { ...patch }
      if (patch.body_json !== undefined) updateRow.body_json = toJson(patch.body_json)
      if (patch.theme !== undefined) updateRow.theme = toJson(patch.theme)
      const { data, error } = await supabase
        .from('email_templates')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updateRow as any)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as unknown as Template
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template', data.id] })
    },
  })
}

export function useDuplicateTemplate() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (template: Template) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const duplicateData = {
        name: `Copy of ${template.name}`,
        subject: template.subject,
        preheader: template.preheader,
        body_html: template.body_html,
        body_json: template.body_json ? toJson(template.body_json) : null,
        theme: template.theme ? toJson(template.theme) : null,
        category: template.category,
        from_name_type: template.from_name_type,
        fixed_from_name: template.fixed_from_name,
        fixed_from_email: template.fixed_from_email,
        attachments: toJson(template.attachments),
        created_by_id: user?.id ?? null,
      }
      const { data, error } = await supabase
        .from('email_templates')
        .insert(duplicateData)
        .select()
        .single()
      if (error) throw error
      return data as unknown as Template
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

export function useDeleteTemplate() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', templateId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}
