import { randomInt } from 'crypto';

const NUMBER_SUFFIX_RANGE = 100_000_000;

/** Human-readable document number with a wide random suffix to avoid collisions. */
export function generateNumber(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = randomInt(NUMBER_SUFFIX_RANGE).toString().padStart(8, '0');
  return `${prefix}-${date}-${random}`;
}

export function decimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
