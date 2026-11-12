import type { Notice } from './notice-utils';
import { noticeProblem, sortNotices, unseenNotices } from './notice-utils';

const notice = (id: string, createdAt: string): Notice => ({
  id,
  title: 't',
  message: 'm',
  important: false,
  author: 'a',
  createdAt,
});

describe('notice utils', () => {
  it('puts important notices on top, then the newest', () => {
    const list = [notice('a', '2026-11-01T08:00'), notice('b', '2026-11-04T10:00'), notice('c', '2026-11-03T09:00')];
    expect(sortNotices(list).map((n) => n.id)).toEqual(['b', 'c', 'a']);
    expect(list[0].id).toBe('a'); // does not change the original list
    const withImportant = [...list, { ...notice('d', '2026-10-01T08:00'), important: true }];
    expect(sortNotices(withImportant).map((n) => n.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('checks a notice before publishing', () => {
    expect(noticeProblem({ title: '', message: 'x', important: false })).toContain('título');
    expect(noticeProblem({ title: 'x', message: '   ', important: false })).toContain('mensaje');
    expect(noticeProblem({ title: 'x'.repeat(81), message: 'x', important: false })).toContain('80');
    expect(noticeProblem({ title: 'Feriado', message: 'Se trabaja', important: true })).toBe('');
  });

  it('counts notices published after the last visit', () => {
    const list = [notice('a', '2026-11-01T08:00'), notice('b', '2026-11-04T10:00')];
    expect(unseenNotices(list, '')).toBe(2);
    expect(unseenNotices(list, '2026-11-02T00:00')).toBe(1);
    expect(unseenNotices(list, '2026-11-05T00:00')).toBe(0);
  });
});
