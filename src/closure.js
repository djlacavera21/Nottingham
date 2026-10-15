import { latestCompletedUSSession, marketSession, timestamp, tradingDay } from './calendar.js';

export const DEFAULT_POLICY = Object.freeze({ enabled: true, bufferBps: 0, extendedHours: false, maxQuoteAgeMs: 30000, maxSpreadBps: 100 });
export const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function validPolicy(policy) {
  return Boolean(policy) && typeof policy.enabled === 'boolean' && typeof policy.extendedHours === 'boolean' &&
    Number.isInteger(policy.bufferBps) && policy.bufferBps >= 0 && policy.bufferBps <= 2000 &&
    Number.isInteger(policy.maxQuoteAgeMs) && policy.maxQuoteAgeMs > 0 && policy.maxQuoteAgeMs <= 60000 &&
    positive(policy.maxSpreadBps) && policy.maxSpreadBps <= 1000;
}

export function captureClose(instrument, close, at, previous = null) {
  const now = timestamp(at);
  const day = tradingDay('US', close.sessionDate);
  const regular = day.intervals.find(i => i.kind === 'regular');
  const latest = latestCompletedUSSession(now);
  if (!regular || !latest || latest.date !== close.sessionDate || !positive(close.price) ||
      close.instrumentId !== instrument.id || close.currency !== instrument.currency ||
      instrument.currency !== 'USD' || close.final !== true || close.kind !== 'official_close' || typeof close.source !== 'string' || !close.source.trim() ||
      timestamp(close.publishedAt) < regular.end || timestamp(close.publishedAt) > now ||
      !Number.isInteger(close.revision) || close.revision < 1) {
    throw new Error('A final, matching official close for the latest completed U.S. session is required.');
  }
  if (previous && (close.sessionDate < previous.sessionDate ||
      (close.sessionDate === previous.sessionDate && close.revision <= previous.revision))) {
    throw new Error('Duplicate or older closing reference.');
  }
  return Object.freeze({ ...close, closeAt: regular.end });
}

export function quoteProblem(quote, instrument, at, maxAgeMs) {
  if (!quote) return 'Waiting for a U.S. quote.';
  if (quote.instrumentId !== instrument.id || quote.currency !== instrument.currency || quote.marketId !== 'US') return 'Quote does not match the held U.S. instrument.';
  if (!positive(quote.bid) || !positive(quote.ask) || quote.bid > quote.ask) return 'Invalid or crossed quote.';
  let age;
  try { age = timestamp(at) - timestamp(quote.at); } catch { return 'Invalid quote timestamp.'; }
  if (age < 0 || age > maxAgeMs) return 'Quote is stale or future-dated.';
  return null;
}

// Pure decision function. It never connects to a broker or sells an overseas listing.
export function evaluateClosure({ position, instrument, anchor, quote, now, policy = DEFAULT_POLICY, capabilities }) {
  const result = (state, reason, extra = {}) => ({ state, reason, order: null, ...extra });
  if (!validPolicy(policy)) return result('blocked', 'Invalid closure policy.');
  if (!policy.enabled) return result('paused', 'Natural Closure is paused.');
  if (!position || position.instrumentId !== instrument.id || position.side !== 'long' || !positive(position.quantity)) return result('blocked', 'A matching long share position is required.');
  if (position.corporateActionPending) return result('blocked', 'Reconcile the corporate action before resetting or closing.');
  if (!anchor) return result('awaiting_close', 'Waiting for a confirmed U.S. closing price.');
  let checked;
  try { checked = captureClose(instrument, anchor, now); } catch { return result('awaiting_close', 'The latest confirmed U.S. close is unavailable.'); }
  if (checked.closeAt !== anchor.closeAt) return result('blocked', 'Closing reference session mismatch.');
  const threshold = Math.round(anchor.price * (1 - policy.bufferBps / 10000) * 100) / 100;
  const session = marketSession('US', now);
  if (!session.known) return result('blocked', session.reason, { threshold, session });
  const problem = quoteProblem(quote, instrument, now, policy.maxQuoteAgeMs);
  if (problem) return result('monitoring', problem, { threshold, session });
  if (timestamp(quote.at) < timestamp(anchor.publishedAt)) return result('monitoring', 'Quote predates the closing reference.', { threshold, session });
  const quoteSession = marketSession('US', quote.at);
  if (quoteSession.kind !== session.kind || quoteSession.date !== session.date) return result('monitoring', 'Waiting for a quote from the current session.', { threshold, session });
  if (quote.bid > threshold) return result('armed', 'U.S. bid is above the soft-close reference.', { threshold, session });
  if (capabilities?.haltedInstrumentIds?.includes(instrument.id)) return result('blocked', 'The held instrument is halted.', { threshold, session });
  const regular = session.kind === 'regular';
  const extended = ['pre_market', 'post_market'].includes(session.kind);
  const eligible = regular || (extended && policy.extendedHours && capabilities?.extendedHours === true);
  if (!eligible) return result('queued', 'Reference crossed. Recheck a fresh U.S. quote in the next eligible session.', { threshold, session });
  if (!capabilities || capabilities.mode !== 'paper' || !capabilities.instrumentIds?.includes(instrument.id) ||
      !capabilities.orderTypes?.includes(regular ? 'market' : 'limit') ||
      (!Number.isInteger(position.quantity) && capabilities.fractionalShares !== true)) {
    return result('blocked', 'This paper adapter does not support the requested instrument, quantity or order type.', { threshold, session });
  }
  const spreadBps = (quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2) * 10000;
  if (spreadBps > policy.maxSpreadBps) return result('blocked', 'The U.S. quote spread exceeds the policy limit.', { threshold, session });
  return result('ready', regular ? 'Ready for a paper market sell at the current bid; the closing price is not guaranteed.' : 'Ready for a paper limit sell at the reference; it may remain unfilled.', {
    threshold, session,
    order: Object.freeze({
      id: `${position.id}:${anchor.sessionDate}:${anchor.revision}`,
      mode: 'paper', positionId: position.id, instrumentId: instrument.id,
      currency: instrument.currency, side: 'sell', reduceOnly: true, quantity: position.quantity,
      type: regular ? 'market' : 'limit', limitPrice: regular ? null : threshold,
      sessionKind: session.kind, createdAt: timestamp(now),
      expiresAt: Math.min(timestamp(now) + policy.maxQuoteAgeMs, session.end),
      referencePrice: anchor.price, referenceDate: anchor.sessionDate, triggerPrice: threshold,
      policySnapshot: Object.freeze({ ...policy }),
    }),
  });
}
