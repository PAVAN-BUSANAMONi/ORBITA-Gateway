import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadCredentials } from '../src/config.js';
import { createCredentialManager } from '../src/credentials.js';

describe('Credential Management & Multi-Key Pool (Isolated)', () => {
  // 1. One credential
  test('handles single configured credential', () => {
    const fakeEnv = {
      OPENROUTER_KEY_1: 'sk-or-v1-single-test-key-111',
    };
    const creds = loadCredentials(fakeEnv);
    assert.strictEqual(creds.length, 1);
    assert.strictEqual(creds[0].id, 'KEY_1');
    assert.strictEqual(creds[0].key, 'sk-or-v1-single-test-key-111');

    const cm = createCredentialManager(creds, 1000);
    assert.strictEqual(cm.getCredentialCount(), 1);
    const selected = cm.getCredential();
    assert.strictEqual(selected.id, 'KEY_1');
    assert.strictEqual(selected.key, 'sk-or-v1-single-test-key-111');

    // Exclude the only key
    assert.strictEqual(cm.getCredential('KEY_1'), null);
  });

  // 2. Multiple credentials (2 and 5)
  test('handles multiple configured credentials (2 and 5)', () => {
    const fakeEnv2 = {
      OPENROUTER_KEY_1: 'sk-or-v1-key-1',
      OPENROUTER_KEY_2: 'sk-or-v1-key-2',
    };
    const creds2 = loadCredentials(fakeEnv2);
    assert.strictEqual(creds2.length, 2);

    const fakeEnv5 = {
      OPENROUTER_KEY_1: 'sk-or-v1-key-1',
      OPENROUTER_KEY_2: 'sk-or-v1-key-2',
      OPENROUTER_KEY_3: 'sk-or-v1-key-3',
      OPENROUTER_KEY_4: 'sk-or-v1-key-4',
      OPENROUTER_KEY_5: 'sk-or-v1-key-5',
    };
    const creds5 = loadCredentials(fakeEnv5);
    assert.strictEqual(creds5.length, 5);
    const cm5 = createCredentialManager(creds5, 1000);
    assert.strictEqual(cm5.getCredentialCount(), 5);

    // Initial selection
    const first = cm5.getCredential();
    assert.strictEqual(first.id, 'KEY_1');

    // Fail KEY_1, next selected should be KEY_2
    cm5.markFailed('KEY_1');
    const second = cm5.getCredential();
    assert.strictEqual(second.id, 'KEY_2');
  });

  // 3. Exactly 12 credentials
  test('handles exactly 12 configured credentials cleanly', () => {
    const fakeEnv12 = {};
    for (let i = 1; i <= 12; i++) {
      fakeEnv12[`OPENROUTER_KEY_${i}`] = `sk-or-v1-mock-12slot-key-${String(i).padStart(2, '0')}`;
    }
    const creds12 = loadCredentials(fakeEnv12);
    assert.strictEqual(creds12.length, 12);
    assert.strictEqual(creds12[0].id, 'KEY_1');
    assert.strictEqual(creds12[11].id, 'KEY_12');

    const cm12 = createCredentialManager(creds12, 1000);
    assert.strictEqual(cm12.getCredentialCount(), 12);

    const summary = cm12.getHealthSummary();
    assert.strictEqual(summary.length, 12);
    assert.ok(summary.every((item) => item.healthy === true));
  });

  // 4. Zero credentials
  test('handles zero credentials gracefully without throwing', () => {
    const credsZero = loadCredentials({});
    assert.strictEqual(credsZero.length, 0);

    const cmZero = createCredentialManager([], 1000);
    assert.strictEqual(cmZero.getCredentialCount(), 0);
    assert.strictEqual(cmZero.getCredential(), null);
    assert.strictEqual(cmZero.getCredential('ANY'), null);
    assert.deepStrictEqual(cmZero.getHealthSummary(), []);

    // Operations on empty pool should not throw
    cmZero.markFailed('NONEXISTENT');
    cmZero.markSuccess('NONEXISTENT');
    cmZero.reset();
    cmZero.markAllFailed();
  });

  // 5. Sparse credential numbering
  test('handles sparse credential numbering without requiring consecutive numbers', () => {
    const sparseEnv = {
      OPENROUTER_KEY_1: 'sk-or-v1-sparse-01',
      OPENROUTER_KEY_3: 'sk-or-v1-sparse-03',
      OPENROUTER_KEY_8: 'sk-or-v1-sparse-08',
      OPENROUTER_KEY_12: 'sk-or-v1-sparse-12',
    };

    const creds = loadCredentials(sparseEnv);
    assert.strictEqual(creds.length, 4);
    assert.deepStrictEqual(
      creds.map((c) => c.id),
      ['KEY_1', 'KEY_3', 'KEY_8', 'KEY_12']
    );

    const cm = createCredentialManager(creds, 1000);
    assert.strictEqual(cm.getCredentialCount(), 4);
    assert.strictEqual(cm.getCredential().id, 'KEY_1');
    assert.strictEqual(cm.getCredential('KEY_1').id, 'KEY_3');
  });

  // 6. Empty and whitespace-only key slots
  test('ignores missing, empty, and whitespace-only slots', () => {
    const mixedEnv = {
      OPENROUTER_KEY_1: 'sk-or-v1-valid-1',
      OPENROUTER_KEY_2: '',
      OPENROUTER_KEY_3: '   ',
      OPENROUTER_KEY_4: '\t\n',
      OPENROUTER_KEY_5: '  sk-or-v1-trimmed-5  ',
    };

    const creds = loadCredentials(mixedEnv);
    assert.strictEqual(creds.length, 2);
    assert.strictEqual(creds[0].id, 'KEY_1');
    assert.strictEqual(creds[0].key, 'sk-or-v1-valid-1');
    assert.strictEqual(creds[1].id, 'KEY_5');
    assert.strictEqual(creds[1].key, 'sk-or-v1-trimmed-5');
  });

  // 7. Full 20-slot configuration
  test('handles full 20-credential pool', () => {
    const fullEnv = {};
    for (let i = 1; i <= 20; i++) {
      fullEnv[`OPENROUTER_KEY_${i}`] = `sk-or-v1-slot-${i}`;
    }
    const creds = loadCredentials(fullEnv);
    assert.strictEqual(creds.length, 20);
    assert.strictEqual(creds[0].id, 'KEY_1');
    assert.strictEqual(creds[19].id, 'KEY_20');

    const cm = createCredentialManager(creds, 1000);
    assert.strictEqual(cm.getCredentialCount(), 20);
  });

  // 8. Cooldown and recovery
  test('failed credential enters cooldown and recovers after expiry without permanent disablement', async () => {
    const creds = [
      { id: 'KEY_1', key: 'sk-or-v1-k1' },
      { id: 'KEY_2', key: 'sk-or-v1-k2' },
    ];
    // Short cooldown of 60ms for fast testing
    const cm = createCredentialManager(creds, 60);

    // Initial state: KEY_1 returned
    assert.strictEqual(cm.getCredential().id, 'KEY_1');

    // Mark KEY_1 failed
    cm.markFailed('KEY_1');

    // While in cooldown, KEY_1 is skipped and KEY_2 is returned
    assert.strictEqual(cm.getCredential().id, 'KEY_2');

    // Wait for cooldown to expire
    await sleep(80);

    // KEY_1 has recovered and is returned again
    const recovered = cm.getCredential();
    assert.strictEqual(recovered.id, 'KEY_1');
  });

  // 9. All available credentials in cooldown
  test('returns null safely when all credentials are in cooldown', () => {
    const creds = [
      { id: 'KEY_1', key: 'sk-or-v1-k1' },
      { id: 'KEY_2', key: 'sk-or-v1-k2' },
      { id: 'KEY_3', key: 'sk-or-v1-k3' },
    ];
    const cm = createCredentialManager(creds, 10000);

    cm.markAllFailed();
    assert.strictEqual(cm.getCredential(), null);
    assert.strictEqual(cm.getCredentialCount(), 3);

    // Reset restores all
    cm.reset();
    assert.strictEqual(cm.getCredential().id, 'KEY_1');
  });

  // 10. Deduplication & invalid credential protection
  test('filters duplicates and malformed entries', () => {
    const dirtyCreds = [
      { id: 'KEY_1', key: 'sk-or-v1-first' },
      null,
      undefined,
      { id: 'KEY_1', key: 'sk-or-v1-duplicate' },
      { id: 123, key: 'invalid' },
      { id: 'KEY_2', key: null },
      { id: 'KEY_3', key: 'sk-or-v1-third' },
    ];

    const cm = createCredentialManager(dirtyCreds, 1000);
    assert.strictEqual(cm.getCredentialCount(), 2);
    assert.strictEqual(cm.getCredential().id, 'KEY_1');
    assert.strictEqual(cm.getCredential().key, 'sk-or-v1-first');
    assert.strictEqual(cm.getCredential('KEY_1').id, 'KEY_3');
  });

  // 11. Secret isolation: health summary never exposes keys
  test('getHealthSummary() never leaks key values', () => {
    const creds = [
      { id: 'KEY_1', key: 'sk-or-v1-super-secret-key-1' },
      { id: 'KEY_2', key: 'sk-or-v1-super-secret-key-2' },
    ];
    const cm = createCredentialManager(creds, 1000);
    const summary = cm.getHealthSummary();

    const serialized = JSON.stringify(summary);
    assert.doesNotMatch(serialized, /super-secret/);
    assert.doesNotMatch(serialized, /sk-or-v1/);
    assert.ok(summary.every((item) => typeof item.id === 'string' && typeof item.healthy === 'boolean'));
  });
});
