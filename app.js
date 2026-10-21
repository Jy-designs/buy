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
      renderRates();
      renderOptionPrices();
    } catch (err) {
      console.warn('Kraken price fetch failed:', err);
      if (!state.updatedAt) {
        $('#refRate').textContent = 'live rate unavailable, retrying…';
        $('#receiveAmt').innerHTML = '<span class="skeleton">0.000000 ' + state.coin.sym + '</span>';
      }
    }
  }

  // ---------------------------------------------------------------- calculator render
  const els = {
    invest: $('#invest'), investBox: $('#investBox'),
    receive: $('#receiveAmt'), refRate: $('#refRate'), updated: $('#updated'),
    value: $('#calcValue'), same: $('#sameLine'),
    slider: $('#slider'), rail: $('#rail'), knob: $('#knob'), fill: $('#fill'), tag: $('#tag'), tagText: $('#tagText'),
    coinWrap: $('#calcCoin'), coinImg: $('#calcCoinImg'),
  };

  function cryptoAmount() {
    const p = state.prices[state.coin.sym];
    return p ? state.invest / p : null;
  }

  function renderRates() {
    const p = state.prices[state.coin.sym];
    const amt = cryptoAmount();
    if (p) {
      els.receive.textContent = qty(amt) + ' ' + state.coin.sym;
      els.refRate.textContent = '1 ' + state.coin.sym + ' = ' + eurRate(p) + ' | Fees excluded.';
      els.same.textContent = 'Same ' + qty(amt) + ' ' + state.coin.sym + '.  A different value in euros.';
    }
    if (state.updatedAt) els.updated.textContent = updatedLabel(state.updatedAt);
  }

  // Animated euro value (eases toward target each frame)
  let shown = state.invest, target = state.invest, raf = 0;
  function setValueTarget(v) {
    target = v;
    if (!raf) raf = requestAnimationFrame(stepValue);
  }
  function stepValue() {
    shown += (target - shown) * 0.22;
    if (Math.abs(target - shown) < 0.005) shown = target;
    els.value.textContent = eur(shown === target ? target : Math.round(shown * 100) / 100);
    raf = shown === target ? 0 : requestAnimationFrame(stepValue);
  }

  function renderSlider() {
    const W = els.slider.offsetWidth;          // 494.5px
    const half = W / 2;
    const travel = half - 19;                  // keep the 38px knob inside the rail
    const x = half + (state.pct / RANGE) * travel;
    els.slider.style.setProperty('--x', x + 'px');
    els.fill.style.left = Math.min(x, half) + 'px';
    els.fill.style.width = Math.abs(x - half) + 'px';
    els.tagText.textContent = pctLabel(state.pct);
    els.knob.setAttribute('aria-valuenow', state.pct);
    els.knob.setAttribute('aria-valuetext', pctLabel(state.pct));

    const v = state.invest * (1 + state.pct / 100);
    setValueTarget(v);
    els.value.classList.toggle('is-up', state.pct > 0);
    els.value.classList.toggle('is-down', state.pct < 0);
  }

  function renderAll() { renderRates(); renderSlider(); const m = document.getElementById('investMinus'); if (m) m.disabled = state.invest <= 0; }

  // ---------------------------------------------------------------- slider interaction
  function pctFromClientX(clientX) {
    const r = els.slider.getBoundingClientRect();
    const half = r.width / 2, travel = half - 19;
    const raw = ((clientX - r.left - half) / travel) * RANGE;
    return Math.max(-RANGE, Math.min(RANGE, Math.round(raw)));   // snap to 1% steps
  }
  function setPct(p, animate) {
    if (p === state.pct && !animate) return;
    els.slider.classList.toggle('is-animating', !!animate);
    state.pct = p;
    renderSlider();
  }
  // Only the knob drags; clicking the track does nothing. The centre dot resets to 0%.
  let dragging = false, grabOffset = 0;
  els.knob.addEventListener('pointerdown', e => {
    dragging = true;
    const k = els.knob.getBoundingClientRect();
    grabOffset = e.clientX - (k.left + k.width / 2);   // keep the knob under the finger, no jump
    els.knob.setPointerCapture(e.pointerId);
    els.slider.classList.remove('is-animating');
    els.slider.classList.add('is-dragging');
  });
  els.knob.addEventListener('pointermove', e => {
    if (!dragging) return;
    setPct(pctFromClientX(e.clientX - grabOffset), false);
  });
  const endDrag = () => { dragging = false; els.slider.classList.remove('is-dragging'); };
  els.knob.addEventListener('pointerup', endDrag);
  els.knob.addEventListener('pointercancel', endDrag);
  $('#tick').addEventListener('click', () => setPct(0, true));
  els.knob.addEventListener('keydown', e => {
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    let p = state.pct;
    if (e.key in map) p += map[e.key] * (e.shiftKey ? 10 : 1);
    else if (e.key === 'Home') p = -RANGE;
    else if (e.key === 'End') p = RANGE;
    else return;
    e.preventDefault();
    setPct(Math.max(-RANGE, Math.min(RANGE, p)), true);
  });

  // ---------------------------------------------------------------- invest input
  const parseAmount = s => {
    const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
    return isFinite(n) ? Math.min(n, MAX_INVEST) : 0;
  };
  els.invest.addEventListener('input', () => {
    // allow digits and a single decimal point (max 2 decimals)
    let v = els.invest.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const [i, ...rest] = v.split('.');
    v = rest.length ? i + '.' + rest.join('').slice(0, 2) : i;
    if (parseFloat(v) > MAX_INVEST) v = String(MAX_INVEST);
    els.invest.value = v;
    state.invest = parseAmount(v);
    renderAll();
  });
  els.invest.addEventListener('focus', () => { els.invest.value = String(state.invest || ''); els.invest.select(); });
  els.invest.addEventListener('blur', () => {
    els.invest.value = state.invest ? state.invest.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : '0';
  });
  // plus / minus buttons: ±€10, never below €0
  const minusBtn = $('#investMinus');
  function stepInvest(delta) {
    state.invest = Math.max(0, Math.min(MAX_INVEST, Math.round((state.invest + delta) * 100) / 100));
    els.invest.value = state.invest.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    els.investBox.classList.remove('is-bump'); void els.investBox.offsetWidth; els.investBox.classList.add('is-bump');
    renderAll();
  }
  $('#investPlus').addEventListener('click', () => stepInvest(10));
  minusBtn.addEventListener('click', () => stepInvest(-10));
  els.invest.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 100 : 10;
      state.invest = Math.max(0, Math.min(MAX_INVEST, Math.round((state.invest + (e.key === 'ArrowUp' ? step : -step)) * 100) / 100));
      els.invest.value = String(state.invest);
      els.investBox.classList.remove('is-bump'); void els.investBox.offsetWidth; els.investBox.classList.add('is-bump');
      renderAll();
    }
    if (e.key === 'Enter') els.invest.blur();
  });

  // ---------------------------------------------------------------- crypto select
  const select = $('#select'), selBtn = $('#selectBtn'), list = $('#selectList');
  const iconFor = c => c.icon || c.coin;
  list.innerHTML = COINS.map((c, i) =>
    `<li class="select__opt" role="option" id="opt-${c.sym}" data-i="${i}" aria-selected="${i === 0}">
       <img src="${iconFor(c)}" alt="" /><span class="select__label">${c.name}<span class="sym">${c.sym}</span></span><span class="px" data-px="${c.sym}"></span>
     </li>`).join('');
  function renderOptionPrices() {
    $$('[data-px]', list).forEach(el => {
      const p = state.prices[el.dataset.px];
      el.textContent = p ? eurRate(p) : '';
    });
  }
  const search = $('#selectSearch'), empty = $('#selectEmpty');
  const opts = $$('.select__opt', list);
  let visible = COINS.map((_, i) => i);   // indices of options matching the search
  let focusPos = 0;                         // position within `visible`
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
  function openSelect(open) {
    select.classList.toggle('is-open', open);
    selBtn.setAttribute('aria-expanded', open);
    if (open) {
      search.value = '';
      filter('');
      focusPos = Math.max(0, visible.indexOf(COINS.indexOf(state.coin)));
      markFocus();
      search.focus({ preventScroll: true });
    }
  }
  function markFocus() {
    opts.forEach(o => o.classList.remove('is-focus'));
    const o = opts[visible[focusPos]];
    if (o) { o.classList.add('is-focus'); o.scrollIntoView({ block: 'nearest' }); search.setAttribute('aria-activedescendant', o.id); }
  }
  function chooseCoin(i) {
    const c = COINS[i];
    openSelect(false);
    selBtn.focus({ preventScroll: true });
    if (c === state.coin) return;
    state.coin = c;
    opts.forEach((o, j) => o.setAttribute('aria-selected', j === i));
    $('#selIcon').src = iconFor(c);
    $('#selName').textContent = c.name;
    els.coinImg.src = c.coin;
    els.coinWrap.classList.remove('is-flip'); void els.coinWrap.offsetWidth; els.coinWrap.classList.add('is-flip');
    renderRates();
  }
  selBtn.addEventListener('click', () => openSelect(!select.classList.contains('is-open')));
  list.addEventListener('click', e => { const o = e.target.closest('.select__opt'); if (o) chooseCoin(+o.dataset.i); });
  list.addEventListener('mousemove', e => {
    const o = e.target.closest('.select__opt');
    if (o) { const pos = visible.indexOf(+o.dataset.i); if (pos !== focusPos) { focusPos = pos; opts.forEach(x => x.classList.toggle('is-focus', x === o)); } }
  });
  search.addEventListener('input', () => filter(search.value));
  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { focusPos = Math.min(visible.length - 1, focusPos + 1); markFocus(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { focusPos = Math.max(0, focusPos - 1); markFocus(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (visible.length) chooseCoin(visible[focusPos]); e.preventDefault(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { openSelect(false); selBtn.focus(); }
  });
  document.addEventListener('pointerdown', e => { if (!select.contains(e.target)) openSelect(false); });

  // ---------------------------------------------------------------- coin carousel (infinite)
  const carouselCoins = ['coin-1', 'coin-2', 'coin-3', 'coin-4', 'coin-5', 'coin-mana', 'coin-uni', 'coin-aave', 'coin-comp', 'coin-sand'];
  const track = $('#carouselTrack');
  const coinHTML = carouselCoins.map((c, i) =>
    `<div class="carousel__coin" style="--bd:${(-i * 0.6).toFixed(1)}s"><img src="assets/${c}.png" alt="" loading="lazy" /></div>`).join('');
  track.innerHTML = coinHTML + coinHTML; // duplicated for a seamless loop

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

  // ---------------------------------------------------------------- A / B variant tabs
  // A = calculator in its own section, looping wave video.
  // B = calculator inside a glass card in the hero, surfer video that plays once and stops on the last frame.
  const tabsEl = $('.tabs'), tabBtns = $$('.tabs__item');
  const calcEl = $('#calc'), calcHome = $('#calcHome'), heroCard = $('#heroCard'), heroVideo = $('#heroVideo');
  const HERO_VIDEO = {
    a: { src: 'assets/hero-wave.mp4', loop: true, poster: 'assets/hero.png' },
    b: { src: 'assets/hero-surfer.mp4', loop: false, poster: '' },
  };
  let variant = null;
  function setVariant(v) {
    if (v === variant) return;
    variant = v;
    const isB = v === 'b';
    document.body.classList.toggle('variant-b', isB);
    tabsEl.dataset.active = v;
    tabBtns.forEach(b => { const on = b.dataset.variant === v; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });

    // move the one live calculator between the section and the hero card (state is kept)
    if (isB) heroCard.appendChild(calcEl);
    else calcHome.after(calcEl);
    calcEl.classList.toggle('calc--card', isB);
    if (isB) calcEl.classList.add('is-in');

    const vid = HERO_VIDEO[v];
    heroVideo.loop = vid.loop;
    if (vid.poster) heroVideo.poster = vid.poster; else heroVideo.removeAttribute('poster');
    if (!heroVideo.src.endsWith(vid.src)) { heroVideo.src = vid.src; }
    heroVideo.currentTime = 0;
    heroVideo.play().catch(() => {});

    const url = new URL(location.href);
    if (isB) url.searchParams.set('variant', 'b'); else url.searchParams.delete('variant');
    history.replaceState(null, '', url);
    renderSlider();
    onScroll();
  }
  tabBtns.forEach(b => b.addEventListener('click', () => setVariant(b.dataset.variant)));
  tabsEl.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = variant === 'a' ? 'b' : 'a';
    setVariant(next);
    tabBtns.find(b => b.dataset.variant === next).focus();
  });
  setVariant(new URLSearchParams(location.search).get('variant') === 'b' ? 'b' : 'a');

  // ---------------------------------------------------------------- boot
  renderAll();
  fetchPrices();
  setInterval(fetchPrices, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchPrices(); });
  addEventListener('resize', () => { renderSlider(); onScroll(); });
})();
