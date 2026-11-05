import { isAdminRole } from './admin.guard';

describe('isAdminRole', () => {
  it('accepts admin and HR roles', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('rh')).toBe(true);
    expect(isAdminRole(' Admin ')).toBe(true);
  });

  it('rejects regular workers and missing roles', () => {
    expect(isAdminRole('regular')).toBe(false);
    expect(isAdminRole('')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(1)).toBe(false);
  });
});
