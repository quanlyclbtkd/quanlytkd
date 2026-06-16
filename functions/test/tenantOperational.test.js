'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-taekwondo-6w1' });
}

const { __test } = require('../src/accountProvisioning');

test('expiry date is inclusive through the end of the Viet Nam local day', () => {
  const parsed = __test.parseExpiryDate('2026-06-30');
  assert.equal(parsed.expiryDate, '2026-06-30');
  assert.equal(parsed.expiryAt.toDate().toISOString(), '2026-06-30T17:00:00.000Z');
});

test('leap day is accepted', () => {
  const parsed = __test.parseExpiryDate('2024-02-29');
  assert.equal(parsed.expiryAt.toDate().toISOString(), '2024-02-29T17:00:00.000Z');
});

test('invalid calendar dates are rejected', () => {
  for (const value of ['2026-02-30', '2025-02-29', '2026-13-01', 'bad']) {
    assert.throws(() => __test.parseExpiryDate(value), error => error?.code === 'invalid-argument');
  }
});

test('future timestamp check is strict', () => {
  const now = Date.now();
  assert.equal(__test.isFutureTimestamp(admin.firestore.Timestamp.fromMillis(now + 1), now), true);
  assert.equal(__test.isFutureTimestamp(admin.firestore.Timestamp.fromMillis(now), now), false);
  assert.equal(__test.isFutureTimestamp(admin.firestore.Timestamp.fromMillis(now - 1), now), false);
  assert.equal(__test.isFutureTimestamp(null, now), false);
});
