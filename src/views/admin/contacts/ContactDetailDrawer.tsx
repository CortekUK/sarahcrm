'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { SECTOR_KEYS, SECTOR_LABELS } from '@/lib/contacts/sectors'
import { ExternalLink, Trash2, Save } from 'lucide-react'

// One contact's full record. Read-only Clay enrichment on the left, the
// hand-editable fields on the right.
//
// Email is shown but never editable — it's the import identity key, so
// changing it would orphan the row from future CSV uploads.

export interface Contact {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  job_title: string | null
  website: string | null
  sector: string
  city: string | null
  location: string | null
  employee_count: number | null
  company_size: string | null
  linkedin_url: string | null
  industry_raw: string | null
  groups: string[] | null
  email_subscribed: boolean
  sms_subscribed: boolean
  is_member_flag: boolean
  source: string | null
  notes: string | null
  created_at: string
}

interface Props {
  contact: Contact | null
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  first_name: string
  last_name: string
  company_name: string
  job_title: string
  website: string
  phone: string
  city: string
  sector: string
  notes: string
  email_subscribed: boolean
}

function toForm(c: Contact): FormState {
  return {
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    company_name: c.company_name ?? '',
    job_title: c.job_title ?? '',
    website: c.website ?? '',
    phone: '',
    city: c.city ?? '',
    sector: c.sector,
    notes: c.notes ?? '',
    email_subscribed: c.email_subscribed,
  }
}

export function ContactDetailDrawer({ contact, onClose, onSaved }: Props) {
  const confirm = useConfirm()
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setForm(contact ? toForm(contact) : null)
  }, [contact])

  if (!contact || !form) return null

  async function save() {
    if (!contact || !form) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not save', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Contact updated' })
      onSaved()
      onClose()
    } catch {
      toast({ title: 'Could not save', description: 'Network error.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!contact) return
    const ok = await confirm({
      title: 'Delete contact',
      description: (
        <span>
          <strong className="text-text">{contact.email}</strong> will be permanently removed. This
          cannot be undone — though re-importing the CSV would bring them back.
        </span>
      ),
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/contacts/${contact.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        toast({ title: 'Delete failed', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Contact deleted' })
      onSaved()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email

  return (
    <Modal open onClose={onClose} title={name} size="lg">
      <div className="space-y-6">
        {/* Identity + status */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={contact.sector === 'unsegmented' ? 'draft' : 'info'}>
            {SECTOR_LABELS[contact.sector] ?? contact.sector}
          </Badge>
          {contact.email_subscribed ? (
            <Badge variant="active" dot>
              Subscribed
            </Badge>
          ) : (
            <Badge variant="urgent" dot>
              Opted out of email
            </Badge>
          )}
          {contact.is_member_flag && <Badge variant="upcoming">Flagged as member</Badge>}
          {(contact.groups ?? []).map((g) => (
            <Badge key={g} variant="draft">
              {g}
            </Badge>
          ))}
        </div>

        <div>
          <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-muted">Email</p>
          <p className="text-sm text-text">{contact.email}</p>
          <p className="text-xs text-text-dim mt-0.5">
            Used to match this contact on re-import, so it can&apos;t be edited here.
          </p>
        </div>

        {/* Editable */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="First name"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
          <Input
            label="Last name"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
          <Input
            label="Company"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
          />
          <Input
            label="Job title"
            value={form.job_title}
            onChange={(e) => setForm({ ...form, job_title: e.target.value })}
          />
          <Input
            label="Website"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
          <Input
            label="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <Select
            label="Sector"
            value={form.sector}
            onChange={(e) => setForm({ ...form, sector: e.target.value })}
            options={SECTOR_KEYS.map((k) => ({ value: k, label: SECTOR_LABELS[k] }))}
          />
          <Select
            label="Email consent"
            value={form.email_subscribed ? 'yes' : 'no'}
            onChange={(e) => setForm({ ...form, email_subscribed: e.target.value === 'yes' })}
            options={[
              { value: 'yes', label: 'Subscribed' },
              { value: 'no', label: 'Opted out' },
            ]}
          />
        </div>

        <Textarea
          label="Internal notes"
          rows={3}
          placeholder="Context for the team — never shown to the contact."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        {/* Enrichment — read-only, straight from the import */}
        <div>
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            From enrichment
          </p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <Field label="Industry (raw)" value={contact.industry_raw} />
            <Field label="Employees" value={contact.employee_count?.toLocaleString('en-GB')} />
            <Field label="Size band" value={contact.company_size} />
            <Field label="Location" value={contact.location} />
            <Field label="Source" value={contact.source} />
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-muted">
                LinkedIn
              </dt>
              <dd className="text-text mt-0.5">
                {contact.linkedin_url ? (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:underline inline-flex items-center gap-1"
                  >
                    Profile <ExternalLink size={11} />
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="-mx-6 -mb-4 mt-6 px-6 py-4 border-t border-border flex items-center justify-between gap-3 bg-surface rounded-b-[var(--radius-xl)]">
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 size={14} />}
          loading={deleting}
          onClick={remove}
        >
          Delete
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon={<Save size={14} />} loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-muted">{label}</dt>
      <dd className="text-text mt-0.5 truncate">{value || '—'}</dd>
    </div>
  )
}
