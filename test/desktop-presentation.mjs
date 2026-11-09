import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app, BrowserWindow, Menu } from 'electron';
import { ALL_DEVICES } from '../src/public/devices.js';
import { presentationFor } from '../src/desktop/presentation.js';

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
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: '/redirected' });
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
      <button id="click" onclick="window.clicked = true">Click</button>
      <p id="relative" style="font-size:1rem">Relative</p>
      <p id="fixed" style="font-size:16px">Fixed</p>
      <code id="code">Monospace</code>`);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const ids = ['iphone-17', 'galaxy-s26', 'ipad-mini', 'desktop-hd'];
  process.argv = [process.argv[0], process.argv[1], url, ...ids, '--text-size=large'];
  await import('../src/desktop/main.js');

  try {
    const all = await waitFor(() => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length !== ids.length) return false;
      const previews = windows.map(window => {
        const contents = window.webContents.getURL() === url ? window.webContents
          : window.contentView.children.find(view => view.webContents?.getURL() === url)?.webContents;
        return { window, contents };
      });
      return previews.every(item => item.contents && !item.contents.isLoading()) && previews;
    });

    for (const { window, contents } of all) {
      const device = ALL_DEVICES.find(item => item.name === window.getTitle());
      assert.ok(device, window.getTitle());
      const frame = presentationFor(device);
      const state = await contents.executeJavaScript(`({
        innerWidth, innerHeight, screenWidth: screen.width, screenHeight: screen.height,
        ratio: devicePixelRatio, userAgent: navigator.userAgent, touches: navigator.maxTouchPoints,
        relative: getComputedStyle(document.getElementById('relative')).fontSize,
        fixed: getComputedStyle(document.getElementById('fixed')).fontSize,
        code: getComputedStyle(document.getElementById('code')).fontSize,
      })`);
      assert.deepEqual([state.innerWidth, state.innerHeight], [frame.viewportWidth, frame.viewportHeight]);
      assert.deepEqual([state.screenWidth, state.screenHeight], [device.width, device.height]);
      assert.deepEqual([state.relative, state.fixed, state.code], ['20px', '16px', '16px']);
      if (frame.pixelRatio) assert.equal(state.ratio, frame.pixelRatio);
      if (frame.kind === 'ios') assert.match(state.userAgent, /iPhone/);
      if (frame.kind === 'android') assert.match(state.userAgent, /Android/);
      if (frame.kind === 'tablet') assert.match(state.userAgent, /iPad/);
      if (frame.bezel) assert.ok(state.touches > 0);
    }

    const phone = all.find(item => item.window.getTitle() === 'iPhone 17');
    const desktop = all.find(item => item.window.getTitle() === 'Desktop HD');
    assert.deepEqual(await desktop.window.webContents.executeJavaScript(`[
      getComputedStyle(document.querySelector('.top-address')).display,
      getComputedStyle(document.querySelector('.bar')).display,
      document.querySelector('.top-address input').value
    ]`), ['flex', 'none', url]);
    async function toggleArea(name, checked, expectedHeight) {
      const menu = Menu.getApplicationMenu().items.find(item => item.label === 'Device Areas');
      menu.submenu.items.find(item => item.label === name).click({ checked });
      await waitFor(async () => (await phone.contents.executeJavaScript('innerHeight')) === expectedHeight);
    }
    await toggleArea('Top Area', false, 792);
    await waitFor(async () => (await desktop.contents.executeJavaScript('innerHeight')) === 1080);
    assert.equal(await desktop.window.webContents.executeJavaScript(
      "getComputedStyle(document.querySelector('.top-address')).display"), 'none');
    await toggleArea('Bottom Area', false, 874);
    assert.deepEqual(await phone.window.webContents.executeJavaScript(`[
      document.getElementById('device').classList.contains('hide-top'),
      document.getElementById('device').classList.contains('hide-bottom')
    ]`), [true, true]);
    await toggleArea('Top Area', true, 820);
    await toggleArea('Bottom Area', true, 738);
    await waitFor(async () => (await desktop.contents.executeJavaScript('innerHeight')) === 1032);

    const menu = Menu.getApplicationMenu().items.find(item => item.label === 'Text Size');
    menu.submenu.items.find(item => item.label.startsWith('Extra Large')).click();
    await waitFor(async () => (await Promise.all(all.map(item => item.contents.executeJavaScript(
      "getComputedStyle(document.getElementById('relative')).fontSize",
    )))).every(size => size === '24px'));

    await phone.contents.loadURL(url + '?navigation=1');
    assert.deepEqual(await phone.contents.executeJavaScript(`[
      innerWidth, innerHeight,
      getComputedStyle(document.getElementById('relative')).fontSize,
      getComputedStyle(document.getElementById('fixed')).fontSize
    ]`), [402, 738, '24px', '16px']);
    phone.window.focus();
    phone.contents.focus();
    const position = await phone.contents.executeJavaScript(`(() => {
      const rect = document.getElementById('click').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    const view = phone.window.contentView.children.find(item => item.webContents === phone.contents);
    const scale = view.getBounds().width / 402;
    const x = Math.round(position.x * scale);
    const y = Math.round(position.y * scale);
    phone.contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    phone.contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await waitFor(() => phone.contents.executeJavaScript('window.clicked === true'));
    const nextUrl = url + 'another-page';
    await desktop.window.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('.top-address');
      form.querySelector('input').value = ${JSON.stringify(nextUrl)};
      form.requestSubmit();
    })()`);
    await waitFor(() => all.every(item => item.contents.getURL() === nextUrl && !item.contents.isLoading()));
    await waitFor(() => phone.window.webContents.executeJavaScript(
      `document.querySelector('.bar input').value === ${JSON.stringify(nextUrl)}`));
    await phone.window.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('.bar form');
      form.querySelector('input').value = 'javascript:alert(1)';
      form.requestSubmit();
    })()`);
    await waitFor(() => phone.window.webContents.executeJavaScript("document.querySelector('.bar form').classList.contains('invalid')"));
    assert.ok(all.every(item => item.contents.getURL() === nextUrl));
    await desktop.window.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('.top-address');
      form.querySelector('input').value = ${JSON.stringify(`127.0.0.1:${server.address().port}/redirect`)};
      form.requestSubmit();
    })()`);
    const redirectedUrl = url + 'redirected';
    await waitFor(() => all.every(item => item.contents.getURL() === redirectedUrl && !item.contents.isLoading()));
    await waitFor(() => desktop.window.webContents.executeJavaScript(
      `document.querySelector('.top-address input').value === ${JSON.stringify(redirectedUrl)}`));
    const devicesMenu = Menu.getApplicationMenu().items.find(item => item.label === 'Devices');
    devicesMenu.submenu.items.flatMap(group => group.submenu.items)
      .find(item => item.label.startsWith('iPhone SE ')).click();
    await waitFor(() => BrowserWindow.getAllWindows().some(window => window.getTitle() === 'iPhone SE'
      && window.contentView.children.some(view => view.webContents?.getURL() === redirectedUrl || view.webContents?.getURL() === url + 'redirect')));
    console.log('Desktop presentation test passed.');
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

run().then(() => app.exit(0)).catch(error => {
  console.error(error);
  app.exit(1);
});
