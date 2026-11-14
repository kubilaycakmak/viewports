import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app, BrowserWindow, Menu, screen } from 'electron';
import { ALL_DEVICES } from '../src/public/devices.js';
import { presentationFor } from '../src/desktop/presentation.js';

function previewViews(view) {
  return view.children.flatMap(child => child.webContents ? [child] : previewViews(child));
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 300; attempt++) {
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
  const ids = ['iphone-17', 'galaxy-s26', 'ipad-mini', 'desktop-hd', 'iphone-duo-folded', 'iphone-duo-unfolded'];
  process.argv = [process.argv[0], process.argv[1], url, ...ids, '--text-size=large'];
  await import('../src/desktop/main.js');

  try {
    const all = await waitFor(() => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length !== ids.length) return false;
      const previews = windows.map(window => {
        const contents = window.webContents.getURL() === url ? window.webContents
          : previewViews(window.contentView).find(view => view.webContents?.getURL() === url)?.webContents;
        return { window, contents };
      });
      return previews.every(item => item.contents && !item.contents.isLoading()) && previews;
    });

    for (const { window, contents } of all) {
      const bounds = window.getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      assert.ok(bounds.x >= area.x && bounds.y >= area.y
        && bounds.x + bounds.width <= area.x + area.width
        && bounds.y + bounds.height <= area.y + area.height,
      `${window.getTitle()} is outside the display work area: ${JSON.stringify({ bounds, area })}`);
      const device = ALL_DEVICES.find(item => item.name === window.getTitle());
      assert.ok(device, window.getTitle());
      const frame = presentationFor(device);
      const shell = await window.webContents.executeJavaScript(`({
        outerRadius: getComputedStyle(document.getElementById('device')).borderTopLeftRadius,
        screenRadius: getComputedStyle(document.querySelector('.screen')).borderTopLeftRadius,
      })`);
      assert.equal(shell.outerRadius, `${frame.outerRadius}px`);
      assert.equal(shell.screenRadius, `${frame.screenRadius}px`);
      const screenView = window.contentView.children.find(item => item.children.some(child => child.webContents === contents));
      assert.ok(screenView, 'Preview should be clipped by its device screen');
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
      if (frame.kind === 'ios' || frame.kind === 'ios-inner') assert.match(state.userAgent, /iPhone/);
      if (frame.kind === 'android') assert.match(state.userAgent, /Android/);
      if (frame.kind === 'tablet') assert.match(state.userAgent, /iPad/);
      if (frame.bezel) assert.ok(state.touches > 0);
    }

    const phone = all.find(item => item.window.getTitle() === 'iPhone 17');
    const duoFolded = all.find(item => item.window.getTitle() === 'iPhone Duo (Folded)');
    const duoOpen = all.find(item => item.window.getTitle() === 'iPhone Duo (Unfolded)');
    assert.deepEqual(await duoFolded.contents.executeJavaScript('[innerWidth, innerHeight]'), [382, 580]);
    assert.deepEqual(await duoOpen.contents.executeJavaScript('[innerWidth, innerHeight]'), [669, 867]);
    assert.equal(await duoOpen.window.webContents.executeJavaScript(
      "getComputedStyle(document.querySelector('.top-address')).display"), 'flex');
    const desktop = all.find(item => item.window.getTitle() === 'Desktop HD');
    if (process.platform === 'darwin') {
      const capture = await phone.window.capturePage();
      assert.equal(capture.toBitmap()[3], 0, 'The outer device corner should be transparent');
    }
    assert.deepEqual(await desktop.window.webContents.executeJavaScript(`[
      getComputedStyle(document.querySelector('.top-address')).display,
      getComputedStyle(document.querySelector('.bar')).display,
      document.querySelector('.top-address input').value,
      getComputedStyle(document.querySelector('.window-controls')).display
    ]`), ['flex', 'none', url, 'none']);
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
    await waitFor(async () => (await duoFolded.contents.executeJavaScript('innerWidth')) === 466);
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
    const view = previewViews(phone.window.contentView).find(item => item.webContents === phone.contents);
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
    const addedPhone = await waitFor(() => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'iPhone SE'
      && previewViews(window.contentView).some(view => view.webContents?.getURL() === redirectedUrl || view.webContents?.getURL() === url + 'redirect')));
    async function clickWindowControl(selector) {
      addedPhone.focus();
      addedPhone.webContents.focus();
      const point = await addedPhone.webContents.executeJavaScript(`(() => {
        const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
      })()`);
      addedPhone.webContents.sendInputEvent({ type: 'mouseMove', ...point });
      addedPhone.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
      addedPhone.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
    }
    assert.equal(await addedPhone.webContents.executeJavaScript(
      "getComputedStyle(document.querySelector('.window-controls')).display"), process.platform === 'win32' ? 'none' : 'flex');
    if (process.platform === 'win32') addedPhone.minimize();
    else await clickWindowControl('.window-controls .minimize');
    await waitFor(() => addedPhone.isMinimized());
    addedPhone.restore();
    await waitFor(() => !addedPhone.isMinimized());
    if (process.platform === 'win32') addedPhone.close();
    else await clickWindowControl('.window-controls .close');
    await waitFor(() => addedPhone.isDestroyed());
    assert.ok(!phone.window.isDestroyed(), 'Closing one preview should not close other devices');
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
