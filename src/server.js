import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startServer({ targetUrl, port, openBrowser }) {
  const app = express();

  // Serve static frontend assets
  app.use(express.static(join(__dirname, 'public')));

  // Pass initial config to the frontend
  app.get('/api/config', (req, res) => {
    res.json({ targetUrl: targetUrl || '' });
  });

  // Health check
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  const server = createServer(app);

  await new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const appUrl = `http://localhost:${port}`;

  console.log('');
  console.log('  \x1b[35m◈ viewports\x1b[0m  by \x1b[36mkubilaycakmak\x1b[0m  ⚡');
  console.log('');
  console.log(`  \x1b[2mServer:\x1b[0m  \x1b[36m${appUrl}\x1b[0m`);
  if (targetUrl) {
    console.log(`  \x1b[2mTarget:\x1b[0m  \x1b[36m${targetUrl}\x1b[0m`);
  }
  console.log('');
  console.log('  \x1b[2mPress Ctrl+C to stop\x1b[0m');
  console.log('');

  if (openBrowser) {
    await open(appUrl);
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  \x1b[2mStopping viewports...\x1b[0m\n');
    server.close(() => process.exit(0));
  });

  return server;
}
