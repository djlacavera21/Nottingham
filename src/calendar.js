// Bounded reference calendars, verified against NYSE and JPX publications.
// Emergency closures and real broker session entitlements need a live provider.
const US_HOLIDAYS = ['01-01', '01-19', '02-16', '04-03', '05-25', '06-19', '07-03', '09-07', '11-26', '12-25'];
const JP_HOLIDAYS = ['01-01', '01-02', '01-03', '01-12', '02-11', '02-23', '03-20', '04-29', '05-03', '05-04', '05-05', '05-06', '07-20', '08-11', '09-21', '09-22', '09-23', '10-12', '11-03', '11-23', '12-31'];
export const MARKETS = Object.freeze({
  US: { name: 'U.S. equities', zone: 'America/New_York', holidays: US_HOLIDAYS },
  XTKS: { name: 'Tokyo', zone: 'Asia/Tokyo', holidays: JP_HOLIDAYS },
});

export function timestamp(value) {
  const result = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(result)) throw new TypeError('A valid timestamp is required.');
  return result;
}

export function localDate(at, zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp(at));
}

// Resolve wall-clock times using IANA zones, rather than assuming EST year-round.
export function zonedTime(date, time, zone) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(guess).map(part => [part.type, part.value]));
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    guess += target - wall;
  }
  return guess;
}

export function tradingDay(marketId, date) {
  const market = MARKETS[marketId];
  const parsed = Date.parse(`${date}T12:00:00Z`);
  if (!market || !/^2026-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) {
    return { known: false, date, intervals: [], reason: 'Calendar coverage unavailable (2026 only).' };
  }
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6 || market.holidays.includes(date.slice(5))) {
    return { known: true, date, intervals: [], reason: weekday === 0 || weekday === 6 ? 'Weekend' : 'Exchange holiday' };
  }
  const interval = (kind, start, end) => ({ kind, start: zonedTime(date, start, market.zone), end: zonedTime(date, end, market.zone) });
  if (marketId === 'XTKS') {
    return { known: true, date, intervals: [interval('regular', '09:00', '11:30'), interval('regular', '12:30', '15:30')] };
  }
  const earlyClose = ['2026-11-27', '2026-12-24'].includes(date);
  const close = earlyClose ? '13:00' : '16:00';
  return { known: true, date, earlyClose, intervals: [
    // These are illustrative broker windows, not NYSE Tape A opening hours.
    interval('pre_market', '04:00', '09:30'), interval('regular', '09:30', close),
    interval('post_market', close, earlyClose ? '17:00' : '20:00'),
  ] };
}

export function marketSession(marketId, at) {
  const market = MARKETS[marketId];
  if (!market) return { kind: 'unknown', known: false, reason: 'Unknown market.' };
  const time = timestamp(at);
  const day = tradingDay(marketId, localDate(time, market.zone));
  if (!day.known) return { ...day, kind: 'unknown' };
  const interval = day.intervals.find(i => time >= i.start && time < i.end);
  if (interval) return { ...day, ...interval };
  const isBreak = day.intervals.length > 1 && time >= day.intervals[0].end && time < day.intervals.at(-1).start;
  return { ...day, kind: isBreak ? 'break' : 'closed' };
}

export function latestCompletedUSSession(at) {
  const now = timestamp(at);
  const date = localDate(now, MARKETS.US.zone);
  if (!tradingDay('US', date).known) return null;
  for (let offset = 0; offset < 12; offset++) {
    const candidate = new Date(Date.parse(`${date}T12:00:00Z`) - offset * 86400000).toISOString().slice(0, 10);
    const day = tradingDay('US', candidate);
    if (!day.known) return null;
    const regular = day.intervals.find(i => i.kind === 'regular');
    if (regular && now >= regular.end) return { ...regular, date: candidate };
  }
  return null;
}
