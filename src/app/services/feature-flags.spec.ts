import { DEFAULT_FLAGS, toFlags } from './feature-flags';

describe('feature flags', () => {
  it('starts with only vacations on', () => {
    expect(DEFAULT_FLAGS).toEqual({
      vacaciones: true,
      horasExtra: false,
      reportes: false,
      avisos: false,
      pagos: false,
    });
  });

  it('reads booleans from config/featureFlags and keeps the default for anything else', () => {
    expect(toFlags(undefined)).toEqual(DEFAULT_FLAGS);
    expect(toFlags({ horasExtra: true, avisos: 'true', pagos: 1, otro: true })).toEqual({
      ...DEFAULT_FLAGS,
      horasExtra: true,
    });
    expect(toFlags({ horasExtra: true, reportes: true, avisos: true, pagos: true })).toEqual({
      vacaciones: true,
      horasExtra: true,
      reportes: true,
      avisos: true,
      pagos: true,
    });
  });

  it('keeps vacations on until someone turns them off, so an old document without the field still shows them', () => {
    expect(toFlags({ horasExtra: true }).vacaciones).toBe(true);
    expect(toFlags({ vacaciones: false, horasExtra: true })).toEqual({
      ...DEFAULT_FLAGS,
      vacaciones: false,
      horasExtra: true,
    });
  });
});
