# Natural Position Closure: behavior and integration contract

## Product interpretation

The initial brief is: “the EoM stock price automatically becomes the set soft closure for shareholders,” with respect for a company's international tickers during U.S. off hours.

In v0.1, EoM is the end of each U.S. **core trading session**, rather than the end of the calendar month. Natural Closure sets a decision reference for an existing long U.S. share holding. It does not liquidate all positions at the bell. The default reference equals the confirmed closing print; the optional buffer places the trigger below it.

The reference resets to the latest confirmed close each session. It can move down. A trailing or high-water rule would be a distinct policy and is not silently substituted here.

## State and execution decisions

| Situation | Decision | Order behavior |
| --- | --- | --- |
| Policy disabled | `paused` | No new intent |
| Latest final closing print missing | `awaiting_close` | No last-trade fallback |
| No fresh matching U.S. quote | `monitoring` | International context can still display |
| Fresh U.S. bid above trigger | `armed` | No sell |
| Bid at/below trigger outside an eligible session | `queued` | Recheck in an eligible session; no stale order queued at a broker |
| Bid at/below trigger during regular hours | `ready` | Market sell intent for the held U.S. instrument |
| Bid at/below trigger in supported, opted-in U.S. extended hours | `ready` | Limit sell at the trigger; no assumed fill below it |
| Unknown calendar, unresolved corporate action, halt, unsupported capability or excessive spread | Held or `blocked` | No routable intent |

`evaluateClosure` is pure. It returns an explanation and, only when eligible, a **paper** order intent. It cannot submit to a real broker. The demo requires a click to run an eligible paper intent. Capturing the reference itself is automatic when the confirmed synthetic close is loaded.

The default maximum U.S. quote age is 30 seconds, the maximum spread is 100 bps, and the initial buffer is zero. Exact equality with the trigger is a breach. A U.S. quote must match the held security, USD currency, current session and reference publication time. A wide spread may cause the policy to hold an otherwise eligible sell.

An off-hours queue is a decision state, not a persistent promise to sell. The next eligible quote is evaluated again. Recovery above the trigger removes the need for a sell. If the next bid gaps below the trigger, a market sell can realize that lower price. A limit sell can remain unfilled.

## Confirmed closing prints

`captureClose(instrument, close, now, previous)` validates the instrument, currency, final-print designation, nonempty source, positive price, session date, publication time and revision. Only the latest completed U.S. core session is accepted. Same-session revisions must advance; duplicated or older updates are rejected.

The `source` field is provenance metadata, not cryptographic proof. A production feed adapter must authenticate the publisher and resolve cancellations and corrections. Caller-supplied `final: true` must never be treated as proof of an exchange print.

At the closing boundary the old reference is no longer current. The engine waits for the new final print. It does not quietly fall back to an older reference when today's print is unavailable. A pending split, ADS ratio change or other corporate action blocks routing until holdings and references are reconciled.

## Sessions and international listings

The bounded calendars cover **2026 only**, using the published NYSE and JPX schedules cited in `sources.md`. U.S. regular sessions use New York local time; Tokyo sessions use Tokyo local time, including the midday break. The U.S. pre/post windows are illustrative broker windows with a 5 p.m. end on the included early-close dates. They are not a claim that every NYSE security or every broker supports those routes. No 24/5 or future exchange proposal is enabled implicitly.

A live calendar provider must account for emergency closures, suspensions, venue-specific breaks and actual account/instrument permissions. Unknown coverage blocks execution.

The initial verified relationship is Toyota `TM` on NYSE and `7203` in Tokyo: one U.S. ADS represents ten ordinary shares. The relationship is context, not authorization for cross-border conversion or a claim that these holdings are immediately fungible.

```text
indicative USD per U.S. share
  = local quoted price
  × price-unit multiplier
  × ordinary shares represented by one U.S. share/ADS
  × USD per unit of local currency
```

Both international quote and FX must be at most 60 seconds old, not future-dated, and correctly identified. The foreign quote must belong to the current open cash-session interval. Missing ratios, reversed currency pairs, stale data or lunch breaks suppress the indicative price. International quotes never create a U.S. closing reference or directly trigger a sell.

## Paper order contract

`PaperBroker` owns a copy of the initial long holdings and enforces reduce-only sells. It independently validates account capabilities, security, currency, order type, quantity, session, reference date, expiry and quote before accepting an order. An intent expires within its eligible session and after at most the allowed quote window.

Order IDs combine position, reference session and print revision. Repeating the same payload returns the existing result. Reusing an ID for a different payload is rejected. Working orders reserve their remaining shares, completed sales deplete holdings, and replaying the same quote does not create more liquidity. The journal records working, partial, filled, cancelled and expired transitions.

The adapter is an in-memory educational execution model. It does not model an exchange order book, queue priority, commissions, taxes, settlement, short selling or live broker stop semantics. USD trigger prices are rounded to cents; valuation and FX calculations use JavaScript numbers. Production accounting needs instrument-specific tick sizes and decimal arithmetic.

The UI applies one policy to all included holdings. Changes cancel working paper intents before the new policy applies; completed fills are retained. Scenario selection explicitly restarts holdings and orders. Preferences are browser-local; a reload resets the paper ledger. Export captures the current policy, closing references, orders and execution journal.

## Live adapter boundary

Implementing real trading requires replacing the synthetic feed and paper adapter with authenticated services that maintain account-owned holdings, trusted final closes, licensed quotes, versioned instrument mappings and current calendar/capability data. A durable order service must persist references and decisions, enforce unique intents across workers, reconcile partial fills and cancellations with broker state, and recover after restart before retrying any submission.

The present server exposes static files and a health check only. It accepts no trading POST requests, stores no credentials and makes no requests to a broker. No unattended scheduler or claim of real-time market data is included.
