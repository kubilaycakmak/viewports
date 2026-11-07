import { app, BrowserWindow, screen } from 'electron';
import { createPreviewRequest, STARTUP_MESSAGE } from './request.js';

const PADDING = 20;
const GAP = 12;
const TITLE_BAR_SPACE = 48;

async function openWindow(device, url, bounds, scale) {
  const window = new BrowserWindow({
    ...bounds,
    title: device.name,
    useContentSize: true,
    resizable: false,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'viewports-preview',
    },
  });

  window.on('page-title-updated', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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

  await window.loadURL(url);
  return window;
}

function report(result, callback) {
  process.stdout.write(`${STARTUP_MESSAGE}${JSON.stringify(result)}\n`, callback);
}

app.name = 'Viewports';
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  const [url, ...deviceIds] = process.argv.slice(2);
  const request = createPreviewRequest(url, deviceIds);

  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const totalWidth = request.devices.reduce((sum, device) => sum + device.width, 0);
  const tallest = Math.max(...request.devices.map(device => device.height));
  const availableWidth = workArea.width - 2 * PADDING - GAP * (request.devices.length - 1);
  const availableHeight = workArea.height - 2 * PADDING - TITLE_BAR_SPACE;
  const scale = Math.min(1, availableWidth / totalWidth, availableHeight / tallest);
  let x = workArea.x + PADDING;

  const windows = await Promise.all(request.devices.map(device => {
    const width = Math.ceil(device.width * scale);
    const height = Math.ceil(device.height * scale);
    const bounds = { x, y: workArea.y + PADDING, width, height };
    x += width + GAP;
    return openWindow(device, request.url, bounds, scale);
  }));

  for (const window of windows) window.show();
  report({ ready: true });
}).catch(error => {
  report({ error: error.message }, () => app.exit(1));
});
