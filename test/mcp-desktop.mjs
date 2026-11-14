import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Viewports MCP test</title><style>body{height:1800px;background:linear-gradient(red,blue)}</style><h1>MCP preview</h1>');
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../bin/viewports.js', import.meta.url)), 'mcp'],
  // The MCP SDK intentionally filters its inherited environment, including DISPLAY on Linux.
  ...(process.platform === 'linux' ? { env: Object.fromEntries(
    ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR']
      .filter(name => process.env[name]).map(name => [name, process.env[name]]),
  ) } : {}),
  stderr: 'pipe',
});
transport.stderr.on('data', chunk => process.stderr.write(chunk));
const client = new Client({ name: 'viewports-test', version: '1.0.0' });
const testSessions = new Set();

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  if (name === 'open_preview') testSessions.add(result.structuredContent.sessionId);
  return result.structuredContent;
}

let sessionId;
try {
  await client.connect(transport);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const opened = await call('open_preview', { url, devices: ['iphone-se', 'desktop-hd'], textSize: 'large' });
  sessionId = opened.sessionId;
  assert.equal(opened.textSize, 'large');
  const screenshot = await client.callTool({ name: 'capture_screenshot', arguments: { sessionId, device: 'iphone-se', mode: 'viewport' } });
  assert.notEqual(screenshot.isError, true, JSON.stringify(screenshot));
  assert.equal(screenshot.content[0].type, 'image');
  assert.equal(screenshot.content[0].mimeType, 'image/png');
  const visible = Buffer.from(screenshot.content[0].data, 'base64');
  assert.equal(visible.subarray(1, 4).toString(), 'PNG');
  const fullScreenshot = await client.callTool({ name: 'capture_screenshot', arguments: { sessionId, device: 'iphone-se', mode: 'full-page' } });
  assert.notEqual(fullScreenshot.isError, true, JSON.stringify(fullScreenshot));
  const full = Buffer.from(fullScreenshot.content[0].data, 'base64');
  assert.ok(full.readUInt32BE(20) > visible.readUInt32BE(20));
  const closedDevice = await client.callTool({ name: 'capture_screenshot', arguments: { sessionId, device: 'ipad-mini', mode: 'viewport' } });
  assert.equal(closedDevice.isError, true);
  assert.deepEqual(opened.areas, { top: true, bottom: true });
  assert.equal(opened.devices[1].viewportHeight, 1032);
  const nextUrl = url + 'mcp-navigation';
  const navigated = await call('navigate_preview', { sessionId, url: nextUrl });
  assert.equal(navigated.url, nextUrl);
  const rejected = await client.callTool({ name: 'navigate_preview', arguments: { sessionId, url: 'file:///etc/passwd' } });
  assert.equal(rejected.isError, true);
  assert.equal((await call('list_devices', { sessionId })).url, nextUrl);
  const hiddenTop = await call('set_device_areas', { sessionId, areas: { top: false, bottom: true } });
  assert.deepEqual(hiddenTop.areas, { top: false, bottom: true });
  assert.equal(hiddenTop.viewports[0].viewportHeight, 585);
  assert.equal(hiddenTop.viewports[1].viewportHeight, 1080);
  const noAreas = await call('set_device_areas', { sessionId, areas: { top: false, bottom: false } });
  assert.equal(noAreas.viewports[0].viewportHeight, 667);
  const addedWithoutAreas = await call('add_device', { sessionId, device: 'ipad-mini' });
  assert.equal(addedWithoutAreas.viewports[2].viewportHeight, 1024);
  await call('remove_device', { sessionId, device: 'ipad-mini' });
  await call('set_device_areas', { sessionId, areas: { top: true, bottom: true } });
  assert.deepEqual([opened.devices[0].viewportWidth, opened.devices[0].viewportHeight], [375, 559]);
  assert.equal((await call('set_text_size', { sessionId, textSize: 'extra-large' })).textSize, 'extra-large');
  assert.deepEqual(opened.devices.map(device => device.id), ['iphone-se', 'desktop-hd']);
  const added = await Promise.all([
    call('add_device', { sessionId, device: 'ipad-mini' }),
    call('add_device', { sessionId, device: 'ipad-mini' }),
  ]);
  for (const result of added) {
    assert.deepEqual(result.devices, ['iphone-se', 'desktop-hd', 'ipad-mini']);
  }
  assert.deepEqual((await call('remove_device', { sessionId, device: 'iphone-se' })).devices,
    ['desktop-hd', 'ipad-mini']);
  const status = await call('list_devices', { sessionId });
  assert.deepEqual(status.devices, ['desktop-hd', 'ipad-mini']);
  assert.equal(status.textSize, 'extra-large');
  assert.deepEqual([status.viewports[1].viewportWidth, status.viewports[1].viewportHeight], [768, 928]);
  await call('remove_device', { sessionId, device: 'desktop-hd' });
  assert.deepEqual((await call('remove_device', { sessionId, device: 'ipad-mini' })).devices, []);
  assert.deepEqual((await call('add_device', { sessionId, device: 'iphone-17' })).devices, ['iphone-17']);
  await call('remove_device', { sessionId, device: 'iphone-17' });

  const foldables = await call('open_preview', {
    url, devices: ['iphone-duo-folded', 'iphone-duo-unfolded', 'galaxy-z-fold8-unfolded'],
  });
  assert.deepEqual(foldables.devices.map(device => [device.viewportWidth, device.viewportHeight]),
    [[382, 580], [669, 867], [816, 512]]);
  const foldablesHidden = await call('set_device_areas', {
    sessionId: foldables.sessionId, areas: { top: false, bottom: false },
  });
  assert.deepEqual(foldablesHidden.viewports.map(device => [device.viewportWidth, device.viewportHeight]),
    [[466, 678], [669, 951], [816, 616]]);
  for (const device of foldablesHidden.devices) {
    await call('remove_device', { sessionId: foldables.sessionId, device });
  }

  const plain = await call('open_preview', {
    url, devices: ['iphone-se'], areas: { top: false, bottom: false },
  });
  assert.deepEqual(plain.areas, { top: false, bottom: false });
  assert.equal(plain.devices[0].viewportHeight, 667);
  await call('remove_device', { sessionId: plain.sessionId, device: 'iphone-se' });
  console.log('MCP desktop session test passed.');
} finally {
  // MCP windows deliberately survive disconnects; close test-owned windows even after a failed assertion.
  for (const id of testSessions) {
    try {
      const state = await call('list_devices', { sessionId: id });
      for (const device of state.devices) await call('remove_device', { sessionId: id, device });
    } catch (error) {
      console.error(`Could not close test preview ${id}: ${error.message}`);
    }
  }
  await client.close();
  server.closeAllConnections();
  server.close();
}
