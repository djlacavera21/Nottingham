import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperBroker } from '../src/paper-broker.js';
import { CAPABILITIES, demoSnapshot, POSITIONS } from '../src/demo.js';
import { DEFAULT_POLICY } from '../src/closure.js';

function setup(scenario = 'gap', policy = DEFAULT_POLICY) {
  const s = demoSnapshot(scenario, policy);
  return { ...s.rows[0], now: s.now, broker: new PaperBroker(POSITIONS, CAPABILITIES) };
}

test('a gapped market fill records actual paper bid, not yesterday\'s closing reference', () => {
  const c = setup();
  const result = c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  assert.equal(result.status, 'filled'); assert.equal(result.averageFillPrice, 187.59);
  assert.equal(result.referencePrice, 192.4); assert.equal(c.broker.remaining(c.position.id), 0);
  assert.equal(c.broker.journal.length, 2);
});
test('repeated submission with the same key returns the same fill without selling twice', () => {
  const c = setup();
  c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  assert.equal(c.broker.orders.length, 1); assert.equal(c.broker.journal.length, 2);
  assert.throws(() => c.broker.submit({ ...c.decision.order, quantity: 10 }, c.instrument, c.quote, c.now), /Idempotency/);
});
test('limit at closing reference remains unfilled below the limit', () => {
  const c = setup('after', { ...DEFAULT_POLICY, extendedHours: true });
  const result = c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  assert.equal(result.status, 'working'); assert.equal(result.filledQuantity, 0);
  assert.equal(c.broker.remaining(c.position.id), 12);
});
test('a fresh higher bid can fill a working limit during the same eligible session', () => {
  const c = setup('after', { ...DEFAULT_POLICY, extendedHours: true });
  c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  c.broker.tick(c.instrument, { ...c.quote, id: 'new-bid', bid: 192.5, ask: 192.54, at: c.now + 1000 }, c.now + 1000);
  assert.equal(c.broker.orders[0].status, 'filled'); assert.equal(c.broker.orders[0].averageFillPrice, 192.5);
});
test('partial fills conserve shares and do not reuse the same quote liquidity', () => {
  const c = setup(); const quote = { ...c.quote, availableQuantity: 5 };
  c.broker.submit(c.decision.order, c.instrument, quote, c.now);
  assert.equal(c.broker.orders[0].status, 'partially_filled'); assert.equal(c.broker.remaining(c.position.id), 7);
  c.broker.tick(c.instrument, quote, c.now + 1);
  assert.equal(c.broker.remaining(c.position.id), 7);
  c.broker.tick(c.instrument, { ...quote, id: 'new-liquidity', availableQuantity: 20, at: c.now + 1000 }, c.now + 1000);
  assert.equal(c.broker.remaining(c.position.id), 0); assert.equal(c.broker.orders[0].filledQuantity, 12);
});
test('reserved shares cannot be sold by a second order while a limit is working', () => {
  const c = setup('after', { ...DEFAULT_POLICY, extendedHours: true });
  c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  assert.throws(() => c.broker.submit({ ...c.decision.order, id: 'another-key' }, c.instrument, c.quote, c.now), /rejected/);
});
test('depleted holdings cannot be oversold using a new idempotency key', () => {
  const c = setup(); c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  assert.throws(() => c.broker.submit({ ...c.decision.order, id: 'second-sale' }, c.instrument, c.quote, c.now), /rejected/);
});
test('expired paper intents expire without a late fill', () => {
  const c = setup('after', { ...DEFAULT_POLICY, extendedHours: true });
  c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  const later = c.now + 31000;
  c.broker.tick(c.instrument, { ...c.quote, bid: 200, ask: 200.1, at: later }, later);
  assert.equal(c.broker.orders[0].status, 'expired'); assert.equal(c.broker.remaining(c.position.id), 12);
});
test('cancellation releases shares and does not fill on later price recovery', () => {
  const c = setup('after', { ...DEFAULT_POLICY, extendedHours: true });
  c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  c.broker.cancel(c.decision.order.id, c.now);
  c.broker.tick(c.instrument, { ...c.quote, bid: 200, ask: 200.1, at: c.now + 1 }, c.now + 1);
  assert.equal(c.broker.orders[0].status, 'cancelled'); assert.equal(c.broker.remaining(c.position.id), 12);
});
test('adapter independently rejects live mode, invalid expiry, market orders off hours and bad quotes', () => {
  const c = setup();
  for (const patch of [{ mode: 'live' }, { quantity: 13 }, { quantity: -1 }, { side: 'buy' }, { expiresAt: NaN }, { createdAt: undefined }, { referenceDate: '2026-10-14' }, { reduceOnly: false }]) {
    assert.throws(() => c.broker.submit({ ...c.decision.order, ...patch }, c.instrument, c.quote, c.now), /rejected/);
  }
  assert.throws(() => c.broker.submit(c.decision.order, c.instrument, { ...c.quote, instrumentId: 'XTKS:7203' }, c.now), /rejected/);
  const extended = setup('after', { ...DEFAULT_POLICY, extendedHours: true });
  assert.throws(() => extended.broker.submit({ ...extended.decision.order, type: 'market' }, extended.instrument, extended.quote, extended.now), /rejected/);
  const restricted = new PaperBroker(POSITIONS);
  assert.throws(() => restricted.submit(extended.decision.order, extended.instrument, extended.quote, extended.now), /rejected/);
});
test('journal and orders snapshots cannot mutate adapter state', () => {
  const c = setup(); c.broker.submit(c.decision.order, c.instrument, c.quote, c.now);
  c.broker.orders[0].filledQuantity = 0; c.broker.journal.length = 0;
  assert.equal(c.broker.orders[0].filledQuantity, 12); assert.equal(c.broker.journal.length, 2);
});
