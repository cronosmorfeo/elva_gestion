// E-mails with Resend (https://resend.com), sent with the same push: same people, same text.
// The page never sends an address, a subject or HTML: the Worker takes each person's address from
// colaboradores.correo and builds the e-mail from a fixed template, escaping every text it puts in.

import type { Push } from './events';

export interface Mail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

const BATCH_URL = 'https://api.resend.com/emails/batch';
// Resend takes up to 100 e-mails per batch call; one call per change keeps the Worker under its
// limit of outside requests.
export const BATCH_SIZE = 100;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL.test(value.trim());
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// One line, cut at `max` letters.
function oneLine(value: string, max: number): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// The link to the page, only when APP_URL is a plain https address (or localhost for tests).
export function pageLink(appUrl: string | undefined, path: string): string {
  const base = (appUrl ?? '').trim().replace(/\/+$/, '');
  if (!/^(https:\/\/[a-z0-9.-]+|http:\/\/localhost(:\d+)?)$/i.test(base)) return '';
  return path.startsWith('/') ? `${base}${path}` : '';
}

export function mailFor(push: Push, to: string, from: string, appUrl?: string): Mail {
  const subject = oneLine(push.subject ?? push.message.title, 150);
  const body = oneLine(push.message.body, 1200);
  const link = pageLink(appUrl, push.message.url);
  const footer = 'Este correo lo envía ELVA Gestión de forma automática. No responda a este mensaje.';
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#008f82;color:#ffffff;` +
      `padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Abrir ELVA Gestión</a></p>`
    : '';
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;max-width:560px;margin:0 auto;padding:24px">` +
    `<p style="color:#00756b;font-weight:bold;margin:0 0 16px">ELVA Gestión</p>` +
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(subject)}</h1>` +
    `<p style="font-size:15px;line-height:1.5;margin:0">${escapeHtml(body)}</p>` +
    button +
    `<p style="font-size:12px;color:#6b7280;margin-top:32px">${escapeHtml(footer)}</p></div>`;
  const text = [subject, '', body, ...(link ? ['', `Abrir ELVA Gestión: ${link}`] : []), '', footer].join('\n');
  return { from, to: [to.trim()], subject, html, text };
}

// Sends the e-mails in batches. `key` (the push_log key) makes Resend ignore a repeated call for the
// same change. Permissive mode: one bad address (or, with Resend's test sender, anyone but the account's
// owner) does not stop the others; those are logged by position only. Returns how many were accepted;
// throws on an error answer, with Resend's reason (Worker logs only).
export async function sendMails(apiKey: string, key: string, mails: Mail[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < mails.length; i += BATCH_SIZE) {
    const batch = mails.slice(i, i + BATCH_SIZE);
    const res = await fetch(BATCH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `${key}-${i / BATCH_SIZE}`.slice(0, 256),
        'x-batch-validation': 'permissive',
      },
      body: JSON.stringify(batch),
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: unknown[];
      errors?: { index?: unknown; message?: unknown }[];
      message?: unknown;
    };
    if (!res.ok) throw new Error(`resend ${res.status} ${String(body.message ?? '').slice(0, 200)}`.trim());
    const errors = Array.isArray(body.errors) ? body.errors : [];
    if (errors.length) {
      const first = String(errors[0]?.message ?? '').slice(0, 200);
      console.warn(`[mail] ${errors.length} of ${batch.length} not sent (e.g. #${String(errors[0]?.index)}: ${first})`);
    }
    sent += Array.isArray(body.data) ? body.data.length : batch.length - errors.length;
  }
  return sent;
}
