import { latestCompletedUSSession, marketSession, timestamp } from './calendar.js';
import { positive, quoteProblem } from './closure.js';

export class PaperBroker {
  #positions = new Map();
  #orders = new Map();
  #journal = [];
  #liquidity = new Map();
  #capabilities;
  constructor(positions, capabilities = { mode: 'paper', instrumentIds: positions.map(p => p.instrumentId), orderTypes: ['market', 'limit'], extendedHours: false, fractionalShares: false, haltedInstrumentIds: [] }) {
    this.#capabilities = structuredClone(capabilities);
    for (const p of positions) {
      if (this.#positions.has(p.id) || !positive(p.quantity) || p.side !== 'long') throw new Error('Invalid paper holding.');
      this.#positions.set(p.id, { ...p });
    }
  }
  get orders() { return structuredClone([...this.#orders.values()]); }
  get journal() { return structuredClone(this.#journal); }
  remaining(positionId) { return this.#positions.get(positionId)?.quantity ?? 0; }
  #event(order, at, status, details = {}) {
    Object.assign(order, details, { status });
    this.#journal.push({ sequence: this.#journal.length + 1, orderId: order.id, at: timestamp(at), status, ...details });
  }
  submit(request, instrument, quote, now) {
    const existing = this.#orders.get(request.id);
    if (existing) {
      if (existing.requestSignature !== JSON.stringify(request)) throw new Error('Idempotency key conflict.');
      return structuredClone(existing);
    }
    const holding = this.#positions.get(request.positionId);
    const reserved = [...this.#orders.values()].filter(o => o.positionId === request.positionId && ['working', 'partially_filled'].includes(o.status)).reduce((sum, o) => sum + o.quantity - o.filledQuantity, 0);
    const session = marketSession('US', now);
    const caps = this.#capabilities;
    if (request.mode !== 'paper' || request.side !== 'sell' || request.reduceOnly !== true ||
        caps.mode !== 'paper' || !caps.instrumentIds?.includes(instrument.id) || !caps.orderTypes?.includes(request.type) ||
        caps.haltedInstrumentIds?.includes(instrument.id) || (!Number.isInteger(request.quantity) && caps.fractionalShares !== true) ||
        !holding || holding.corporateActionPending || holding.instrumentId !== instrument.id || request.instrumentId !== instrument.id || request.currency !== instrument.currency ||
        !positive(request.quantity) || request.quantity > holding.quantity - reserved ||
        !['market', 'limit'].includes(request.type) || (request.type === 'limit' && !positive(request.limitPrice)) ||
        (request.type === 'market' && session.kind !== 'regular') || !['regular', 'pre_market', 'post_market'].includes(session.kind) ||
        (session.kind !== 'regular' && caps.extendedHours !== true) ||
        !Number.isFinite(request.createdAt) || !Number.isFinite(request.expiresAt) || request.expiresAt <= request.createdAt ||
        request.expiresAt - request.createdAt > 60000 || request.expiresAt > session.end ||
        !positive(request.referencePrice) || request.referenceDate !== latestCompletedUSSession(now)?.date ||
        session.kind !== request.sessionKind || timestamp(now) < request.createdAt || timestamp(now) >= request.expiresAt ||
        quoteProblem(quote, instrument, now, 30000) || timestamp(quote.at) < session.start || marketSession('US', quote.at).kind !== session.kind) {
      throw new Error('Paper order rejected: invalid, expired, unsupported or overselling.');
    }
    const order = { ...request, requestSignature: JSON.stringify(request), filledQuantity: 0, averageFillPrice: null };
    this.#orders.set(order.id, order);
    this.#event(order, now, 'working');
    this.tick(instrument, quote, now);
    return structuredClone(order);
  }
  tick(instrument, quote, now) {
    for (const order of this.#orders.values()) {
      if (!['working', 'partially_filled'].includes(order.status) || order.instrumentId !== instrument.id) continue;
      if (timestamp(now) >= order.expiresAt) { this.#event(order, now, 'expired'); continue; }
      const session = marketSession('US', now);
      if (session.kind !== order.sessionKind || !['regular', 'pre_market', 'post_market'].includes(session.kind) ||
          quoteProblem(quote, instrument, now, 30000) || timestamp(quote.at) < session.start) continue;
      if (order.type === 'limit' && quote.bid < order.limitPrice) continue;
      const liquidityKey = `${quote.instrumentId}:${quote.id ?? quote.at}`;
      const consumed = this.#liquidity.get(liquidityKey) ?? 0;
      const available = (quote.availableQuantity ?? order.quantity) - consumed;
      if (!positive(available)) continue;
      const fill = Math.min(available, order.quantity - order.filledQuantity, this.remaining(order.positionId));
      if (fill <= 0) continue;
      this.#liquidity.set(liquidityKey, consumed + fill);
      const filledQuantity = order.filledQuantity + fill;
      const averageFillPrice = ((order.averageFillPrice ?? 0) * order.filledQuantity + quote.bid * fill) / filledQuantity;
      this.#positions.get(order.positionId).quantity -= fill;
      this.#event(order, now, filledQuantity === order.quantity ? 'filled' : 'partially_filled', { filledQuantity, averageFillPrice, fillQuantity: fill, fillPrice: quote.bid });
    }
    return this.orders;
  }
  cancel(orderId, now) {
    const order = this.#orders.get(orderId);
    if (order && ['working', 'partially_filled'].includes(order.status)) this.#event(order, now, 'cancelled');
  }
}
