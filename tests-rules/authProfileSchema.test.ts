import { describe, expect, it } from 'vitest';
import { UserProfileSchema } from '@/schemas/auth';

/**
 * The Settings "Plan length" field accepts integer values 1..7 — wires up to
 * `defaultPlanLength` on the user profile. This file pins the contract so
 * grep-driven regressions are caught.
 */
describe('UserProfileSchema.defaultPlanLength', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('accepts %i as a valid plan length', (n) => {
    const result = UserProfileSchema.safeParse({
      displayName: 'Tester',
      defaultPlanLength: n,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultPlanLength).toBe(n);
    }
  });

  it.each([0, -1, 8, 99])('rejects %i as out-of-range', (n) => {
    const result = UserProfileSchema.safeParse({
      displayName: 'Tester',
      defaultPlanLength: n,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer (1.5) via the int() chain', () => {
    const result = UserProfileSchema.safeParse({
      displayName: 'Tester',
      defaultPlanLength: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('falls back to the schema default (5) when omitted', () => {
    const result = UserProfileSchema.safeParse({
      displayName: 'Tester',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultPlanLength).toBe(5);
    }
  });
});
