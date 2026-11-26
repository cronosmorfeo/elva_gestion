import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Push } from './events';
import { BATCH_SIZE, escapeHtml, mailFor, pageLink, sendMails, validEmail } from './mail';

const FROM = 'ELVA Gestión <onboarding@resend.dev>';

const push = (extra: Partial<Push> = {}): Push => ({
  to: { uid: 'ana' },
  key: 'vacations_requests-v1-rechazada',
  email: true,
  message: {
    tag: 'vacations_requests-v1-rechazada',
    title: 'Sus vacaciones fueron rechazadas',
    body: 'Vacaciones del 14 dic al 20 dic. Motivo: <b>cierre</b> & "inventario"',
    url: '/tabs/solicitudes',
  },
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe('mailFor', () => {
  it('builds the e-mail from the template, escaping every text', () => {
    const mail = mailFor(push(), ' ana@correo.com ', FROM, 'https://elva-gestion.web.app/');
    expect(mail.from).toBe(FROM);
    expect(mail.to).toEqual(['ana@correo.com']);
    expect(mail.subject).toBe('Sus vacaciones fueron rechazadas');
    expect(mail.html).toContain('Motivo: &lt;b&gt;cierre&lt;/b&gt; &amp; &quot;inventario&quot;');
    expect(mail.html).not.toContain('<b>cierre</b>');
    expect(mail.html).toContain('href="https://elva-gestion.web.app/tabs/solicitudes"');
    expect(mail.text).toContain('Abrir ELVA Gestión: https://elva-gestion.web.app/tabs/solicitudes');
  });

  it('uses the subject of the push when there is one, on one line', () => {
    const mail = mailFor(push({ subject: 'Aviso importante:\r\nCierre' }), 'ana@correo.com', FROM);
    expect(mail.subject).toBe('Aviso importante: Cierre');
    // Without APP_URL there is no button.
    expect(mail.html).not.toContain('<a ');
  });

  it('only links to a plain https address', () => {
    expect(pageLink('https://elva-gestion.web.app', '/tabs/avisos')).toBe('https://elva-gestion.web.app/tabs/avisos');
    expect(pageLink('javascript:alert(1)', '/tabs')).toBe('');
    expect(pageLink('https://x.com/"><script>', '/tabs')).toBe('');
    expect(pageLink(undefined, '/tabs')).toBe('');
  });

  it('helpers', () => {
    expect(validEmail('ana@correo.com')).toBe(true);
    expect(validEmail('Ana <ana@correo.com>')).toBe(false);
    expect(validEmail('a@b')).toBe(false);
    expect(validEmail('')).toBe(false);
    expect(validEmail(42)).toBe(false);
    expect(escapeHtml(`<a href='x'>`)).toBe('&lt;a href=&#39;x&#39;&gt;');
  });
});

describe('sendMails', () => {
  it('sends one batch per 100 e-mails, with the key so Resend ignores a repeat', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const count = (JSON.parse(init.body as string) as unknown[]).length;
      return new Response(JSON.stringify({ data: Array.from({ length: count }, (_, id) => ({ id })) }), {
        status: 200,
      });
    });
    const mails = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => mailFor(push(), `p${i}@correo.com`, FROM));
    expect(await sendMails('re_test', 'notices-n1', mails)).toBe(BATCH_SIZE + 1);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://api.resend.com/emails/batch');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer re_test');
    expect(headers['idempotency-key']).toBe('notices-n1-0');
    expect(headers['x-batch-validation']).toBe('permissive');
    expect((calls[1].init.headers as Record<string, string>)['idempotency-key']).toBe('notices-n1-1');
    expect(JSON.parse(calls[0].init.body as string)).toHaveLength(BATCH_SIZE);
  });

  it('sends the good ones when some addresses are refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({ data: [{ id: 'a' }], errors: [{ index: 1, message: 'You can only send testing emails' }] }),
          { status: 200 },
        ),
    );
    const mails = [mailFor(push(), 'ana@correo.com', FROM), mailFor(push(), 'luis@correo.com', FROM)];
    expect(await sendMails('re_test', 'k', mails)).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 of 2 not sent'));
    warn.mockRestore();
  });

  it("throws on an error answer, with Resend's reason", async () => {
    vi.stubGlobal('fetch', async () => new Response('{"message":"Invalid from field"}', { status: 422 }));
    await expect(sendMails('re_test', 'k', [mailFor(push(), 'ana@correo.com', FROM)])).rejects.toThrow(
      'resend 422 Invalid from field',
    );
  });
});
