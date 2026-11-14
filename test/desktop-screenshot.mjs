import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app, BrowserWindow, Menu, nativeImage } from 'electron';
import { captureScreenshot } from '../src/desktop/screenshot.js';
import { presentationFor } from '../src/desktop/presentation.js';

async function run() {
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body { margin: 0; height: 1800px; background: linear-gradient(red, blue); }</style>
    <script>addEventListener('scroll', () => {
      if (scrollY > 500 && !document.getElementById('loaded')) {
        const marker = document.createElement('div'); marker.id = 'loaded';
        marker.style.cssText = 'position:absolute;top:1400px;left:0;width:100%;height:100px;background:rgb(0,255,0)';
        document.body.append(marker);
      }
    });</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
process.argv = [process.argv[0], process.argv[1], url, 'iphone-se'];
await import('../src/desktop/main.js');

function views(view) { return view.children.flatMap(child => child.webContents ? [child] : views(child)); }
try {
  let contents;
  for (let i = 0; i < 300 && !contents; i++) {
    contents = BrowserWindow.getAllWindows().flatMap(window => views(window.contentView))
      .map(view => view.webContents).find(item => item.getURL() === url && !item.isLoading());
    if (!contents) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(contents, 'Preview did not open');
  let menu;
  for (let i = 0; i < 300 && !menu; i++) {
    menu = Menu.getApplicationMenu()?.items.find(item => item.label === 'Screenshot');
    if (!menu) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(menu, 'Screenshot menu did not appear');
  assert.ok(menu.submenu.items.some(item => item.label === 'iPhone SE'));
  const frame = presentationFor({ id: 'iphone-se', type: 'mobile', width: 375, height: 667 });
  await contents.executeJavaScript('scrollTo(0, 300)');
  const before = await contents.executeJavaScript('scrollY');
  const size = data => {
    const bytes = Buffer.from(data, 'base64');
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  };
  const visible = size(await captureScreenshot(contents, frame, 'viewport'));
  const fullData = await captureScreenshot(contents, frame, 'full-page');
  const full = size(fullData);
  assert.deepEqual(visible, [750, 1118]);
  assert.deepEqual(full, [750, 3600]);
  const bitmap = nativeImage.createFromBuffer(Buffer.from(fullData, 'base64')).toBitmap();
  const offset = (2900 * full[0] + 200) * 4;
  assert.deepEqual([...bitmap.subarray(offset, offset + 4)], [0, 255, 0, 255], 'Lazy-loaded content is missing');
  assert.equal(await contents.executeJavaScript('scrollY'), before);
  await contents.executeJavaScript("document.body.style.height = '100000px'");
  await assert.rejects(captureScreenshot(contents, frame, 'full-page'), /size limit/);
  assert.equal(await contents.executeJavaScript('scrollY'), before);
  console.log('Desktop screenshot capture test passed.', { visible, full });
} finally {
  server.closeAllConnections();
  server.close();
}
}
run().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
