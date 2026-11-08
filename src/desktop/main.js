import { app, BrowserWindow, dialog, Menu, screen } from 'electron';
import { DEVICE_GROUPS } from '../public/devices.js';
import { createPreviewRequest, STARTUP_MESSAGE } from './request.js';

const PADDING = 20;
const GAP = 12;
const TITLE_BAR_SPACE = 48;
const windows = new Map();
const opening = new Set();
let targetUrl;

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
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}

async function toggleDevice(device) {
  const current = windows.get(device.id);
  if (current) {
    current.close();
    return;
  }
  if (opening.has(device.id)) return;

  opening.add(device.id);
  updateMenu();
  try {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const scale = Math.min(1, (workArea.width - 2 * PADDING) / device.width,
      (workArea.height - 2 * PADDING - TITLE_BAR_SPACE) / device.height);
    const width = Math.ceil(device.width * scale);
    const height = Math.ceil(device.height * scale);
    const offset = Math.min(windows.size * 32, 160);
    const bounds = {
      x: workArea.x + Math.min(PADDING + offset, workArea.width - width - PADDING),
      y: workArea.y + Math.min(PADDING + offset, workArea.height - height - TITLE_BAR_SPACE),
      width,
      height,
    };
    const window = await openWindow(device, targetUrl, bounds, scale);
    window.show();
  } catch (error) {
    dialog.showErrorBox('Could not open device', error.message);
  } finally {
    opening.delete(device.id);
    updateMenu();
  }
}

function updateScale(window, device) {
  let updating = false;
  let pending = false;

  window.on('resize', async () => {
    pending = true;
    if (updating) return;
    updating = true;
    try {
      while (pending && !window.isDestroyed() && window.webContents.debugger.isAttached()) {
        pending = false;
        const [width, height] = window.getContentSize();
        const scale = Math.min(width / device.width, height / device.height);
        if (scale > 0) {
          await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
            width: device.width,
            height: device.height,
            deviceScaleFactor: 0,
            mobile: false,
            scale,
          });
        }
      }
    } catch {
      // The window or its debugging session may close during a resize.
    } finally {
      updating = false;
    }
  });
}

async function openWindow(device, url, bounds, scale) {
  const window = new BrowserWindow({
    ...bounds,
    title: device.name,
    useContentSize: true,
    resizable: true,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'viewports-preview',
    },
  });

  windows.set(device.id, window);
  window.on('closed', () => {
    windows.delete(device.id);
    updateMenu();
  });
  window.on('page-title-updated', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.setAspectRatio(device.width / device.height);

  try {
    await window.loadURL('about:blank');
    const debuggerSession = window.webContents.debugger;
    debuggerSession.attach();
    await debuggerSession.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: device.width,
      height: device.height,
      deviceScaleFactor: 0,
      mobile: false,
      scale,
    });

    updateScale(window, device);
    await window.loadURL(url);
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
    const width = Math.max(...rows.map(row => row.reduce((sum, device) => sum + device.width, 0)
      + GAP * (row.length - 1)));
    const height = rows.reduce((sum, row) => sum + Math.max(...row.map(device => device.height)), 0);
    const scale = Math.min(1, availableWidth / width,
      (availableHeight - rows.length * TITLE_BAR_SPACE - (rows.length - 1) * GAP) / height);
    if (!best || scale > best.scale) best = { rows, scale };
  }

  const placements = [];
  let y = workArea.y + PADDING;
  for (const row of best.rows) {
    let x = workArea.x + PADDING;
    for (const device of row) {
      const width = Math.ceil(device.width * best.scale);
      const height = Math.ceil(device.height * best.scale);
      placements.push({ device, bounds: { x, y, width, height } });
      x += width + GAP;
    }
    y += Math.ceil(Math.max(...row.map(device => device.height)) * best.scale) + TITLE_BAR_SPACE + GAP;
  }
  return { ...best, placements };
}

function report(result, callback) {
  process.stdout.write(`${STARTUP_MESSAGE}${JSON.stringify(result)}\n`, callback);
}

app.name = 'Viewports';
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  const [url, ...deviceIds] = process.argv.slice(2);
  const request = createPreviewRequest(url, deviceIds);
  targetUrl = request.url;

  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const layout = layoutDevices(request.devices, workArea);
  const opened = await Promise.all(layout.placements.map(({ device, bounds }) =>
    openWindow(device, targetUrl, bounds, layout.scale)));

  updateMenu();
  for (const window of opened) window.show();
  report({ ready: true });
}).catch(error => {
  report({ error: error.message }, () => app.exit(1));
});
