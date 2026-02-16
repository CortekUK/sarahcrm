import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      setConnected(true)
    }).catch(() => {
      setConnected(false)
    })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">SarahCRM</h1>
        <p className="text-gray-600 mb-2">Vite + React + TypeScript + Tailwind + Supabase</p>
        <p className="text-sm text-gray-400">
          Supabase: {connected === null ? 'Connecting...' : connected ? 'Connected' : 'Error'}
        </p>
      </div>
    </div>
  )
}

export default App
