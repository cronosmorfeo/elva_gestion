import { IDLE_DEFAULT_MINUTES, idleState, lastActivity, parseStoredActivity, toIdleMinutes } from './idle';

describe('toIdleMinutes', () => {
  it('keeps whole minutes between 5 and 240', () => {
    expect(toIdleMinutes(5)).toBe(5);
    expect(toIdleMinutes(30)).toBe(30);
    expect(toIdleMinutes(240)).toBe(240);
  });

  it('uses the default for anything else, so the protection cannot be turned off by mistake', () => {
    for (const value of [undefined, null, 0, 4, 241, 9999, 12.5, '30', true, Number.NaN]) {
      expect(toIdleMinutes(value)).toBe(IDLE_DEFAULT_MINUTES);
    }
  });
});

describe('parseStoredActivity', () => {
  it('reads a saved activity and ignores broken values', () => {
    expect(parseStoredActivity('{"uid":"u1","at":1000}')).toEqual({ uid: 'u1', at: 1000 });
    expect(parseStoredActivity(null)).toBeNull();
    expect(parseStoredActivity('no es json')).toBeNull();
    expect(parseStoredActivity('{"uid":"u1"}')).toBeNull();
    expect(parseStoredActivity('{"uid":1,"at":1000}')).toBeNull();
  });
});

describe('lastActivity', () => {
  it('uses the latest of the saved activity and the sign-in', () => {
    expect(lastActivity({ uid: 'u1', at: 5000 }, 'u1', 1000)).toBe(5000);
    expect(lastActivity({ uid: 'u1', at: 1000 }, 'u1', 5000)).toBe(5000);
  });

  it("ignores another account's activity", () => {
    expect(lastActivity({ uid: 'otro', at: 9000 }, 'u1', 1000)).toBe(1000);
  });

  it('closes a session left open: an old activity and an old sign-in stay old', () => {
    expect(lastActivity(null, 'u1', Number.NaN)).toBe(0);
    expect(idleState(lastActivity(null, 'u1', Number.NaN), Date.now(), 30).kind).toBe('cerrar');
  });
});

describe('idleState', () => {
  const min = 60_000;

  it('is active until the last minute', () => {
    expect(idleState(0, 28 * min, 30)).toEqual({ kind: 'activo' });
    expect(idleState(0, 29 * min - 1, 30)).toEqual({ kind: 'activo' });
  });

  it('warns during the last minute with the seconds left', () => {
    expect(idleState(0, 29 * min, 30)).toEqual({ kind: 'aviso', seconds: 60 });
    expect(idleState(0, 30 * min - 1500, 30)).toEqual({ kind: 'aviso', seconds: 2 });
  });

  it('closes when the time is up, also if the tab was asleep for longer', () => {
    expect(idleState(0, 30 * min, 30)).toEqual({ kind: 'cerrar' });
    expect(idleState(0, 300 * min, 30)).toEqual({ kind: 'cerrar' });
  });
});
