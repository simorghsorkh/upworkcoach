import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7 } from './uuid';

describe('uuidv7', () => {
  it('produces RFC 9562 version 7 UUIDs', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('is time-ordered', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a < b).toBe(true);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const id = uuidv7(0x0123456789ab);
    expect(id.startsWith('01234567-89ab-7')).toBe(true);
  });
});
