import { ALL_MONTHS, matchesRequest, normalize, requestMonths } from './request-filter';

const ana = { employee: 'José Ana Solís', email: 'ana@elva.ai', start: '2026-11-23' };
const luis = { employee: 'Luis Mora', email: 'luis@elva.ai', start: '2026-12-02T17:00' };

describe('request filter', () => {
  it('ignores case and accents', () => {
    expect(normalize('  JOSÉ  ')).toBe('jose');
  });

  it('matches by name or email', () => {
    expect(matchesRequest(ana, 'jose', ALL_MONTHS)).toBe(true);
    expect(matchesRequest(ana, 'ANA@', ALL_MONTHS)).toBe(true);
    expect(matchesRequest(ana, 'luis', ALL_MONTHS)).toBe(false);
    expect(matchesRequest(ana, '', ALL_MONTHS)).toBe(true);
  });

  it('matches by the month of the request date', () => {
    expect(matchesRequest(ana, '', '2026-11')).toBe(true);
    expect(matchesRequest(luis, '', '2026-11')).toBe(false);
    expect(matchesRequest(luis, 'luis', '2026-12')).toBe(true);
  });

  it('lists the months with requests, newest first, after all months', () => {
    expect(requestMonths([ana, luis, ana])).toEqual([
      { value: ALL_MONTHS, label: 'Todos los meses' },
      { value: '2026-12', label: 'Diciembre 2026' },
      { value: '2026-11', label: 'Noviembre 2026' },
    ]);
  });
});
