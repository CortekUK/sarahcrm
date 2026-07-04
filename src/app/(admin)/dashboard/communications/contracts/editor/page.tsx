'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ContractEditorPage } from '@/components/contracts/editor/ContractEditorPage'

function ContractEditorRoute() {
  const params = useSearchParams()
  const id = params.get('id') ?? undefined
  return <ContractEditorPage contractId={id} />
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContractEditorRoute />
    </Suspense>
  )
}
