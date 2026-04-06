#!/usr/bin/env node

import { startServer } from '../src/server.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
  Usage: viewports [url] [options]

  Arguments:
    url                    Target URL to preview (e.g. http://localhost:3000)
                           Auto-detected from package.json if omitted.

  Options:
    -p, --port <number>    Port for the viewports server  (default: 5177)
    --no-open              Skip auto-opening the browser
    -V, --version          Print version number
    -h, --help             Display help
  `);
  process.exit(0);
}

if (args.includes('-V') || args.includes('--version')) {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json');
  console.log(pkg.version);
  process.exit(0);
}

let url = '';
let port = 5177;
let openBrowser = true;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-p' || arg === '--port') {
    port = parseInt(args[++i], 10);
  } else if (arg === '--no-open') {
    openBrowser = false;
  } else if (!arg.startsWith('-')) {
    url = arg;
  }
}

// Auto-detect URL from project's package.json if not provided
if (!url) {
  url = await detectProjectUrl();
}

await startServer({ targetUrl: url, port, openBrowser });

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

