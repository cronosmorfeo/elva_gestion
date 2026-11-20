import { pageToOpen } from './notifications';

describe('pageToOpen', () => {
  it('opens the page a notification click asks for', () => {
    expect(pageToOpen({ type: 'elva-open', url: '/tabs/solicitudes' })).toBe('/tabs/solicitudes');
    expect(pageToOpen({ type: 'elva-open', url: '/tabs/dashboard?x=1#vacaciones' })).toBe(
      '/tabs/dashboard?x=1#vacaciones',
    );
  });

  it('never leaves the app', () => {
    for (const url of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'tabs/inicio', '']) {
      expect(pageToOpen({ type: 'elva-open', url })).toBeNull();
    }
  });

  it('ignores other messages', () => {
    expect(pageToOpen({ type: 'otra', url: '/tabs/inicio' })).toBeNull();
    expect(pageToOpen({ type: 'elva-open', url: 5 })).toBeNull();
    expect(pageToOpen('elva-open')).toBeNull();
    expect(pageToOpen(null)).toBeNull();
  });
});
