import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCompletedUSSession, marketSession, tradingDay } from '../src/calendar.js';

test('U.S. regular session boundaries are half-open', () => {
  assert.equal(marketSession('US', '2026-10-15T13:29:59Z').kind, 'pre_market');
  assert.equal(marketSession('US', '2026-10-15T13:30:00Z').kind, 'regular');
  assert.equal(marketSession('US', '2026-10-15T19:59:59Z').kind, 'regular');
  assert.equal(marketSession('US', '2026-10-15T20:00:00Z').kind, 'post_market');
});
test('U.S. DST shifts UTC openings without shifting the local opening', () => {
  assert.equal(marketSession('US', '2026-03-06T14:30:00Z').kind, 'regular');
  assert.equal(marketSession('US', '2026-03-09T13:30:00Z').kind, 'regular');
  assert.equal(marketSession('US', '2026-10-30T13:30:00Z').kind, 'regular');
  assert.equal(marketSession('US', '2026-11-02T14:30:00Z').kind, 'regular');
});
test('Thanksgiving and Christmas Eve early closes use 13:00 ET', () => {
  for (const date of ['2026-11-27', '2026-12-24']) {
    assert.equal(marketSession('US', `${date}T17:59:59Z`).kind, 'regular');
    assert.equal(marketSession('US', `${date}T18:00:00Z`).kind, 'post_market');
    assert.equal(latestCompletedUSSession(`${date}T18:00:00Z`).date, date);
    assert.equal(marketSession('US', `${date}T22:00:00Z`).kind, 'closed');
  }
});
test('holidays and weekends never count as core sessions', () => {
  for (const date of ['2026-07-03', '2026-11-26', '2026-12-25', '2026-10-17']) {
    assert.equal(marketSession('US', `${date}T15:00:00Z`).kind, 'closed');
  }
  assert.equal(latestCompletedUSSession('2026-11-27T15:00:00Z').date, '2026-11-25');
});
test('unknown markets, uncovered years and invalid dates fail closed', () => {
  assert.equal(marketSession('US', '2027-01-04T15:00:00Z').kind, 'unknown');
  assert.equal(marketSession('UNKNOWN', '2026-10-15T15:00:00Z').kind, 'unknown');
  assert.equal(tradingDay('US', '2026-02-30').known, false);
  assert.equal(latestCompletedUSSession('2027-01-04T15:00:00Z'), null);
});
test('Tokyo respects local trading date, lunch, holidays and afternoon close', () => {
  assert.equal(marketSession('XTKS', '2026-10-16T00:00:00Z').kind, 'regular');
  assert.equal(marketSession('XTKS', '2026-10-16T02:30:00Z').kind, 'break');
  assert.equal(marketSession('XTKS', '2026-10-16T03:30:00Z').kind, 'regular');
  assert.equal(marketSession('XTKS', '2026-10-16T06:30:00Z').kind, 'closed');
  assert.equal(marketSession('XTKS', '2026-10-12T01:00:00Z').kind, 'closed');
});
