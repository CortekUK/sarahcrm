// Shared pipeline stage model.
//
// These per-pipeline status → shared stage maps are a VERBATIM copy of the
// inline maps in `src/views/admin/pipeline/PipelinePage.tsx` (Feature 4). They
// are centralised here so the Executive Dashboard's per-stream "open value"
// reconciles exactly with the Pipeline board — every record lands in the same
// stage in both places.
//
// PipelinePage is intentionally left untouched (it keeps its own identical
// inline copy); when that view is next revised it should import from here to
// remove the duplication. Until then, KEEP THESE TWO IN SYNC.

export type Stage = 'new' | 'qualified' | 'proposal' | 'won' | 'lost'

// The three "open" stages — live opportunity, excluding booked (won) or dead
// (lost) business. Open pipeline value is summed over exactly these.
export const OPEN_STAGES: Stage[] = ['new', 'qualified', 'proposal']

export function isOpenStage(stage: Stage): boolean {
  return OPEN_STAGES.includes(stage)
}

export function membershipStage(status: string): Stage {
  switch (status) {
    case 'approved':
      return 'won'
    case 'rejected':
      return 'lost'
    case 'shortlisted':
      return 'qualified'
    default:
      return 'new' // pending
  }
}

export function sponsorshipStage(status: string): Stage {
  switch (status) {
    case 'paid':
      return 'won'
    case 'declined':
    case 'cancelled':
    case 'lost':
    case 'rejected':
      return 'lost'
    case 'confirmed':
      return 'qualified'
    case 'invoiced':
      return 'proposal'
    default:
      return 'new' // proposed / pending
  }
}

export function conciergeStage(status: string): Stage {
  switch (status) {
    case 'accepted':
    case 'booked':
    case 'delivered':
    case 'feedback':
      return 'won'
    case 'declined':
    case 'cancelled':
      return 'lost'
    case 'sourcing':
      return 'qualified'
    case 'quoted':
      return 'proposal'
    default:
      return 'new' // pending / assigned
  }
}

export function introductionStage(status: string, dealStatus: string | null): Stage {
  if (dealStatus === 'won') return 'won'
  if (dealStatus === 'lost') return 'lost'
  if (status === 'declined') return 'lost'
  if (status === 'completed') return 'won'
  if (status === 'sent' || status === 'scheduled' || status === 'accepted') return 'qualified'
  return 'new' // suggested / approved
}

export function bookingStage(status: string): Stage {
  switch (status) {
    case 'confirmed':
      return 'won'
    case 'cancelled':
    case 'refunded':
      return 'lost'
    default:
      return 'new' // pending
  }
}
