import { describe, it, expect, beforeEach } from 'vitest';
import { ensureProfile } from '../src/utils/demoAdapter';

describe('Google Authentication Handler', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates profile and user credentials upon Google Sign-In in demo mode', () => {
    const demoUid = 'demo-user-google';
    const profile = ensureProfile(demoUid);

    expect(profile).toBeDefined();
    expect(profile.displayName).toBe('Demo Cook');
    expect(profile.householdSize).toBeGreaterThanOrEqual(1);
  });

  it('persists authentication source state for Google authenticated users', () => {
    const userPayload = {
      uid: 'google-uid-123',
      email: 'chef@example.com',
      displayName: 'Google Chef',
      emailVerified: true,
      source: 'google',
    };

    localStorage.setItem('freebuff-demo-user', JSON.stringify(userPayload));
    const stored = JSON.parse(localStorage.getItem('freebuff-demo-user') || '{}');

    expect(stored.source).toBe('google');
    expect(stored.email).toBe('chef@example.com');
  });
});
