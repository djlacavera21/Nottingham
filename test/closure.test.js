import test from 'node:test';
import assert from 'node:assert/strict';
import { captureClose, DEFAULT_POLICY, evaluateClosure } from '../src/closure.js';
import { CAPABILITIES, demoSnapshot, INSTRUMENTS } from '../src/demo.js';

function input(scenario = 'gap', overrides = {}) {
  const snapshot = demoSnapshot(scenario);
  return { ...snapshot.rows[0], now: snapshot.now, policy: { ...DEFAULT_POLICY }, capabilities: structuredClone(CAPABILITIES), ...overrides };
}
const evaluate = (scenario, overrides) => evaluateClosure(input(scenario, overrides));

test('official closing print becomes the exact automatic reference', () => {
  const { anchor, decision } = demoSnapshot('close').rows[0];
  assert.equal(anchor.price, 192.4); assert.equal(anchor.sessionDate, '2026-10-15');
  assert.equal(decision.threshold, 192.4); assert.equal(decision.state, 'armed');
});
test('rejects nonfinal, premature, mismatched or invalid closing prints', () => {
  const context = input();
  for (const patch of [{ final: false }, { kind: 'last_trade' }, { instrumentId: 'XTKS:7203' }, { currency: 'JPY' }, { price: NaN }, { price: 0 }, { publishedAt: '2026-10-15T19:59:59Z' }, { publishedAt: '2026-10-17T20:00:00Z' }, { sessionDate: '2026-10-14' }, { revision: 0 }]) {
    assert.throws(() => captureClose(context.instrument, { ...context.anchor, ...patch }, context.now));
  }
});
test('duplicate reference updates are idempotently rejected; higher revision is accepted', () => {
  const { instrument, anchor, now } = input();
  assert.throws(() => captureClose(instrument, anchor, now, anchor), /Duplicate/);
  assert.equal(captureClose(instrument, { ...anchor, revision: 2 }, now, anchor).revision, 2);
});
test('a new daily close resets even lower; no implied ratchet or lock on profit', () => {
  const now = '2026-10-16T20:00:02Z';
  const { instrument, anchor } = input();
  const next = captureClose(instrument, { ...anchor, price: 180, sessionDate: '2026-10-16', publishedAt: '2026-10-16T20:00:01Z' }, now, anchor);
  assert.equal(next.price, 180);
});
test('after-hours breach queues by default, and never creates an order', () => {
  const decision = evaluate('after'); assert.equal(decision.state, 'queued'); assert.equal(decision.order, null);
});
test('extended-hours needs both policy opt-in and adapter support, and uses a limit', () => {
  const policy = { ...DEFAULT_POLICY, extendedHours: true };
  const result = evaluate('after', { policy });
  assert.equal(result.state, 'ready'); assert.equal(result.order.type, 'limit'); assert.equal(result.order.limitPrice, 192.4);
  assert.equal(evaluate('after', { policy, capabilities: { ...CAPABILITIES, extendedHours: false } }).state, 'queued');
});
test('regular-session gap produces a market intent, with a lower current bid', () => {
  const result = evaluate('gap');
  assert.equal(result.state, 'ready'); assert.equal(result.order.type, 'market');
  assert.equal(result.order.referencePrice, 192.4); assert.equal(input().quote.bid, 187.59);
});
test('next-open recovery rechecks current price and does not sell on a stale breach', () => {
  assert.equal(evaluate('after').state, 'queued');
  assert.equal(evaluate('recovery').state, 'armed'); assert.equal(evaluate('recovery').order, null);
});
test('exact equality triggers; a buffer moves the trigger down from the same reference', () => {
  const c = input();
  assert.equal(evaluateClosure({ ...c, quote: { ...c.quote, bid: 192.4, ask: 192.44 } }).state, 'ready');
  const result = evaluate('after', { policy: { ...DEFAULT_POLICY, bufferBps: 100 } });
  assert.equal(result.threshold, 190.48); assert.equal(result.state, 'armed');
});
test('stale, future, pre-reference and foreign quotes never route a closure', () => {
  const c = input();
  for (const patch of [{ at: c.now - 30001 }, { at: c.now + 1 }, { instrumentId: 'XTKS:7203' }, { currency: 'JPY' }, { marketId: 'XTKS' }, { bid: -1 }, { ask: 1 }, { at: 'bad' }]) {
    assert.equal(evaluateClosure({ ...c, quote: { ...c.quote, ...patch } }).order, null);
  }
});
test('session-crossing quote cannot route at the opening or closing boundary', () => {
  const c = input();
  assert.equal(evaluateClosure({ ...c, now: Date.parse('2026-10-16T13:30:00Z'), quote: { ...c.quote, at: Date.parse('2026-10-16T13:29:59Z') } }).order, null);
});
test('Tokyo price context cannot replace a missing U.S. quote or change the anchor', () => {
  const c = demoSnapshot('tokyo');
  assert.equal(c.international.available, true); assert.ok(Math.abs(c.international.indicativeUSD - 191.1) < 1e-9);
  assert.equal(c.rows[0].anchor.price, 192.4); assert.equal(c.rows[0].decision.order, null);
});
test('missing the latest official print fails closed at the next close', () => {
  assert.equal(evaluate('gap', { now: Date.parse('2026-10-16T20:00:05Z') }).state, 'awaiting_close');
  assert.equal(evaluate('gap', { anchor: null }).state, 'awaiting_close');
});
test('early-close reference is set at 13:00 ET', () => {
  const c = demoSnapshot('early'); assert.equal(c.rows[0].anchor.closeAt, Date.parse('2026-11-27T18:00:00Z'));
});
test('disabled policies, invalid policies, shorts and corporate actions cannot route', () => {
  const c = input();
  assert.equal(evaluate('gap', { policy: { ...DEFAULT_POLICY, enabled: false } }).state, 'paused');
  for (const policy of [null, { ...DEFAULT_POLICY, bufferBps: -1 }, { ...DEFAULT_POLICY, bufferBps: 0.5 }, { ...DEFAULT_POLICY, maxQuoteAgeMs: Infinity }]) assert.equal(evaluate('gap', { policy }).state, 'blocked');
  for (const patch of [{ side: 'short' }, { quantity: 0 }, { quantity: Infinity }, { corporateActionPending: true }, { instrumentId: 'US:OTHER' }]) assert.equal(evaluate('gap', { position: { ...c.position, ...patch } }).state, 'blocked');
});
test('halted, unsupported, live-mode or wide-spread input never routes', () => {
  const c = input();
  for (const capabilities of [undefined, { ...CAPABILITIES, mode: 'live' }, { ...CAPABILITIES, instrumentIds: [] }, { ...CAPABILITIES, orderTypes: [] }, { ...CAPABILITIES, haltedInstrumentIds: [INSTRUMENTS[0].id] }]) assert.equal(evaluate('gap', { capabilities }).order, null);
  assert.equal(evaluate('gap', { quote: { ...c.quote, ask: 200 } }).state, 'blocked');
  assert.equal(evaluate('gap', { position: { ...c.position, quantity: 0.5 }, capabilities: { ...CAPABILITIES, fractionalShares: false } }).state, 'blocked');
});
