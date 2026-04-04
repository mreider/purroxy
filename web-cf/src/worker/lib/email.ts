// Mailgun email helpers for Cloudflare Workers

export async function sendEmail(
  apiKey: string,
  domain: string,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!apiKey) return false;

  const form = new URLSearchParams();
  form.append('from', `Purroxy <noreply@${domain}>`);
  form.append('to', to);
  form.append('subject', subject);
  form.append('html', html);

  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa('api:' + apiKey),
    },
    body: form,
  });

  return res.ok;
}

// --- HTML helpers ---

function button(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background:#2563eb; border-radius:6px; padding:12px 24px;">
        <a href="${url}" style="color:#ffffff; text-decoration:none; font-size:14px; font-weight:600;">${text}</a>
      </td>
    </tr>
  </table>`;
}

export function wrap(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0; padding:0; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#ffffff; border-radius:8px; border:1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px 16px; border-bottom:1px solid #f1f5f9;">
              <span style="font-size:18px; font-weight:700; color:#1e293b;">Purroxy</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:24px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px; border-top:1px solid #f1f5f9;">
              <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.5;">
                Purroxy - Sites for Claude Desktop<br>
                <a href="https://purroxy.com" style="color:#94a3b8;">purroxy.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Email templates ---

export async function sendVerificationEmail(
  apiKey: string,
  domain: string,
  appUrl: string,
  to: string,
  token: string,
): Promise<boolean> {
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;
  const html = wrap(`
    <h2 style="margin:0 0 16px; font-size:20px; color:#1e293b;">Verify Your Email</h2>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      Thanks for signing up for Purroxy. Click the button below to verify your email address.
    </p>
    ${button('Verify Email', verifyUrl)}
    <p style="margin:0 0 8px; font-size:13px; color:#94a3b8; line-height:1.5;">
      This link expires in 24 hours. If you didn't create this account, ignore this email.
    </p>
    <p style="margin:0; font-size:12px; color:#cbd5e1; word-break:break-all;">
      ${verifyUrl}
    </p>
  `);

  return sendEmail(apiKey, domain, to, 'Verify your Purroxy email', html);
}

export async function sendWelcome(
  apiKey: string,
  domain: string,
  appUrl: string,
  to: string,
  username: string,
): Promise<boolean> {
  const html = wrap(`
    <h2 style="margin:0 0 16px; font-size:20px; color:#1e293b;">Welcome to Purroxy</h2>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      Hey ${username}, thanks for signing up. Purroxy turns any website into a site
      for Claude Desktop, so you can automate what you do on the web with AI.
    </p>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      Here's how to get started:
    </p>
    <ol style="margin:0 0 12px; padding-left:20px; font-size:14px; color:#475569; line-height:1.8;">
      <li>Browse the <a href="${appUrl}/marketplace" style="color:#2563eb;">public library</a> for existing sites</li>
      <li>Or build your own: just enter a website URL</li>
      <li>Connect to Claude Desktop and start asking</li>
    </ol>
    ${button('Get Started', appUrl)}
    <p style="margin:0; font-size:13px; color:#94a3b8;">
      7-day free trial, then $3.89/month. Submit a site to get free access forever.
    </p>
  `);

  return sendEmail(apiKey, domain, to, 'Welcome to Purroxy', html);
}

export async function sendPasswordReset(
  apiKey: string,
  domain: string,
  appUrl: string,
  to: string,
  resetToken: string,
): Promise<boolean> {
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;
  const html = wrap(`
    <h2 style="margin:0 0 16px; font-size:20px; color:#1e293b;">Reset Your Password</h2>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      We received a request to reset your password. Click the button below to choose a new one.
    </p>
    ${button('Reset Password', resetUrl)}
    <p style="margin:0 0 8px; font-size:13px; color:#94a3b8; line-height:1.5;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    </p>
    <p style="margin:0; font-size:12px; color:#cbd5e1; word-break:break-all;">
      ${resetUrl}
    </p>
  `);

  return sendEmail(apiKey, domain, to, 'Reset your Purroxy password', html);
}

export async function sendSubscriptionConfirmation(
  apiKey: string,
  domain: string,
  to: string,
  username: string,
): Promise<boolean> {
  const html = wrap(`
    <h2 style="margin:0 0 16px; font-size:20px; color:#1e293b;">Subscription Active</h2>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      Hey ${username}, your Purroxy subscription is now active. You have unlimited access
      to all sites and capabilities.
    </p>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      You can manage your subscription anytime from your account settings.
    </p>
    ${button('Open Purroxy', 'https://purroxy.com')}
  `);

  return sendEmail(apiKey, domain, to, 'Your Purroxy subscription is active', html);
}

export async function sendSiteApproved(
  apiKey: string,
  domain: string,
  appUrl: string,
  to: string,
  siteName: string,
): Promise<boolean> {
  const html = wrap(`
    <h2 style="margin:0 0 16px; font-size:20px; color:#1e293b;">Site Approved!</h2>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      Your site <strong>${siteName}</strong> has been approved and is now live
      in the Purroxy public library. Your account has been upgraded to Contributor, free forever.
    </p>
    ${button('View in Library', `${appUrl}/marketplace`)}
  `);

  return sendEmail(apiKey, domain, to, `${siteName} is live in the Purroxy library`, html);
}

export async function sendSiteRejected(
  apiKey: string,
  domain: string,
  appUrl: string,
  to: string,
  siteName: string,
  reason: string,
): Promise<boolean> {
  const html = wrap(`
    <h2 style="margin:0 0 16px; font-size:20px; color:#1e293b;">Changes Needed</h2>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      Your site <strong>${siteName}</strong> wasn't approved yet.
    </p>
    <div style="margin:16px 0; padding:12px 16px; background:#fef2f2; border-radius:6px; border-left:3px solid #ef4444;">
      <p style="margin:0; font-size:13px; color:#991b1b;">${reason}</p>
    </div>
    <p style="margin:0 0 12px; font-size:14px; color:#475569; line-height:1.6;">
      You can fix the issues and resubmit from the desktop app.
    </p>
  `);

  return sendEmail(apiKey, domain, to, `${siteName}: changes needed`, html);
}
