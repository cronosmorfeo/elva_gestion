import { relayRequest } from './push-relay';

describe('relayRequest', () => {
  it('posts the changed document with the Firebase ID token', () => {
    const [url, init] = relayRequest('https://push.example.workers.dev/', 'token-123', 'vacations_requests', 'abc');
    expect(url).toBe('https://push.example.workers.dev/notify');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ authorization: 'Bearer token-123', 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ collection: 'vacations_requests', id: 'abc' });
    expect(init.keepalive).toBe(true);
  });
});
