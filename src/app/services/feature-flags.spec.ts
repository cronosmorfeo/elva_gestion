import { DEFAULT_FLAGS, toFlags } from './feature-flags';

describe('feature flags', () => {
  it('starts with only vacations on', () => {
    expect(DEFAULT_FLAGS).toEqual({ horasExtra: false, reportes: false, avisos: false, pagos: false });
  });

  it('reads booleans from config/featureFlags and keeps the default for anything else', () => {
    expect(toFlags(undefined)).toEqual(DEFAULT_FLAGS);
    expect(toFlags({ horasExtra: true, avisos: 'true', pagos: 1, otro: true })).toEqual({
      ...DEFAULT_FLAGS,
      horasExtra: true,
    });
    expect(toFlags({ horasExtra: true, reportes: true, avisos: true, pagos: true })).toEqual({
      horasExtra: true,
      reportes: true,
      avisos: true,
      pagos: true,
    });
  });
});
