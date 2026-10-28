/**
 * Пересборка ленты — из событий заново, каждый раз: так проще не ошибиться, когда пришли
 * правка, расшифровка, реакция или квитанция. Но экрану новые объекты на каждой строке —
 * повод перерисовать все строки. Здесь то, что не изменилось, получает прежний объект, и
 * Svelte трогает только строки, в которых правда что-то случилось.
 */

/** Равенство простых данных: примитивы, массивы, обычные объекты. Остальное — только тот же объект. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b) || Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) if (!(key in right) || !same(left[key], right[key])) return false;
  return true;
}

/**
 * Новый список с прежними объектами там, где строка с тем же ключом не изменилась.
 * Ничего не изменилось вовсе — прежний список: экрану не о чем и узнавать.
 */
export function reuse<T extends { key: string }>(previous: readonly T[], next: T[]): T[] {
  if (!previous.length) return next;
  const byKey = new Map<string, T>();
  for (const item of previous) byKey.set(item.key, item);
  let unchanged = previous.length === next.length;
  for (let i = 0; i < next.length; i++) {
    const old = byKey.get(next[i]!.key);
    if (old && same(old, next[i])) next[i] = old;
    if (unchanged && next[i] !== previous[i]) unchanged = false;
  }
  return unchanged ? (previous as T[]) : next;
}
