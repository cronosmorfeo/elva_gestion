import { describe, expect, it } from 'vitest';

import { MAX_FILE_BYTES, checkUpload, downloadName, ownerOf, reportPath, safeName } from './files';
import { presign } from './sigv4';

describe('checkUpload', () => {
  it('accepts the allowed types and takes the content type from the extension', () => {
    expect(checkUpload('Informe final.PDF', 1000)).toEqual({
      ok: true,
      name: 'Informe-final.PDF',
      contentType: 'application/pdf',
    });
    expect(checkUpload('planilla.xlsx', MAX_FILE_BYTES)).toMatchObject({ ok: true });
    expect(checkUpload('foto.jfif', 10)).toMatchObject({ ok: true, contentType: 'image/jpeg' });
  });

  it('rejects other types, empty or too big files and bad input', () => {
    for (const name of ['virus.exe', 'pagina.html', 'dibujo.svg', 'todo.zip', 'sin-extension', 'script.js']) {
      expect(checkUpload(name, 10)).toEqual({ ok: false, error: 'type not allowed' });
    }
    expect(checkUpload('a.pdf', MAX_FILE_BYTES + 1)).toEqual({ ok: false, error: 'too big' });
    expect(checkUpload('a.pdf', 0)).toEqual({ ok: false, error: 'bad size' });
    expect(checkUpload('a.pdf', 1.5)).toEqual({ ok: false, error: 'bad size' });
    expect(checkUpload('a.pdf', '10')).toEqual({ ok: false, error: 'bad size' });
    expect(checkUpload('', 10)).toEqual({ ok: false, error: 'missing name' });
  });
});

describe('names and paths', () => {
  it('keeps names safe', () => {
    expect(safeName('Reporte de Señor Pérez (v2).docx')).toBe('Reporte-de-Senor-Perez-v2-.docx');
    expect(safeName('../../etc/passwd.txt')).toBe('etc-passwd.txt');
    expect(safeName('a'.repeat(200) + '.pdf')).toHaveLength(80);
    expect(safeName('a'.repeat(200) + '.pdf').endsWith('.pdf')).toBe(true);
  });

  it('finds the owner only in a real report path', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const path = reportPath('uidAna', id, 'informe.pdf');
    expect(path).toBe(`reports/uidAna/${id}-informe.pdf`);
    expect(ownerOf(path)).toBe('uidAna');
    expect(downloadName(path)).toBe('informe.pdf');
    expect(ownerOf(`reports/uidAna/../uidLuis/${id}-informe.pdf`)).toBeNull();
    expect(ownerOf(`otros/uidAna/${id}-informe.pdf`)).toBeNull();
    expect(ownerOf(`reports/uidAna/informe.pdf`)).toBeNull();
    expect(ownerOf(42)).toBeNull();
  });
});

describe('presign (AWS Signature Version 4)', () => {
  it('matches the example in the AWS documentation', async () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = await presign({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresSeconds: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });

  it('signs the size and type of an upload', async () => {
    const url = new URL(
      await presign({
        method: 'PUT',
        host: 's3.us-east-005.backblazeb2.com',
        path: '/bucket/reports/u/x.pdf',
        region: 'us-east-005',
        accessKeyId: 'id',
        secretAccessKey: 'secret',
        expiresSeconds: 300,
        now: new Date('2026-11-24T15:00:00Z'),
        headers: { 'content-type': 'application/pdf', 'content-length': '1000' },
      }),
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.pathname).toBe('/bucket/reports/u/x.pdf');
  });
});
