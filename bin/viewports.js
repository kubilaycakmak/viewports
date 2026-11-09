#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createPreviewRequest, DEFAULT_DEVICES, DEVICE_IDS } from '../src/desktop/request.js';
import { DEVICE_GROUPS } from '../src/public/devices.js';
import { TEXT_SIZES } from '../src/desktop/presentation.js';

try {
  await run(process.argv.slice(2));
} catch (error) {
  if (error.name === 'ExitPromptError') {
    console.error('Selection cancelled.');
    process.exitCode = 130;
  } else {
    console.error(`viewports: ${error.message}`);
    process.exitCode = 1;
  }
}

async function run(args) {
  const command = ['web', 'mcp'].includes(args[0]) ? args.shift() : 'desktop';
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      devices: { type: 'string' },
      'text-size': { type: 'string' },
      port: { type: 'string', short: 'p' },
      'no-open': { type: 'boolean' },
      version: { type: 'boolean', short: 'V' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`Usage:
  viewports [url] [--devices <ids>] [--text-size <size>]
                                       Open live previews in desktop windows
  viewports mcp                        Start the local MCP server over stdio
  viewports web [url] [--port <port>] [--no-open]
                                       Open the original browser canvas

Desktop defaults to iPhone 17, iPad Pro 11, and Desktop HD.
Choose devices interactively, or pass comma-separated preset IDs.
Text sizes: default, large, extra-large
Preset IDs: ${DEVICE_IDS.join(', ')}
  -h, --help      Display help
  -V, --version   Print version number`);
    return;
  }

  if (values.version || command === 'mcp') {
    const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    if (values.version) {
      console.log(version);
      return;
    }
    if (positionals.length || Object.keys(values).length) {
      throw new Error('Usage: viewports mcp');
    }
    const { startMcp } = await import('../src/mcp.js');
    await startMcp(version);
    return;
  }

  if (positionals.length > 1) throw new Error('Pass one URL. See viewports --help.');
  const [url] = positionals;
  if (command === 'web' || values.port !== undefined || values['no-open']) {
    if (values.devices !== undefined || values['text-size'] !== undefined) {
      throw new Error('--devices and --text-size are only available in desktop mode.');
    }
    const port = Number(values.port ?? 5177);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('--port must be an integer from 1 to 65535.');
    }
    const { startServer } = await import('../src/server.js');
    await startServer({ targetUrl: url || await detectProjectUrl(), port, openBrowser: !values['no-open'] });
    return;
  }

  const target = url || await detectRunningProjectUrl();
  let devices = values.devices?.split(',').map(id => id.trim());
  let textSize = values['text-size'];
  if (!devices && process.stdin.isTTY && process.stdout.isTTY) {
    const { default: checkbox, Separator } = await import('@inquirer/checkbox');
    devices = await checkbox({
      message: 'Select devices',
      choices: DEVICE_GROUPS.flatMap(group => [
        new Separator(`── ${group.label} ──`),
        ...group.devices.map(device => ({
          name: `${device.name}  ${device.width} × ${device.height}`,
          value: device.id,
          checked: DEFAULT_DEVICES.includes(device.id),
        })),
      ]),
      pageSize: 18,
      validate: selected => selected.length > 0 || 'Select at least one device.',
    });
    if (!textSize) {
      const { default: select } = await import('@inquirer/select');
      textSize = await select({
        message: 'Select text size',
        choices: Object.entries(TEXT_SIZES).map(([value, size]) => ({
          name: `${size.label} (${Math.round(size.scale * 100)}%)`,
          value,
        })),
      });
    }
  }
  const request = createPreviewRequest(target, devices, textSize);
  const { launchDesktop } = await import('../src/desktop/launch.js');
  await launchDesktop(request);
  console.log(`Opened ${request.devices.map(({ name }) => name).join(', ')} for ${request.url}`);
}

async function detectRunningProjectUrl() {
  const url = await detectProjectUrl();
  if (url) {
    try {
      await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(1500) });
      return url;
    } catch {
      throw new Error(`Could not reach ${url}. Start your dev server or pass its URL explicitly.`);
    }
  }
  throw new Error('Could not detect a dev server URL. Run viewports http://localhost:3000.');
}

async function detectProjectUrl() {
  // Known framework default ports
  const FRAMEWORK_PORTS = [
    { pattern: /\bvite\b/,           port: 5173 }, // Vite, SvelteKit
    { pattern: /\bnext\s+dev\b/,     port: 3000 }, // Next.js
    { pattern: /\bnuxt\b/,           port: 3000 }, // Nuxt
    { pattern: /\bremix\b/,          port: 3000 }, // Remix
    { pattern: /\breact-scripts\b/,  port: 3000 }, // CRA
    { pattern: /\bangular\b|ng\s+serve\b/, port: 4200 }, // Angular
    { pattern: /\bastro\b/,          port: 4321 }, // Astro
    { pattern: /\bvue-cli-service\b/, port: 8080 }, // Vue CLI
    { pattern: /\bparcel\b/,         port: 1234 }, // Parcel
    { pattern: /\bsvelte-kit\b/,     port: 5173 }, // SvelteKit legacy
  ];

  try {
    const raw = await readFile(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    const scripts = pkg.scripts || {};

    // Check dev, start, serve, preview scripts in priority order
    const candidates = ['dev', 'start', 'serve', 'preview', 'develop'];

    for (const name of candidates) {
      const script = scripts[name];
      if (!script) continue;

      // Explicit port in script: --port 3000 or -p 3000 or PORT=3000
      const portMatch = script.match(/(?:--port|-p)\s+(\d{4,5})|PORT=(\d{4,5})/);
      if (portMatch) {
        const p = portMatch[1] || portMatch[2];
        return `http://localhost:${p}`;
      }

      // Framework detection
      for (const { pattern, port } of FRAMEWORK_PORTS) {
        if (pattern.test(script)) return `http://localhost:${port}`;
      }
    }
  } catch {
    // No package.json or unreadable — silently skip
  }

  return '';
}

