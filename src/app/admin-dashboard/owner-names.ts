// The name and e-mail written in a request come from the worker's browser, so anyone could type someone
// else's. The panel shows the ones in the owner's own record (found by uid) instead.
export function withOwnerNames<T extends { employee: string; email?: string }>(
  items: T[],
  ownerId: (item: T) => string | undefined,
  people: { id: string; name: string; email: string }[],
): T[] {
  return items.map((item) => {
    const owner = people.find((p) => p.id === ownerId(item));
    return owner?.name ? { ...item, employee: owner.name, email: owner.email || item.email } : item;
  });
}
