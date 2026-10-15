import { DEFAULT_POLICY, validPolicy } from '/src/closure.js';
import { CAPABILITIES, POSITIONS, SCENARIOS, demoSnapshot } from '/src/demo.js';
import { PaperBroker } from '/src/paper-broker.js';

const $ = id => document.getElementById(id);
const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const dateTime = at => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(at);
const stateNames = { armed: 'Reference armed', monitoring: 'Monitoring context', queued: 'Waiting for U.S. session', ready: 'Paper closure ready', paused: 'Closure paused', awaiting_close: 'Awaiting confirmed close', blocked: 'Closure on hold', filled: 'Paper position closed', working: 'Paper limit working', partially_filled: 'Partially filled', expired: 'Paper order expired', cancelled: 'Paper order cancelled' };
const storageKey = 'nottingham:paper-policy:v1';
let policy = { ...DEFAULT_POLICY };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && validPolicy(saved)) policy = saved;
} catch { /* Restricted storage and malformed preferences fall back to defaults. */ }
let scenarioId = 'close';
let selectedId = 'US:TM';
let broker = new PaperBroker(POSITIONS, CAPABILITIES);
let snapshot;
let toastTimer;

function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function savePolicy() {
  try { localStorage.setItem(storageKey, JSON.stringify(policy)); } catch { notify('Preferences apply for this page session.'); }
}

function selectedOrder(row) {
  return broker.orders.find(order => order.id === `${row.position.id}:${row.anchor.sessionDate}:${row.anchor.revision}`);
}

function drawChart(row) {
  const baseline = row.anchor.price;
  const last = row.quote?.bid ?? baseline;
  const fractions = [0.981, 0.984, 0.982, 0.986, 0.987, 0.985, 0.989, 0.986, 0.992, 0.989, 0.994, 0.990, 0.991, 0.995, 0.993, 0.997, 0.994, 0.998, 0.996, 1.001, 0.998, 1.002, 0.999, 1];
  const values = [...fractions.map(value => value * baseline), last];
  const min = Math.min(...values, baseline * 0.975), max = Math.max(...values, baseline * 1.012);
  const y = value => 173 - (value - min) / (max - min) * 151;
  const points = values.map((value, i) => `${8 + i / (values.length - 1) * 704},${y(value).toFixed(2)}`);
  const refY = y(baseline).toFixed(2);
  $('price-chart').innerHTML = `<defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#aad77e" stop-opacity="0.15"/><stop offset="100%" stop-color="#aad77e" stop-opacity="0"/></linearGradient></defs><path d="M8 185 L${points.join(' L')} L712 185 Z" fill="url(#chart-fill)"/><line x1="0" x2="720" y1="${refY}" y2="${refY}" stroke="#7c9769" stroke-width="1" stroke-dasharray="4 6"/><polyline points="${points.join(' ')}" stroke="#c1ed94" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="712" cy="${y(last).toFixed(2)}" r="4" fill="#c1ed94"/><line x1="682" x2="682" y1="6" y2="183" stroke="#46513e" stroke-dasharray="2 5"/>`;
  $('chart-symbol').textContent = row.instrument.symbol;
  $('chart-label').textContent = row.quote ? `Illustrative price · ${money(last)}` : 'U.S. reference · no fresh U.S. quote';
  $('close-label').textContent = snapshot.scenario.id === 'early' ? '1:00 PM · EoM' : '4:00 PM · EoM';
}

function renderJournal() {
  const items = [
    { title: 'Closing references captured', description: 'Final synthetic U.S. prints set the reference for all three holdings.', at: snapshot.rows[0].anchor.publishedAt },
    { title: 'Session and quote checks complete', description: snapshot.scenario.description, at: snapshot.now },
    ...broker.journal.map(event => {
      const row = snapshot.rows.find(r => event.orderId.startsWith(`${r.position.id}:`));
      return { title: `${row.instrument.symbol} · ${stateNames[event.status] ?? event.status}`, description: event.fillQuantity ? `${event.fillQuantity} shares at ${money(event.fillPrice)}. Reference ${money(row.anchor.price)}.` : 'Paper order only. No real brokerage connection.', at: event.at };
    }),
  ];
  $('journal').replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'event-dot'; dot.setAttribute('aria-hidden', 'true');
    const div = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = item.title;
    const description = document.createElement('p'); description.textContent = item.description;
    const time = document.createElement('time'); time.dateTime = new Date(item.at).toISOString(); time.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(item.at));
    div.append(title, description); li.append(dot, div, time); return li;
  }));
}

function render() {
  snapshot = demoSnapshot(scenarioId, policy);
  const row = snapshot.rows.find(r => r.instrument.id === selectedId);
  const order = selectedOrder(row);
  const remaining = broker.remaining(row.position.id);
  const orderActive = order && ['working', 'partially_filled'].includes(order.status);
  const displayState = remaining === 0 ? 'filled' : orderActive ? order.status : row.decision.state;
  const cash = 1800 + broker.orders.reduce((sum, o) => sum + o.filledQuantity * (o.averageFillPrice ?? 0), 0);
  const marketValue = snapshot.rows.reduce((sum, r) => sum + broker.remaining(r.position.id) * (r.quote?.bid ?? r.anchor.price), 0);
  const closeValue = snapshot.rows.reduce((sum, r) => sum + broker.remaining(r.position.id) * r.anchor.price, 0);
  $('portfolio-value').textContent = money(cash + marketValue);
  $('portfolio-sub').textContent = snapshot.scenario.noUSQuote ? 'Holdings marked at the U.S. closing reference · synthetic' : `${money(marketValue - closeValue)} vs. remaining holdings at EoM · synthetic`;
  $('cash-value').textContent = money(cash);
  $('reference-value').textContent = money(closeValue);
  $('rules-count').textContent = `${policy.enabled ? snapshot.rows.filter(r => broker.remaining(r.position.id) > 0).length : 0} active`;
  const usStatus = { regular: 'U.S. regular session', pre_market: 'U.S. pre-market', post_market: 'U.S. after hours', closed: 'U.S. market closed' };
  $('us-status').textContent = usStatus[snapshot.usSession.kind] ?? 'Session unavailable';
  $('demo-time').textContent = dateTime(snapshot.now);
  $('scenario-description').textContent = `${snapshot.scenario.description} Scenarios restart paper positions.`;
  for (const button of $('scenarios').children) button.setAttribute('aria-pressed', String(button.dataset.scenario === scenarioId));
  $('holdings').innerHTML = snapshot.rows.map(r => {
    const qty = broker.remaining(r.position.id);
    const existing = selectedOrder(r);
    const status = qty === 0 ? 'filled' : existing?.status === 'working' ? 'working' : r.decision.state;
    const value = qty * (r.quote?.bid ?? r.anchor.price);
    return `<tr class="${r.instrument.id === selectedId ? 'selected' : ''}"><td><button type="button" class="ticker-button" data-instrument="${r.instrument.id}" aria-pressed="${r.instrument.id === selectedId}"><span class="ticker-logo" aria-hidden="true">${r.instrument.symbol === 'TM' ? 'T' : r.instrument.symbol === 'AAPL' ? 'a' : 'm'}</span><span><strong>${r.instrument.symbol}</strong><small>${r.instrument.name}</small></span></button></td><td>${qty}</td><td>${money(r.anchor.price)}</td><td>${money(value)}</td><td><span class="row-state ${status}">${status === 'filled' ? 'Closed' : status === 'queued' ? 'Queued' : status === 'working' ? 'Limit working' : status === 'ready' ? 'Ready' : status === 'paused' ? 'Paused' : 'Watching'}</span></td></tr>`;
  }).join('');
  $('selected-name').textContent = `${row.instrument.symbol} · ${row.instrument.name}`;
  $('selected-reference').textContent = money(row.anchor.price);
  $('reference-date').textContent = `${row.anchor.sessionDate} · confirmed demo closing print`;
  $('threshold').textContent = money(row.decision.threshold ?? row.anchor.price * (1 - policy.bufferBps / 10000));
  $('decision-state').textContent = stateNames[displayState];
  $('decision-state').dataset.state = displayState;
  $('decision-reason').textContent = remaining === 0 ? `${order.filledQuantity} paper shares closed at ${money(order.averageFillPrice)}. Closing reference: ${money(row.anchor.price)}.` : orderActive ? `Sell limit at ${money(order.limitPrice)}. The current bid is below the limit, so it remains unfilled.` : row.decision.reason;
  $('enabled').checked = policy.enabled; $('extended').checked = policy.extendedHours;
  $('buffer').value = policy.bufferBps; $('buffer-output').value = `${(policy.bufferBps / 100).toFixed(2)}%`;
  $('paper-order').disabled = !orderActive && (row.decision.state !== 'ready' || remaining === 0 || Boolean(order));
  $('paper-order').textContent = orderActive ? 'Cancel paper limit' : remaining === 0 ? 'Paper position closed' : order ? 'Order complete · reset to retry' : 'Run paper closure ↗';
  $('tokyo-status').textContent = snapshot.tokyoSession.kind === 'regular' ? 'Cash session open · synthetic quote' : snapshot.tokyoSession.kind === 'break' ? 'Midday break' : 'Cash session closed';
  $('global-price').textContent = snapshot.international.available ? money(snapshot.international.indicativeUSD) : 'Waiting for Tokyo';
  $('global-caption').textContent = snapshot.international.available ? `${snapshot.international.deviationPct.toFixed(2)}% vs. TM U.S. close · indicative` : 'No executable U.S. price inferred';
  $('global-reason').textContent = snapshot.international.reason;
  drawChart(row); renderJournal();
}

for (const scenario of SCENARIOS) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'scenario-button'; button.dataset.scenario = scenario.id; button.textContent = scenario.label;
  button.addEventListener('click', () => { scenarioId = scenario.id; broker = new PaperBroker(POSITIONS, CAPABILITIES); render(); });
  $('scenarios').append(button);
}
$('holdings').addEventListener('click', event => { const button = event.target.closest('[data-instrument]'); if (button) { selectedId = button.dataset.instrument; render(); } });
for (const [id, field] of [['enabled', 'enabled'], ['extended', 'extendedHours']]) {
  $(id).addEventListener('change', event => {
    policy[field] = event.target.checked;
    // Policy changes cancel working paper intents before the new policy applies.
    for (const order of broker.orders) broker.cancel(order.id, snapshot.now);
    savePolicy(); render();
  });
}
$('buffer').addEventListener('input', event => {
  policy.bufferBps = Number(event.target.value);
  for (const order of broker.orders) broker.cancel(order.id, snapshot.now);
  savePolicy(); render();
});
$('paper-order').addEventListener('click', () => {
  const row = snapshot.rows.find(r => r.instrument.id === selectedId);
  const existing = selectedOrder(row);
  if (existing && ['working', 'partially_filled'].includes(existing.status)) {
    broker.cancel(existing.id, snapshot.now); render(); notify('Paper limit cancelled.'); return;
  }
  if (!row.decision.order) return;
  try {
    const order = broker.submit(row.decision.order, row.instrument, row.quote, snapshot.now);
    notify(order.status === 'filled' ? `Paper closure filled at ${money(order.averageFillPrice)}.` : 'Paper limit recorded. No fill at the current bid.'); render();
  } catch (error) { notify(error.message); }
});
$('reset').addEventListener('click', () => { policy = { ...DEFAULT_POLICY }; scenarioId = 'close'; selectedId = 'US:TM'; broker = new PaperBroker(POSITIONS, CAPABILITIES); savePolicy(); render(); notify('Paper demo reset.'); });
$('export').addEventListener('click', () => {
  const journal = { mode: 'paper', syntheticData: true, scenario: scenarioId, at: new Date(snapshot.now).toISOString(), policy, brokerCapabilities: CAPABILITIES,
    closingReferences: snapshot.rows.map(r => r.anchor), orders: broker.orders, events: broker.journal };
  const url = URL.createObjectURL(new Blob([JSON.stringify(journal, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `nottingham-paper-${scenarioId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Paper journal exported.');
});
render();
