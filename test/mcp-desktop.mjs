import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><title>Viewports MCP test</title><h1>MCP preview</h1>');
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../bin/viewports.js', import.meta.url)), 'mcp'],
  stderr: 'pipe',
});
transport.stderr.on('data', chunk => process.stderr.write(chunk));
const client = new Client({ name: 'viewports-test', version: '1.0.0' });

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return result.structuredContent;
}

let sessionId;
try {
  await client.connect(transport);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const opened = await call('open_preview', { url, devices: ['iphone-se', 'desktop-hd'], textSize: 'large' });
  sessionId = opened.sessionId;
  assert.equal(opened.textSize, 'large');
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

  const plain = await call('open_preview', {
    url, devices: ['iphone-se'], areas: { top: false, bottom: false },
  });
  assert.deepEqual(plain.areas, { top: false, bottom: false });
  assert.equal(plain.devices[0].viewportHeight, 667);
  await call('remove_device', { sessionId: plain.sessionId, device: 'iphone-se' });
  console.log('MCP desktop session test passed.');
} finally {
  await client.close();
  server.closeAllConnections();
  server.close();
}
