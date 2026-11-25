// Peer-Priced Token Radar page: reads window.RADAR (../data.js, written by main.ts), no network.
// State lives in the URL hash so every view is linkable: #p=<slug>, #tab=traded, #cat=RWA&wl=1&sort=growth.
(function () {
  'use strict';
  const D = window.RADAR;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const usd = (n) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
  const pct = (n) => n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  const bySlug = new Map(D.rows.map((r) => [r.slug, r]));
  const peersOf = new Map();
  for (const t of D.traded) peersOf.set(t.category, [...(peersOf.get(t.category) || []), t]);

  const COLS = [
    { key: 'rank', label: '#', num: true, cell: (r) => `<td class="rank num">${r.rank}</td>` },
    { key: 'name', label: 'Protocol', cell: (r) => `<td><b>${esc(r.name)}</b>${r.watchlist ? '<span class="wl">WATCHLIST</span>' : ''}</td>` },
    { key: 'category', label: 'Category', cell: (r) => `<td>${esc(r.category)}</td>` },
    { key: 'chain', label: 'Chain', cell: (r) => `<td>${esc(r.chains[0] || '—')}${r.chains.length > 1 ? ` <span class="pill">+${r.chains.length - 1}</span>` : ''}</td>` },
    { key: 'tvl_usd', label: 'TVL', num: true, cell: (r) => `<td class="num">${usd(r.tvl_usd)}</td>` },
    { key: 'change_7d', label: '7d', num: true, cell: (r) => `<td class="num ${r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''}">${pct(r.change_7d)}</td>` },
    { key: 'age_days', label: 'Days, no token', num: true, cell: (r) => `<td class="num">${r.age_days === null ? '—' : r.age_days}</td>` },
    { key: 'multiple', label: 'Peer ×', num: true, cell: (r) => `<td class="num">${r.multiple.toFixed(3)}</td>` },
    { key: 'implied_value_usd', label: 'Implied value', num: true, cell: (r) => `<td class="num"><b>${usd(r.implied_value_usd)}</b></td>` },
    { key: 'bar', label: '', cell: (r) => `<td class="barcell"><div class="bar" style="width:${Math.max(2, Math.round(140 * Math.sqrt(r.implied_value_usd / D.rows[0].implied_value_usd)))}px"></div></td>` },
  ];

  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    return { tab: h.get('tab') || 'board', p: h.get('p') || '', q: h.get('q') || '', cat: h.get('cat') || '', chain: h.get('chain') || '', tvl: +(h.get('tvl') || 0), wl: h.get('wl') === '1', up: h.get('up') === '1', sort: h.get('sort') || 'rank', dir: h.get('dir') || '' };
  }
  let S = readHash();
  function writeHash() {
    const h = new URLSearchParams();
    for (const [k, v] of Object.entries(S)) if (v && !(k === 'tab' && v === 'board') && !(k === 'sort' && v === 'rank')) h.set(k, v === true ? '1' : String(v));
    const next = h.toString();
    if (location.hash.slice(1) !== next) history.replaceState(null, '', next ? `#${next}` : location.pathname);
  }

  function header() {
    const total = D.rows.reduce((a, r) => a + r.implied_value_usd, 0);
    const wl = D.rows.filter((r) => r.watchlist).length;
    $('chips').innerHTML = [`Snapshot <b>${esc(D.as_of)}</b>`, `Ranked <b>${D.rows.length}</b> pre-token`, `Watchlist <b>${wl}/${D.watchlist}</b> covered`, `Implied, all rows <b>${usd(total)}</b>`].map((c) => `<span class="chip">${c}</span>`).join('');
    $('model').innerHTML = `<div class="formula">implied = <span class="t">TVL</span> × <span class="m">peer multiple</span> × <span class="g">growth</span> × <span class="a">runway</span></div>
      <small><span class="m">Peer multiple</span>: median market cap ÷ TVL of the snapshot's traded protocols in the same category, shrunk toward the market median (${D.market.toFixed(3)}) when peers are few. <span class="g">Growth</span> = e^(2 × 7-day change, clamped ±30%). <span class="a">Runway</span> = 0.85 → 1.15 over two years with no token.</small>`;
    const cats = [...new Set(D.rows.map((r) => r.category))].sort();
    const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
    $('cat').insertAdjacentHTML('beforeend', cats.map((c) => `<option>${esc(c)}</option>`).join(''));
    $('chain').insertAdjacentHTML('beforeend', chains.map((c) => `<option>${esc(c)}</option>`).join(''));
  }

  function filtered() {
    const q = S.q.toLowerCase();
    const rows = D.rows.filter((r) => (!S.cat || r.category === S.cat) && (!S.chain || r.chains.includes(S.chain)) && r.tvl_usd >= S.tvl && (!S.wl || r.watchlist) && (!S.up || r.change_7d > 0) && (!q || r.name.toLowerCase().includes(q) || r.chains.some((c) => c.toLowerCase().includes(q))));
    const key = S.sort === 'chain' ? (r) => r.chains[0] || '' : (r) => r[S.sort];
    const asc = S.dir ? S.dir === 'asc' : S.sort === 'rank' || S.sort === 'name' || S.sort === 'category' || S.sort === 'chain';
    return rows.sort((a, b) => { const x = key(a), y = key(b); const c = x === null ? 1 : y === null ? -1 : x < y ? -1 : x > y ? 1 : a.rank - b.rank; return asc ? c : -c; });
  }

  function board() {
    const rows = filtered();
    $('count').textContent = `${rows.length} of ${D.rows.length} protocols`;
    const head = COLS.map((c) => `<th data-key="${c.key}" class="${c.num ? 'num' : ''} ${S.sort === c.key ? 'sorted' : ''}">${c.label}${S.sort === c.key ? (S.dir === 'desc' || (!S.dir && c.num && c.key !== 'rank') ? ' ↓' : ' ↑') : ''}</th>`).join('');
    const body = rows.map((r) => `<tr data-slug="${esc(r.slug)}">${COLS.map((c) => c.cell(r)).join('')}</tr>`).join('');
    $('view').innerHTML = rows.length ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` : '<div class="empty">No protocol matches these filters.</div>';
  }

  function traded() {
    $('count').textContent = `${D.traded.length} traded protocols (largest by market cap): the peers the multiples come from`;
    $('view').innerHTML = `<table><thead><tr><th>Protocol</th><th>Symbol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap ÷ TVL</th></tr></thead><tbody>${D.traded.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.symbol)}</td><td>${esc(t.category)}</td><td class="num">${usd(t.tvl_usd)}</td><td class="num">${usd(t.mcap_usd)}</td><td class="num">${t.ratio.toFixed(3)}</td></tr>`).join('')}</tbody></table>`;
  }

  function multiples() {
    $('count').textContent = `${D.multiples.length} categories with traded peers; others use the market median ${D.market.toFixed(3)}`;
    $('view').innerHTML = `<table><thead><tr><th>Category</th><th class="num">Traded peers</th><th class="num">Peer median</th><th class="num">Multiple used</th><th class="num">Pre-token rows</th></tr></thead><tbody>${D.multiples.map((m) => `<tr><td><b>${esc(m.category)}</b></td><td class="num">${m.peers}</td><td class="num">${m.median.toFixed(3)}</td><td class="num">${m.multiple.toFixed(3)}</td><td class="num">${D.rows.filter((r) => r.category === m.category).length}</td></tr>`).join('')}</tbody></table>`;
  }

  function detail() {
    const r = bySlug.get(S.p);
    const el = $('detail');
    if (!r) { el.hidden = true; return; }
    const peers = (peersOf.get(r.category) || []).slice(0, 6);
    el.hidden = false;
    el.innerHTML = `<button class="close" id="close">Close ✕</button>
      <h2>${esc(r.name)}${r.watchlist ? '<span class="wl">WATCHLIST</span>' : ''}</h2>
      <div class="meta">#${r.rank} of ${D.rows.length} · ${esc(r.category)} · ${r.chains.map(esc).join(', ')} · records no token</div>
      <div class="value">${usd(r.implied_value_usd)}</div>
      <div class="calc">
        <div><span>TVL</span><span>${usd(r.tvl_usd)}</span></div>
        <div><span>× peer multiple (${r.peers ? `${r.peers} traded ${esc(r.category)} peers` : 'market median'})</span><span>${r.multiple.toFixed(3)}</span></div>
        <div><span>× growth (7d ${pct(r.change_7d)})</span><span>${r.growth.toFixed(3)}</span></div>
        <div><span>× runway (${r.age_days === null ? 'start unrecorded' : `${r.age_days} days, no token`})</span><span>${r.runway.toFixed(3)}</span></div>
        <div class="eq"><span>= implied value</span><span>${usd(r.implied_value_usd)}</span></div>
      </div>
      <h3>Farm plan</h3>
      <ol class="steps">${r.plan.map((s) => `<li>${esc(s.text)}<div class="pills"><span class="pill cost">Cost: ${esc(s.cost)}</span><span class="pill time">Time: ${esc(s.time)}</span></div></li>`).join('')}</ol>
      <h3>Traded peers behind the multiple</h3>
      ${peers.length ? `<div class="peers">${peers.map((t) => `<span>${esc(t.name)} (${esc(t.symbol)})</span><span>${usd(t.mcap_usd)}</span><span>${t.ratio.toFixed(2)}×</span>`).join('')}</div>` : `<div class="meta">No traded peer in this category: the market median ${D.market.toFixed(3)} applies.</div>`}`;
    $('close').onclick = () => { S.p = ''; render(); };
  }

  function render() {
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === S.tab);
    $('filters').style.display = S.tab === 'board' ? '' : 'none';
    $('q').value = S.q; $('cat').value = S.cat; $('chain').value = S.chain; $('tvl').value = String(S.tvl); $('wl').checked = S.wl; $('up').checked = S.up;
    (S.tab === 'traded' ? traded : S.tab === 'multiples' ? multiples : board)();
    detail();
    writeHash();
  }

  header();
  $('tabs').onclick = (e) => { const t = e.target.closest('button'); if (t) { S.tab = t.dataset.tab; S.p = ''; render(); } };
  for (const id of ['q', 'cat', 'chain', 'tvl', 'wl', 'up']) $(id).addEventListener('input', () => { S.q = $('q').value; S.cat = $('cat').value; S.chain = $('chain').value; S.tvl = +$('tvl').value; S.wl = $('wl').checked; S.up = $('up').checked; render(); });
  $('view').onclick = (e) => {
    const th = e.target.closest('th[data-key]');
    if (th && th.dataset.key !== 'bar') { const k = th.dataset.key; S.dir = S.sort === k ? (S.dir === 'asc' ? 'desc' : 'asc') : ''; S.sort = k; render(); return; }
    const tr = e.target.closest('tr[data-slug]');
    if (tr) { S.p = tr.dataset.slug; render(); }
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.p) { S.p = ''; render(); } });
  window.addEventListener('hashchange', () => { S = readHash(); render(); });
  render();
})();
