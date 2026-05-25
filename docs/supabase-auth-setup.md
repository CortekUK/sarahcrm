# Supabase auth setup — invitation email + redirect URL

When an admin approves an application at `/dashboard/applications`, the
server calls `supabase.auth.admin.inviteUserByEmail()` with a
`redirectTo` of `<site>/set-password`. For that flow to actually land
on our branded page (instead of Supabase's default), three one-time
dashboard tweaks are required.

## 1. Add `/set-password` to the redirect-URL allow-list

If this URL isn't on the allow-list, Supabase silently drops the
`redirectTo` and falls back to your Site URL — which is why the invite
email currently lands on the homepage / login page instead of
`/set-password`.

**Supabase Dashboard → Auth → URL Configuration → Redirect URLs:**

Add **all** of these (one per line):

```
https://sarahcrm.vercel.app/set-password
https://sarahcrm.vercel.app/portal
http://localhost:3000/set-password
http://localhost:3000/portal
```

(If you've deployed under a custom domain, add that variant too.)

## 2. Set the Site URL

**Supabase Dashboard → Auth → URL Configuration → Site URL:**

For production:

```
https://sarahcrm.vercel.app
```

The Site URL gets used as `{{ .SiteURL }}` inside email templates and as
the fallback redirect when no `redirectTo` is whitelisted. It's a
single value, so set it to production — `localhost` only needs to
appear in the allow-list above.

## 3. Replace the "Invite user" email template

**Supabase Dashboard → Auth → Email Templates → "Invite user":**

Set the subject:

```
Welcome to The Club — set your password
```

Then paste the HTML below into the body. It uses Supabase's standard
placeholders (`{{ .ConfirmationURL }}`, `{{ .Data.first_name }}`) and
already includes the bronze/ink branding so the email matches the
public site.

```html
<!DOCTYPE html>
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
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#14171D;border:1px solid #2C313B;border-radius:0;">

            <!-- Brand bar -->
            <tr>
              <td align="center" style="padding:40px 32px 12px 32px;border-bottom:1px solid #2C313B;">
                <!-- Replace src below with a hosted logo URL once you upload one.
                     Supabase email templates can't reference /public assets directly. -->
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:0.02em;color:#F0EBE0;font-weight:600;">
                  The Club
                </div>
                <div style="margin-top:8px;display:inline-block;">
                  <span style="display:inline-block;width:32px;height:1px;background:#A87B4F;vertical-align:middle;"></span>
                  <span style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#A87B4F;padding:0 12px;font-weight:500;">
                    by Sarah Restrick
                  </span>
                  <span style="display:inline-block;width:32px;height:1px;background:#A87B4F;vertical-align:middle;"></span>
                </div>
              </td>
            </tr>

            <!-- Headline + greeting -->
            <tr>
              <td style="padding:40px 40px 16px 40px;">
                <p style="margin:0 0 24px 0;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:#C09870;font-weight:500;">
                  Welcome
                </p>
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.15;color:#F0EBE0;font-weight:500;letter-spacing:-0.01em;">
                  Your seat at The Club.
                </h1>
              </td>
            </tr>

            <!-- Body copy -->
            <tr>
              <td style="padding:0 40px 16px 40px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
                  Hello {{ .Data.first_name }},
                </p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#D6D0C2;">
                  Your application to The Club has been approved. To finish setting up your
                  members account, choose a password and you'll be taken straight to your
                  members area.
                </p>
              </td>
            </tr>

            <!-- CTA button -->
            <tr>
              <td align="center" style="padding:24px 40px 8px 40px;">
                <a href="{{ .ConfirmationURL }}"
                   style="display:inline-block;padding:16px 36px;background:#A87B4F;color:#0E1014;text-decoration:none;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-weight:600;border-radius:999px;">
                  Set your password
                </a>
              </td>
            </tr>

            <!-- Fallback link -->
            <tr>
              <td style="padding:24px 40px 16px 40px;">
                <p style="margin:0;font-size:12px;line-height:1.7;color:#8A8680;">
                  If the button doesn't work, paste this link into your browser:
                </p>
                <p style="margin:8px 0 0 0;word-break:break-all;">
                  <a href="{{ .ConfirmationURL }}" style="font-size:12px;color:#C09870;text-decoration:underline;">
                    {{ .ConfirmationURL }}
                  </a>
                </p>
              </td>
            </tr>

            <!-- Hairline -->
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <div style="height:1px;background:#2C313B;"></div>
              </td>
            </tr>

            <!-- Sign-off -->
            <tr>
              <td style="padding:24px 40px 40px 40px;">
                <p style="margin:0 0 8px 0;font-style:italic;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#D6D0C2;">
                  With warmth,
                </p>
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#F0EBE0;">
                  Sarah Restrick &amp; the team
                </p>
              </td>
            </tr>

          </table>

          <!-- Footer -->
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:24px;">
            <tr>
              <td align="center" style="padding:0 16px;">
                <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5C5953;font-weight:500;">
                  The Club by Sarah Restrick
                </p>
                <p style="margin:8px 0 0 0;font-size:11px;color:#5C5953;">
                  This link expires in 24 hours. If you didn't expect it, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
```

## 4. (Optional) Customize sender name + reply-to

**Supabase Dashboard → Auth → Email Templates → SMTP Settings:**

If you're using Supabase's built-in email service (the default), the
sender will be `noreply@mail.app.supabase.io`. To send from
`hello@theclubsarahrestrick.com` instead, wire up custom SMTP under
Auth Settings → SMTP Settings — Supabase supports any provider that
speaks SMTP (Resend, SendGrid, Postmark, etc.).

Without custom SMTP, the email *content* is still fully branded by the
HTML template above; only the From: address shows Supabase's domain.

## Verification checklist

After applying the three changes above, approve a test application
from `/dashboard/applications` and check:

- [ ] The email arrives with subject "Welcome to The Club — set your password"
- [ ] The body is dark / bronze branded (not Supabase's default blue link)
- [ ] Clicking the CTA lands on `<your domain>/set-password`, not the
      homepage or login page
- [ ] The `/set-password` page shows "Welcome, {first name}" and lets
      you set a password
- [ ] After setting a password you land on `/portal`
