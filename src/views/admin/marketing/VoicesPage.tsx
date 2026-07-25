'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Save, MessageSquareQuote } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Button, Card, Input, Textarea } from '@/components/ui'

interface Sample {
  label: string
  text: string
}

interface Voice {
  id: string
  key: 'club' | 'sarah'
  name: string
  guidance: string | null
  samples: Sample[]
  updated_at: string
}

const VOICE_BLURB: Record<string, string> = {
  club: 'Formal luxury — the community’s house voice. Used for any channel set to "The Club" and for the LinkedIn "The Club" variant.',
  sarah:
    'Warm, conversational founder voice — Sarah speaking directly. Used for any channel set to "Sarah", plus the LinkedIn "Sarah" and "Founder spotlight" variants.',
}

export function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/marketing/voices')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load voices')
      setVoices(normalise(json.voices ?? []))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load voices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Brand voices"
        description="Two editable voices the AI writes in. Edit each voice’s guidance and add reference sample posts — generation reads both so drafts sound like you. LinkedIn always produces both voices plus a sponsor and a founder-spotlight angle."
        breadcrumbs={[
          { label: 'Marketing', href: '/dashboard/marketing' },
          { label: 'Voices' },
        ]}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading voices…
        </div>
      ) : error ? (
        <Card className="p-8 text-center text-accent-warm">{error}</Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {voices.map((v) => (
            <VoiceCard key={v.id} voice={v} />
          ))}
        </div>
      )}
    </div>
  )
}

function normalise(rows: unknown[]): Voice[] {
  return (rows as Voice[]).map((v) => ({
    ...v,
    samples: Array.isArray(v.samples)
      ? v.samples.map((s) => ({ label: s?.label ?? '', text: s?.text ?? '' }))
      : [],
  }))
}

function VoiceCard({ voice }: { voice: Voice }) {
  const [name, setName] = useState(voice.name)
  const [guidance, setGuidance] = useState(voice.guidance ?? '')
  const [samples, setSamples] = useState<Sample[]>(voice.samples)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function updateSample(i: number, patch: Partial<Sample>) {
    setSamples((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function addSample() {
    setSamples((prev) => [...prev, { label: '', text: '' }])
  }
  function removeSample(i: number) {
    setSamples((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const cleanSamples = samples
        .map((s) => ({ label: s.label.trim(), text: s.text.trim() }))
        .filter((s) => s.label || s.text)
      const res = await fetch('/api/admin/marketing/voices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: voice.key,
          name: name.trim() || voice.name,
          guidance,
          samples: cleanSamples,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      setSamples(
        Array.isArray(json.voice?.samples)
          ? json.voice.samples.map((s: Sample) => ({ label: s.label ?? '', text: s.text ?? '' }))
          : cleanSamples,
      )
      setSavedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center">
          <MessageSquareQuote size={17} className="text-gold" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-text leading-tight">{name || voice.name}</p>
          <p className="text-xs text-text-dim">{VOICE_BLURB[voice.key]}</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4 flex-1">
        <Input
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Voice name"
        />

        <Textarea
          label="Guidance"
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="How should this voice sound? Tone, register, spelling, sign-off…"
          className="min-h-[160px]"
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
              Reference sample posts
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
              onClick={addSample}
            >
              <Plus size={13} /> Add sample
            </button>
          </div>

          {samples.length === 0 ? (
            <p className="text-xs text-text-dim">
              No reference samples yet. Add a few real posts written in this voice and the AI will
              mirror them.
            </p>
          ) : (
            <div className="space-y-3">
              {samples.map((s, i) => (
                <div key={i} className="rounded-[var(--radius-md)] border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={s.label}
                      onChange={(e) => updateSample(i, { label: e.target.value })}
                      placeholder="Label (e.g. LinkedIn — dinner recap)"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeSample(i)}
                      className="p-1.5 rounded text-text-dim hover:text-accent-warm hover:bg-surface-2"
                      title="Remove sample"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <Textarea
                    value={s.text}
                    onChange={(e) => updateSample(i, { text: e.target.value })}
                    placeholder="Paste a representative post written in this voice…"
                    className="min-h-[100px] text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-accent-warm">{error}</p>}
      </div>

      <div className="flex items-center gap-3 px-6 py-4 border-t border-border">
        <Button size="sm" icon={<Save size={14} />} loading={saving} onClick={save}>
          Save voice
        </Button>
        {savedAt && !saving && <span className="text-xs text-text-dim">Saved.</span>}
      </div>
    </Card>
  )
}
