'use client'

import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ProspectsView } from '@/views/admin/sponsorship/ProspectsView'

export default function Page() {
  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Sponsor prospects"
        description="Ranked ideal sponsors for the selected event — warm CRM matches first, then cold discovery."
        breadcrumbs={[
          { label: 'Sponsorship', href: '/dashboard/sponsorship' },
          { label: 'Prospects' },
        ]}
      />
      <ProspectsView />
    </div>
  )
}
