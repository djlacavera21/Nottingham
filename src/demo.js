import { captureClose, DEFAULT_POLICY, evaluateClosure } from './closure.js';
import { internationalContext } from './international.js';
import { marketSession } from './calendar.js';

export const INSTRUMENTS = [
  { id: 'US:TM', symbol: 'TM', name: 'Toyota Motor', currency: 'USD', exchange: 'NYSE', closePrice: 192.40, costBasis: 181.20 },
  { id: 'US:AAPL', symbol: 'AAPL', name: 'Apple', currency: 'USD', exchange: 'Nasdaq', closePrice: 235.20, costBasis: 228.50 },
  { id: 'US:MSFT', symbol: 'MSFT', name: 'Microsoft', currency: 'USD', exchange: 'Nasdaq', closePrice: 448.80, costBasis: 435.40 },
];
export const POSITIONS = INSTRUMENTS.map((i, index) => ({ id: `paper-${i.symbol}`, instrumentId: i.id, side: 'long', quantity: [12, 8, 3][index] }));
export const LISTING = Object.freeze({
  id: 'XTKS:7203', symbol: '7203', name: 'Toyota Motor', usInstrumentId: 'US:TM', marketId: 'XTKS',
  currency: 'JPY', ordinarySharesPerUSShare: 10, priceUnit: 1,
  source: 'https://www.sec.gov/Archives/edgar/data/1094517/000119312526264811/d101983d20f.htm',
});
export const CAPABILITIES = Object.freeze({ mode: 'paper', extendedHours: true, fractionalShares: true,
  instrumentIds: INSTRUMENTS.map(i => i.id), orderTypes: ['market', 'limit'], haltedInstrumentIds: [] });
export const SCENARIOS = [
  { id: 'close', label: 'U.S. close', time: '2026-10-15T20:00:05Z', ratio: 1.003, description: 'The final closing print becomes the new reference for every enabled holding.' },
  { id: 'after', label: 'After hours', time: '2026-10-15T22:15:00Z', ratio: 0.995, description: 'A fresh U.S. quote crosses the reference. With regular-hours routing, the decision waits and rechecks.' },
  { id: 'tokyo', label: 'Tokyo opens', time: '2026-10-16T00:15:00Z', ratio: 1, noUSQuote: true, description: 'Toyota trades in Tokyo. Its USD-equivalent value adds context; your U.S. shares and reference stay the same.' },
  { id: 'gap', label: 'U.S. gap down', time: '2026-10-16T13:30:05Z', ratio: 0.975, description: 'The U.S. bid opens below the reference. A paper market sell uses that lower bid, making the gap visible.' },
  { id: 'recovery', label: 'U.S. recovery', time: '2026-10-16T13:31:05Z', ratio: 1.006, description: 'A fresh U.S. quote recovers above the reference. An earlier off-hours signal does not force a stale sale.' },
  { id: 'early', label: 'Early close', time: '2026-11-27T18:00:05Z', ratio: 1.003, referenceDate: '2026-11-27', closeTime: '18:00:00Z', description: 'On this published early-close date, the reference is captured at 1:00 p.m. Eastern.' },
];

export function demoSnapshot(scenarioId = 'close', policy = DEFAULT_POLICY) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId) ?? SCENARIOS[0];
  const now = Date.parse(scenario.time);
  const rows = INSTRUMENTS.map((instrument, index) => {
    const position = POSITIONS[index];
    const anchor = captureClose(instrument, {
      instrumentId: instrument.id, currency: 'USD', kind: 'official_close', final: true,
      price: instrument.closePrice, sessionDate: scenario.referenceDate ?? '2026-10-15',
      publishedAt: `${scenario.referenceDate ?? '2026-10-15'}T${scenario.closeTime ?? '20:00:00Z'}`,
      source: 'SYNTHETIC_DEMO_CLOSE', revision: 1,
    }, now);
    const bid = Math.round(instrument.closePrice * (index === 0 ? scenario.ratio : 1.002) * 100) / 100;
    const quote = scenario.noUSQuote ? null : { id: `${scenario.id}:${instrument.id}`, instrumentId: instrument.id, currency: 'USD', marketId: 'US', bid, ask: bid + 0.04, at: now, availableQuantity: 1000 };
    return { instrument, position, anchor, quote, decision: evaluateClosure({ position, instrument, anchor, quote, now, policy, capabilities: CAPABILITIES }) };
  });
  const international = internationalContext({ instrument: INSTRUMENTS[0], listing: LISTING,
    quote: { instrumentId: LISTING.id, marketId: 'XTKS', currency: 'JPY', price: 2866.50, at: now },
    fx: { base: 'JPY', quote: 'USD', rate: 1 / 150, at: now }, now, anchor: rows[0].anchor });
  return { scenario, now, rows, international, usSession: marketSession('US', now), tokyoSession: marketSession('XTKS', now) };
}
