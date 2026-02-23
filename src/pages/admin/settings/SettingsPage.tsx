import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { Avatar } from '../../../components/ui/Avatar'
import { Building2, CreditCard, Landmark, Mail, Pencil, UserPlus } from 'lucide-react'

const TIERS = [
  { name: 'Individual Tier 1', type: 'Individual', price: '£375', intros: '3', status: 'Active' },
  { name: 'Individual Tier 2', type: 'Individual', price: '£500', intros: '5', status: 'Active' },
  { name: 'Individual Tier 3', type: 'Individual', price: '£750', intros: '10', status: 'Active' },
  { name: 'Business Tier 1', type: 'Business', price: '£600', intros: '5', status: 'Active' },
  { name: 'Business Tier 2', type: 'Business', price: '£900', intros: '10', status: 'Active', note: 'Showcase enabled' },
  { name: 'Business Tier 3', type: 'Business', price: '£1,500', intros: 'Unlimited', status: 'Active', note: 'Sponsor aligned' },
]

const INTEGRATIONS = [
  {
    name: 'Stripe',
    description: 'Payment processing for event tickets and one-off charges',
    icon: CreditCard,
    connected: true,
  },
  {
    name: 'GoCardless',
    description: 'Direct debit collection for recurring membership fees',
    icon: Landmark,
    connected: true,
  },
  {
    name: 'Xero',
    description: 'Accounting sync for invoices, payments, and reconciliation',
    icon: Building2,
    connected: true,
  },
  {
    name: 'Resend',
    description: 'Transactional email delivery for introductions and communications',
    icon: Mail,
    connected: true,
  },
]

const TEAM = [
  { name: 'Sarah Restrick', email: 'admin@sarahrestrick.com', role: 'Admin', initials: 'SR' },
  { name: 'Leanne', email: 'leanne@sarahrestrick.com', role: 'Admin', initials: 'L' },
]

export function SettingsPage() {
  const [clubName, setClubName] = useState('The Club by Sarah Restrick')
  const [contactEmail, setContactEmail] = useState('hello@sarahrestrick.com')
  const [phone, setPhone] = useState('+44 20 7946 0958')
  const [website, setWebsite] = useState('https://sarahrestrick.com')
  const [description, setDescription] = useState(
    'An exclusive private members network connecting ambitious founders, investors, and senior professionals across London. Curated introductions, intimate events, and a shared commitment to meaningful business relationships.'
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaving(true)
    setSaved(false)
    setTimeout(() => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 600)
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Settings
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Manage your club details, membership tiers, integrations, and team.
        </p>
      </div>

      {/* Club Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Club Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input
              label="Club Name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
            />
            <Input
              label="Contact Email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Website URL"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <div className="mt-5">
            <Textarea
              label="Club Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
            {saved && (
              <span className="text-sm text-accent">Changes saved</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Membership Tiers */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Membership Tiers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Monthly Price</TableHead>
                <TableHead>Monthly Intros</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {TIERS.map((tier) => (
                <TableRow key={tier.name}>
                  <TableCell>
                    <span className="font-medium text-text">{tier.name}</span>
                    {tier.note && (
                      <span className="block text-xs text-text-dim mt-0.5">{tier.note}</span>
                    )}
                  </TableCell>
                  <TableCell>{tier.type}</TableCell>
                  <TableCell className="font-[family-name:var(--font-mono)] text-sm">
                    {tier.price}/mo
                  </TableCell>
                  <TableCell>{tier.intros}</TableCell>
                  <TableCell>
                    <Badge variant="active" dot>{tier.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <button className="flex items-center gap-1.5 text-xs text-text-muted hover:text-gold transition-colors">
                      <Pencil size={13} strokeWidth={1.5} />
                      Edit
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {INTEGRATIONS.map((integration) => (
              <div
                key={integration.name}
                className="flex items-start gap-4 p-4 border border-border rounded-[var(--radius-lg)] bg-surface"
              >
                <div className="p-2.5 rounded-[var(--radius-md)] bg-surface-2 text-text-muted shrink-0">
                  <integration.icon size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-sm text-text">{integration.name}</p>
                    <Badge variant="active" dot>Connected</Badge>
                  </div>
                  <p className="text-xs text-text-dim leading-relaxed">{integration.description}</p>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0">
                  Configure
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Team */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Team</CardTitle>
          <Button size="sm" variant="secondary" icon={<UserPlus size={14} />}>
            Add Member
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {TEAM.map((member) => (
              <div key={member.email} className="flex items-center gap-4 px-6 py-4">
                <Avatar name={member.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text">{member.name}</p>
                  <p className="text-xs text-text-dim">{member.email}</p>
                </div>
                <Badge variant="upcoming">{member.role}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
