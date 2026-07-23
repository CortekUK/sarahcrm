'use client'

import { StaffTasksPage } from '@/views/staff/StaffTasksPage'
import { StaffScorecardPanel } from '@/views/staff/StaffScorecardPanel'
import { StaffHandoverPanel } from '@/views/staff/StaffHandoverPanel'
import { StaffSopPanel } from '@/views/staff/StaffSopPanel'

export default function Page() {
  return (
    <>
      <StaffScorecardPanel />
      <StaffHandoverPanel />
      <StaffTasksPage />
      <StaffSopPanel />
    </>
  )
}
