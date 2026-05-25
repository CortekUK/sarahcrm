// Pushes the branded "Invite user" email template + URL allow-list to
// the Supabase project via the Management API. Run after the codebase
// changes the template content, or whenever you want to re-sync the
// dashboard config from this repo (so it's not lost on a project move).
//
// Reads SUPABASE_ACCESS_TOKEN from .env.local.

import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const TOKEN = env.SUPABASE_ACCESS_TOKEN
const REF = 'owjnsljovmaaxgxpxxtw'

// ─── Branded "Invite user" template (ink + bronze) ───────────────────
// Uses Supabase's standard placeholders:
//   {{ .ConfirmationURL }}   — the password-set link (lands on our
//                              /set-password page once redirectTo is
//                              allow-listed)
//   {{ .Data.first_name }}   — user_metadata.first_name we pass when
//                              inviting (see api/admin/applications/approve)
//
// IMPORTANT: keep this in sync with docs/supabase-auth-setup.md (the
// human-readable copy of the same template).
const INVITE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Welcome to The Club</title>
  </head>
  <body style="margin:0;padding:0;background:#0E1014;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0E1014;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#14171D;border:1px solid #2C313B;">
            <tr>
              <td align="center" style="padding:40px 32px 24px 32px;border-bottom:1px solid #2C313B;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:0.02em;color:#F0EBE0;font-weight:600;">The Club</div>
                <div style="margin-top:10px;">
                  <span style="display:inline-block;width:32px;height:1px;background:#A87B4F;vertical-align:middle;"></span>
                  <span style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#A87B4F;padding:0 12px;font-weight:500;">by Sarah Restrick</span>
                  <span style="display:inline-block;width:32px;height:1px;background:#A87B4F;vertical-align:middle;"></span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 16px 40px;">
                <p style="margin:0 0 24px 0;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:#C09870;font-weight:500;">Welcome</p>
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.15;color:#F0EBE0;font-weight:500;letter-spacing:-0.01em;">Your seat at The Club.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 16px 40px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">Hello {{ .Data.first_name }},</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">Your application to The Club has been approved. To finish setting up your members account, choose a password — you'll be taken straight to your members area afterwards.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 40px 8px 40px;">
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:16px 36px;background:#A87B4F;color:#0E1014;text-decoration:none;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-weight:600;border-radius:999px;">Set your password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 16px 40px;">
                <p style="margin:0;font-size:12px;line-height:1.7;color:#8A8680;">If the button doesn't work, paste this link into your browser:</p>
                <p style="margin:8px 0 0 0;word-break:break-all;">
                  <a href="{{ .ConfirmationURL }}" style="font-size:12px;color:#C09870;text-decoration:underline;">{{ .ConfirmationURL }}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <div style="height:1px;background:#2C313B;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 40px 40px;">
                <p style="margin:0 0 8px 0;font-style:italic;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#D6D0C2;">With warmth,</p>
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#F0EBE0;">Sarah Restrick &amp; the team</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:24px;">
            <tr>
              <td align="center" style="padding:0 16px;">
                <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C5953;font-weight:500;">The Club by Sarah Restrick</p>
                <p style="margin:8px 0 0 0;font-size:11px;color:#5C5953;">This link expires in 24 hours. If you didn't expect it, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

// All redirect URLs the auth flow needs to land on. Supabase's allow-list
// is comma-separated. Keeping both http://localhost and the deployed
// domain so the same project works in dev + prod.
const ALLOWED_URIS = [
  'http://localhost:3000/set-password',
  'http://localhost:3000/portal',
  'http://localhost:3000/dashboard',
  'http://localhost:3000/login',
  'https://sarahcrm.vercel.app/set-password',
  'https://sarahcrm.vercel.app/portal',
  'https://sarahcrm.vercel.app/dashboard',
  'https://sarahcrm.vercel.app/login',
]

const patch = {
  mailer_subjects_invite: 'Welcome to The Club — set your password',
  mailer_templates_invite_content: INVITE_TEMPLATE,
  uri_allow_list: ALLOWED_URIS.join(','),
  // Leave site_url alone — admins should set this from the Supabase
  // dashboard when promoting between environments. Touching it from
  // a script could break unrelated email links.
}

console.log('— Pushing branded invite template + URL allow-list —')
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(patch),
})
const text = await res.text()
if (!res.ok) {
  console.error(`✗ Failed (${res.status}):`, text)
  process.exit(1)
}
console.log(`✓ Updated. Subject is now: "${patch.mailer_subjects_invite}"`)
console.log(`✓ Invite template: ${INVITE_TEMPLATE.length.toLocaleString()} chars of branded HTML`)
console.log(`✓ Allow-list: ${ALLOWED_URIS.length} URLs whitelisted`)

// Verify the round-trip — re-read and confirm the new values stuck.
const verify = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
})
const cfg = await verify.json()
console.log('\nVerified after write:')
console.log('  subject:', cfg.mailer_subjects_invite)
console.log('  uri_allow_list:', cfg.uri_allow_list.split(',').length, 'entries')
console.log('  site_url:', cfg.site_url, '(unchanged)')
console.log(
  '  template starts with:',
  cfg.mailer_templates_invite_content.slice(0, 60).replace(/\n/g, ' '),
  '…',
)
