// GET /api/admin/docusign/consent
//
// The redirect target for DocuSign's one-time JWT consent grant. After an admin
// clicks "Allow" on the DocuSign consent screen, DocuSign sends them here with
// a ?code=…; JWT Grant doesn't need that code, so we just show a friendly,
// on-brand confirmation and let them close the tab. If consent was denied
// (?error=…), we say so.

import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function page(title: string, body: string, accent: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title></head>
<body style="margin:0;background:#F7F5F0;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:520px;margin:14vh auto 0;padding:0 20px;">
    <div style="background:#FFFFFF;border:1px solid #EAE6DE;border-radius:14px;padding:40px 36px;text-align:center;">
      <div style="font-family:Georgia,serif;font-size:26px;color:#2C2825;font-weight:600;">The Club</div>
      <div style="width:34px;height:1px;background:#B8975A;margin:12px auto 22px;"></div>
      <div style="width:54px;height:54px;border-radius:50%;background:${accent};margin:0 auto 20px;"></div>
      <h1 style="font-family:Georgia,serif;font-size:22px;color:#2C2825;font-weight:500;margin:0 0 12px;">${title}</h1>
      <p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.7;color:#3A3530;margin:0;">${body}</p>
    </div>
    <p style="text-align:center;font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#A09A93;margin-top:16px;">You can close this tab and return to the CRM.</p>
  </div>
</body></html>`
}

export async function GET(req: NextRequest) {
  const err = req.nextUrl.searchParams.get('error')
  const html = err
    ? page(
        'DocuSign access wasn’t granted',
        `The consent screen returned: “${err}”. Please try again from the CRM and choose <strong>Allow</strong>.`,
        '#C4694A',
      )
    : page(
        'DocuSign access granted',
        'The CRM can now send documents for e-signature. You won’t need to do this again.',
        '#5B7B6A',
      )
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
