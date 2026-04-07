// ─── Device Definitions ────────────────────────────────────────────────────

// Proxy port provided by the server (transparent port-forwarding proxy).
// When set, iframes point to http://localhost:<proxyPort>/ instead of
// the raw target URL, so X-Frame-Options / CORS / SPA routing all just work.
let _proxyPort = 0;

function iframeSrc(url) {
  if (!url) return '';
  if (_proxyPort) return `http://localhost:${_proxyPort}/`;
  // Fallback: no proxy port (shouldn't happen in normal use)
  return `about:blank`;
}

const DEVICE_GROUPS = [
  {
    label: 'Mobile',
    devices: [
      // ── iPhone 17 series (2025) ──
      { id: 'iphone-17',          name: 'iPhone 17',          width: 393,  height: 852,  type: 'mobile' },
      { id: 'iphone-17-air',      name: 'iPhone 17 Air',      width: 393,  height: 852,  type: 'mobile' },
      { id: 'iphone-17-pro',      name: 'iPhone 17 Pro',      width: 402,  height: 874,  type: 'mobile' },
      { id: 'iphone-17-pro-max',  name: 'iPhone 17 Pro Max',  width: 440,  height: 956,  type: 'mobile' },
      // ── Galaxy S26 series (2026) ──
      { id: 'galaxy-s26',         name: 'Galaxy S26',         width: 360,  height: 780,  type: 'mobile' },
      { id: 'galaxy-s26-plus',    name: 'Galaxy S26+',        width: 412,  height: 915,  type: 'mobile' },
      { id: 'galaxy-s26-ultra',   name: 'Galaxy S26 Ultra',   width: 412,  height: 932,  type: 'mobile' },
      // ── Pixel 10 series (2026) ──
      { id: 'pixel-10',           name: 'Pixel 10',           width: 393,  height: 851,  type: 'mobile' },
      { id: 'pixel-10-pro',       name: 'Pixel 10 Pro',       width: 412,  height: 892,  type: 'mobile' },
      // ── Legacy ──
      { id: 'iphone-se',          name: 'iPhone SE',          width: 375,  height: 667,  type: 'mobile' },
      { id: 'iphone-14',          name: 'iPhone 14',          width: 390,  height: 844,  type: 'mobile' },
    ],
  },
  {
    label: 'Tablet',
    devices: [
      { id: 'ipad-mini',       name: 'iPad Mini',       width: 768,  height: 1024, type: 'tablet' },
      { id: 'ipad-air-11',     name: 'iPad Air 11"',    width: 820,  height: 1180, type: 'tablet' },
      { id: 'ipad-pro-11',     name: 'iPad Pro 11"',    width: 834,  height: 1194, type: 'tablet' },
      { id: 'ipad-pro-13',     name: 'iPad Pro 13"',    width: 1024, height: 1366, type: 'tablet' },
      { id: 'galaxy-tab-s10',  name: 'Galaxy Tab S10',  width: 800,  height: 1280, type: 'tablet' },
    ],
  },
  {
    label: 'Laptop',
    devices: [
      { id: 'laptop-1280',  name: 'Laptop 1280',  width: 1280, height: 800,  type: 'laptop' },
      { id: 'macbook-13',   name: 'MacBook 13"',  width: 1280, height: 832,  type: 'laptop' },
      { id: 'macbook-14',   name: 'MacBook 14"',  width: 1512, height: 982,  type: 'laptop' },
      { id: 'macbook-16',   name: 'MacBook 16"',  width: 1728, height: 1117, type: 'laptop' },
    ],
  },
  {
    label: 'Desktop',
    devices: [
      { id: 'desktop-hd',  name: 'Desktop HD',   width: 1920, height: 1080, type: 'desktop' },
      { id: 'desktop-2k',  name: 'Desktop 2K',   width: 2560, height: 1440, type: 'desktop' },
      { id: 'desktop-4k',  name: 'Desktop 4K',   width: 3840, height: 2160, type: 'desktop' },
    ],
  },
];

const ALL_DEVICES = DEVICE_GROUPS.flatMap((g) => g.devices);

// ─── State ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'viewports_state_v3'; // v3: infinite canvas (pan + zoom)
const HEADER_HEIGHT = 40;
const ZOOM_LEVELS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.4, 0.5, 0.6, 0.67, 0.75, 1.0, 1.1, 1.25, 1.5, 2.0];
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 2.0;
const DEFAULT_ACTIVE = ['iphone-17', 'ipad-pro-11', 'laptop-1280', 'macbook-14', 'desktop-hd'];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return null;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      url: state.url,
      zoom: state.zoom,
      pan: state.pan,
      activeIds: state.activeIds,
      rotated: state.rotated,
      customDevices: state.customDevices,
      positions: state.positions,
      sessionId: state.sessionId,
      zIndices: state.zIndices,
      maxZ: state.maxZ,
    }));
  } catch (_) { /* ignore */ }
}

const persisted = loadState();

const state = {
  url: persisted?.url ?? '',
  zoom: persisted?.zoom ?? 0.5,
  pan: persisted?.pan ?? { x: 0, y: 0 },
  activeIds: persisted?.activeIds ?? [...DEFAULT_ACTIVE],
  rotated: persisted?.rotated ?? [],
  customDevices: persisted?.customDevices ?? [],
  positions: persisted?.positions ?? {},
  zIndices: persisted?.zIndices ?? {},
  maxZ: persisted?.maxZ ?? 10,
  sessionId: persisted?.sessionId ?? '',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function getAllDevices() {
  return [
    ...ALL_DEVICES,
    ...state.customDevices.map((d) => ({ ...d, type: d.type || 'custom' })),
  ];
}

function getActiveDevices() {
  return state.activeIds
    .map((id) => getAllDevices().find((d) => d.id === id))
    .filter(Boolean);
}

function isRotated(id) { return state.rotated.includes(id); }

function getEffectiveDims(device) {
  if (isRotated(device.id)) return { w: device.height, h: device.width };
  return { w: device.width, h: device.height };
}

// ─── Toast ─────────────────────────────────────────────────────────────────

let toastContainer;
function initToast() {
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
}

function showToast(message, type = 'info', duration = 2500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, duration);
}

// ─── Render: Device Bar ─────────────────────────────────────────────────────

function renderDeviceBar() {
  const container = document.getElementById('deviceBarInner');
  container.innerHTML = '';

  const allDevices = getAllDevices();

  // Group standard devices
  DEVICE_GROUPS.forEach((group) => {
    const label = document.createElement('span');
    label.className = 'device-group-label';
    label.textContent = group.label;
    container.appendChild(label);

    group.devices.forEach((d) => renderChip(container, d));
  });

  // Custom devices
  if (state.customDevices.length > 0) {
    const label = document.createElement('span');
    label.className = 'device-group-label';
    label.textContent = 'Custom';
    container.appendChild(label);
    state.customDevices.forEach((d) => renderChip(container, d, true));
  }
}

function renderChip(container, device, isCustom = false) {
  const active = state.activeIds.includes(device.id);
  const chip = document.createElement('button');
  chip.className = `device-chip${active ? ' active' : ''}`;
  chip.dataset.id = device.id;
  chip.title = `${device.width}×${device.height}`;

  const dot = document.createElement('span');
  dot.className = 'device-chip-dot';
  chip.appendChild(dot);

  chip.appendChild(document.createTextNode(device.name));

  if (isCustom) {
    const removeBtn = document.createElement('span');
    removeBtn.className = 'chip-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.style.cssText = 'margin-left:2px;opacity:0.5;font-size:13px;';
    removeBtn.title = 'Remove device';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCustomDevice(device.id);
    });
    chip.appendChild(removeBtn);
  }

  chip.addEventListener('click', () => toggleDevice(device.id));
  container.appendChild(chip);
}

// ─── Render: Canvas ─────────────────────────────────────────────────────────

function renderCanvas() {
  const canvasInner = document.getElementById('canvasInner');
  const emptyState  = document.getElementById('emptyState');
  const emptyDevicesHint = document.getElementById('emptyDevicesHint');
  const active = getActiveDevices();
  const hasUrl = state.url.trim().length > 0;

  if (!hasUrl || active.length === 0) {
    emptyState.style.display = 'flex';
    emptyDevicesHint.style.display = active.length === 0 && hasUrl ? 'block' : 'none';
    canvasInner.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';

  // Map of existing wrappers
  const existingMap = new Map();
  canvasInner.querySelectorAll('.viewport-wrapper[data-id]').forEach((el) => {
    existingMap.set(el.dataset.id, el);
  });

  // Remove deactivated cards immediately
  existingMap.forEach((el, id) => {
    if (!state.activeIds.includes(id)) el.remove();
  });

  // Add new cards
  active.forEach((device) => {
    if (!existingMap.has(device.id)) {
      ensurePosition(device);
      const wrapper = createViewportCard(device);
      canvasInner.appendChild(wrapper);
    }
  });

  // Update layout and position for all active cards
  active.forEach((device) => {
    const wrapper = canvasInner.querySelector(`.viewport-wrapper[data-id="${device.id}"]`);
    if (!wrapper) return;
    const pos = state.positions[device.id];
    updateCardLayout(wrapper, device);
    wrapper.style.left = `${pos.x}px`;
    wrapper.style.top  = `${pos.y}px`;
    wrapper.style.zIndex = state.zIndices[device.id] ?? 10;
  });

  scheduleFrame();
}

// ─── Position helpers ───────────────────────────────────────────────────────

const GRID = 8;
const PAD  = 24;
const GAP  = 20;

function snap(v) { return Math.round(v / GRID) * GRID; }

/** Ensure a device has a stored position; auto-place to the right of existing cards. */
function ensurePosition(device) {
  if (state.positions[device.id]) return state.positions[device.id];

  // Find rightmost edge of all existing positioned cards
  let curX = PAD;
  let curY = PAD;

  state.activeIds.forEach((id) => {
    if (id === device.id) return;
    const pos = state.positions[id];
    const d   = getAllDevices().find((x) => x.id === id);
    if (!pos || !d) return;
    const { w } = getEffectiveDims(d);
    const right = pos.x + w + GAP;
    if (right > curX) {
      curX = right;
      curY = pos.y;
    }
  });

  const pos = { x: snap(curX), y: snap(curY) };
  state.positions[device.id] = pos;
  return pos;
}

function bringToFront(id) {
  state.maxZ += 1;
  state.zIndices[id] = state.maxZ;
  const wrapper = document.querySelector(`.viewport-wrapper[data-id="${id}"]`);
  if (wrapper) wrapper.style.zIndex = state.maxZ;
}

// ─── View transform ─────────────────────────────────────────────────────────

let _rafPending = false;

function scheduleFrame() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(_renderFrame);
}

function _renderFrame() {
  _rafPending = false;
  const inner = document.getElementById('canvasInner');
  const grid  = document.getElementById('canvasDotGrid');
  if (!inner) return;
  const { pan, zoom } = state;

  inner.style.transform = `translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`;

  if (grid) {
    if (zoom < 0.1) {
      grid.style.opacity = '0';
    } else {
      grid.style.opacity = '1';
      const s  = 128 * zoom;
      const bx = ((pan.x % s) + s) % s;
      const by = ((pan.y % s) + s) % s;
      grid.style.backgroundSize     = `${s}px ${s}px`;
      grid.style.backgroundPosition = `${bx}px ${by}px`;
    }
  }
}

function createViewportCard(device) {
  const { w, h } = getEffectiveDims(device);

  const wrapper = document.createElement('div');
  wrapper.className = 'viewport-wrapper';
  wrapper.dataset.id = device.id;

  const scaler = document.createElement('div');
  scaler.className = 'viewport-scaler';

  const card = document.createElement('div');
  card.className = 'viewport-card';

  // Header
  const header = document.createElement('div');
  header.className = 'viewport-header';

  // Drag handle
  const dragHandle = document.createElement('button');
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'Drag to reorder';
  dragHandle.innerHTML = ICONS.grip;
  dragHandle.setAttribute('aria-label', 'Drag to reorder');

  const title = document.createElement('div');
  title.className = 'viewport-title';

  const badge = document.createElement('span');
  badge.className = `viewport-type-badge badge-${device.type}`;
  badge.textContent = device.type;

  const nameEl = document.createElement('span');
  nameEl.className = 'viewport-name';
  nameEl.textContent = device.name;

  const dimsEl = document.createElement('span');
  dimsEl.className = 'viewport-dims';
  dimsEl.textContent = `${w}×${h}`;

  title.append(badge, nameEl, dimsEl);

  const controls = document.createElement('div');
  controls.className = 'viewport-controls';

  // Rotate button
  const rotateBtn = makeIconBtn(ICONS.rotate, 'Rotate', () => rotateDevice(device.id));
  // Reload button
  const reloadBtn = makeIconBtn(ICONS.reload, 'Reload', () => reloadViewport(device.id));
  // Remove button
  const removeBtn = makeIconBtn(ICONS.close, 'Remove', () => toggleDevice(device.id));

  controls.append(rotateBtn, reloadBtn, removeBtn);
  header.append(dragHandle, title, controls);

  // iframe wrapper
  const iframeWrap = document.createElement('div');
  iframeWrap.className = 'viewport-iframe-wrap';
  iframeWrap.style.width = `${w}px`;
  iframeWrap.style.height = `${h}px`;

  // Loading overlay
  const loading = document.createElement('div');
  loading.className = 'viewport-loading';
  loading.innerHTML = `<div class="spinner"></div><span>Loading…</span>`;

  // Error overlay
  const error = document.createElement('div');
  error.className = 'viewport-error';
  error.innerHTML = `
    <div class="viewport-error-icon">⚠</div>
    <h4>Could not load</h4>
    <p>The page refused to be embedded. This usually means the server sends an
    <code>X-Frame-Options</code> header. Try disabling it in your dev server config.</p>
  `;

  // iframe
  const iframe = document.createElement('iframe');
  iframe.width = w;
  iframe.height = h;
  iframe.title = device.name;
  iframe.setAttribute('loading', 'lazy');
  iframe.addEventListener('load', () => {
    loading.classList.add('hidden');
    // Detect X-Frame-Options block heuristically: blank iframe with no access
    try {
      const doc = iframe.contentDocument;
      if (!doc || doc.URL === 'about:blank') {
        // still loading or will resolve
      }
    } catch (_) {
      loading.classList.add('hidden');
      error.classList.add('visible');
    }
  });

  iframe.src = iframeSrc(state.url);
  iframeWrap.append(loading, error, iframe);
  card.append(header, iframeWrap);
  scaler.appendChild(card);
  wrapper.appendChild(scaler);

  // Bring card to front on any interaction
  wrapper.addEventListener('mousedown', () => bringToFront(device.id), true);

  // Attach drag behaviour after element is built
  initDrag(wrapper, device.id);

  return wrapper;
}

function updateCardLayout(wrapper, device) {
  const { w, h } = getEffectiveDims(device);

  const scaler     = wrapper.querySelector('.viewport-scaler');
  const iframeWrap = wrapper.querySelector('.viewport-iframe-wrap');
  const iframe     = wrapper.querySelector('iframe');
  const dimsEl     = wrapper.querySelector('.viewport-dims');

  if (dimsEl) dimsEl.textContent = `${w}×${h}`;

  iframeWrap.style.width  = `${w}px`;
  iframeWrap.style.height = `${h}px`;
  iframe.width  = w;
  iframe.height = h;
  iframe.style.width  = `${w}px`;
  iframe.style.height = `${h}px`;

  // No per-card zoom — canvas itself is scaled via CSS transform
  scaler.style.transform = '';
  wrapper.style.width  = `${w}px`;
  wrapper.style.height = `${h + HEADER_HEIGHT}px`;
}

// ─── Actions ───────────────────────────────────────────────────────────────

function setUrl(url) {
  state.url = url.trim();
  saveState();

  // Tell the server's transparent proxy to switch target
  if (state.url) {
    fetch(`/api/set-target?url=${encodeURIComponent(state.url)}`).catch(() => {});
  }

  // Update src on ALL existing iframes — renderCanvas reuses DOM nodes
  document.querySelectorAll('#canvasInner iframe').forEach((iframe) => {
    const wrap = iframe.closest('.viewport-iframe-wrap');
    wrap?.querySelector('.viewport-loading')?.classList.remove('hidden');
    wrap?.querySelector('.viewport-error')?.classList.remove('visible');
    iframe.src = iframeSrc(state.url);
  });

  renderCanvas(); // handles newly activated devices (no existing iframe yet)
}

function loadUrl() {
  const input = document.getElementById('urlInput');
  let url = input.value.trim();
  if (!url) return;
  // Auto-prefix protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
    input.value = url;
  }
  setUrl(url);
  // Probe reachability and warn if not reachable
  fetch(`/api/probe?url=${encodeURIComponent(url)}`)
    .then((r) => r.json())
    .then(({ ok }) => {
      if (!ok) showToast(`⚠ Cannot reach ${url} — is the dev server running?`, 'error');
    })
    .catch(() => {});
}

function toggleDevice(id) {
  const idx = state.activeIds.indexOf(id);
  if (idx >= 0) {
    state.activeIds.splice(idx, 1);
  } else {
    state.activeIds.push(id);
  }
  saveState();
  renderDeviceBar();
  renderCanvas();
}

function rotateDevice(id) {
  const idx = state.rotated.indexOf(id);
  if (idx >= 0) {
    state.rotated.splice(idx, 1);
  } else {
    state.rotated.push(id);
  }
  saveState();
  const wrapper = document.querySelector(`.viewport-wrapper[data-id="${id}"]`);
  if (wrapper) {
    const device = getAllDevices().find((d) => d.id === id);
    if (device) updateCardLayout(wrapper, device);
  }
}

function reloadViewport(id) {
  const wrapper = document.querySelector(`.viewport-wrapper[data-id="${id}"]`);
  if (!wrapper) return;
  const iframe = wrapper.querySelector('iframe');
  const loading = wrapper.querySelector('.viewport-loading');
  const error = wrapper.querySelector('.viewport-error');
  if (iframe) {
    loading.classList.remove('hidden');
    error.classList.remove('visible');
    iframe.src = iframe.src;
  }
}

function reloadAll() {
  document.querySelectorAll('.viewport-wrapper').forEach((wrapper) => {
    const id = wrapper.dataset.id;
    if (id) reloadViewport(id);
  });
  showToast('All viewports reloaded', 'success');
}

function setZoom(zoom) {
  const canvas  = document.getElementById('canvas');
  const centerX = canvas ? canvas.clientWidth  / 2 : 400;
  const centerY = canvas ? canvas.clientHeight / 2 : 300;
  zoomAt(centerX, centerY, zoom);
}

// Zoom toward a specific screen-space point (used by wheel + toolbar buttons)
function zoomAt(screenX, screenY, newZoom) {
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  // Canvas-space point under cursor must stay fixed
  const canvasX = (screenX - state.pan.x) / state.zoom;
  const canvasY = (screenY - state.pan.y) / state.zoom;
  state.zoom  = newZoom;
  state.pan.x = screenX - canvasX * newZoom;
  state.pan.y = screenY - canvasY * newZoom;
  document.getElementById('zoomLabel').textContent = `${Math.round(newZoom * 100)}%`;
  scheduleFrame();
}

function fitToScreen() {
  const active = getActiveDevices();
  if (!active.length) return;

  const canvas  = document.getElementById('canvas');
  const canvasW = canvas.clientWidth;
  const canvasH = canvas.clientHeight;

  // Arrange cards in a row (natural coords)
  let curX = 0;
  active.forEach((device) => {
    const { w } = getEffectiveDims(device);
    state.positions[device.id] = { x: snap(curX), y: 0 };
    curX += w + GAP;
  });

  // Bounding box of arranged cards
  const totalNatW = curX - GAP;
  const maxNatH   = Math.max(...active.map((d) => getEffectiveDims(d).h + HEADER_HEIGHT));

  // Fit zoom
  const fit     = Math.min((canvasW - PAD * 2) / totalNatW, (canvasH - PAD * 2) / maxNatH, ZOOM_MAX);
  const snapped = ZOOM_LEVELS.reduce((a, b) =>
    Math.abs(b - fit) < Math.abs(a - fit) ? b : a
  );
  state.zoom = snapped;

  // Center content in canvas viewport
  state.pan = {
    x: (canvasW - totalNatW * snapped) / 2,
    y: (canvasH - maxNatH   * snapped) / 2,
  };

  document.getElementById('zoomLabel').textContent = `${Math.round(snapped * 100)}%`;

  // Animate cards to new positions
  const EASE = 'cubic-bezier(.22,1,.36,1)';
  const DUR  = '420ms';
  active.forEach((device) => {
    const wrapper = document.querySelector(`.viewport-wrapper[data-id="${device.id}"]`);
    if (!wrapper) return;
    wrapper.style.transition = `left ${DUR} ${EASE}, top ${DUR} ${EASE}`;
    const pos = state.positions[device.id];
    updateCardLayout(wrapper, device);
    wrapper.style.left = `${pos.x}px`;
    wrapper.style.top  = `${pos.y}px`;
  });

  scheduleFrame();

  setTimeout(() => {
    document.querySelectorAll('.viewport-wrapper').forEach((w) => { w.style.transition = ''; });
  }, 480);

  saveState();
  showToast(`Arranged ${active.length} devices · ${Math.round(snapped * 100)}%`);
}

function zoomStep(dir) {
  const idx  = ZOOM_LEVELS.findIndex((z) => z >= state.zoom - 0.001);
  const base = idx === -1 ? ZOOM_LEVELS.length - 1 : idx;
  const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, base + dir));
  setZoom(ZOOM_LEVELS[next]);
  saveState();
}

function addCustomDevice({ name, width, height, type }) {
  const id = `custom-${Date.now()}`;
  const device = { id, name, width: +width, height: +height, type };
  state.customDevices.push(device);
  state.activeIds.push(id);
  saveState();
  renderDeviceBar();
  renderCanvas();
  showToast(`Added "${name}"`, 'success');
}

function removeCustomDevice(id) {
  state.customDevices = state.customDevices.filter((d) => d.id !== id);
  state.activeIds = state.activeIds.filter((x) => x !== id);
  state.rotated = state.rotated.filter((x) => x !== id);
  saveState();
  renderDeviceBar();
  renderCanvas();
}

// ─── SVG Icons ──────────────────────────────────────────────────────────────

const ICONS = {
  rotate: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 8a5.5 5.5 0 1 0 1-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 2v3h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  reload: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 2v3h-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close:  `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  grip:   `<svg viewBox="0 0 12 12" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="3.5" cy="2.5" r="1"/><circle cx="8.5" cy="2.5" r="1"/><circle cx="3.5" cy="6" r="1"/><circle cx="8.5" cy="6" r="1"/><circle cx="3.5" cy="9.5" r="1"/><circle cx="8.5" cy="9.5" r="1"/></svg>`,
};

function makeIconBtn(iconSvg, title, onClick) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.title = title;
  btn.innerHTML = iconSvg;
  btn.addEventListener('click', onClick);
  return btn;
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('customName').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('customName').value = '';
  document.getElementById('customWidth').value = '';
  document.getElementById('customHeight').value = '';
}

function submitModal() {
  const name   = document.getElementById('customName').value.trim();
  const width  = parseInt(document.getElementById('customWidth').value, 10);
  const height = parseInt(document.getElementById('customHeight').value, 10);
  const type   = document.querySelector('.type-btn.active')?.dataset.type ?? 'custom';

  if (!name)               return showToast('Please enter a device name', 'error');
  if (!width || width < 1) return showToast('Please enter a valid width', 'error');
  if (!height || height < 1) return showToast('Please enter a valid height', 'error');

  addCustomDevice({ name, width, height, type });
  closeModal();
}

// ─── Drag (2D free positioning) ────────────────────────────────────────────

let drag = null;

function initDrag(wrapper, deviceId) {
  const handle = wrapper.querySelector('.drag-handle');
  if (!handle) return;

  // Whole header is the drag surface (not just the grip icon)
  const dragSurface = wrapper.querySelector('.viewport-header') || handle;

  function startCardDrag(e) {
    if (e.button !== 0) return;
    if (e.target.closest('button') && e.target.closest('button') !== handle) return;
    e.preventDefault();
    e.stopPropagation();

    bringToFront(deviceId);

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPos    = { ...state.positions[deviceId] };

    drag = deviceId;
    wrapper.style.transition = 'none';
    wrapper.classList.add('is-dragging');

    document.querySelectorAll('.viewport-iframe-wrap').forEach((wrap) => {
      const ov = document.createElement('div');
      ov.className = 'iframe-drag-overlay';
      wrap.appendChild(ov);
    });

    let tx = 0, ty = 0;

    function onMove(e) {
      const zoom = state.zoom;
      // Delta in natural (canvas) coords — compositor-only transform, zero layout
      tx = (e.clientX - startMouseX) / zoom;
      ty = (e.clientY - startMouseY) / zoom;
      wrapper.style.transform = `translate(${tx}px,${ty}px)`;
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);

      // Commit to left/top, clear transform
      const finalX = snap(startPos.x + tx);
      const finalY = snap(startPos.y + ty);
      state.positions[deviceId] = { x: finalX, y: finalY };
      wrapper.style.transform  = '';
      wrapper.style.transition = '';
      wrapper.style.left = `${finalX}px`;
      wrapper.style.top  = `${finalY}px`;

      document.querySelectorAll('.iframe-drag-overlay').forEach((o) => o.remove());
      wrapper.classList.remove('is-dragging');

      saveState();
      drag = null;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  }

  dragSurface.addEventListener('mousedown', startCardDrag);
}

// ─── Screenshot ─────────────────────────────────────────────────────────────

async function takeScreenshot() {
  const canvasEl = document.getElementById('canvas');
  const rect     = canvasEl.getBoundingClientRect();
  const dpr      = window.devicePixelRatio || 1;
  const RADIUS   = 16; // rounded corner radius

  let stream;
  try {
    // preferCurrentTab keeps it to this tab, no browser chrome
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        cursor: 'never',
        width:  { ideal: Math.round(window.innerWidth  * dpr) },
        height: { ideal: Math.round(window.innerHeight * dpr) },
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    });
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Screenshot cancelled', 'error');
    return;
  }

  // Give the browser a moment to hide share-bar chrome
  await new Promise((r) => setTimeout(r, 300));

  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();

  // Actual pixel coords of #canvas in the captured frame
  const scaleX  = video.videoWidth  / window.innerWidth;
  const scaleY  = video.videoHeight / window.innerHeight;
  const cropX   = Math.round(rect.left   * scaleX);
  const cropY   = Math.round(rect.top    * scaleY);
  const cropW   = Math.round(rect.width  * scaleX);
  const cropH   = Math.round(rect.height * scaleY);
  const r       = RADIUS * Math.max(scaleX, scaleY);

  const out = document.createElement('canvas');
  out.width  = cropW;
  out.height = cropH;
  const ctx = out.getContext('2d');

  // Rounded-corner clip
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(cropW - r, 0);
  ctx.quadraticCurveTo(cropW, 0, cropW, r);
  ctx.lineTo(cropW, cropH - r);
  ctx.quadraticCurveTo(cropW, cropH, cropW - r, cropH);
  ctx.lineTo(r, cropH);
  ctx.quadraticCurveTo(0, cropH, 0, cropH - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.clip();

  // Draw only the canvas area
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  stream.getTracks().forEach((t) => t.stop());
  video.remove();

  // Flash effect
  const flash = document.createElement('div');
  flash.className = 'screenshot-flash';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove(), { once: true });

  out.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `viewports-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Screenshot saved!', 'success');
  }, 'image/png');
}

// ─── Boot ───────────────────────────────────────────────────────────────────

async function init() {
  initToast();

  // Fetch config from server (URL + sessionId for layout reset detection)
  let newSession = false;
  try {
    const res = await fetch('/api/config');
    const { targetUrl, fromCli, sessionId, proxyPort } = await res.json();
    if (proxyPort) _proxyPort = proxyPort;
    if (targetUrl && (fromCli || !state.url)) {
      state.url = targetUrl;
      // Probe if CLI target is reachable
      if (fromCli) {
        fetch(`/api/probe?url=${encodeURIComponent(targetUrl)}`)
          .then((r) => r.json())
          .then(({ ok }) => {
            if (!ok) showToast(`⚠ Cannot reach ${targetUrl} — is the dev server running?`, 'error');
          })
          .catch(() => {});
      }
    }
    // Different sessionId = server was restarted → reset layout + restore devices if empty
    if (sessionId && sessionId !== state.sessionId) {
      state.positions = {};
      state.zIndices  = {};
      state.maxZ      = 10;
      state.sessionId = sessionId;
      // If all devices were removed in a previous session, restore defaults
      if (state.activeIds.length === 0) {
        state.activeIds = [...DEFAULT_ACTIVE];
      }
      newSession = true;
    }
  } catch (_) { /* offline / dev */ }

  // Populate URL input
  const urlInput = document.getElementById('urlInput');
  if (state.url) urlInput.value = state.url;
  document.getElementById('zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;

  renderDeviceBar();
  renderCanvas();

  // Auto-arrange if new session, no positions, or degenerate positions
  const savedPositions = Object.values(state.positions);
  const uniqueCoords   = new Set(savedPositions.map((p) => `${p.x},${p.y}`)).size;
  const needsArrange   = newSession || savedPositions.length === 0 || uniqueCoords < savedPositions.length;
  if (needsArrange) setTimeout(() => fitToScreen(), 80);

  // ─── Event listeners ─────────────────────────────────────────

  // URL form
  document.getElementById('loadBtn').addEventListener('click', loadUrl);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUrl(); });
  document.getElementById('urlClear').addEventListener('click', () => {
    urlInput.value = '';
    state.url = '';
    saveState();
    renderCanvas();
    urlInput.focus();
  });

  // Zoom
  document.getElementById('zoomIn').addEventListener('click', () => zoomStep(+1));
  document.getElementById('zoomOut').addEventListener('click', () => zoomStep(-1));
  document.getElementById('fitBtn').addEventListener('click', fitToScreen);
  document.getElementById('resetLayoutBtn').addEventListener('click', () => {
    state.positions = {};
    state.zIndices  = {};
    state.maxZ      = 10;
    saveState();
    fitToScreen();
  });

  // ── Canvas pan: left-click on empty area OR middle-click anywhere ─────────
  {
    const canvasEl = document.getElementById('canvas');
    let panning = false;
    let startMouseX = 0, startMouseY = 0, startPanX = 0, startPanY = 0;

    function startPan(e) {
      panning     = true;
      startMouseX = e.clientX;  startMouseY = e.clientY;
      startPanX   = state.pan.x; startPanY  = state.pan.y;
      canvasEl.classList.add('is-panning');
      e.preventDefault();
    }

    function onPanMove(e) {
      if (!panning) return;
      state.pan.x = startPanX + (e.clientX - startMouseX);
      state.pan.y = startPanY + (e.clientY - startMouseY);
      scheduleFrame();
    }

    function endPan(btn) {
      if (!panning) return;
      if (btn !== undefined && btn !== 0 && btn !== 1) return;
      panning = false;
      canvasEl.classList.remove('is-panning');
      saveState();
    }

    // Left-click on background
    canvasEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.viewport-wrapper')) return;
      startPan(e);
    });

    // Middle-click anywhere
    canvasEl.addEventListener('mousedown', (e) => {
      if (e.button !== 1) return;
      startPan(e);
    });

    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup',   (e) => endPan(e.button));
    canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Scroll → zoom toward cursor ──────────────────────────────────────────
  {
    const canvas    = document.getElementById('canvas');
    const zoomLabel = document.getElementById('zoomLabel');
    let saveTimer   = null;

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect   = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const natX = (mouseX - state.pan.x) / state.zoom;
      const natY = (mouseY - state.pan.y) / state.zoom;

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= 400;

      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom * Math.pow(1.001, -dy)));
      if (Math.abs(newZoom - state.zoom) < 0.00005) return;

      state.zoom  = newZoom;
      state.pan.x = mouseX - natX * newZoom;
      state.pan.y = mouseY - natY * newZoom;

      zoomLabel.textContent = `${Math.round(newZoom * 100)}%`;
      scheduleFrame();

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveState(), 200);
    }, { passive: false });
  }

  // Reload all
  document.getElementById('reloadBtn').addEventListener('click', reloadAll);

  // Add device modal
  document.getElementById('addDeviceBtn').addEventListener('click', openModal);

  // Screenshot
  document.getElementById('screenshotBtn').addEventListener('click', takeScreenshot);

  // Device bar: vertical wheel → horizontal scroll
  {
    const bar = document.getElementById('deviceBar');
    bar.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // already horizontal
      e.preventDefault();
      bar.scrollLeft += e.deltaY * 0.8;
    }, { passive: false });
  }

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalAdd').addEventListener('click', submitModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    // Cmd/Ctrl+R reloads all
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
      e.preventDefault();
      reloadAll();
    }
  });

  // Type selector in modal
  document.getElementById('customType').addEventListener('click', (e) => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

init();
