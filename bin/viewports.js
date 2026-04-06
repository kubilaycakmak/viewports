#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from '../src/server.js';

const program = new Command();

program
  .name('viewports')
  .description('Responsive preview tool — see your site at every screen size simultaneously')
  .version('1.0.0')
  .argument('[url]', 'URL to preview (e.g. http://localhost:3000)', '')
  .option('-p, --port <number>', 'Port for the viewports server', '5177')
  .option('--no-open', 'Do not automatically open browser')
  .action(async (url, options) => {
    await startServer({
      targetUrl: url,
      port: parseInt(options.port, 10),
      openBrowser: options.open,
    });
  });

program.parse();
