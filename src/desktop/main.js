import { app, BrowserWindow, dialog, ipcMain, Menu, screen, View, WebContentsView } from 'electron';
import { createInterface } from 'node:readline';
import { createConnection } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ALL_DEVICES, DEVICE_GROUPS } from '../public/devices.js';
import { createPreviewRequest, STARTUP_MESSAGE } from './request.js';
import { DEFAULT_AREAS, mobileUserAgent, presentationFor, TEXT_SIZES, WINDOW_CONTROLS_HEIGHT } from './presentation.js';
import { captureScreenshot } from './screenshot.js';

const PADDING = 20;
const GAP = 12;
const TITLE_BAR_SPACE = 48;
const windowControlsHeight = frame => frame.bezel && process.platform !== 'win32' ? WINDOW_CONTROLS_HEIGHT : 0;
const windows = new Map();
const opening = new Map();
const capturing = new Set();
const previews = new WeakMap();
const chromePath = fileURLToPath(new URL('./chrome.html', import.meta.url));
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url));
let targetUrl;
let currentTextSize = 'default';
let currentAreas = { ...DEFAULT_AREAS };
let areaUpdates = Promise.resolve();
let textSizeUpdates = Promise.resolve();
let navigationUpdates = Promise.resolve();
let controlled = process.env.VIEWPORTS_CONTROL === 'stdio';

function updateMenu() {
  const menu = [];

  if (process.platform === 'darwin') menu.push({ role: 'appMenu' });
  menu.push(
    {
      label: 'Devices',
      submenu: DEVICE_GROUPS.map(group => ({
        label: group.label,
        submenu: group.devices.map(device => ({
          label: `${device.name}  (${device.width} × ${device.height})`,
          type: 'checkbox',
          checked: windows.has(device.id),
          enabled: !opening.has(device.id),
          click: () => toggleDevice(device),
        })),
      })),
    },
    {
      label: 'Screenshot',
      submenu: [...windows.keys()].map(id => ({
        label: ALL_DEVICES.find(device => device.id === id)?.name ?? id,
        enabled: !capturing.has(id),
        submenu: [
          { label: 'Visible viewport…', click: () => saveScreenshot(id, 'viewport') },
          { label: 'Full page…', click: () => saveScreenshot(id, 'full-page') },
        ],
      })),
    },
    {
      label: 'Text Size',
      submenu: Object.entries(TEXT_SIZES).map(([id, size]) => ({
        label: `${size.label} (${Math.round(size.scale * 100)}%)`,
        type: 'radio',
        checked: id === currentTextSize,
        click: () => setTextSize(id).catch(error => dialog.showErrorBox('Could not change text size', error.message)),
      })),
    },
    {
      label: 'Device Areas',
      submenu: [
        {
          label: 'Top Area',
          type: 'checkbox',
          checked: currentAreas.top,
          click: item => setAreas({ ...currentAreas, top: item.checked })
            .catch(error => dialog.showErrorBox('Could not change device areas', error.message)),
        },
        {
          label: 'Bottom Area',
          type: 'checkbox',
          checked: currentAreas.bottom,
          click: item => setAreas({ ...currentAreas, bottom: item.checked })
            .catch(error => dialog.showErrorBox('Could not change device areas', error.message)),
        },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}

async function captureDevice(id, mode) {
  const window = windows.get(id);
  const preview = window && previews.get(window);
  if (!window || window.isDestroyed() || !preview) throw new Error('Device is not open.');
  if (capturing.has(id)) throw new Error('A screenshot is already in progress for this device.');
  capturing.add(id);
  updateMenu();
  try {
    const data = await captureScreenshot(preview.contents, preview.frame, mode);
    if (Buffer.byteLength(data, 'base64') > 6_000_000) throw new Error('Screenshot exceeds the output size limit.');
    return data;
  } finally {
    capturing.delete(id);
    updateMenu();
  }
}

async function saveScreenshot(id, mode) {
  try {
    const result = await dialog.showSaveDialog(windows.get(id), {
      title: 'Save screenshot', defaultPath: `viewports-${id}-${mode}.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return;
    const data = await captureDevice(id, mode);
    await writeFile(result.filePath, Buffer.from(data, 'base64'));
  } catch (error) {
    dialog.showErrorBox('Could not save screenshot', error.message);
  }
}

async function toggleDevice(device) {
  try {
    if (windows.has(device.id)) {
      await removeDevice(device);
    } else {
      await addDevice(device);
    }
  } catch (error) {
    dialog.showErrorBox('Could not update device', error.message);
  }
}

function keepWindowOnDisplay(window) {
  if (window.isDestroyed()) return;
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height));
  if (x !== bounds.x || y !== bounds.y) window.setPosition(x, y);
}

function addDevice(device) {
  if (opening.has(device.id)) return opening.get(device.id);
  if (windows.has(device.id)) return Promise.resolve();

  const operation = Promise.resolve().then(async () => {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const frame = presentationFor(device, currentAreas);
    const controlsHeight = windowControlsHeight(frame);
    const scale = Math.min(1, (workArea.width - 2 * PADDING) / frame.width,
      (workArea.height - 2 * PADDING - TITLE_BAR_SPACE - controlsHeight) / frame.height);
    const width = Math.ceil(frame.width * scale);
    const height = Math.ceil(frame.height * scale) + controlsHeight;
    const offset = Math.min(windows.size * 32, 160);
    const bounds = {
      x: workArea.x + Math.min(PADDING + offset, workArea.width - width - PADDING),
      y: workArea.y + Math.min(PADDING + offset, workArea.height - height - TITLE_BAR_SPACE),
      width,
      height,
    };
    const window = await openWindow(device, targetUrl, bounds);
    window.show();
    keepWindowOnDisplay(window);
  }).finally(() => {
    opening.delete(device.id);
    updateMenu();
  });
  opening.set(device.id, operation);
  updateMenu();
  return operation;
}

async function removeDevice(device) {
  if (opening.has(device.id)) await opening.get(device.id);
  const window = windows.get(device.id);
  if (!window) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeListener('closed', onClosed);
      reject(new Error(`${device.name} could not be closed.`));
    }, 5000);
    function onClosed() {
      clearTimeout(timeout);
      resolve();
    }
    window.once('closed', onClosed);
    window.close();
  });
}

async function applyTextSize(contents, textSize) {
  const size = TEXT_SIZES[textSize];
  await contents.debugger.sendCommand('Page.setFontSizes', {
    fontSizes: { standard: size.fontSize, fixed: Math.round(13 * size.scale) },
  });
  await contents.debugger.sendCommand('Emulation.setEmulatedOSTextScale', { scale: size.scale });
}

function setTextSize(textSize) {
  if (!Object.hasOwn(TEXT_SIZES, textSize)) return Promise.reject(new Error('Unknown text size.'));
  const operation = textSizeUpdates.then(async () => {
    const previous = currentTextSize;
    currentTextSize = textSize;
    const applyToOpenWindows = size => Promise.all([...windows.values()].map(async window => {
      const contents = previews.get(window)?.contents;
      if (contents && !contents.isDestroyed() && contents.debugger.isAttached()) {
        await applyTextSize(contents, size);
      }
    }));
    try {
      await applyToOpenWindows(textSize);
    } catch (error) {
      currentTextSize = previous;
      await applyToOpenWindows(previous).catch(() => {});
      throw error;
    } finally {
      updateMenu();
    }
  });
  textSizeUpdates = operation.catch(() => {});
  return operation;
}

function setAreas(areas) {
  if (typeof areas?.top !== 'boolean' || typeof areas?.bottom !== 'boolean') {
    return Promise.reject(new Error('Device areas must specify top and bottom as true or false.'));
  }
  const operation = areaUpdates.then(async () => {
    const previous = currentAreas;
    currentAreas = { top: areas.top, bottom: areas.bottom };
    const applyToOpenWindows = async value => {
      await Promise.all([...windows.entries()].map(async ([id, window]) => {
        const preview = previews.get(window);
        const device = ALL_DEVICES.find(item => item.id === id);
        if (!window.isDestroyed() && preview?.contents.debugger.isAttached()) {
          preview.frame = presentationFor(device, value);
          await scheduleMetrics(window, device);
        }
      }));
    };
    try {
      await applyToOpenWindows(currentAreas);
    } catch (error) {
      currentAreas = previous;
      await applyToOpenWindows(previous).catch(() => {});
      throw error;
    } finally {
      updateMenu();
    }
  });
  areaUpdates = operation.catch(() => {});
  return operation;
}

function normalizeAddress(value) {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value.trim())) {
    throw new Error('Enter a valid website address.');
  }
  const address = value.trim();
  const local = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(address);
  const hostWithPort = /^[^/:]+\.[^/:]+:\d+(?:[/?#]|$)/.test(address);
  const candidate = local ? `http://${address}`
    : hostWithPort || !/^[a-z][a-z\d+.-]*:/i.test(address) ? `https://${address}` : address;
  return createPreviewRequest(candidate).url;
}

function navigateAll(value) {
  const url = normalizeAddress(value);
  const operation = navigationUpdates.then(async () => {
    targetUrl = url;
    await Promise.allSettled([...opening.values()]);
    const results = await Promise.allSettled([...windows.values()].map(window => {
      const contents = previews.get(window)?.contents;
      return contents && !contents.isDestroyed() ? contents.loadURL(url) : Promise.resolve();
    }));
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new Error(`Could not load the address in ${failures.length} preview window(s).`);
    return url;
  });
  navigationUpdates = operation.catch(() => {});
  return operation;
}

async function startControl() {
  const stream = process.env.VIEWPORTS_CONTROL_PIPE
    ? createConnection(process.env.VIEWPORTS_CONTROL_PIPE) : process.stdin;
  if (stream !== process.stdin) {
    await new Promise((resolve, reject) => {
      stream.once('connect', resolve);
      stream.once('error', reject);
    });
    stream.on('error', () => stream.destroy());
  }
  const input = createInterface({ input: stream });
  let queue = Promise.resolve();
  input.on('line', line => {
    queue = queue.then(async () => {
      let message;
      try {
        message = JSON.parse(line);
        if (message.action === 'screenshot') {
          const data = await captureDevice(message.device, message.value);
          report({ id: message.id, data });
          return;
        } else if (message.action === 'text-size') {
          await setTextSize(message.value);
        } else if (message.action === 'areas') {
          await setAreas(message.value);
        } else if (message.action === 'navigate') {
          await navigateAll(message.value);
        } else if (message.action !== 'status') {
          const device = ALL_DEVICES.find(item => item.id === message.device);
          if (!device || !['add', 'remove'].includes(message.action)) {
            throw new Error('Unknown device or action.');
          }
          await (message.action === 'add' ? addDevice(device) : removeDevice(device));
        }
        report({ id: message.id, devices: [...windows.keys()], textSize: currentTextSize, areas: currentAreas, url: targetUrl });
      } catch (error) {
        report({ id: message?.id, error: error.message });
      }
    });
  });
  input.on('close', () => {
    controlled = false;
    if (windows.size === 0) app.quit();
  });
}

async function applyMetrics(window, device) {
  const { contents, view, screenView, frame } = previews.get(window);
  const [width, height] = window.getContentSize();
  const controlsHeight = windowControlsHeight(frame);
  const scale = Math.min(width / frame.width, (height - controlsHeight) / frame.height);
  if (scale <= 0) return;

  if (view) {
    const x = Math.round(frame.bezel * scale);
    const y = controlsHeight + Math.round(frame.bezel * scale);
    const screenWidth = Math.max(1, Math.round(device.width * scale));
    const screenHeight = Math.max(1, Math.round(device.height * scale));
    const top = Math.round(frame.top * scale);
    screenView.setBounds({ x, y, width: screenWidth, height: screenHeight });
    screenView.setBorderRadius(Math.round(frame.screenRadius * scale));
    view.setBounds({
      x: 0,
      y: top,
      width: Math.max(1, Math.round(frame.viewportWidth * scale)),
      height: Math.max(1, Math.round(frame.viewportHeight * scale)),
    });
    await window.webContents.executeJavaScript(
      `(() => {
        const element = document.getElementById('device');
        element.style.setProperty('--scale', ${JSON.stringify(scale)});
        element.style.setProperty('--status-height', '${frame.top}px');
        element.style.setProperty('--bottom', '${frame.bottom}px');
        element.classList.toggle('hide-top', ${frame.top === 0});
        element.classList.toggle('hide-bottom', ${frame.bottom === 0});
      })()`,
    );
  }

  await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: frame.viewportWidth,
    height: frame.viewportHeight,
    screenWidth: device.width,
    screenHeight: device.height,
    deviceScaleFactor: frame.pixelRatio,
    mobile: device.type === 'mobile' || device.type === 'tablet',
    dontSetVisibleSize: true,
    scale,
  });
}

function scheduleMetrics(window, device) {
  const preview = previews.get(window);
  preview.pendingMetrics = true;
  if (preview.metricsUpdate) return preview.metricsUpdate;

  preview.metricsUpdate = (async () => {
    while (preview.pendingMetrics && !window.isDestroyed() && preview.contents.debugger.isAttached()) {
      preview.pendingMetrics = false;
      await applyMetrics(window, device);
    }
  })().finally(() => {
    preview.metricsUpdate = null;
  });
  return preview.metricsUpdate;
}

function updateScale(window, device) {
  window.on('resize', () => {
    scheduleMetrics(window, device).catch(() => {
      // The window or its debugging session may close during a resize.
    });
  });
}

async function openWindow(device, url, bounds) {
  const frame = presentationFor(device, currentAreas);
  const window = new BrowserWindow({
    ...bounds,
    title: device.name,
    useContentSize: true,
    resizable: true,
    show: false,
    transparent: frame.bezel > 0 && process.platform !== 'win32',
    backgroundColor: frame.bezel > 0 && process.platform !== 'win32' ? '#00000000' : '#09090b',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `viewports-shell-${device.id}`,
      preload: preloadPath,
    },
  });

  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'viewports-preview',
    },
  });
  const screenView = new View();
  screenView.setBackgroundColor('#00000000');
  screenView.addChildView(view);
  const contents = view.webContents;
  const userAgent = mobileUserAgent(device, process.versions.chrome);
  if (userAgent) contents.setUserAgent(userAgent);
  previews.set(window, { contents, view, screenView, frame });
  windows.set(device.id, window);

  window.on('closed', () => {
    if (view && !contents.isDestroyed()) contents.close();
    windows.delete(device.id);
    updateMenu();
  });
  window.on('page-title-updated', event => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const updateAddress = (_event, address) => {
    if (!window.isDestroyed()) window.webContents.send('viewports:address', address);
  };
  contents.on('did-navigate', updateAddress);
  contents.on('did-navigate-in-page', (event, address, isMainFrame) => {
    if (isMainFrame) updateAddress(event, address);
  });
  window.setAspectRatio(frame.width / frame.height, { width: 0, height: windowControlsHeight(frame) });
  keepWindowOnDisplay(window);

  try {
    if (view) {
      await window.loadFile(chromePath, { query: {
        id: device.id,
        name: device.name,
        kind: frame.kind,
        controlsHeight: String(windowControlsHeight(frame)),
        width: String(frame.width),
        height: String(frame.height),
        top: String(frame.top),
        bottom: String(frame.bottom),
        url,
        outerRadius: String(frame.outerRadius),
        screenRadius: String(frame.screenRadius),
      } });
      window.contentView.addChildView(screenView);
    }
    await contents.loadURL('about:blank');
    contents.debugger.attach();
    previews.get(window).frame = presentationFor(device, currentAreas);
    await scheduleMetrics(window, device);
    await applyTextSize(contents, currentTextSize);
    if (device.type === 'mobile' || device.type === 'tablet') {
      await contents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true });
    }
    updateScale(window, device);
    await contents.loadURL(url);
    await applyTextSize(contents, currentTextSize);
    return window;
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}

function layoutDevices(devices, workArea) {
  const availableWidth = workArea.width - 2 * PADDING;
  const availableHeight = workArea.height - 2 * PADDING;
  let best;

  for (let columns = 1; columns <= devices.length; columns++) {
    const rows = [];
    for (let index = 0; index < devices.length; index += columns) {
      rows.push(devices.slice(index, index + columns));
    }
    const width = Math.max(...rows.map(row => row.reduce((sum, device) => sum + presentationFor(device).width, 0)
      + GAP * (row.length - 1)));
    const height = rows.reduce((sum, row) => sum + Math.max(...row.map(device => presentationFor(device).height)), 0);
    const controlsHeight = rows.reduce((sum, row) =>
      sum + Math.max(...row.map(device => windowControlsHeight(presentationFor(device)))), 0);
    const scale = Math.min(1, availableWidth / width,
      (availableHeight - controlsHeight - rows.length * TITLE_BAR_SPACE - (rows.length - 1) * GAP) / height);
    if (!best || scale > best.scale) best = { rows, scale };
  }

  const placements = [];
  let y = workArea.y + PADDING;
  for (const row of best.rows) {
    let x = workArea.x + PADDING;
    for (const device of row) {
      const frame = presentationFor(device);
      const width = Math.ceil(frame.width * best.scale);
      const height = Math.ceil(frame.height * best.scale) + windowControlsHeight(frame);
      placements.push({ device, bounds: { x, y, width, height } });
      x += width + GAP;
    }
    y += Math.max(...row.map(device => {
      const frame = presentationFor(device);
      return Math.ceil(frame.height * best.scale) + windowControlsHeight(frame);
    })) + TITLE_BAR_SPACE + GAP;
  }
  return { ...best, placements };
}

function report(result, callback) {
  process.stdout.write(`${STARTUP_MESSAGE}${JSON.stringify(result)}\n`, callback);
}

app.name = 'Viewports';
app.on('window-all-closed', () => {
  if (!controlled) app.quit();
});

app.whenReady().then(async () => {
  const shellWindow = event => [...windows.values()].find(window => !window.isDestroyed()
    && window.webContents === event.sender && event.senderFrame === window.webContents.mainFrame);
  ipcMain.on('viewports:window-action', (event, action) => {
    const window = shellWindow(event);
    if (!window || !previews.get(window)?.frame.bezel) return;
    if (action === 'minimize') window.minimize();
    if (action === 'close') window.close();
  });
  ipcMain.handle('viewports:navigate', async (event, address) => {
    if (!shellWindow(event)) return { ok: false, error: 'Navigation is unavailable.' };
    try {
      return { ok: true, url: await navigateAll(address) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [url, ...arguments_] = args;
  const textSizeOption = arguments_.find(value => value.startsWith('--text-size='));
  const areaOption = arguments_.find(value => value.startsWith('--areas='));
  const textSize = textSizeOption ? textSizeOption.slice('--text-size='.length) : 'default';
  const areaNames = areaOption ? areaOption.slice('--areas='.length).split(',') : ['top', 'bottom'];
  if (areaNames.some(name => !['top', 'bottom', 'none'].includes(name))
    || (areaNames.includes('none') && areaNames.length > 1)) {
    throw new Error('Invalid device areas.');
  }
  const areas = { top: areaNames.includes('top'), bottom: areaNames.includes('bottom') };
  const deviceIds = arguments_.filter(value => !value.startsWith('--text-size=') && !value.startsWith('--areas='));
  const request = createPreviewRequest(url, deviceIds, textSize, areas);
  targetUrl = request.url;
  currentTextSize = request.textSize;
  currentAreas = request.areas;

  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const layout = layoutDevices(request.devices, workArea);
  const opened = await Promise.all(layout.placements.map(({ device, bounds }) =>
    openWindow(device, targetUrl, bounds)));

  updateMenu();
  for (const window of opened) {
    window.show();
    keepWindowOnDisplay(window);
  }
  if (controlled) await startControl();
  report({ ready: true });
}).catch(error => {
  report({ error: error.message }, () => app.exit(1));
});
