import nodemailer from 'nodemailer';

let cachedTransporter = null;

function getSmtpTransporter() {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;

  if (!cachedTransporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure =
      process.env.SMTP_SECURE === 'true' || port === 465;
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

export function isEmailConfigured() {
  const hasResend = Boolean((process.env.RESEND_API_KEY || '').trim());
  const hasSmtp = Boolean(
    (process.env.SMTP_HOST || '').trim() &&
      (process.env.SMTP_USER || '').trim() &&
      (process.env.SMTP_PASS || '').trim()
  );
  return hasResend || hasSmtp;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

function stripHeaderNewlines(val) {
  return String(val ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail({ to, subject, text, html, replyTo = '' }) {
  const cleanTo = stripHeaderNewlines(to);
  const cleanSubject = stripHeaderNewlines(subject);
  const cleanReplyTo = stripHeaderNewlines(replyTo);
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const defaultFrom =
    stripHeaderNewlines(process.env.MAIL_FROM || '') ||
    stripHeaderNewlines(process.env.SMTP_USER || '') ||
    'eriqo <no-reply@eriqo.local>';

  // 1. Prefer Resend HTTP API if configured
  if (resendKey) {
    const payload = {
      from: defaultFrom,
      to: [cleanTo],
      subject: cleanSubject,
      text,
      html,
    };
    if (cleanReplyTo) {
      payload.reply_to = cleanReplyTo;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Email delivery failed (${res.status}): ${body || 'Resend error'}`);
    }
    return { delivered: true, provider: 'resend' };
  }

  // 2. Otherwise use SMTP (e.g., Gmail App Password, Outlook, Brevo)
  const transporter = getSmtpTransporter();
  if (transporter) {
    await transporter.sendMail({
      from: defaultFrom,
      to: cleanTo,
      replyTo: cleanReplyTo || undefined,
      subject: cleanSubject,
      text,
      html,
    });
    return { delivered: true, provider: 'smtp' };
  }

  // 3. Fallback when no email provider is configured yet
  return { delivered: false, provider: 'console' };
}

export async function sendSignupVerificationEmail({ to, name, code, expiresInMinutes = 15 }) {
  const safeName = stripHeaderNewlines(name || 'Instructor');
  const safeCode = stripHeaderNewlines(code);
  const subject = `${safeCode} is your eriqo verification code`;
  const text = [
    `Hi ${safeName},`,
    '',
    `Your eriqo email verification code is: ${safeCode}`,
    '',
    `Enter this 6-digit code to finish creating your instructor account. It expires in ${expiresInMinutes} minutes.`,
    '',
    'If you did not try to create an eriqo account, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">
        <span style="color: #0f2b5b;">eri</span><span style="color: #10c96f;">qo</span>
      </div>
      <h2 style="font-size: 18px; margin: 0 0 10px;">Confirm your email address</h2>
      <p style="font-size: 14px; color: #475569; line-height: 1.55; margin: 0 0 20px;">
        Hi ${escapeHtml(safeName)}, enter the 6-digit verification code below to finish creating your instructor account:
      </p>
      <div style="background: #f1f5fb; border: 1px solid #d3dcec; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 30px; font-weight: 700; letter-spacing: 0.25em; color: #0f172a;">
          ${escapeHtml(safeCode)}
        </span>
      </div>
      <p style="font-size: 13px; color: #64748b; margin: 0;">
        This code expires in ${expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, text, html });
  if (!result.delivered && !IS_PRODUCTION) {
    console.log(
      `\n[EMAIL VERIFICATION] Account: ${to} (${safeName}) | Code: ${safeCode} | Expires in ${expiresInMinutes}m\n`
    );
  }
  return result;
}

export async function sendOwnerSecurityCodeEmail({ to, code, expiresInMinutes = 5 }) {
  const safeCode = stripHeaderNewlines(code);
  const subject = `${safeCode} — eriqo Owner Monitor Security Code`;
  const text = [
    'eriqo Owner Security Verification',
    '',
    `Your one-time code to unlock the private Active Users Monitor is: ${safeCode}`,
    '',
    `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
    'If you did not request this unlock, change your account password immediately.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">
        <span style="color: #0f2b5b;">eri</span><span style="color: #10c96f;">qo</span>
      </div>
      <h2 style="font-size: 18px; margin: 0 0 10px;">Owner Monitor Security Code</h2>
      <p style="font-size: 14px; color: #475569; line-height: 1.55; margin: 0 0 18px;">
        Enter this one-time 6-digit code to unlock your private Active Users Monitor:
      </p>
      <div style="background: #f1f5fb; border: 1px solid #d3dcec; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 18px;">
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 30px; font-weight: 700; letter-spacing: 0.25em; color: #0f172a;">
          ${escapeHtml(safeCode)}
        </span>
      </div>
      <p style="font-size: 13px; color: #64748b; margin: 0;">
        Expires in ${expiresInMinutes} minutes (single use). If you did not request this, change your password immediately.
      </p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}

export async function sendPasswordResetEmail({ to, name, code, expiresAt }) {
  const safeName = stripHeaderNewlines(name || 'Instructor');
  const safeCode = stripHeaderNewlines(code);
  const subject = `eriqo Password Reset Code: ${safeCode}`;
  const text = [
    `Hi ${safeName},`,
    '',
    `Your eriqo password reset code is: ${safeCode}`,
    '',
    'This code expires in 15 minutes. If you did not request a password reset, you can ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">
        <span style="color: #0f2b5b;">eri</span><span style="color: #10c96f;">qo</span>
      </div>
      <h2 style="font-size: 18px; margin: 0 0 10px;">Reset your password</h2>
      <p style="font-size: 14px; color: #475569; line-height: 1.55; margin: 0 0 20px;">
        Hi ${escapeHtml(safeName)}, use this single-use code to reset your eriqo password:
      </p>
      <div style="background: #f1f5fb; border: 1px solid #d3dcec; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
        <span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 24px; font-weight: 700; letter-spacing: 0.14em; color: #0f172a;">
          ${escapeHtml(safeCode)}
        </span>
      </div>
      <p style="font-size: 13px; color: #64748b; margin: 0;">
        This code expires in 15 minutes.
      </p>
    </div>
  `;

  const result = await sendEmail({ to, subject, text, html });
  if (!result.delivered && !IS_PRODUCTION) {
    console.log(
      `\n[PASSWORD RESET] Account: ${to} | Code: ${safeCode} | Expires: ${expiresAt}\n`
    );
  }
  return result;
}

const DEFAULT_SUPPORT_EMAIL = 'attend.qrsupport@gmail.com';

export function getSupportEmail() {
  return (process.env.SUPPORT_EMAIL || '').trim() || DEFAULT_SUPPORT_EMAIL;
}

export async function sendSupportReportEmail({
  reportId,
  senderName,
  senderEmail,
  category,
  subject,
  message,
}) {
  const supportRecipient = (process.env.SUPPORT_EMAIL || '').trim() || DEFAULT_SUPPORT_EMAIL;
  const cleanCategory = String(category || 'General').trim();
  const cleanSubject = String(subject || 'Problem Report').trim();
  const cleanMessage = String(message || '').trim();
  const cleanName = String(senderName || 'Instructor').trim();
  const cleanEmail = String(senderEmail || '').trim();

  const mailSubject = `[eriqo Support · ${cleanCategory}] ${cleanSubject}`;
  const text = [
    `Report ID: ${reportId}`,
    `From: ${cleanName} <${cleanEmail}>`,
    `Category: ${cleanCategory}`,
    `Subject: ${cleanSubject}`,
    '',
    'Message:',
    cleanMessage,
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 14px;">
        <span style="color: #0f2b5b;">eri</span><span style="color: #10c96f;">qo</span>
        <span style="font-size: 13px; color: #64748b; font-weight: 500; margin-left: 8px;">Problem Report</span>
      </div>
      <div style="background: #f1f5fb; border: 1px solid #d3dcec; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; font-size: 13px;">
        <div><strong>From:</strong> ${escapeHtml(cleanName)} (${escapeHtml(cleanEmail)})</div>
        <div style="margin-top: 4px;"><strong>Category:</strong> ${escapeHtml(cleanCategory)}</div>
        <div style="margin-top: 4px;"><strong>Subject:</strong> ${escapeHtml(cleanSubject)}</div>
        <div style="margin-top: 4px; color: #64748b;"><strong>Report ID:</strong> ${escapeHtml(reportId)}</div>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(cleanMessage)}</div>
    </div>
  `;

  const result = await sendEmail({
    to: supportRecipient,
    replyTo: cleanEmail,
    subject: mailSubject,
    text,
    html,
  });

  if (!result.delivered && !IS_PRODUCTION) {
    console.log(
      `\n[SUPPORT REPORT ${reportId}] From: ${cleanName} <${cleanEmail}> | Category: ${cleanCategory} | Subject: ${cleanSubject}\n${cleanMessage}\n`
    );
  }
  return result;
}
