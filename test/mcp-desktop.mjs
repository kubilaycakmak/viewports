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
  const opened = await call('open_preview', { url, devices: ['iphone-se', 'desktop-hd'] });
  sessionId = opened.sessionId;
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
  assert.deepEqual((await call('list_devices', { sessionId })).devices, ['desktop-hd', 'ipad-mini']);
  await call('remove_device', { sessionId, device: 'desktop-hd' });
  assert.deepEqual((await call('remove_device', { sessionId, device: 'ipad-mini' })).devices, []);
  assert.deepEqual((await call('add_device', { sessionId, device: 'iphone-17' })).devices, ['iphone-17']);
  await call('remove_device', { sessionId, device: 'iphone-17' });
  console.log('MCP desktop session test passed.');
} finally {
  await client.close();
  server.closeAllConnections();
  server.close();
}
