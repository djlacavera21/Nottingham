# Reference sources

Reviewed for the initial implementation on **October 15, 2026**. Synthetic demo prices are not quotations taken from these sources.

| Source | Used for |
| --- | --- |
| [NYSE holidays and trading hours](https://www.nyse.com/trade/hours-calendars) | 2026 U.S. holiday dates; core 9:30 a.m.–4 p.m. Eastern session; 1 p.m. early closes on November 27 and December 24; relevant 5 p.m. late-session early-close examples |
| [JPX market holidays](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html) | 2026 Tokyo closure dates; published calendars may change |
| [JPX domestic equity trading hours](https://www.jpx.co.jp/english/equities/trading/domestic/01.html) | Tokyo 9–11:30 a.m. and 12:30–3:30 p.m. cash sessions |
| [Toyota 2026 Form 20-F, Item 9](https://www.sec.gov/Archives/edgar/data/1094517/000119312526264811/d101983d20f.htm) | U.S. symbol TM, Japanese symbol 7203 and ten ordinary shares per ADS |
| [Toyota stock overview](https://global.toyota/en/ir/stock/outline/) | Issuer's Japanese securities code and international listing overview |
| [FINRA: Understanding order types](https://syndication.finra.org/content/understanding-order-types-can-save-time-and-money) | Distinguishing stop triggers, market execution prices and limit nonexecution risk |

The design inference is Nottingham's own: a confirmed close can serve as a software decision reference, while an international listing supplies separate indicative context. None of these sources promises execution at a prior closing price or establishes immediate cross-listing fungibility.

The static reference calendars are appropriate for deterministic scenarios and tests. A production calendar and instrument master need ongoing updates and venue/account-specific entitlements.
