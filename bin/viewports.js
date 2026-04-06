#!/usr/bin/env node

import { startServer } from '../src/server.js';

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
  Usage: viewports [url] [options]

  Arguments:
    url                    Target URL to preview (e.g. http://localhost:3000)

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

await startServer({ targetUrl: url, port, openBrowser });
