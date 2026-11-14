import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app, BrowserWindow, desktopCapturer, Menu } from 'electron';

if (process.platform !== 'win32') {
  console.log('Native corner capture is only checked on Windows.');
  app.exit(0);
} else {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>html,body{margin:0;min-height:100%;background:rgb(249,217,123)}</style>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  process.argv = [process.argv[0], process.argv[1], url, 'iphone-duo-unfolded', 'galaxy-z-flip8'];
  await import('../src/desktop/main.js');

  async function waitFor(check) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await check();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for a device preview.');
  }

  function pixel(image, x, y) {
    const { width, height } = image.getSize();
    assert.ok(x >= 0 && x < width && y >= 0 && y < height);
    const bytes = image.toBitmap();
    const offset = (y * width + x) * 4;
    return [bytes[offset + 2], bytes[offset + 1], bytes[offset]];
  }

  function assertColorNear(actual, expected, message) {
    assert.ok(actual.every((channel, index) => Math.abs(channel - expected[index]) <= 3),
      `${message}: ${JSON.stringify({ actual, expected })}`);
  }

  async function run() {
    try {
      const windows = await waitFor(() => {
        const opened = BrowserWindow.getAllWindows();
        return opened.length === 2 && opened.every(window => window.isVisible()) ? opened : false;
      });
      await new Promise(resolve => setTimeout(resolve, 400));
      const sources = await desktopCapturer.getSources({
        types: ['window'], thumbnailSize: { width: 2000, height: 2000 },
      });
      for (const window of windows) {
        const source = sources.find(item => item.id === window.getMediaSourceId());
        assert.ok(source, `Could not capture ${window.getTitle()}`);
        const shell = await window.webContents.executeJavaScript(`(() => {
          const device = document.getElementById('device');
          const screen = document.querySelector('.screen');
          const rect = screen.getBoundingClientRect();
          const scale = Number(device.style.getPropertyValue('--scale'));
          const top = Number(device.style.getPropertyValue('--status-height').replace('px', ''));
          const bottom = Number(device.style.getPropertyValue('--bottom').replace('px', ''));
          const radius = parseFloat(getComputedStyle(screen).borderBottomLeftRadius);
          return { left: rect.left, right: rect.right, pageBottom: rect.bottom - bottom * scale,
            screenBottom: rect.bottom, radius: radius * scale, scale };
        })()`);
        assert.ok(shell.screenBottom - shell.pageBottom >= shell.radius - 1,
          `${window.getTitle()} page overlaps the rounded screen corner`);
        const image = source.thumbnail;
        const factor = image.getSize().width / window.getContentSize()[0];
        const y = Math.floor((shell.pageBottom - 2 * shell.scale) * factor);
        const center = pixel(image, Math.floor((shell.left + shell.right) / 2 * factor), y);
        const left = pixel(image, Math.ceil((shell.left + 2 * shell.scale) * factor), y);
        const right = pixel(image, Math.floor((shell.right - 2 * shell.scale) * factor), y);
        assertColorNear(center, [249, 217, 123], `${window.getTitle()} page should fill the viewport center`);
        assertColorNear(left, center, `${window.getTitle()} page should have a square lower-left corner`);
        assertColorNear(right, center, `${window.getTitle()} page should have a square lower-right corner`);
      }
      const bottomArea = Menu.getApplicationMenu().items.find(item => item.label === 'Device Areas')
        .submenu.items.find(item => item.label === 'Bottom Area');
      bottomArea.click({ checked: false });
      await waitFor(async () => (await Promise.all(windows.map(window => window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.bar')).display === 'none'",
      )))).every(Boolean));
      await new Promise(resolve => setTimeout(resolve, 200));
      const hiddenSources = await desktopCapturer.getSources({
        types: ['window'], thumbnailSize: { width: 2000, height: 2000 },
      });
      for (const window of windows) {
        const source = hiddenSources.find(item => item.id === window.getMediaSourceId());
        assert.ok(source, `Could not capture ${window.getTitle()} without the bottom area`);
        const shell = await window.webContents.executeJavaScript(`(() => {
          const device = document.getElementById('device');
          const screen = document.querySelector('.screen');
          const body = device.getBoundingClientRect();
          const rect = screen.getBoundingClientRect();
          return { left: rect.left, right: rect.right, bottom: rect.bottom, bodyBottom: body.bottom,
            radius: parseFloat(getComputedStyle(device).borderBottomLeftRadius),
            scale: Number(device.style.getPropertyValue('--scale')) };
        })()`);
        assert.ok(shell.bodyBottom - shell.bottom >= shell.radius * shell.scale - 1,
          `${window.getTitle()} page reaches the outer rounded case when bottom controls are hidden`);
        const image = source.thumbnail;
        const factor = image.getSize().width / window.getContentSize()[0];
        const y = Math.floor((shell.bottom - 2 * shell.scale) * factor);
        const center = pixel(image, Math.floor((shell.left + shell.right) / 2 * factor), y);
        const left = pixel(image, Math.ceil((shell.left + 2 * shell.scale) * factor), y);
        assertColorNear(center, [249, 217, 123], `${window.getTitle()} page should fill the viewport center`);
        assertColorNear(left, center, `${window.getTitle()} page should remain square without bottom controls`);
      }
      console.log('Desktop corner clearance test passed.');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  }
  run().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
}
