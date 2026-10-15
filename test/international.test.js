import test from 'node:test';
import assert from 'node:assert/strict';
import { internationalContext } from '../src/international.js';
import { INSTRUMENTS, LISTING } from '../src/demo.js';

const now = Date.parse('2026-10-16T00:15:00Z');
function context(overrides = {}) {
  return { instrument: INSTRUMENTS[0], listing: { ...LISTING },
    quote: { instrumentId: LISTING.id, marketId: 'XTKS', currency: 'JPY', price: 3000, at: now },
    fx: { base: 'JPY', quote: 'USD', rate: 1 / 150, at: now }, now, anchor: { price: 192.4 }, ...overrides };
}
test('normalizes ordinary-share price through ADS ratio and correctly directed FX', () => {
  const result = internationalContext(context());
  assert.equal(result.indicativeUSD, 200); assert.equal(result.available, true);
  assert.ok(result.deviationPct > 0);
});
test('price units are explicit, including pence-like quotation units', () => {
  const c = context();
  const result = internationalContext({ ...c, listing: { ...c.listing, priceUnit: 0.01 }, quote: { ...c.quote, price: 300000 } });
  assert.equal(result.indicativeUSD, 200);
});
test('unmapped listings, invalid ratios, mismatched currency and reversed FX are unavailable', () => {
  const c = context();
  for (const patch of [
    { listing: null }, { listing: { ...LISTING, usInstrumentId: 'US:OTHER' } },
    { listing: { ...LISTING, ordinarySharesPerUSShare: 0 } }, { listing: { ...LISTING, source: '' } },
    { quote: { ...c.quote, currency: 'USD' } }, { quote: { ...c.quote, instrumentId: 'XTKS:OTHER' } },
    { fx: { ...c.fx, base: 'USD', quote: 'JPY', rate: 150 } }, { fx: { ...c.fx, rate: 0 } },
  ]) assert.equal(internationalContext({ ...c, ...patch }).available, false);
});
test('stale or future FX and price ticks cannot imply a current U.S. value', () => {
  const c = context();
  for (const patch of [{ quote: { ...c.quote, at: now - 60001 } }, { quote: { ...c.quote, at: now + 1 } }, { fx: { ...c.fx, at: now - 60001 } }, { fx: { ...c.fx, at: now + 1 } }, { fx: null }]) {
    assert.equal(internationalContext({ ...c, ...patch }).available, false);
  }
});
test('foreign lunch break and quote crossing lunch boundary are unavailable', () => {
  const c = context();
  const lunch = Date.parse('2026-10-16T02:45:00Z');
  assert.equal(internationalContext({ ...c, now: lunch, quote: { ...c.quote, at: lunch }, fx: { ...c.fx, at: lunch } }).available, false);
  const reopen = Date.parse('2026-10-16T03:30:00Z');
  assert.equal(internationalContext({ ...c, now: reopen, quote: { ...c.quote, at: reopen - 1 }, fx: { ...c.fx, at: reopen } }).available, false);
});
