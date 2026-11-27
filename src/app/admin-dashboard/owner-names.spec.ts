import { withOwnerNames } from './owner-names';

const people = [
  { id: 'ana', name: 'Ana Solís', email: 'ana@elva.ai' },
  { id: 'luis', name: 'Luis Mora', email: 'luis@elva.ai' },
];

describe('owner names', () => {
  it("shows the owner's own name, not the one written in the request", () => {
    // Luis sends a request with Ana's name and e-mail: the panel must still say Luis.
    const fake = { id: 'r1', ownerId: 'luis', employee: 'Ana Solís', email: 'ana@elva.ai' };
    const [shown] = withOwnerNames([fake], (r) => r.ownerId, people);
    expect(shown.employee).toBe('Luis Mora');
    expect(shown.email).toBe('luis@elva.ai');
    expect(shown.id).toBe('r1');
  });

  it('keeps the written name only when the owner is not in the list', () => {
    const old = { id: 'r2', ownerId: 'gone', employee: 'Persona vieja', email: undefined };
    expect(withOwnerNames([old], (r) => r.ownerId, people)[0].employee).toBe('Persona vieja');
  });
});
