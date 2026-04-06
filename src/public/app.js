// ─── Device Definitions ────────────────────────────────────────────────────

// Route iframe through local proxy to strip X-Frame-Options / CSP headers
function iframeSrc(url) {
  if (!url) return '';
  return `/dev-proxy?url=${encodeURIComponent(url)}`;
}

const DEVICE_GROUPS = [
  {
    label: 'Mobile',
    devices: [
      { id: 'iphone-se',         name: 'iPhone SE',         width: 375,  height: 667,  type: 'mobile' },
      { id: 'iphone-14',         name: 'iPhone 14',         width: 390,  height: 844,  type: 'mobile' },
      { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', width: 430,  height: 932,  type: 'mobile' },
    ],
  },
  {
    label: 'Tablet',
    devices: [
      { id: 'ipad-mini',   name: 'iPad Mini',     width: 768,  height: 1024, type: 'tablet' },
      { id: 'ipad-pro-11', name: 'iPad Pro 11"',  width: 834,  height: 1194, type: 'tablet' },
      { id: 'ipad-pro-13', name: 'iPad Pro 13"',  width: 1024, height: 1366, type: 'tablet' },
    ],
  },
  {
    label: 'Laptop',
    devices: [
      { id: 'laptop-1280',  name: 'Laptop 1280',   width: 1280, height: 800,  type: 'laptop' },
      { id: 'macbook-13',   name: 'MacBook 13"',   width: 1280, height: 832,  type: 'laptop' },
      { id: 'macbook-14',   name: 'MacBook 14"',   width: 1512, height: 982,  type: 'laptop' },
      { id: 'macbook-16',   name: 'MacBook 16"',   width: 1728, height: 1117, type: 'laptop' },
    ],
  },
  {
    label: 'Desktop',
    devices: [
      { id: 'desktop-hd',  name: 'Desktop HD',    width: 1920, height: 1080, type: 'desktop' },
      { id: 'desktop-2k',  name: 'Desktop 2K',    width: 2560, height: 1440, type: 'desktop' },
    ],
  },
];

const ALL_DEVICES = DEVICE_GROUPS.flatMap((g) => g.devices);

// ─── State ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'viewports_state_v1';
const HEADER_HEIGHT = 40; // px — viewport card header
const ZOOM_LEVELS = [0.2, 0.25, 0.33, 0.4, 0.5, 0.6, 0.67, 0.75, 1.0];
const DEFAULT_ACTIVE = ['iphone-14', 'ipad-mini', 'laptop-1280', 'macbook-14', 'desktop-hd'];

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

  // Remove deactivated cards
  existingMap.forEach((el, id) => {
    if (!state.activeIds.includes(id)) {
      el.style.animation = 'card-enter 220ms cubic-bezier(.22,1,.36,1) reverse forwards';
      setTimeout(() => el.remove(), 200);
    }
  });

  // Add new cards with entrance animation
  active.forEach((device) => {
    if (!existingMap.has(device.id)) {
      ensurePosition(device);
      const wrapper = createViewportCard(device);
      wrapper.classList.add('entering');
      canvasInner.appendChild(wrapper);
      // Remove entering class after animation
      wrapper.addEventListener('animationend', () => wrapper.classList.remove('entering'), { once: true });
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

  updateCanvasSize();
}

// ─── Position helpers ───────────────────────────────────────────────────────

const GRID = 8;
const PAD  = 24;
const GAP  = 20;

function snap(v) { return Math.round(v / GRID) * GRID; }

/** Ensure a device has a stored position; auto-place to the right of existing cards. */
function ensurePosition(device) {
  if (state.positions[device.id]) return state.positions[device.id];

  // Find rightmost edge of existing cards to place next to them
  let curX = PAD;
  let curY = PAD;
  const CANVAS_MAX_W = 1800; // wrap to next row beyond this

  state.activeIds.forEach((id) => {
    if (id === device.id) return;
    const pos = state.positions[id];
    const d   = getAllDevices().find((x) => x.id === id);
    if (!pos || !d) return;
    const { w } = getEffectiveDims(d);
    const right = pos.x + Math.round(w * state.zoom) + GAP;
    if (right < CANVAS_MAX_W) {
      curX = Math.max(curX, right);
      curY = Math.min(curY, pos.y);
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

function updateCanvasSize() {
  const canvasInner = document.getElementById('canvasInner');
  if (!canvasInner) return;

  let maxRight  = 400;
  let maxBottom = 300;

  state.activeIds.forEach((id) => {
    const pos    = state.positions[id];
    const device = getAllDevices().find((d) => d.id === id);
    if (!pos || !device) return;
    const { w, h } = getEffectiveDims(device);
    maxRight  = Math.max(maxRight,  pos.x + Math.round(w * state.zoom));
    maxBottom = Math.max(maxBottom, pos.y + Math.round((h + HEADER_HEIGHT) * state.zoom));
  });

  canvasInner.style.width  = `${maxRight  + 80}px`;
  canvasInner.style.height = `${maxBottom + 80}px`;
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
  const zoom = state.zoom;

  const scaler    = wrapper.querySelector('.viewport-scaler');
  const iframeWrap = wrapper.querySelector('.viewport-iframe-wrap');
  const iframe    = wrapper.querySelector('iframe');
  const dimsEl    = wrapper.querySelector('.viewport-dims');

  if (dimsEl) dimsEl.textContent = `${w}×${h}`;

  iframeWrap.style.width  = `${w}px`;
  iframeWrap.style.height = `${h}px`;
  iframe.width  = w;
  iframe.height = h;
  iframe.style.width  = `${w}px`;
  iframe.style.height = `${h}px`;

  scaler.style.transform = `scale(${zoom})`;

  // Outer wrapper occupies the scaled footprint
  wrapper.style.width  = `${Math.round(w * zoom)}px`;
  wrapper.style.height = `${Math.round((h + HEADER_HEIGHT) * zoom)}px`;
}

// ─── Actions ───────────────────────────────────────────────────────────────

function setUrl(url) {
  state.url = url.trim();
  saveState();

  // Update src on ALL existing iframes — renderCanvas reuses DOM nodes
  // so without this, old iframes keep showing the previous URL.
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
  state.zoom = Math.max(0.2, Math.min(1.0, zoom));
  document.getElementById('zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
  saveState();
  getActiveDevices().forEach((device) => {
    const wrapper = document.querySelector(`.viewport-wrapper[data-id="${device.id}"]`);
    if (wrapper) updateCardLayout(wrapper, device);
  });
  updateCanvasSize();
}

function fitToScreen() {
  const active = getActiveDevices();
  if (!active.length) return;

  const canvas  = document.getElementById('canvas');
  const canvasW = canvas.clientWidth;
  const canvasH = canvas.clientHeight;

  // Calculate zoom to fit all devices in one row
  const totalNatW = active.reduce((s, d) => s + getEffectiveDims(d).w, 0)
    + GAP * (active.length - 1);
  const maxNatH = Math.max(...active.map((d) => getEffectiveDims(d).h + HEADER_HEIGHT));

  const scaleW = (canvasW - PAD * 2) / totalNatW;
  const scaleH = (canvasH - PAD * 2) / maxNatH;
  const fit    = Math.min(scaleW, scaleH, 1.0);
  const snapped = ZOOM_LEVELS.reduce((a, b) =>
    Math.abs(b - fit) < Math.abs(a - fit) ? b : a
  );

  state.zoom = snapped;
  document.getElementById('zoomLabel').textContent = `${Math.round(snapped * 100)}%`;

  // Compute new positions (single row)
  let curX = PAD;
  const newPositions = {};
  active.forEach((device) => {
    newPositions[device.id] = { x: snap(curX), y: PAD };
    curX += Math.round(getEffectiveDims(device).w * snapped) + GAP;
  });

  // Animate cards to their new positions
  const EASE = 'cubic-bezier(.22,1,.36,1)';
  const DURATION = '420ms';

  active.forEach((device) => {
    const wrapper = document.querySelector(`.viewport-wrapper[data-id="${device.id}"]`);
    if (!wrapper) return;

    // Set transition for this move
    wrapper.style.transition = `left ${DURATION} ${EASE}, top ${DURATION} ${EASE}`;

    const pos = newPositions[device.id];
    state.positions[device.id] = pos;
    updateCardLayout(wrapper, device);
    wrapper.style.left = `${pos.x}px`;
    wrapper.style.top  = `${pos.y}px`;
  });

  // Clean up transitions after animation
  setTimeout(() => {
    document.querySelectorAll('.viewport-wrapper').forEach((w) => {
      w.style.transition = '';
    });
    updateCanvasSize();
  }, 480);

  saveState();
  showToast(`Arranged ${active.length} devices · ${Math.round(snapped * 100)}%`);
}

function zoomStep(dir) {
  const idx = ZOOM_LEVELS.findIndex((z) => z >= state.zoom);
  const base = idx === -1 ? ZOOM_LEVELS.length - 1 : idx;
  const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, base + dir));
  setZoom(ZOOM_LEVELS[next]);
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

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    bringToFront(deviceId);

    const canvasEl   = document.getElementById('canvas');
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPos    = { ...state.positions[deviceId] };

    drag = deviceId;
    wrapper.classList.add('is-dragging');

    // Block pointer events on all iframes so mouse stays captured
    document.querySelectorAll('.viewport-iframe-wrap').forEach((wrap) => {
      const ov = document.createElement('div');
      ov.className = 'iframe-drag-overlay';
      wrap.appendChild(ov);
    });

    function onMove(e) {
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const x  = Math.max(0, startPos.x + dx);
      const y  = Math.max(0, startPos.y + dy);

      state.positions[deviceId] = { x, y };
      wrapper.style.left = `${x}px`;
      wrapper.style.top  = `${y}px`;
      updateCanvasSize();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);

      // Snap to grid
      const pos = state.positions[deviceId];
      pos.x = snap(Math.max(0, pos.x));
      pos.y = snap(Math.max(0, pos.y));
      wrapper.style.left = `${pos.x}px`;
      wrapper.style.top  = `${pos.y}px`;

      // Remove overlays
      document.querySelectorAll('.iframe-drag-overlay').forEach((o) => o.remove());

      // Swap dragging → settle animation
      wrapper.classList.remove('is-dragging');
      wrapper.classList.add('just-dropped');
      wrapper.addEventListener('animationend', () => {
        wrapper.classList.remove('just-dropped');
      }, { once: true });

      saveState();
      updateCanvasSize();
      drag = null;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
}

// ─── Screenshot ─────────────────────────────────────────────────────────────

async function takeScreenshot() {
  showToast('Select this browser tab or window to capture…');

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'never', displaySurface: 'browser' },
      audio: false,
    });
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Screenshot cancelled', 'error');
    return;
  }

  // Wait one frame so the share-screen chrome disappears
  await new Promise((r) => setTimeout(r, 200));

  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();

  const cvs = document.createElement('canvas');
  cvs.width = video.videoWidth;
  cvs.height = video.videoHeight;
  cvs.getContext('2d').drawImage(video, 0, 0);
  stream.getTracks().forEach((t) => t.stop());
  video.remove();

  // Flash effect
  const flash = document.createElement('div');
  flash.className = 'screenshot-flash';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove(), { once: true });

  // Download
  cvs.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
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
    const { targetUrl, fromCli, sessionId } = await res.json();
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

  // Scroll-to-zoom on canvas
  document.getElementById('canvas').addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomStep(e.deltaY < 0 ? 1 : -1);
    }
  }, { passive: false });

  // Reload all
  document.getElementById('reloadBtn').addEventListener('click', reloadAll);

  // Add device modal
  document.getElementById('addDeviceBtn').addEventListener('click', openModal);

  // Screenshot
  document.getElementById('screenshotBtn').addEventListener('click', takeScreenshot);
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
