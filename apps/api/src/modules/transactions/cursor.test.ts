import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips and rejects garbage', () => {
    const c = {
      date: '2026-10-06',
      createdAt: '2026-10-06T15:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
    };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(() => decodeCursor('basura')).toThrow();
    expect(() => decodeCursor(Buffer.from('{"date":"x"}').toString('base64url'))).toThrow();
  });
});
