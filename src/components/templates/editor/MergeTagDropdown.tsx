'use client'

import { useState } from 'react'
import { Button } from '@/components/ui-shadcn/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui-shadcn/popover'
import { Input } from '@/components/ui-shadcn/input'
import { Badge } from '@/components/ui-shadcn/badge'
import { Code2, Search, User, Calendar, Handshake, UserCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { templateVariables, templateVariableCategories } from '@/lib/templates/editor-types'

interface MergeTagDropdownProps {
  onInsert: (tag: string) => void
  className?: string
  variant?: 'default' | 'compact'
}

const categoryIcons = {
  member: User,
  event: Calendar,
  intro: Handshake,
  sender: UserCircle,
  misc: Sparkles,
}

export function MergeTagDropdown({ onInsert, className, variant = 'default' }: MergeTagDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredVariables = templateVariables.filter(
    (v) =>
      v.label.toLowerCase().includes(search.toLowerCase()) ||
      v.value.toLowerCase().includes(search.toLowerCase()) ||
      v.description.toLowerCase().includes(search.toLowerCase()),
  )

  const groupedVariables = filteredVariables.reduce((acc, variable) => {
    const category = variable.category || 'other'
    if (!acc[category]) acc[category] = []
    acc[category].push(variable)
    return acc
  }, {} as Record<string, typeof templateVariables>)

  const handleInsert = (tag: string) => {
    onInsert(tag)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {variant === 'compact' ? (
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', className)}>
            <Code2 className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={cn('h-8 text-xs', className)}>
            <Code2 className="h-3.5 w-3.5 mr-1.5" />
            Insert Merge Tag
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search merge tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          {Object.entries(groupedVariables).map(([category, variables]) => {
            const Icon = categoryIcons[category as keyof typeof categoryIcons] || Code2
            const categoryLabel =
              templateVariableCategories[category as keyof typeof templateVariableCategories] || category

            return (
              <div key={category} className="mb-3 last:mb-0">
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Icon className="h-3.5 w-3.5" />
                  {categoryLabel}
                </div>
                <div className="space-y-0.5">
                  {variables.map((variable) => (
                    <button
                      key={variable.value}
                      onClick={() => handleInsert(variable.value)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-surface-2)] transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-foreground">
                          {variable.label}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-5 font-mono opacity-70 group-hover:opacity-100"
                        >
                          {variable.value}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {variable.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {filteredVariables.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No merge tags found
            </div>
          )}
        </div>

        <div className="p-2 border-t bg-[var(--color-surface-2)]">
          <p className="text-xs text-muted-foreground">
            Tip: Use <code className="bg-[var(--color-surface-3)] px-1 rounded">{'{{tag|fallback}}'}</code> for fallback values
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
