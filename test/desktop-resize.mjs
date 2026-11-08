import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app, BrowserWindow, screen } from 'electron';

const device = { width: 375, height: 667 };

async function waitFor(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the preview.');
}

async function run() {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>html, body { margin: 0; height: 100%; background: rgb(11, 16, 32); }</style>
      <h1 style="color: white">Resize test</h1>`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const url = `http://127.0.0.1:${server.address().port}/`;
  process.argv = [process.argv[0], process.argv[1], url, 'iphone-se'];
  await import('../src/desktop/main.js');

  try {
    const window = await waitFor(() => {
      const preview = BrowserWindow.getAllWindows().find(item => item.webContents.getURL() === url);
      return preview && !preview.webContents.isLoading() && preview;
    });

    for (const width of [250, 375, 550, 300]) {
      const height = Math.round(width * device.height / device.width);
      window.setContentSize(width, height);
      await waitFor(async () => {
        const outerWidth = await window.webContents.executeJavaScript('window.outerWidth');
        return outerWidth === width;
      });
      // Allow the resize event and compositor update to finish before capturing.
      await new Promise(resolve => setTimeout(resolve, 300));

      const viewport = await window.webContents.executeJavaScript('[window.innerWidth, window.innerHeight]');
      assert.deepEqual(viewport, [device.width, device.height]);

      const image = await window.capturePage();
      const size = image.getSize();
      const factor = screen.getDisplayMatching(window.getBounds()).scaleFactor;
      assert.ok(Math.abs(size.width - width * factor) <= 2, `Unexpected captured width ${size.width} for ${width}`);
      assert.ok(Math.abs(size.height - height * factor) <= 2, `Unexpected captured height ${size.height} for ${height}`);

      const bitmap = image.toBitmap();
      const x = size.width - Math.round(10 * factor);
      const y = size.height - Math.round(10 * factor);
      const offset = (y * size.width + x) * 4;
      assert.deepEqual([...bitmap.subarray(offset, offset + 4)], [32, 16, 11, 255],
        `Preview did not fill the bottom-right corner at width ${width}`);
    }
    console.log('Desktop resize test passed.');
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

run().then(() => app.exit(0)).catch(error => {
  console.error(error);
  app.exit(1);
});
