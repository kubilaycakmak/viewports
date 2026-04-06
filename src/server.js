import { createServer } from 'http';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { connect as netConnect } from 'net';
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

function proxyErrorHtml(url, message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
min-height:100vh;margin:0;background:#0d0d0d;color:#ccc;}
.box{text-align:center;padding:2rem;max-width:400px;}
.icon{font-size:2.5rem;margin-bottom:.5rem;}
h3{margin:.5rem 0;color:#fff;font-size:1rem;}
p{margin:.5rem 0;font-size:.8rem;line-height:1.5;}
code{background:#1a1a1a;padding:.2em .4em;border-radius:4px;font-size:.75rem;color:#f87171;}
</style></head><body>
<div class="box">
  <div class="icon">⚠️</div>
  <h3>Cannot load page</h3>
  <p>${message}</p>
  <code>${url}</code>
</div>
</body></html>`;
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd);
}

// Find an available TCP port starting from `start`
async function findAvailablePort(start) {
  for (let p = start; p < start + 50; p++) {
    const ok = await new Promise(resolve => {
      const s = createServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(p);
    });
    if (ok) return p;
  }
  return null;
}

/**
 * Transparent HTTP/WS proxy.
 * All requests are forwarded to the current target with:
 *   - X-Frame-Options removed
 *   - Access-Control-Allow-Origin: * added
 *   - CSP frame-ancestors removed
 * No content rewriting — assets/fonts/WS all just work.
 */
function createTransparentProxy(getTarget) {
  const proxy = createServer((req, res) => {
    const rawTarget = getTarget();
    if (!rawTarget) {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      return res.end(proxyErrorHtml('', 'No target URL set. Enter a URL in the viewports toolbar.'));
    }
    let t;
    try { t = new URL(rawTarget); } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      return res.end(proxyErrorHtml(rawTarget, 'Invalid target URL'));
    }

    const targetPort = +t.port || (t.protocol === 'https:' ? 443 : 80);
    const requester  = t.protocol === 'https:' ? httpsRequest : httpRequest;

    const fwdHeaders = { ...req.headers };
    fwdHeaders['host'] = t.hostname + (t.port ? ':' + t.port : '');
    // Avoid breaking CORS pre-flight on the target
    delete fwdHeaders['origin'];
    delete fwdHeaders['referer'];

    const proxyReq = requester(
      { hostname: t.hostname, port: targetPort,
        path: req.url, method: req.method, headers: fwdHeaders },
      (proxyRes) => {
        const h = { ...proxyRes.headers };
        delete h['x-frame-options'];
        h['access-control-allow-origin']      = '*';
        h['access-control-allow-credentials'] = 'true';
        if (h['content-security-policy']) {
          h['content-security-policy'] = h['content-security-policy']
            .replace(/frame-ancestors[^;]*(;|$)/gi, '');
        }
        res.writeHead(proxyRes.statusCode, h);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', (e) => {
      if (res.headersSent) return;
      res.writeHead(502, { 'Content-Type': 'text/html' });
      res.end(proxyErrorHtml(rawTarget, e.code === 'ECONNREFUSED'
        ? `Connection refused — is the dev server running on ${t.hostname}:${targetPort}?`
        : e.message));
    });
    req.pipe(proxyReq);
  });

  // WebSocket upgrade forwarding (for HMR, WS APIs)
  proxy.on('upgrade', (req, socket, head) => {
    const rawTarget = getTarget();
    if (!rawTarget) return socket.destroy();
    let t;
    try { t = new URL(rawTarget); } catch { return socket.destroy(); }
    const targetPort = +t.port || 80;

    const targetSocket = netConnect(targetPort, t.hostname, () => {
      targetSocket.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
      for (const [k, v] of Object.entries(req.headers)) {
        if (k === 'host') targetSocket.write(`host: ${t.hostname}:${targetPort}\r\n`);
        else targetSocket.write(`${k}: ${v}\r\n`);
      }
      targetSocket.write('\r\n');
      if (head && head.length) targetSocket.write(head);
      targetSocket.pipe(socket);
      socket.pipe(targetSocket);
    });
    targetSocket.on('error', () => socket.destroy());
    socket.on('error', () => targetSocket.destroy());
  });

  return proxy;
}

export async function startServer({ targetUrl, port, openBrowser: shouldOpen }) {
  const publicDir = join(__dirname, 'public');
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Mutable proxy target (updated live when user changes URL in toolbar)
  let currentTarget = targetUrl || '';

  // Start transparent proxy on port+1 (finds next available)
  let proxyPort = null;
  try {
    proxyPort = await findAvailablePort(port + 1);
    const tProxy = createTransparentProxy(() => currentTarget);
    await new Promise((resolve, reject) =>
      tProxy.listen(proxyPort, (err) => err ? reject(err) : resolve())
    );
  } catch {
    proxyPort = null; // fall back to /dev-proxy path
  }

  const server = createServer(async (req, res) => {
    // API: config — returns sessionId + proxyPort for frontend
    if (req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({
        targetUrl: currentTarget,
        fromCli: !!targetUrl,
        sessionId,
        proxyPort,
      }));
    }

    // API: set-target — update proxy target when user types a URL
    if (req.url.startsWith('/api/set-target')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      currentTarget = params.get('url') || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, proxyPort }));
    }

    // API: health
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // API: probe — quick reachability check
    if (req.url.startsWith('/api/probe')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const target = params.get('url');
      if (!target) { res.writeHead(400); return res.end('{}'); }
      try {
        const t = new URL(target);
        const requester = t.protocol === 'https:' ? httpsRequest : httpRequest;
        const probeReq = requester(
          { hostname: t.hostname, port: +t.port || (t.protocol === 'https:' ? 443 : 80),
            path: '/', method: 'HEAD', timeout: 3000,
            headers: { 'user-agent': 'viewports-probe' } },
          (r) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, status: r.statusCode }));
            r.resume();
          }
        );
        probeReq.on('timeout', () => probeReq.destroy());
        probeReq.on('error', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false }));
        });
        probeReq.end();
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      }
      return;
    }

    // Static files (viewports UI)
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = join(publicDir, filePath.split('?')[0]);
    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(port, (err) => err ? reject(err) : resolve());
  });

  const appUrl = `http://localhost:${port}`;

  console.log('');
  console.log('  \x1b[35m◈ viewports\x1b[0m  by \x1b[36mkubilaycakmak\x1b[0m  ⚡');
  console.log('');
  console.log(`  \x1b[2mServer:\x1b[0m  \x1b[36m${appUrl}\x1b[0m`);
  if (currentTarget) {
    console.log(`  \x1b[2mTarget:\x1b[0m  \x1b[36m${currentTarget}\x1b[0m`);
  } else {
    console.log(`  \x1b[2mTarget:\x1b[0m  \x1b[33mnot set — enter a URL in the toolbar\x1b[0m`);
  }
  if (proxyPort) {
    console.log(`  \x1b[2mProxy:\x1b[0m   \x1b[36mhttp://localhost:${proxyPort}\x1b[0m`);
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
