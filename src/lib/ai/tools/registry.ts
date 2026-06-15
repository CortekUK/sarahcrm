// Tool registry for the agentic template builder.
//
// Each tool is a small read-only query against the application's
// Supabase schema. The model decides when to call them; the route
// (src/app/api/templates/ai-generate/route.ts) executes them with the
// service-role client and feeds the results back in the next loop
// iteration as a `tool` message.
//
// Read-only by design: at this stage the agent can LOOK at any
// records but CAN'T mutate them. Mutations (create_template etc.)
// still flow through the structured-response path so the canvas
// stays the source of truth for what's been built. We can layer
// write tools on later once read behaviour is trusted.

import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Tool schemas — surface to OpenAI ───────────────────────────────
//
// `strict: true` forces structured outputs from the model. Every
// property listed in `properties` becomes required (no missing keys
// in the model's tool call args), and additional fields are rejected.

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_events',
      description:
        "Lists The Club's events. Use when the user asks how many events exist, names them, or wants context before drafting an event email. Returns id, slug, title, start_date, venue, type, status, capacity, prices, and brief description.",
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: {
            type: 'array',
            description:
              "Filter by event status. Defaults to upcoming-only ('published' + 'live'). Pass ['completed'] for past events, ['draft'] for unpublished, or an explicit mix.",
            items: {
              type: 'string',
              enum: ['draft', 'published', 'live', 'completed', 'cancelled'],
            },
          },
          time: {
            type: 'string',
            description:
              "Date filter. 'upcoming' = start_date >= now (default). 'past' = start_date < now. 'all' = no time filter.",
            enum: ['upcoming', 'past', 'all'],
          },
          limit: {
            type: 'integer',
            description: 'Max number of events to return (1-50). Default 10.',
            minimum: 1,
            maximum: 50,
          },
        },
        required: ['status', 'time', 'limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_event',
      description:
        'Retrieves full detail for a single event by id or slug — including booking counts. Use after `list_events` returned a match, when the user asks for a template tied to a specific event.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: "Event UUID, OR the event's URL slug — either works.",
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_members',
      description:
        'Lists active members. Use when the user asks how many members, who they are by tier, or wants context before drafting a member-segmented email.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tier: {
            type: 'string',
            description: "Filter by membership tier. Omit (or 'all') for every active member.",
            enum: ['all', 'tier_1', 'tier_2', 'tier_3'],
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
          },
        },
        required: ['tier', 'limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_applications',
      description:
        'Lists membership applications. Use when the user asks who has applied, how many are pending, or wants context for a rejection / approval email template.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['pending', 'shortlisted', 'approved', 'rejected'],
            },
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
          },
        },
        required: ['status', 'limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bookings',
      description:
        'Lists event bookings. Use when the user asks who is attending an event or wants context for an event reminder email. Pass event_id to filter to one event.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          event_id: {
            type: 'string',
            description: 'Optional event UUID to filter bookings.',
          },
          status: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['pending', 'confirmed', 'cancelled', 'refunded'],
            },
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
          },
        },
        required: ['event_id', 'status', 'limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_enquiries',
      description:
        'Lists public enquiries submitted via the contact form. Use when the user asks about recent enquiries or wants context for a follow-up template.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: {
            type: 'array',
            items: { type: 'string', enum: ['new', 'replied', 'closed'] },
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
          },
        },
        required: ['status', 'limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_subscribers',
      description:
        'Lists newsletter subscribers (from the public signup form). Use when the user asks how many subscribers or wants context for a newsletter campaign template.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          active_only: {
            type: 'boolean',
            description: 'When true, excludes unsubscribed addresses. Default true.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
          },
        },
        required: ['active_only', 'limit'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reviews',
      description:
        'Lists submitted reviews (the public /share-your-experience form). Use when the user asks about recent reviews or wants quote material for marketing copy.',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['pending', 'approved', 'rejected'],
            },
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
          },
        },
        required: ['status', 'limit'],
      },
    },
  },
]

// ─── Handlers — server-side execution against Supabase ──────────────
//
// Each handler accepts `(args, supabaseAdmin)` and returns a JSON-
// serialisable object. Failures return `{ error }` rather than
// throwing so the model can see what went wrong and adapt.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any
type Handler = (args: Json, admin: SupabaseClient) => Promise<Json>

const formatGBP = (pence: number | null | undefined) =>
  pence == null ? null : `£${(pence / 100).toFixed(2)}`

const HANDLERS: Record<string, Handler> = {
  async list_events(args, admin) {
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 10))
    const statusFilter: string[] | null = Array.isArray(args.status) && args.status.length > 0 ? args.status : null
    const timeFilter: 'upcoming' | 'past' | 'all' = args.time === 'past' || args.time === 'all' ? args.time : 'upcoming'

    let q = admin
      .from('events')
      .select(
        'id, slug, title, start_date, end_date, status, event_type, venue_name, venue_city, capacity, member_price_pence, guest_price_pence, description',
      )
      .order('start_date', { ascending: timeFilter !== 'past' })
      .limit(limit)
    const nowIso = new Date().toISOString()
    if (timeFilter === 'upcoming') q = q.gte('start_date', nowIso)
    if (timeFilter === 'past') q = q.lt('start_date', nowIso)
    if (statusFilter) q = q.in('status', statusFilter)
    else if (timeFilter === 'upcoming')
      q = q.in('status', ['published', 'live'])

    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      count: data?.length ?? 0,
      events: (data ?? []).map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        start_date: e.start_date,
        end_date: e.end_date,
        status: e.status,
        type: e.event_type,
        venue: [e.venue_name, e.venue_city].filter(Boolean).join(', ') || null,
        capacity: e.capacity,
        member_price: formatGBP(e.member_price_pence),
        guest_price: formatGBP(e.guest_price_pence),
        description: e.description?.slice(0, 280) ?? null,
      })),
    }
  },

  async get_event(args, admin) {
    const idOrSlug = String(args.id ?? '').trim()
    if (!idOrSlug) return { error: 'id required' }
    const isUuid = /^[0-9a-f]{8}-/i.test(idOrSlug)
    const q = admin
      .from('events')
      .select(
        'id, slug, title, start_date, end_date, status, event_type, venue_name, venue_city, venue_address, capacity, member_price_pence, guest_price_pence, dress_code, description, bookings(count)',
      )
      .eq(isUuid ? 'id' : 'slug', idOrSlug)
      .maybeSingle()
    const { data, error } = await q
    if (error) return { error: error.message }
    if (!data) return { error: 'Event not found' }
    const bookings = (data.bookings as { count: number }[] | null) ?? []
    return {
      id: data.id,
      slug: data.slug,
      title: data.title,
      start_date: data.start_date,
      end_date: data.end_date,
      status: data.status,
      type: data.event_type,
      venue_name: data.venue_name,
      venue_city: data.venue_city,
      venue_address: data.venue_address,
      capacity: data.capacity,
      member_price: formatGBP(data.member_price_pence),
      guest_price: formatGBP(data.guest_price_pence),
      dress_code: data.dress_code,
      description: data.description,
      booked_count: bookings[0]?.count ?? 0,
    }
  },

  async list_members(args, admin) {
    const limit = Math.max(1, Math.min(100, Number(args.limit) || 25))
    const tier = typeof args.tier === 'string' && args.tier !== 'all' ? args.tier : null

    let q = admin
      .from('members')
      .select(
        'id, membership_tier, membership_type, membership_status, company_name, profiles(first_name, last_name, email, company_name, job_title)',
      )
      .eq('membership_status', 'active')
      .is('deleted_at', null)
      .limit(limit)
    if (tier) q = q.eq('membership_tier', tier)

    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      count: data?.length ?? 0,
      members: (data ?? []).map((m) => {
        const p = m.profiles as unknown as {
          first_name: string | null
          last_name: string | null
          email: string | null
          company_name: string | null
          job_title: string | null
        } | null
        return {
          id: m.id,
          name: `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || null,
          email: p?.email ?? null,
          tier: m.membership_tier,
          type: m.membership_type,
          company: m.company_name ?? p?.company_name ?? null,
          title: p?.job_title ?? null,
        }
      }),
    }
  },

  async list_applications(args, admin) {
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 15))
    const statusFilter: string[] | null = Array.isArray(args.status) && args.status.length > 0 ? args.status : null

    let q = admin
      .from('membership_applications')
      .select(
        'id, first_name, last_name, email, company, position, preferred_tier, payment_preference, status, amount_paid_pence, refunded_at, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit)
    if (statusFilter) q = q.in('status', statusFilter)

    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      count: data?.length ?? 0,
      applications: (data ?? []).map((a) => ({
        id: a.id,
        name: `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || null,
        email: a.email,
        company: a.company,
        title: a.position,
        preferred_tier: a.preferred_tier,
        payment_preference: a.payment_preference,
        status: a.status,
        amount_paid: formatGBP(a.amount_paid_pence),
        refunded: Boolean(a.refunded_at),
        created_at: a.created_at,
      })),
    }
  },

  async list_bookings(args, admin) {
    const limit = Math.max(1, Math.min(100, Number(args.limit) || 25))
    const eventId = typeof args.event_id === 'string' && args.event_id ? args.event_id : null
    const statusFilter: string[] | null = Array.isArray(args.status) && args.status.length > 0 ? args.status : null

    let q = admin
      .from('bookings')
      .select(
        'id, event_id, status, is_guest, amount_pence, created_at, guest_name, guest_email, guest_company, members(id, profiles(first_name, last_name, email, company_name)), events(title, start_date, venue_name)',
      )
      .order('created_at', { ascending: false })
      .limit(limit)
    if (eventId) q = q.eq('event_id', eventId)
    if (statusFilter) q = q.in('status', statusFilter)

    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      count: data?.length ?? 0,
      bookings: (data ?? []).map((b) => {
        const member = b.members as unknown as {
          id: string
          profiles: {
            first_name: string | null
            last_name: string | null
            email: string | null
            company_name: string | null
          } | null
        } | null
        const event = b.events as unknown as {
          title: string | null
          start_date: string | null
          venue_name: string | null
        } | null
        const memberName = member?.profiles
          ? `${member.profiles.first_name ?? ''} ${member.profiles.last_name ?? ''}`.trim()
          : ''
        return {
          id: b.id,
          event_id: b.event_id,
          event_title: event?.title ?? null,
          event_start: event?.start_date ?? null,
          status: b.status,
          attendee: b.is_guest
            ? {
                kind: 'guest',
                name: b.guest_name,
                email: b.guest_email,
                company: b.guest_company,
              }
            : {
                kind: 'member',
                member_id: member?.id ?? null,
                name: memberName || null,
                email: member?.profiles?.email ?? null,
                company: member?.profiles?.company_name ?? null,
              },
          amount: formatGBP(b.amount_pence),
        }
      }),
    }
  },

  async list_enquiries(args, admin) {
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 15))
    const statusFilter: string[] | null = Array.isArray(args.status) && args.status.length > 0 ? args.status : null

    let q = admin
      .from('enquiries')
      .select(
        'id, first_name, last_name, email, company, intent, message, status, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit)
    if (statusFilter) q = q.in('status', statusFilter)

    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      count: data?.length ?? 0,
      enquiries: (data ?? []).map((e) => ({
        id: e.id,
        name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || null,
        email: e.email,
        company: e.company,
        intent: Array.isArray(e.intent) ? e.intent.join(', ') : null,
        message: e.message?.slice(0, 400) ?? null,
        status: e.status,
        created_at: e.created_at,
      })),
    }
  },

  async list_subscribers(args, admin) {
    const limit = Math.max(1, Math.min(100, Number(args.limit) || 25))
    const activeOnly = args.active_only !== false

    let q = admin
      .from('mailing_list')
      .select('id, first_name, last_name, email, subscribed_at, unsubscribed_at, source')
      .order('subscribed_at', { ascending: false })
      .limit(limit)
    if (activeOnly) q = q.is('unsubscribed_at', null)

    const { data, error } = await q
    if (error) return { error: error.message }
    // For privacy + token cost we never surface ALL subscriber rows by
    // default — the model should reason from the count + a sample.
    const sample = (data ?? []).slice(0, 10).map((s) => ({
      name: `${s.first_name} ${s.last_name}`.trim(),
      email: s.email,
      subscribed_at: s.subscribed_at,
    }))
    // The selected sample is what's available without a separate
    // count query — for a precise total the model can re-call with
    // a larger limit or trust this as a "first N of many".
    return {
      visible_count: data?.length ?? 0,
      sample,
    }
  },

  async list_reviews(args, admin) {
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 15))
    const statusFilter: string[] | null = Array.isArray(args.status) && args.status.length > 0 ? args.status : null

    let q = admin
      .from('reviews')
      .select(
        'id, first_name, last_name, company, title, body, status, event_id, created_at, events(title)',
      )
      .order('created_at', { ascending: false })
      .limit(limit)
    if (statusFilter) q = q.in('status', statusFilter)

    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      count: data?.length ?? 0,
      reviews: (data ?? []).map((r) => {
        const event = r.events as unknown as { title: string | null } | null
        return {
          id: r.id,
          reviewer: `${r.first_name ?? ''} ${(r.last_name ?? '').slice(0, 1).toUpperCase()}.`.trim(),
          company: r.company,
          title: r.title,
          event: event?.title ?? null,
          body: r.body?.slice(0, 400) ?? null,
          status: r.status,
          created_at: r.created_at,
        }
      }),
    }
  },
}

// Caller-facing dispatch: name + args → JSON-serialisable result.
// Unknown tools and exceptions return a structured error so the model
// can apologise / pick a different tool without crashing the loop.
export async function runAgentTool(
  name: string,
  args: Json,
  admin: SupabaseClient,
): Promise<Json> {
  const fn = HANDLERS[name]
  if (!fn) return { error: `Unknown tool: ${name}` }
  try {
    return await fn(args ?? {}, admin)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Tool execution failed' }
  }
}

export const AGENT_TOOL_NAMES = AGENT_TOOLS
  .filter((t): t is Extract<ChatCompletionTool, { type: 'function' }> => t.type === 'function')
  .map((t) => t.function.name)
