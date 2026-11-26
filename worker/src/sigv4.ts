// Presigned URLs for S3-compatible storage (Backblaze B2), AWS Signature Version 4 with Web Crypto.
// A presigned URL lets the browser upload or download one object for a few minutes without ever seeing the key.

export interface PresignInput {
  method: 'GET' | 'PUT';
  host: string; // e.g. s3.us-east-005.backblazeb2.com
  path: string; // e.g. /bucket/reports/uid/file.pdf (not encoded)
  region: string; // e.g. us-east-005
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  now: Date;
  // Extra headers the request must send with exactly these values (e.g. content-type, content-length).
  headers?: Record<string, string>;
  // Extra query parameters, e.g. response-content-disposition for downloads.
  query?: Record<string, string>;
}

export async function presign(input: PresignInput): Promise<string> {
  const amzDate = input.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/s3/aws4_request`;

  const headers: Record<string, string> = { host: input.host };
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = String(v).trim();
  const headerNames = Object.keys(headers).sort();
  const signedHeaders = headerNames.join(';');

  const query: Record<string, string> = {
    ...input.query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join('&');
  const canonicalPath = input.path
    .split('/')
    .map((segment) => rfc3986(segment))
    .join('/');
  const canonicalHeaders = headerNames.map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = [
    input.method,
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');
  let key = await hmac(new TextEncoder().encode(`AWS4${input.secretAccessKey}`), day);
  key = await hmac(key, input.region);
  key = await hmac(key, 's3');
  key = await hmac(key, 'aws4_request');
  const signature = hex(await hmac(key, stringToSign));
  return `https://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
}

async function sha256Hex(data: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
