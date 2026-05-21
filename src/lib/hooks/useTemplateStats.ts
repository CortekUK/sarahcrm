'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface TemplateStats {
  totalTemplates: number
  automationTemplates: number
  campaignTemplates: number
  draftTemplates: number
}

export function useTemplateStats() {
  const supabase = createClient()
  return useQuery({
    queryKey: ['template-stats'],
    queryFn: async (): Promise<TemplateStats> => {
      const [
        { count: totalTemplates },
        { count: automationTemplates },
        { count: campaignTemplates },
        { count: draftTemplates },
      ] = await Promise.all([
        supabase.from('email_templates').select('*', { count: 'exact', head: true }),
        supabase
          .from('email_templates')
          .select('*', { count: 'exact', head: true })
          .eq('category', 'automation'),
        supabase
          .from('email_templates')
          .select('*', { count: 'exact', head: true })
          .eq('category', 'campaign'),
        supabase
          .from('email_templates')
          .select('*', { count: 'exact', head: true })
          .eq('is_draft', true),
      ])
      return {
        totalTemplates: totalTemplates ?? 0,
        automationTemplates: automationTemplates ?? 0,
        campaignTemplates: campaignTemplates ?? 0,
        draftTemplates: draftTemplates ?? 0,
      }
    },
  })
}
