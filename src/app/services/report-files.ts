import { getAuth } from 'firebase/auth';

import { workerUrl } from './push-relay';

// Report attachments in Backblaze B2 through the Worker (worker/README.md). The Worker checks the session,
// the type and the size, and answers with a 5-minute signed URL; the file goes straight to or from Backblaze.

export function filesAvailable(): boolean {
  return workerUrl() !== '';
}

// Uploads one file and returns its path, to save in the report.
export async function uploadReportFile(file: File): Promise<string> {
  const { path, url, contentType } = await askWorker<{ path: string; url: string; contentType: string }>(
    '/files/upload',
    { name: file.name, size: file.size },
  );
  const put = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: file });
  if (!put.ok) throw new Error(`Backblaze answered ${put.status}`);
  return path;
}

// Opens (downloads) a file of a report. The tab is opened right away, before waiting for the Worker,
// so the browser does not block it as a pop-up.
export async function openReportFile(path: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { url } = await askWorker<{ url: string }>('/files/open', { path });
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (err) {
    tab?.close();
    throw err;
  }
}

async function askWorker<T>(route: string, body: unknown): Promise<T> {
  const base = workerUrl();
  const user = getAuth().currentUser;
  if (!base || !user) throw new Error('files are not available');
  const res = await fetch(`${base.replace(/\/+$/, '')}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await user.getIdToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`The Worker answered ${res.status} on ${route}`);
  return (await res.json()) as T;
}
