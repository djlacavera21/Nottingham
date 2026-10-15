# Nottingham

**An investing workspace built around a natural close.**

Nottingham explores a Robinhood-style portfolio with **Natural Position Closure**: the final price at the end of the U.S. core trading session automatically becomes a holding's soft-close reference. Verified international listings add off-hours context, with their own sessions, currencies and share ratios.

This first working version is a **paper-trading prototype**. Every displayed price is synthetic. It has no brokerage credentials, live market feeds or real-money execution path.

## Run

Requires Node.js 22 or later. There are no third-party runtime dependencies.

```sh
npm start
```

Open <http://127.0.0.1:3000>. `HOST` and `PORT` can configure the local server.

```sh
npm run check
npm test
```

## Try the complete flow

1. **U.S. close:** TM, AAPL and MSFT receive their confirmed synthetic closing references.
2. **After hours:** TM crosses below its reference. Regular-hours policy queues the decision for a fresh U.S. quote; it does not submit a sell.
3. **Tokyo opens:** Toyota's `7203` listing provides indicative USD context using 10 ordinary shares per `TM` ADS and a fresh JPY/USD quote. The U.S. reference remains unchanged.
4. **U.S. gap down:** click **Run paper closure**. The simulated market sell fills at the lower current bid, visibly below the prior close.
5. **U.S. recovery:** the new quote is above the reference, so the old off-hours breach does not force a sale.
6. **Early close:** the published November 27, 2026 session ends at 1 p.m. Eastern; its final print sets the reference then.

In **After hours**, enable **Include U.S. extended hours** to test a paper limit sell. The limit is the trigger reference; a bid below it leaves the order unfilled. Cancel it or export its journal.

Scenario changes restart paper holdings and orders. Policy preferences persist in this browser; paper balances and the event journal last only for the page session. The policy controls apply across all three holdings.

## The core rule

For a long position:

```text
reference = latest confirmed U.S. core-session closing price
trigger   = reference × (1 − buffer_bps / 10,000), rounded to USD cents
breach    = fresh matching U.S. bid <= trigger
```

Here **EoM means end of the market's core session**, including an early close. Each newly confirmed daily close resets the reference, even if it is lower. This version does not implement a high-water ratchet.

A soft close is a decision reference, not a guaranteed execution price, an actual sale at the bell, or a lock on portfolio value. Regular-session paper sells use the observed bid. Extended-session paper sells use a limit and may remain unfilled. A related foreign ticker never liquidates or replaces a U.S. holding.

## What is implemented

- Responsive dark portfolio, selectable holdings, scenario controls and indicative international context.
- Pure closure evaluator, official-close validation, optional buffer and portfolio-wide pause.
- Bounded 2026 U.S. and Tokyo calendars, IANA time zones, DST, holidays, early closes and Tokyo's lunch break.
- Quote freshness, currency and instrument checks; spread, halt, corporate-action and capability gates.
- Paper order adapter with idempotency, share reservation, partial fills, cancellation, expiry and no overselling.
- Exportable paper orders and event journal, restrictive static serving and a health endpoint.
- Automated domain and HTTP/module-graph integration tests; GitHub Actions checks.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/calendar.js` | Bounded sessions and latest completed U.S. session |
| `src/closure.js` | Closing-reference capture and pure closure decisions |
| `src/international.js` | Related-listing ratios, units, FX and indicative context |
| `src/paper-broker.js` | In-memory reduce-only simulated orders |
| `src/demo.js` | Explicit synthetic holdings and replay scenarios |
| `web/` | Buildless browser interface |
| `server.js` | Local HTTP server; public-file allowlist; `/health` |
| `test/` | Domain and HTTP integration coverage |

See [the behavior and integration contract](docs/natural-closure.md) and [the source notes](docs/sources.md).

## Next integration boundary

A live version needs an authenticated broker integration, licensed closing prints and quotes, current exchange and broker calendars, a maintained instrument/ADS/corporate-action master, and durable account/order reconciliation. The supplied calendar intentionally refuses uncovered years. No scheduled process runs while this browser prototype is closed.

This repository is not affiliated with Robinhood.
