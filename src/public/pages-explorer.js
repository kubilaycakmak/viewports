// ─── Pages Explorer ───────────────────────────────────────────────────────────
// Discovers all pages of a frontend app via sitemap.xml, robots.txt, and HTML
// link crawling. Renders live iframe previews on an infinite 2D pan/zoom canvas
// — same system as the Viewport tab. Zero dependencies — pure vanilla JS/CSS.

// Fixed natural card width in canvas-space pixels. The device aspect ratio
// determines the height. Zoom handles visual scale.
const CANVAS_CARD_W = 320;
const CANVAS_GAP    = 32;
const CANVAS_PAD    = 48;
const FOOTER_H      = 36;  // must match .page-card-footer height in CSS

const PG_ZOOM_MIN = 0.05;
const PG_ZOOM_MAX = 2.0;

let _proxyPort = 0;
let _pages     = [];
let _device    = null;
let _colCount  = 3;
let _observer  = null;

// Canvas pan/zoom state
let _pgZoom = 0.5;
let _pgPanX = CANVAS_PAD;
let _pgPanY = CANVAS_PAD;

// ─── Canvas transform ─────────────────────────────────────────────────────────

function applyPagesTransform() {
  const inner = document.getElementById('pagesCanvasInner');
  const dot   = document.getElementById('pagesCanvasDot');
  if (!inner) return;

  inner.style.transform = `translate3d(${_pgPanX}px,${_pgPanY}px,0) scale(${_pgZoom})`;

  if (dot) {
    if (_pgZoom < 0.1) {
      dot.style.backgroundImage = 'none';
    } else {
      const s  = 128 * _pgZoom;
      const bx = ((_pgPanX % s) + s) % s;
      const by = ((_pgPanY % s) + s) % s;
      dot.style.backgroundImage   = 'radial-gradient(circle, var(--dot) 1.5px, transparent 1.5px)';
      dot.style.backgroundSize    = `${s}px ${s}px`;
      dot.style.backgroundPosition = `${bx}px ${by}px`;
    }
  }
}

// Fit all cards into the canvas viewport after a crawl or layout change.
function fitPagesView() {
  const canvasEl = document.getElementById('pagesCanvas');
  if (!canvasEl || !_pages.length || !_device) return;

  const scale  = CANVAS_CARD_W / _device.width;
  const cardH  = Math.round(_device.height * scale);
  const rowH   = cardH + FOOTER_H;
  const rows   = Math.ceil(_pages.length / _colCount);

  const totalW = _colCount * (CANVAS_CARD_W + CANVAS_GAP) - CANVAS_GAP + CANVAS_PAD * 2;
  const totalH = rows * (rowH + CANVAS_GAP) - CANVAS_GAP + CANVAS_PAD * 2;

  const cW   = canvasEl.clientWidth;
  const cH   = canvasEl.clientHeight;
  const MARG = 48;

  const fit  = Math.min((cW - MARG * 2) / totalW, (cH - MARG * 2) / totalH, 1.0);
  _pgZoom = Math.max(PG_ZOOM_MIN, fit);
  _pgPanX = (cW - totalW * _pgZoom) / 2;
  _pgPanY = MARG;

  applyPagesTransform();
}

// ─── Render cards ─────────────────────────────────────────────────────────────

function renderPages() {
  const inner   = document.getElementById('pagesCanvasInner');
  const emptyEl = document.getElementById('pagesEmpty');

  if (_observer) { _observer.disconnect(); _observer = null; }

  if (!_pages.length || !_device) {
    emptyEl.style.display = 'flex';
    if (inner) inner.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  inner.innerHTML = '';

  const scale = CANVAS_CARD_W / _device.width;
  const cardH = Math.round(_device.height * scale);
  const rowH  = cardH + FOOTER_H;

  const canvasEl = document.getElementById('pagesCanvas');
  _observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.dataset.lazySrc) {
          el.src = el.dataset.lazySrc;
          delete el.dataset.lazySrc;
          _observer.unobserve(el);
        }
      }
    }
  }, { root: canvasEl, rootMargin: '200px 0px' });

  _pages.forEach((page, i) => {
    const col = i % _colCount;
    const row = Math.floor(i / _colCount);
    const x   = CANVAS_PAD + col * (CANVAS_CARD_W + CANVAS_GAP);
    const y   = CANVAS_PAD + row * (rowH + CANVAS_GAP);

    const card = document.createElement('div');
    card.className = 'page-card';
    card.style.cssText = `position:absolute;left:${x}px;top:${y}px;`;

    const frameWrap = document.createElement('div');
    frameWrap.className = 'page-card-frame';
    frameWrap.style.cssText =
      `width:${CANVAS_CARD_W}px;height:${cardH}px;overflow:hidden;flex-shrink:0;contain:layout paint;`;

    const iframeSrc = _proxyPort
      ? `http://localhost:${_proxyPort}${page.path}`
      : page.url;

    const iframe = document.createElement('iframe');
    iframe.title           = page.path;
    iframe.dataset.lazySrc = iframeSrc;
    iframe.src             = 'about:blank';
    iframe.style.cssText   =
      `width:${_device.width}px;height:${_device.height}px;` +
      `transform:scale(${scale});transform-origin:top left;border:none;display:block;`;
    iframe.setAttribute('tabindex', '-1');

    frameWrap.appendChild(iframe);
    card.appendChild(frameWrap);

    const footer = document.createElement('div');
    footer.className = 'page-card-footer';
    footer.style.width = CANVAS_CARD_W + 'px';

    const link = document.createElement('a');
    link.className   = 'page-card-link';
    link.href        = page.url;
    link.target      = '_blank';
    link.rel         = 'noopener noreferrer';
    link.textContent = page.path === '/' ? '/ (home)' : page.path;
    footer.appendChild(link);

    const badge = document.createElement('span');
    badge.className   = `page-card-badge src-${page.source}`;
    badge.textContent = page.source;
    footer.appendChild(badge);

    card.appendChild(footer);
    inner.appendChild(card);
    _observer.observe(iframe);
  });
}

// ─── Pan/Zoom events ───────────────────────────────────────────────────────────

function initPagesCanvas() {
  const canvasEl = document.getElementById('pagesCanvas');
  if (!canvasEl) return;

  let panning     = false;
  let startMouseX = 0, startMouseY = 0, startPanX = 0, startPanY = 0;

  function beginPan(e) {
    panning     = true;
    startMouseX = e.clientX; startMouseY = e.clientY;
    startPanX   = _pgPanX;   startPanY   = _pgPanY;
    canvasEl.classList.add('is-panning');
  }

  canvasEl.addEventListener('mousedown', (e) => {
    if (e.button === 1) { e.preventDefault(); beginPan(e); return; }
    if (e.button !== 0) return;
    if (e.target.closest('.page-card')) return;  // let cards handle their own clicks
    beginPan(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (!panning) return;
    _pgPanX = startPanX + (e.clientX - startMouseX);
    _pgPanY = startPanY + (e.clientY - startMouseY);
    applyPagesTransform();
  });

  document.addEventListener('mouseup', () => {
    if (!panning) return;
    panning = false;
    canvasEl.classList.remove('is-panning');
  });

  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect   = canvasEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    // Cursor-anchored zoom — same math as the Viewport tab
    const natX = (mouseX - _pgPanX) / _pgZoom;
    const natY = (mouseY - _pgPanY) / _pgZoom;
    const newZoom = Math.max(PG_ZOOM_MIN, Math.min(PG_ZOOM_MAX,
      _pgZoom * Math.pow(1.001, -e.deltaY)
    ));
    if (Math.abs(newZoom - _pgZoom) < 0.00005) return;
    _pgZoom = newZoom;
    _pgPanX = mouseX - natX * newZoom;
    _pgPanY = mouseY - natY * newZoom;
    applyPagesTransform();
  }, { passive: false });

  canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ─── Init ──────────────────────────────────────────────────────────────────────

export function initPagesExplorer(proxyPort, deviceGroups) {
  _proxyPort = proxyPort || 0;

  const urlInput     = document.getElementById('pagesUrlInput');
  const deviceSelect = document.getElementById('pagesDeviceSelect');
  const crawlBtn     = document.getElementById('crawlBtn');
  const statusBar    = document.getElementById('pagesStatusBar');
  const mainInput    = document.getElementById('urlInput');
  const colSelect    = document.getElementById('pagesColSelect');

  initPagesCanvas();
  applyPagesTransform();

  // Build grouped device dropdown — same devices as the Viewport tab.
  let allDevices = [];
  for (const group of (deviceGroups || [])) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const d of group.devices) {
      const opt = document.createElement('option');
      opt.value       = d.id;
      opt.textContent = `${d.name} (${d.width}×${d.height})`;
      optgroup.appendChild(opt);
      allDevices.push(d);
    }
    deviceSelect.appendChild(optgroup);
  }
  _device = allDevices[0] || { id: 'fallback', name: 'Mobile', width: 390, height: 844 };

  deviceSelect.addEventListener('change', () => {
    const found = allDevices.find(d => d.id === deviceSelect.value);
    if (found) _device = found;
    if (_pages.length) { renderPages(); fitPagesView(); }
  });

  // Column count controls cards-per-row in the canvas grid layout.
  colSelect.addEventListener('click', (e) => {
    const btn = e.target.closest('.pages-col-btn');
    if (!btn) return;
    colSelect.querySelectorAll('.pages-col-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _colCount = parseInt(btn.dataset.cols, 10);
    if (_pages.length) { renderPages(); fitPagesView(); }
  });

  // Pre-fill from main URL input and keep in sync.
  if (mainInput?.value) urlInput.value = mainInput.value;
  mainInput?.addEventListener('change', () => {
    if (!urlInput.value) urlInput.value = mainInput.value;
  });

  async function crawl() {
    let url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

    crawlBtn.disabled    = true;
    crawlBtn.textContent = 'Crawling…';
    statusBar.style.display = 'none';

    const inner   = document.getElementById('pagesCanvasInner');
    const emptyEl = document.getElementById('pagesEmpty');
    emptyEl.style.display = 'flex';
    inner.innerHTML = '';
    emptyEl.querySelector('p').textContent = 'Discovering pages…';

    try {
      if (mainInput) mainInput.value = url;
      await fetch(`/api/set-target?url=${encodeURIComponent(url)}`);

      const res  = await fetch(`/api/crawl-pages?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      _pages = data.pages || [];

      statusBar.innerHTML = '';
      const countEl = document.createElement('span');
      countEl.className   = 'pages-stat';
      countEl.textContent = `${_pages.length} page${_pages.length !== 1 ? 's' : ''} found`;
      statusBar.appendChild(countEl);

      const sep = document.createElement('span');
      sep.className   = 'pages-stat-sep';
      sep.textContent = '·';
      statusBar.appendChild(sep);

      const srcEl = document.createElement('span');
      srcEl.className   = 'pages-stat-via';
      srcEl.textContent = `via ${data.source}`;
      statusBar.appendChild(srcEl);

      statusBar.style.display = 'flex';
      renderPages();
      fitPagesView();
    } catch (e) {
      emptyEl.style.display = 'flex';
      inner.innerHTML = '';
      emptyEl.querySelector('p').textContent = `Error: ${e.message}`;
    }

    crawlBtn.disabled    = false;
    crawlBtn.textContent = 'Crawl';
  }

  crawlBtn.addEventListener('click', crawl);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') crawl(); });
}

