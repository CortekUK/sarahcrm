# `docs/knowledge/` — the help assistant's knowledge base

This directory is the machine-readable map of the whole platform. It exists to be
fed into the in-app AI help assistant so it can answer staff questions like
*"how do I set up an introduction between two people?"* with real screen names,
real button labels and the real order of steps.

It is **documentation, not code**. Nothing here is imported at build time.

## The files

| File | Size | Covers |
|---|---|---|
| `00-core-brief.md` | ~9 KB | Roles, front doors, sidebar, vocabulary, the rules people get wrong, and a routing table. **Always in context.** |
| `01-routes-and-navigation.md` | ~31 KB | Every page URL → file → component, all layouts, middleware role gating, the full nav trees |
| `02-api-endpoints.md` | ~55 KB | All ~100 API routes: methods, request/response shape, auth, external services, tables touched |
| `03-database-schema.md` | ~74 KB | 79 tables with columns and FKs, 12 enums + ~35 CHECK vocabularies, RLS tiers, storage buckets, triggers |
| `04-business-logic.md` | ~94 KB | Every file in `src/lib/`: scoring formulas, AI prompts, the automation trigger catalogue, hardcoded business rules |
| `05-screens-and-components.md` | ~111 KB | Every admin/portal/staff screen and **every button on it**, plus the component catalogue and theming |
| `06-integrations-and-config.md` | ~33 KB | OpenAI, Stripe, Resend, Google, Xero, DocuSign, WhatsApp; env vars, crons, webhooks, scripts, deploy |
| `07-workflows-and-faq.md` | ~64 KB | 22 numbered step-by-step playbooks + a 44-question FAQ |

Total ≈ 472 KB ≈ 120k tokens.

## How to feed this to the assistant

The whole corpus does **not** fit comfortably in a single `gpt-4o-mini` request,
and sending it on every turn would be slow and expensive. Use two tiers:

1. **Always send `00-core-brief.md`** in the system prompt (~2.5k tokens). It
   answers the most common questions outright and tells the model which
   reference file covers what.
2. **Attach one or two reference files on demand**, chosen by routing the user's
   question through the table in §7 of the core brief. `07-workflows-and-faq.md`
   is the right file for the large majority of "how do I…" questions.

Keyword routing is enough here — no vector store is needed. If a question spans
areas, prefer `07-workflows-and-faq.md` plus `05-screens-and-components.md`.

The existing public-site concierge (`src/app/api/concierge/chat/route.ts` and
`src/components/website/night/ConciergeWidget.tsx`) is the house pattern to copy
for the endpoint and the floating widget: a scope-guarded system prompt, strict
JSON-schema structured output, conversation persistence, rate limiting, and a
calm canned reply on every failure path.

Model selection follows the repo convention — read
`process.env.OPENAI_MODEL` with a hardcoded fallback, so the help assistant can
be pinned to a cheaper model independently of the rest of the platform.

## Keeping it current

**This is the part that matters.** A stale map makes the assistant confidently
wrong, which is worse than having no assistant.

When you add or change a feature, update the affected files in the same commit
as the code:

| You changed | Update |
|---|---|
| Added/moved a page, or changed the sidebar | `01`, and `00` if the sidebar changed |
| Added/changed an API route | `02` |
| Ran a migration, added a table/column/status value | `03` |
| Changed scoring, prompts, automations or business rules | `04` |
| Added a screen, button, dialog or form field | `05` **and** `07` |
| Added an integration, env var, cron or webhook | `06` |
| Changed how staff actually do a task | `07`, and `00` §8 if it is a top question |

The fastest way to regenerate a section is to ask Claude Code to re-map that one
area against the current code and rewrite only that file, rather than
regenerating the whole corpus.

## Provenance

Generated 2026-09-07 by seven parallel mapping agents reading the codebase
directly, cross-checked against `docs/PLATFORM-USER-JOURNEY-TRAINING.md` and the
other files in `docs/`. Where the older docs disagreed with the code, the code
won and the doc claim was corrected.
