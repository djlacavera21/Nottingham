import { marketSession, timestamp } from './calendar.js';
import { positive } from './closure.js';

// Indicative valuation only. ADS ratios and FX do not confer fungibility or routing rights.
export function internationalContext({ instrument, listing, quote, fx, now, anchor }) {
  const unavailable = reason => ({ available: false, reason, indicativeUSD: null, deviationPct: null });
  if (!listing || listing.usInstrumentId !== instrument.id || !listing.source || !positive(listing.ordinarySharesPerUSShare) || !positive(listing.priceUnit)) return unavailable('A verified listing relationship is required.');
  if (!quote || quote.instrumentId !== listing.id || quote.currency !== listing.currency || quote.marketId !== listing.marketId || !positive(quote.price)) return unavailable('No matching international quote.');
  let age, fxAge;
  try { age = timestamp(now) - timestamp(quote.at); fxAge = timestamp(now) - timestamp(fx?.at); } catch { return unavailable('Waiting for fresh international price and FX data.'); }
  if (age < 0 || age > 60000 || fxAge < 0 || fxAge > 60000) return unavailable('International quote or FX is stale.');
  if (!fx || fx.base !== listing.currency || fx.quote !== 'USD' || !positive(fx.rate)) return unavailable('FX pair or quote units do not match.');
  const session = marketSession(listing.marketId, now);
  const quoteSession = marketSession(listing.marketId, quote.at);
  if (session.kind !== 'regular' || quoteSession.kind !== 'regular' || quoteSession.start !== session.start) return unavailable('The international cash session is closed or on break.');
  const indicativeUSD = quote.price * listing.priceUnit * listing.ordinarySharesPerUSShare * fx.rate;
  return { available: true, reason: 'Indicative context only; the U.S. reference is unchanged.', indicativeUSD,
    deviationPct: anchor ? (indicativeUSD / anchor.price - 1) * 100 : null, session };
}
