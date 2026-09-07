// Knowledge base loader for the admin Help Assistant.
//
// The corpus lives as plain markdown in `docs/knowledge/` (see the README
// there). It is deliberately NOT bundled or embedded — it is read from disk at
// request time and cached in module scope for the life of the lambda, so
// updating the knowledge base is "edit the markdown, commit, deploy" with no
// re-index step. `next.config.ts` traces `docs/knowledge/**` into the server
// bundle so the files exist in production.
//
// The full corpus is ~140k tokens, which does not fit in a single request.
// Instead the model always gets the small core brief and pulls one reference
// file at a time via the `fetch_reference` tool (see the chat route).

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const KNOWLEDGE_DIR = path.join(process.cwd(), 'docs', 'knowledge')

export const CORE_BRIEF_FILE = '00-core-brief.md'

// Files the assistant is allowed to fetch, with the description the model sees
// when choosing. Deliberately EXCLUDES the developer-facing references
// (`02-api-endpoints.md`, `03-database-schema.md`) — admins ask how to use the
// platform, not how it is wired, and leaving those out keeps the model from
// answering a usage question with an endpoint path.
export const FETCHABLE_REFERENCES: Record<string, string> = {
  '07-workflows-and-faq.md':
    'Step-by-step playbooks for every task in the platform (introductions, applications, events, marketing, sponsorship, accountability, finance, contracts, website, automations, portals) plus a 44-question FAQ. START HERE for any "how do I..." question.',
  '05-screens-and-components.md':
    'What every individual screen shows and every button, dialog, form field, filter and bulk action on it, with the exact on-screen wording. Use when you need the precise label of a control, or what a specific screen does.',
  '01-routes-and-navigation.md':
    'Where every page lives (its URL), how the sidebar is organised, and which role can reach which area. Use for "where do I find..." and permission questions.',
  '04-business-logic.md':
    'How the platform calculates things and what fires automatically: match and lead scoring formulas, member engagement scores, ROI, the automation trigger catalogue, and hardcoded business rules such as tiers and quotas. Use for "how is X calculated" or "what happens automatically when...".',
}

export const FETCHABLE_FILE_NAMES = Object.keys(FETCHABLE_REFERENCES)

// Cached per lambda instance. The corpus is static between deploys.
const cache = new Map<string, string>()

function isAllowed(file: string): boolean {
  return file === CORE_BRIEF_FILE || file in FETCHABLE_REFERENCES
}

// Reads one knowledge file. Returns null rather than throwing when the file is
// missing or unreadable, so a partial corpus degrades to a weaker answer
// instead of a 500.
export async function readKnowledgeFile(file: string): Promise<string | null> {
  // Defence in depth: the tool schema constrains `file` to an enum, but the
  // value still originates from model output, so re-check against the
  // allowlist rather than trusting it into a path join.
  if (!isAllowed(file)) return null

  const cached = cache.get(file)
  if (cached !== undefined) return cached

  try {
    const content = await readFile(path.join(KNOWLEDGE_DIR, file), 'utf8')
    cache.set(file, content)
    return content
  } catch (e) {
    console.error('[help/knowledge] failed to read', file, e)
    return null
  }
}

// The always-in-context brief. Missing it is not fatal — the assistant falls
// back to a much thinner prompt and can still fetch references.
export async function readCoreBrief(): Promise<string | null> {
  return readKnowledgeFile(CORE_BRIEF_FILE)
}
