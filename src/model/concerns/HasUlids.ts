import { ModelMetadata } from '../ModelMetadata';

type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Mixin that auto-generates a ULID as the primary key (and any extra
 * columns listed in `uniqueIds()`) before every INSERT.
 *
 * ULIDs are 26-character, lexicographically sortable, URL-safe strings.
 * They encode a 48-bit timestamp (milliseconds) followed by 80 bits of
 * randomness — making them both time-ordered and collision-resistant.
 *
 * No external dependency is required: a compact ULID generator is
 * implemented inline using `crypto.getRandomValues`.
 *
 * ### Usage
 * ```ts
 * import { Model, HasUlids } from 'orion';
 *
 * \@table('events')
 * class Event extends HasUlids(Model) {
 *   declare id: string;
 * }
 *
 * const event = await Event.create({ name: 'PageView' });
 * // event.id → '01HZQG7K4X3M2N8P5R6T7V9WCB'
 * ```
 */
export function HasUlids<TBase extends Constructor>(Base: TBase) {
  return class HasUlidsModel extends Base {
    /**
     * Generate a new ULID. Override to use a different ULID library.
     */
    newUniqueId(): string {
      return generateUlid();
    }

    /**
     * Return the list of attribute names that should receive a generated ULID
     * before insert. Defaults to the model's primary key column.
     */
    uniqueIds(): string[] {
      const cfg = ModelMetadata.resolve(this as any);
      return [cfg.primaryKey];
    }

    /** @internal */
    _applyUniqueIds(): void {
      for (const col of (this as any).uniqueIds()) {
        if (!(this as any)._attributes[col]) {
          (this as any)._attributes[col] = (this as any).newUniqueId();
        }
      }
    }
  };
}

// ── Compact ULID implementation ───────────────────────────────────────────────

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number, len: number): string {
  let str = '';
  for (let i = len - 1; i >= 0; i--) {
    str = ENCODING[now % ENCODING_LEN] + str;
    now = Math.floor(now / ENCODING_LEN);
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  // Use crypto.getRandomValues when available (Node 19+ / browser), else fallback
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.getRandomValues) {
    (globalThis as any).crypto.getRandomValues(bytes);
  } else {
    const { randomFillSync } = require('crypto');
    randomFillSync(bytes);
  }
  let str = '';
  for (const b of bytes) {
    str += ENCODING[b % ENCODING_LEN];
  }
  return str;
}

function generateUlid(): string {
  const now = Date.now();
  return encodeTime(now, TIME_LEN) + encodeRandom(RANDOM_LEN);
}
