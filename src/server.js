import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd);
}

export async function startServer({ targetUrl, port, openBrowser: shouldOpen }) {
  const publicDir = join(__dirname, 'public');

  const server = createServer(async (req, res) => {
    // API: config
    if (req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ targetUrl: targetUrl || '' }));
    }

    // API: health
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Static files
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = join(publicDir, filePath.split('?')[0]);

    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

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
  } else {
    console.log(`  \x1b[2mTarget:\x1b[0m  \x1b[33mnot set — enter a URL in the toolbar\x1b[0m`);
  }
  console.log('');
  console.log('  \x1b[2mPress Ctrl+C to stop\x1b[0m');
  console.log('');

  if (shouldOpen) openBrowser(appUrl);

  process.on('SIGINT', () => {
    console.log('\n  \x1b[2mStopping viewports...\x1b[0m\n');
    server.close(() => process.exit(0));
  });

  return server;
}
