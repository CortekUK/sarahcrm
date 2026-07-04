'use client'

import { TemplatesListPage } from '@/views/admin/communications/TemplatesListPage'

// The saved-contracts view. Same screen as AI Templates, opened on the
// Contracts tab — where the contract builder returns after Save & Exit.
export default function Page() {
  return <TemplatesListPage initialView="contracts" />
}
