'use client'

import { StaffTasksPage } from '@/views/staff/StaffTasksPage'
import { StaffScorecardPanel } from '@/views/staff/StaffScorecardPanel'
import { StaffHandoverPanel } from '@/views/staff/StaffHandoverPanel'

export default function Page() {
  return (
    <>
      <StaffScorecardPanel />
      <StaffHandoverPanel />
      <StaffTasksPage />
    </>
  )
}
