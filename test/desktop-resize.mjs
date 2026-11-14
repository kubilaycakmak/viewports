import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app, BrowserWindow, Menu, screen } from 'electron';
import { presentationFor, WINDOW_CONTROLS_HEIGHT } from '../src/desktop/presentation.js';

const device = { id: 'iphone-se', type: 'mobile', width: 375, height: 667 };
const frame = presentationFor(device);

function previewViews(view) {
  return view.children.flatMap(child => child.webContents ? [child] : previewViews(child));
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the preview.');
}

async function captureAfterResize(contents) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await contents.capturePage();
    } catch (error) {
      if (error.message !== 'UnknownVizError' || attempt === 9) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

async function run() {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>html, body { margin: 0; height: 100%; background: rgb(11, 16, 32); }</style>
      <h1 style="color: white">Resize test</h1><p id="relative" style="font-size:1rem">Relative</p><p id="fixed" style="font-size:16px">Fixed</p>`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const url = `http://127.0.0.1:${server.address().port}/`;
  process.argv = [process.argv[0], process.argv[1], url, 'iphone-se', '--text-size=large'];
  await import('../src/desktop/main.js');

  try {
    const window = await waitFor(() => BrowserWindow.getAllWindows().find(item =>
      previewViews(item.contentView).some(view => view.webContents?.getURL() === url && !view.webContents.isLoading())));
    const view = previewViews(window.contentView).find(item => item.webContents?.getURL() === url);
    const contents = view.webContents;
    const readFontSizes = () => contents.executeJavaScript(
      `['relative', 'fixed'].map(id => getComputedStyle(document.getElementById(id)).fontSize)`,
    );
    assert.deepEqual(await readFontSizes(), ['20px', '16px']);

    const textMenu = Menu.getApplicationMenu().items.find(item => item.label === 'Text Size');
    textMenu.submenu.items.find(item => item.label.startsWith('Extra Large')).click();
    await waitFor(async () => (await readFontSizes())[0] === '24px');
    assert.deepEqual(await readFontSizes(), ['24px', '16px']);

    for (const width of [250, frame.width, 550, 300]) {
      const height = Math.round(width * frame.height / frame.width);
      window.setContentSize(width, height + WINDOW_CONTROLS_HEIGHT);
      await waitFor(() => window.getContentSize()[0] === width);
      // Allow the resize event and compositor update to finish before capturing.
      await new Promise(resolve => setTimeout(resolve, 300));

      const viewport = await contents.executeJavaScript('[window.innerWidth, window.innerHeight, screen.width, screen.height]');
      assert.deepEqual(viewport, [frame.viewportWidth, frame.viewportHeight, device.width, device.height]);

      const image = await captureAfterResize(contents);
      const size = image.getSize();
      const factor = screen.getDisplayMatching(window.getBounds()).scaleFactor;
      const scale = Math.min(width / frame.width, height / frame.height);
      assert.ok(Math.abs(size.width - Math.round(frame.viewportWidth * scale) * factor) <= 3,
        `Unexpected captured width ${size.width} for ${width}`);
      assert.ok(Math.abs(size.height - Math.round(frame.viewportHeight * scale) * factor) <= 3,
        `Unexpected captured height ${size.height} for ${height}`);

      const bitmap = image.toBitmap();
      const x = size.width - Math.round(10 * factor);
      const y = size.height - Math.round(10 * factor);
      const offset = (y * size.width + x) * 4;
      assert.deepEqual([...bitmap.subarray(offset, offset + 4)], [32, 16, 11, 255],
        `Preview did not fill the bottom-right corner at width ${width}`);
    }

    // Windows can report a content size whose aspect differs from the device.
    // The entire shell must stay visible after such a resize.
    window.setContentSize(373, 674 + WINDOW_CONTROLS_HEIGHT);
    await waitFor(async () => window.webContents.executeJavaScript(`(() => {
      const rect = document.getElementById('device').getBoundingClientRect();
      return rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    })()`));
    const shell = await window.webContents.executeJavaScript(`(() => {
      const rect = document.getElementById('device').getBoundingClientRect();
      return { right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    })()`);
    assert.ok(shell.right <= shell.width + 1 && shell.bottom <= shell.height + 1,
      `Device shell extends outside the window: ${JSON.stringify(shell)}`);
    const rendererRecovered = await window.webContents.executeJavaScript(`(() => {
      const device = document.getElementById('device');
      device.style.setProperty('--scale', '2');
      dispatchEvent(new Event('resize'));
      const rect = device.getBoundingClientRect();
      return rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    })()`);
    assert.ok(rendererRecovered, 'Renderer should fit the device without a main-process metrics update');
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
