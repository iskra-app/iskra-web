/** Сильнее всего эмодзи кренится в любую сторону — `Theme.Reaction.maxTilt`, градусы. */
export const MAX_REACTION_TILT = 14;

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;
const encoder = new TextEncoder();

/**
 * Насколько наклонена эта эмодзи на этом сообщении: выглядит случайно, но при каждой отрисовке
 * одинаково, иначе эмодзи шевелились бы от любого обновления. FNV-1a по байтам, как `tilt(for:)`
 * нативной.
 */
export function reactionTilt(seed: string): number {
  let hash = FNV_OFFSET;
  for (const byte of encoder.encode(seed)) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & FNV_MASK;
  return Number(hash % BigInt(MAX_REACTION_TILT * 2 + 1)) - MAX_REACTION_TILT;
}
