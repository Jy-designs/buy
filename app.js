/* Venga – Buy Crypto page
   Live EUR prices come from Kraken's public Ticker endpoint (no API key, CORS-enabled). */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------------------------------------------------------------- coins
  // `keys` = the result keys Kraken may return for each pair (legacy X/Z-prefixed names for BTC/ETH).
  const COINS = [
    { sym: 'BTC',  name: 'Bitcoin',      pair: 'XBTEUR',  keys: ['XXBTZEUR', 'XBTEUR'], icon: 'assets/btc-icon.svg', coin: 'assets/coin-btc.png' },
    { sym: 'ETH',  name: 'Ethereum',     pair: 'ETHEUR',  keys: ['XETHZEUR', 'ETHEUR'], coin: 'assets/coin-2.png' },
    { sym: 'LINK', name: 'Chainlink',    pair: 'LINKEUR', keys: ['LINKEUR'], coin: 'assets/coin-4.png' },
    { sym: 'AAVE', name: 'Aave',         pair: 'AAVEEUR', keys: ['AAVEEUR'], coin: 'assets/coin-aave.png' },
    { sym: 'UNI',  name: 'Uniswap',      pair: 'UNIEUR',  keys: ['UNIEUR'],  coin: 'assets/coin-uni.png' },
    { sym: 'TRX',  name: 'TRON',         pair: 'TRXEUR',  keys: ['TRXEUR'],  coin: 'assets/coin-3.png' },
    { sym: 'POL',  name: 'Polygon',      pair: 'POLEUR',  keys: ['POLEUR'],  coin: 'assets/coin-5.png' },
    { sym: 'COMP', name: 'Compound',     pair: 'COMPEUR', keys: ['COMPEUR'], coin: 'assets/coin-comp.png' },
    { sym: 'MANA', name: 'Decentraland', pair: 'MANAEUR', keys: ['MANAEUR'], coin: 'assets/coin-mana.png' },
    { sym: 'SAND', name: 'The Sandbox',  pair: 'SANDEUR', keys: ['SANDEUR'], coin: 'assets/coin-sand.png' },
  ];
  const KRAKEN_URL = 'https://api.kraken.com/0/public/Ticker?pair=' + COINS.map(c => c.pair).join(',');
  const REFRESH_MS = 30000;
  const MAX_INVEST = 1000000;
  const RANGE = 100; // slider goes from -100% to +100%

  const state = {
    coin: COINS[0],
    invest: 100,
    pct: 0,
    prices: {},      // sym -> last trade price in EUR
    updatedAt: null,
  };

  // ---------------------------------------------------------------- formatting
  const eur = (v, forceCents) => {
    const cents = forceCents || Math.round(v * 100) % 100 !== 0;
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2,
    }).format(v);
  };
  const eurRate = v => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 6 : 2,
  }).format(v);
  const qty = v => {
    if (!isFinite(v) || v === 0) return '0';
    if (v >= 1000) return v.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    if (v >= 1) return v.toLocaleString('en-GB', { maximumFractionDigits: 4 });
    // small amounts: keep 3 significant figures, at least 6 decimals (e.g. 0.000387)
    const decimals = Math.max(6, -Math.floor(Math.log10(v)) + 2);
    return v.toFixed(Math.min(decimals, 10));
  };
  const pctLabel = p => (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p) + '%';
  const updatedLabel = d => 'Last updated: ' + new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Madrid', timeZoneName: 'short',
  }).format(d).replace(/ at /, ', ');

  // ---------------------------------------------------------------- live prices (Kraken)
  async function fetchPrices() {
    try {
      const res = await fetch(KRAKEN_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.error && json.error.length) throw new Error(json.error.join(', '));
      for (const c of COINS) {
        const k = c.keys.find(key => json.result[key]);
        if (k) state.prices[c.sym] = parseFloat(json.result[k].c[0]); // c[0] = last trade price
      }
      state.updatedAt = new Date();
      updateRates();
      updateOptionPrices();
    } catch (err) {
      console.warn('Kraken price fetch failed:', err);
      if (!state.updatedAt) setAll('ref', 'live rate unavailable, retrying…');
    }
  }

  // ---------------------------------------------------------------- calculator: one engine, a template per variant
  // The same state (amount, coin, % move, prices) drives every variant; switching tabs re-renders the markup.
  let root = null;                                   // current .calc element
  const roles = r => root ? $$(`[data-role="${r}"]`, root) : [];
  const role = r => roles(r)[0] || null;
  const setAll = (r, text) => roles(r).forEach(el => { el.textContent = text; });
  const iconFor = c => c.icon || c.coin;
  const clampPct = p => Math.max(-RANGE, Math.min(RANGE, p));
  const priceNum = v => v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 6 : 2 });
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '+') + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const withCoin = tpl => tpl.replace('{coin}', state.coin.name);

  const ICON_MINUS = '<img src="assets/minus-circle.svg" width="24" height="24" alt="" />';
  const ICON_PLUS = '<img src="assets/plus-circle.svg" width="24" height="24" alt="" />';
  const ICON_SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="#707070" stroke-width="1.5"/><path d="M20 20l-3.5-3.5" stroke="#707070" stroke-width="1.5" stroke-linecap="round"/></svg>';

  // ---- template pieces (cls = spacing utility from the Figma layout)
  const H = {
    invest: euroIcon => `
      <div class="field">
        <label class="label trim" for="invest">You invest</label>
        <div class="input-box" data-role="investBox">
          ${euroIcon ? '<span class="input-box__euro"><span><img src="assets/euro-glyph.svg" alt="" /></span></span>' : '<span class="input-box__cur">€</span>'}
          <input id="invest" data-role="invest" type="text" inputmode="decimal" autocomplete="off" aria-label="Amount in euros" />
          <div class="input-box__steps">
            <button class="input-box__plus" data-step="invest" data-dir="-1" type="button" aria-label="Remove €10">${ICON_MINUS}</button>
            <button class="input-box__plus" data-step="invest" data-dir="1" type="button" aria-label="Add €10">${ICON_PLUS}</button>
          </div>
        </div>
      </div>`,
    crypto: () => `
      <div class="field">
        <span class="label trim">Crypto</span>
        <div class="select" data-role="select">
          <button class="input-box select__btn" type="button" data-role="selectBtn" aria-haspopup="listbox" aria-expanded="false">
            <img class="select__icon" data-role="selIcon" src="${iconFor(state.coin)}" alt="" />
            <span class="select__name" data-role="selName">${state.coin.name}</span>
            <img class="select__chev" src="assets/nav-arrow-right.svg" width="24" height="24" alt="" />
          </button>
          <div class="select__panel" data-role="panel">
            <label class="select__search">${ICON_SEARCH}<input data-role="search" type="text" placeholder="Search for a crypto" autocomplete="off" spellcheck="false" aria-label="Search for a crypto" /></label>
            <ul class="select__list" data-role="list" role="listbox">${COINS.map((c, i) => `
              <li class="select__opt" role="option" id="opt-${c.sym}" data-i="${i}" aria-selected="${c === state.coin}">
                <img src="${iconFor(c)}" alt="" /><span class="select__label">${c.name}<span class="sym">${c.sym}</span></span><span class="px" data-px="${c.sym}"></span>
              </li>`).join('')}
            </ul>
            <p class="select__empty" data-role="empty" hidden>No coins match your search.</p>
          </div>
        </div>
      </div>`,
    fields: (euroIcon, cls = '') => `<div class="calc__fields ${cls}">${H.invest(euroIcon)}${H.crypto()}</div>`,
    receive: (withCoinImg, cls = '') => `
      <div class="calc__receive ${cls}">
        <span class="label trim">You receive</span>
        ${withCoinImg ? `
        <div class="receive-box receive-box--coin">
          <img class="receive-box__coin" data-role="receiveCoin" src="${state.coin.coin}" width="67" height="67" alt="" />
          <div class="receive-box__text">
            <p class="receive-box__amt trim" data-role="receive"></p>
            <p class="receive-box__note trim">Estimated amount. Transaction rates may differ.</p>
          </div>
        </div>` : `
        <div class="receive-box">
          <p class="receive-box__amt trim" data-role="receive"></p>
          <p class="receive-box__note trim">Estimated amount. Actual transaction rates may differ.</p>
        </div>`}
      </div>`,
    meta: (small, cls = '') => `
      <div class="calc__meta ${small ? 'calc__meta--sm' : ''} ${cls}">
        <p class="trim"><span class="muted">Reference rate:</span> <span class="strong" data-role="ref">loading live rate…</span></p>
        <p class="trim muted" data-role="updated">Last updated: —</p>
      </div>`,
    what: (tpl, cls = '') => `<p class="calc__what trim ${cls}" data-role="coinText" data-tpl="${tpl}">${withCoin(tpl)}</p>`,
    value: (cls = '') => `<p class="calc__value trim ${cls}" data-role="value" aria-live="polite"></p>`,
    current: () => `
      <div class="field">
        <span class="label trim" data-role="coinText" data-tpl="Current {coin} price">${withCoin('Current {coin} price')}</span>
        <div class="input-box input-box--readonly"><span class="input-box__cur">€</span><span class="input-box__val" data-role="current">—</span></div>
      </div>`,
    future: tpl => `
      <div class="field">
        <label class="label trim" for="future" data-role="coinText" data-tpl="${tpl}">${withCoin(tpl)}</label>
        <div class="input-box" data-role="futureBox">
          <span class="input-box__cur">€</span>
          <input id="future" data-role="future" type="text" inputmode="decimal" autocomplete="off" />
          <div class="input-box__steps">
            <button class="input-box__plus" data-step="future" data-dir="-1" type="button" aria-label="Lower the future price by 1%">${ICON_MINUS}</button>
            <button class="input-box__plus" data-step="future" data-dir="1" type="button" aria-label="Raise the future price by 1%">${ICON_PLUS}</button>
          </div>
        </div>
      </div>`,
    prices: (cls = '') => `<div class="calc__prices ${cls}">${H.current()}${H.future('Future {coin} price')}</div>`,
    slider: (cls = '', small = false) => `
      <div class="slider ${small ? 'slider--sm' : ''} ${cls}" data-role="slider">
        <div class="slider__tag">
          <div class="tag"><img class="tag__pattern" src="assets/tag-pattern.svg" alt="" /><span class="tag__glass"></span><span class="tag__text" data-role="tagText">0%</span></div>
          <img class="tag__pointer" src="assets/tag-pointer.svg" alt="" />
        </div>
        <div class="slider__rail">
          <div class="slider__track"><div class="slider__fill" data-role="fill"></div></div>
          <button class="slider__tick" data-role="tick" type="button" aria-label="Reset to 0%"><img src="assets/tick.svg" width="4" height="4" alt="" /></button>
          <div class="slider__knob" data-role="knob" role="slider" tabindex="0" aria-label="Price change" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0%"></div>
        </div>
      </div>`,
    worth: (cls = '') => `
      <div class="calc__worth ${cls}">
        <span class="label trim">Your crypto would be worth</span>
        <div class="worth-box">
          <div class="worth-box__row"><p class="worth-box__val trim" data-role="worth"></p><p class="worth-box__gain trim" data-role="gain"></p></div>
          <p class="worth-box__note trim">Estimated amount. Transaction rates may differ. | Hypothetical scenario, not a forecast.</p>
        </div>
      </div>`,
    updated: (cls = '') => `<p class="calc__small trim ${cls}" data-role="updated">Last updated: —</p>`,
    foot: (cls = '') => `<p class="calc__small trim ${cls}">Hypothetical scenario, not a forecast.</p>`,
  };

  // ---- one layout per variant (spacing from the Figma frames)
  const TEMPLATES = {
    a: () => `
      <div class="calc calc--a">
        <div class="calc__col">
          <p class="calc__title trim">Euro to crypto calculator</p>
          ${H.fields(false, 'mt32')}
          ${H.receive(false, 'mt32')}
          ${H.meta(false, 'mt16')}
        </div>
        <div class="calc__divider" aria-hidden="true"></div>
        <div class="calc__col">
          ${H.what('What if price changes?')}
          ${H.prices('mt32')}
          ${H.slider('mt16')}
          ${H.worth('mt16')}
          ${H.updated('mt8')}
        </div>
      </div>`,
    b: () => `
      <div class="calc calc--card">
        ${H.fields(false)}
        ${H.receive(true, 'mt16')}
        ${H.what('What if {coin} price changes?', 'mt24')}
        ${H.value('mt32')}
        ${H.slider('mt32')}
        ${H.meta(true, 'mtauto')}
        ${H.foot('mt12')}
      </div>`,
    c: () => `
      <div class="calc calc--card">
        ${H.fields(false)}
        ${H.receive(true, 'mt16')}
        ${H.what('What if {coin} price changes?', 'mt24')}
        ${H.prices('mt32')}
        ${H.slider('mt16')}
        ${H.worth('mt16')}
        ${H.updated('mt8')}
      </div>`,
    d: () => `
      <div class="calc calc--card">
        ${H.fields(false)}
        ${H.receive(true, 'mt16')}
        ${H.what('What if the price changes?', 'mt24')}
        <div class="calc__row mt32">${H.slider('', true)}${H.future('Future price')}</div>
        ${H.worth('mt16')}
        ${H.meta(true, 'mt16')}
        ${H.foot('mt12')}
      </div>`,
    e: () => `
      <div class="calc calc--card">
        <p class="calc__title calc__title--lg trim">Euro → crypto calculator</p>
        ${H.fields(true, 'mt24')}
        ${H.receive(true, 'mt16')}
        ${H.meta(false, 'mt16')}
      </div>`,
  };

  // ---- updates (only touch what the current template has)
  function updateRates() {
    const c = state.coin, p = state.prices[c.sym];
    roles('receive').forEach(el => {
      if (p) el.textContent = qty(state.invest / p) + ' ' + c.sym;
      else el.innerHTML = '<span class="skeleton">0.000000 ' + c.sym + '</span>';
    });
    if (p) setAll('ref', '1 ' + c.sym + ' = ' + eurRate(p) + ' | Fees excluded.');
    setAll('current', p ? priceNum(p) : '—');
    if (state.updatedAt) setAll('updated', updatedLabel(state.updatedAt));
    roles('coinText').forEach(el => { el.textContent = withCoin(el.dataset.tpl); });
    updateMove();
  }

  // Animated euro value for B's big number (eases toward target each frame)
  let shown = state.invest, target = state.invest, raf = 0;
  function setValueTarget(v) { target = v; if (!raf) raf = requestAnimationFrame(stepValue); }
  function stepValue() {
    shown += (target - shown) * 0.22;
    if (Math.abs(target - shown) < 0.005) shown = target;
    setAll('value', eur(shown === target ? target : Math.round(shown * 100) / 100));
    raf = shown === target ? 0 : requestAnimationFrame(stepValue);
  }

  // everything that depends on the % move: slider, future price, worth, gain, big value
  function updateMove() {
    const pct = state.pct, worth = state.invest * (1 + pct / 100), gain = worth - state.invest;
    const slider = role('slider');
    if (slider) {
      const W = slider.offsetWidth, half = W / 2;
      const kw = parseFloat(getComputedStyle(slider).getPropertyValue('--kw')) || 38;
      const x = half + (pct / RANGE) * (half - kw / 2);
      slider.style.setProperty('--x', x + 'px');
      const fill = role('fill');
      fill.style.left = Math.min(x, half) + 'px';
      fill.style.width = Math.abs(x - half) + 'px';
      role('tagText').textContent = pctLabel(pct);
      const knob = role('knob');
      knob.setAttribute('aria-valuenow', pct);
      knob.setAttribute('aria-valuetext', pctLabel(pct));
    }
    const p = state.prices[state.coin.sym];
    const fut = role('future');
    if (fut && document.activeElement !== fut) fut.value = p ? priceNum(p * (1 + pct / 100)) : '';
    setAll('worth', eur(worth, true));
    roles('gain').forEach(el => {
      el.textContent = signed(gain) + ' on your ' + eur(state.invest);
      el.classList.toggle('is-down', gain < 0);
      el.classList.toggle('is-flat', gain === 0);
    });
    if (role('value')) {
      setValueTarget(worth);
      roles('value').forEach(el => { el.classList.toggle('is-up', pct > 0); el.classList.toggle('is-down', pct < 0); });
    }
  }

  function updateInvestField() {
    const inp = role('invest');
    if (inp && document.activeElement !== inp) inp.value = state.invest.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    roles('investBox').forEach(box => {
      const minus = box.querySelector('[data-dir="-1"]');
      if (minus) minus.disabled = state.invest <= 0;
    });
  }
  function updateAll() { updateInvestField(); updateRates(); }

  function setPct(p, animate) {
    p = clampPct(p);
    if (p === state.pct && !animate) return;
    const slider = role('slider');
    if (slider) slider.classList.toggle('is-animating', !!animate);
    state.pct = p;
    updateMove();
  }
  function setInvest(v) {
    state.invest = Math.max(0, Math.min(MAX_INVEST, Math.round(v * 100) / 100));
    updateAll();
  }

  // ---- input helpers
  const parseAmount = s => {
    const n = parseFloat(String(s).replace(/,/g, '').replace(/[^\d.]/g, ''));
    return isFinite(n) ? n : 0;
  };
  const cleanTyping = v => {   // digits and one decimal point, max 2 decimals
    v = v.replace(/,/g, '').replace(/[^\d.]/g, '');
    const [i, ...rest] = v.split('.');
    return rest.length ? i + '.' + rest.join('').slice(0, 2) : i;
  };

  // press and hold to repeat: starts after 400ms, speeds up; `step(heldMs)` does one step and returns false at a limit
  function holdToRepeat(btn, box, step) {
    let timer = 0, started = 0;
    const stop = () => { clearTimeout(timer); timer = 0; box.classList.remove('is-active'); };
    const tick = () => {
      const held = performance.now() - started;
      if (step(held) === false) return stop();
      timer = setTimeout(tick, Math.max(40, 140 - held / 15));   // 140ms → 40ms as you keep holding
    };
    btn.addEventListener('pointerdown', e => {
      if (e.button !== 0 || btn.disabled) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* keep working without capture */ }
      started = performance.now();
      box.classList.add('is-active');   // primary (#111A29) outline while pressing
      step(0);
      timer = setTimeout(tick, 400);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, stop));
    btn.addEventListener('click', e => { if (e.detail === 0) step(0); });   // keyboard: one step per press
  }

  // ---- wire up a freshly rendered calculator
  function bindCalc() {
    // invest field
    const invest = role('invest'), investBox = role('investBox');
    invest.addEventListener('input', () => {
      let v = cleanTyping(invest.value);
      if (parseFloat(v) > MAX_INVEST) v = String(MAX_INVEST);
      invest.value = v;
      state.invest = parseAmount(v);
      updateInvestField(); updateRates();
    });
    invest.addEventListener('focus', () => { invest.value = String(state.invest || ''); invest.select(); });
    invest.addEventListener('blur', updateInvestField);
    invest.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        setInvest(state.invest + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 100 : 10));
        invest.value = String(state.invest);
      }
      if (e.key === 'Enter') invest.blur();
    });
    $$('[data-step="invest"]', root).forEach(btn => {
      const dir = +btn.dataset.dir;
      holdToRepeat(btn, investBox, held => {
        setInvest(state.invest + dir * (held > 2000 ? 50 : 10));
        return !((dir < 0 && state.invest <= 0) || (dir > 0 && state.invest >= MAX_INVEST));
      });
    });

    // future price field (A, C, D): typing sets the % move; ± steps 1% (5% after 2s)
    const future = role('future'), futureBox = role('futureBox');
    if (future) {
      future.addEventListener('focus', () => { future.select(); });
      future.addEventListener('input', () => {
        future.value = cleanTyping(future.value);
        const p = state.prices[state.coin.sym], v = parseAmount(future.value);
        if (p && future.value !== '') setPct(Math.round((v / p - 1) * 100), false);
      });
      future.addEventListener('blur', updateMove);       // snap to the 1% step
      future.addEventListener('keydown', e => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setPct(state.pct + (e.key === 'ArrowUp' ? 1 : -1), false); future.value = priceNum((state.prices[state.coin.sym] || 0) * (1 + state.pct / 100)); }
        if (e.key === 'Enter') future.blur();
      });
      $$('[data-step="future"]', root).forEach(btn => {
        const dir = +btn.dataset.dir;
        holdToRepeat(btn, futureBox, held => {
          setPct(state.pct + dir * (held > 2000 ? 5 : 1), false);
          return Math.abs(state.pct) < RANGE;
        });
      });
    }

    // slider: only the knob drags; the centre dot resets to 0%
    const slider = role('slider');
    if (slider) {
      const knob = role('knob');
      const pctFromClientX = clientX => {
        const r = slider.getBoundingClientRect(), half = r.width / 2;
        const kw = parseFloat(getComputedStyle(slider).getPropertyValue('--kw')) || 38;
        return clampPct(Math.round(((clientX - r.left - half) / (half - kw / 2)) * RANGE));
      };
      let dragging = false, grabOffset = 0;
      knob.addEventListener('pointerdown', e => {
        dragging = true;
        const k = knob.getBoundingClientRect();
        grabOffset = e.clientX - (k.left + k.width / 2);
        try { knob.setPointerCapture(e.pointerId); } catch (_) { /* fine without capture */ }
        slider.classList.remove('is-animating');
        slider.classList.add('is-dragging');
      });
      knob.addEventListener('pointermove', e => { if (dragging) setPct(pctFromClientX(e.clientX - grabOffset), false); });
      const endDrag = () => { dragging = false; slider.classList.remove('is-dragging'); };
      knob.addEventListener('pointerup', endDrag);
      knob.addEventListener('pointercancel', endDrag);
      role('tick').addEventListener('click', () => setPct(0, true));
      knob.addEventListener('keydown', e => {
        const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
        let p = state.pct;
        if (e.key in map) p += map[e.key] * (e.shiftKey ? 10 : 1);
        else if (e.key === 'Home') p = -RANGE;
        else if (e.key === 'End') p = RANGE;
        else return;
        e.preventDefault();
        setPct(p, true);
      });
    }

    bindSelect();
  }

  // ---- crypto dropdown with search
  let selectApi = null;
  function updateOptionPrices() {
    roles('list').forEach(list => $$('[data-px]', list).forEach(el => {
      const p = state.prices[el.dataset.px];
      el.textContent = p ? eurRate(p) : '';
    }));
  }
  function bindSelect() {
    const select = role('select'), btn = role('selectBtn'), panel = role('panel');
    const list = role('list'), search = role('search'), empty = role('empty');
    const opts = $$('.select__opt', list);
    let visible = COINS.map((_, i) => i), focusPos = 0;

    function markFocus() {
      opts.forEach(o => o.classList.remove('is-focus'));
      const o = opts[visible[focusPos]];
      if (!o) return;
      o.classList.add('is-focus');
      // scroll only the list (scrollIntoView would also scroll the glass card)
      if (o.offsetTop < list.scrollTop) list.scrollTop = o.offsetTop;
      else if (o.offsetTop + o.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = o.offsetTop + o.offsetHeight - list.clientHeight;
      search.setAttribute('aria-activedescendant', o.id);
    }
    function filter(q) {
      q = q.trim().toLowerCase();
      visible = [];
      COINS.forEach((c, i) => {
        const hit = !q || c.name.toLowerCase().includes(q) || c.sym.toLowerCase().includes(q);
        opts[i].hidden = !hit;
        if (hit) visible.push(i);
      });
      empty.hidden = visible.length > 0;
      focusPos = 0;
      markFocus();
    }
    function open(on) {
      select.classList.toggle('is-open', on);
      btn.setAttribute('aria-expanded', on);
      if (!on) return;
      // in the hero card the panel opens inside the card, from just under the fields down to the bottom
      if (root.classList.contains('calc--card')) {
        const fields = select.closest('.calc__fields');
        panel.style.top = (fields.getBoundingClientRect().bottom - root.getBoundingClientRect().top + 8) + 'px';
      } else panel.style.top = '';
      search.value = '';
      filter('');
      focusPos = Math.max(0, visible.indexOf(COINS.indexOf(state.coin)));
      markFocus();
      search.focus({ preventScroll: true });
    }
    function choose(i) {
      const c = COINS[i];
      open(false);
      btn.focus({ preventScroll: true });
      if (c === state.coin) return;
      state.coin = c;
      opts.forEach((o, j) => o.setAttribute('aria-selected', j === i));
      role('selIcon').src = iconFor(c);
      role('selName').textContent = c.name;
      roles('receiveCoin').forEach(img => { img.src = c.coin; });
      updateRates();
    }
    btn.addEventListener('click', () => open(!select.classList.contains('is-open')));
    list.addEventListener('click', e => { const o = e.target.closest('.select__opt'); if (o) choose(+o.dataset.i); });
    list.addEventListener('mousemove', e => {
      const o = e.target.closest('.select__opt');
      if (o) { const pos = visible.indexOf(+o.dataset.i); if (pos !== focusPos) { focusPos = pos; opts.forEach(x => x.classList.toggle('is-focus', x === o)); } }
    });
    search.addEventListener('input', () => filter(search.value));
    search.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { focusPos = Math.min(visible.length - 1, focusPos + 1); markFocus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { focusPos = Math.max(0, focusPos - 1); markFocus(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (visible.length) choose(visible[focusPos]); e.preventDefault(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { open(false); btn.focus(); }
    });
    selectApi = { select, close: () => open(false) };
    updateOptionPrices();
  }
  document.addEventListener('pointerdown', e => { if (selectApi && !selectApi.select.contains(e.target)) selectApi.close(); });

  function renderCalc(v, container) {
    $('#calcHome').innerHTML = '';
    $('#heroCard').innerHTML = '';
    container.innerHTML = TEMPLATES[v]();
    root = container.firstElementChild;
    bindCalc();
    shown = state.invest * (1 + state.pct / 100);   // no count-up animation on a fresh render
    updateAll();
  }

  // ---------------------------------------------------------------- blog list
  const articles = $$('.article');
  let active = 0;
  function setArticle(i) {
    active = (i + articles.length) % articles.length;
    articles.forEach((a, j) => a.classList.toggle('is-active', j === active));
    const img = $('#blogCover');
    img.classList.add('is-swap');
    setTimeout(() => img.classList.remove('is-swap'), 220);
  }
  articles.forEach((a, i) => a.addEventListener('click', e => { if (!e.target.closest('.btn')) setArticle(i); }));
  $('#blogPrev').addEventListener('click', () => setArticle(active - 1));
  $('#blogNext').addEventListener('click', () => setArticle(active + 1));

  // ---------------------------------------------------------------- FAQ accordion
  $$('.faq__item').forEach(item => {
    const q = $('.faq__q', item);
    q.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      $$('.faq__item.is-open').forEach(o => { o.classList.remove('is-open'); $('.faq__q', o).setAttribute('aria-expanded', 'false'); });
      item.classList.toggle('is-open', open);
      q.setAttribute('aria-expanded', open);
    });
  });

  // ---------------------------------------------------------------- newsletter (front-end only, nothing is sent)
  $('#newsletter').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#nlEmail'), msg = $('#nlMsg');
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
    msg.classList.toggle('is-err', !ok);
    msg.textContent = ok ? 'Thanks! You’re on the list.' : 'Please enter a valid email address.';
    if (ok) input.value = '';
  });

  // ---------------------------------------------------------------- scroll effects
  const topbar = $('#topbar');
  const banner = $('.banner__bg img');
  const bannerEl = $('.banner');
  // Stacking step cards: each card sticks under the nav; as the next one slides over it,
  // the covered card shrinks back, lifts slightly and dims.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepCards = $$('.step');
  const clamp01 = v => Math.max(0, Math.min(1, v));
  function stack() {
    stepCards.forEach((c, i) => {
      const top = parseFloat(getComputedStyle(c).top);
      c.classList.toggle('is-stuck', c.getBoundingClientRect().top <= top + 1);
      const next = stepCards[i + 1];
      const p = next ? clamp01(1 - (next.getBoundingClientRect().top - top) / c.offsetHeight) : 0;
      c.style.transform = p ? `scale(${1 - p * 0.06}) translateY(${-p * 12}px)` : '';
      c.querySelector('.step__shade').style.opacity = (p * 0.18).toFixed(3);
    });
  }

  let ticking = false;
  function onScroll() {
    topbar.classList.toggle('is-scrolled', window.scrollY > 40);
    if (!reduceMotion) stack();
    // gentle parallax on the CTA banner photo
    const r = bannerEl.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) {
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      banner.style.transform = `translateY(${(p * 60).toFixed(1)}px)`;
    }
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal, .step').forEach(el => io.observe(el));

  // ---------------------------------------------------------------- A–E variant tabs
  // A = calculator in its own section, looping wave video.
  // B–E = calculator in a glass card in the hero, surfer video that plays once and stops on the last frame.
  const tabsEl = $('.tabs'), tabBtns = $$('.tabs__item'), heroVideo = $('#heroVideo');
  const VARIANTS = ['a', 'b', 'c', 'd', 'e'];
  const VIDEO_A = { src: 'assets/hero-wave.mp4', loop: true, poster: 'assets/hero.png' };
  const VIDEO_CARD = { src: 'assets/hero-surfer.mp4', loop: false, poster: '' };
  let variant = null;
  function setVariant(v) {
    if (v === variant) return;
    const wasCard = variant && variant !== 'a';
    variant = v;
    const isCard = v !== 'a';
    VARIANTS.forEach(x => document.body.classList.toggle('variant-' + x, x === v));
    document.body.classList.toggle('variant-card', isCard);
    tabsEl.dataset.active = v;
    tabBtns.forEach(b => { const on = b.dataset.variant === v; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });

    renderCalc(v, isCard ? $('#heroCard') : $('#calcHome'));

    // video: only restart when switching between A and the card variants
    if (!variant || isCard !== wasCard || !heroVideo.currentSrc) {
      const vid = isCard ? VIDEO_CARD : VIDEO_A;
      heroVideo.loop = vid.loop;
      if (vid.poster) heroVideo.poster = vid.poster; else heroVideo.removeAttribute('poster');
      if (!heroVideo.src.endsWith(vid.src)) heroVideo.src = vid.src;
      heroVideo.currentTime = 0;
      heroVideo.play().catch(() => {});
    }

    const url = new URL(location.href);
    if (isCard) url.searchParams.set('variant', v); else url.searchParams.delete('variant');
    history.replaceState(null, '', url);
    onScroll();
  }
  tabBtns.forEach(b => b.addEventListener('click', () => setVariant(b.dataset.variant)));
  tabsEl.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = VARIANTS.indexOf(variant) + (e.key === 'ArrowRight' ? 1 : -1);
    const next = VARIANTS[(i + VARIANTS.length) % VARIANTS.length];
    setVariant(next);
    tabBtns.find(b => b.dataset.variant === next).focus();
  });
  const requested = new URLSearchParams(location.search).get('variant');
  setVariant(VARIANTS.includes(requested) ? requested : 'a');

  // ---------------------------------------------------------------- boot
  fetchPrices();
  setInterval(fetchPrices, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchPrices(); });
  addEventListener('resize', () => { updateMove(); onScroll(); });
})();
