import { DEFAULT_FLAGS } from './feature-flags';
import { FLAG_LABELS, SEEDS, missingFields } from './system-admin';

describe('missingFields', () => {
  const defaults = { horasExtra: false, avisos: false };

  it('creates every field when the document does not exist', () => {
    expect(missingFields(undefined, defaults)).toEqual({ horasExtra: false, avisos: false });
  });

  it('only adds the missing fields and never overwrites one that is there', () => {
    expect(missingFields({ horasExtra: true }, defaults)).toEqual({ avisos: false });
    expect(missingFields({ horasExtra: true, avisos: true }, defaults)).toEqual({});
  });

  it('keeps a field that exists even if its value is false or empty', () => {
    expect(missingFields({ horasExtra: false, avisos: null }, defaults)).toEqual({});
  });
});

describe('SEEDS', () => {
  it('seeds the feature flags with only vacations on', () => {
    const flags = SEEDS.find((s) => s.document === 'featureFlags');
    expect(flags?.collection).toBe('config');
    expect(flags?.values).toEqual(DEFAULT_FLAGS);
    expect(flags?.values['vacaciones']).toBe(true);
    expect(Object.entries(flags?.values ?? {}).filter(([, v]) => v === true)).toEqual([['vacaciones', true]]);
  });

  it('adds the new vacaciones flag to a document from before, without touching the others', () => {
    const flags = SEEDS.find((s) => s.document === 'featureFlags');
    const old = { horasExtra: true, reportes: false, avisos: false, pagos: false };
    expect(missingFields(old, flags?.values ?? {})).toEqual({ vacaciones: true });
  });

  it('seeds the 30 minutes of the session timeout', () => {
    expect(SEEDS.find((s) => s.document === 'seguridad')?.values).toEqual({ minutosInactividad: 30 });
  });

  it('has a name for every flag', () => {
    expect(Object.keys(FLAG_LABELS).sort()).toEqual(Object.keys(DEFAULT_FLAGS).sort());
  });
});
