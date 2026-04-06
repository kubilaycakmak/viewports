import { createServer } from 'http';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
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

export async function startServer({ targetUrl, port, openBrowser: shouldOpen }) {
  const publicDir = join(__dirname, 'public');

  const server = createServer(async (req, res) => {
    // API: config
    if (req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // fromCli=true tells the frontend to override localStorage with this URL
      return res.end(JSON.stringify({ targetUrl: targetUrl || '', fromCli: !!targetUrl }));
    }

    // API: health
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }

    // Dev proxy: strips X-Frame-Options & CSP frame-ancestors so iframes load
    if (req.url.startsWith('/dev-proxy')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const target = params.get('url');
      if (!target) { res.writeHead(400); return res.end('Missing url param'); }

      const makeProxyRequest = (targetUrl, redirectsLeft) => {
        let t;
        try { t = new URL(targetUrl); } catch (e) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          return res.end(proxyErrorHtml(targetUrl, 'Invalid URL: ' + e.message));
        }
        const requester = t.protocol === 'https:' ? httpsRequest : httpRequest;
        const proxyReq = requester(
          { hostname: t.hostname, port: +t.port || (t.protocol === 'https:' ? 443 : 80),
            path: (t.pathname || '/') + t.search, method: 'GET',
            headers: { accept: 'text/html,*/*', 'user-agent': 'viewports-proxy/2.2' } },
          async (proxyRes) => {
            // Follow redirects (301/302/303/307/308) back through our own proxy
            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && redirectsLeft > 0) {
              const loc = proxyRes.headers['location'];
              if (loc) {
                const newUrl = new URL(loc, targetUrl).href;
                // Redirect the browser to our proxy with the new URL
                res.writeHead(302, { location: `/dev-proxy?url=${encodeURIComponent(newUrl)}` });
                return res.end();
              }
            }

            const headers = { ...proxyRes.headers };
            delete headers['x-frame-options'];
            delete headers['x-frame-options']; // belt-and-suspenders
            if (headers['content-security-policy']) {
              headers['content-security-policy'] = headers['content-security-policy']
                .replace(/frame-ancestors[^;]*(;|$)/gi, '');
            }
            const ct = headers['content-type'] || '';
            if (ct.includes('text/html')) {
              const chunks = [];
              try {
                for await (const chunk of proxyRes) chunks.push(chunk);
              } catch (e) {
                res.writeHead(502, { 'Content-Type': 'text/html' });
                return res.end(proxyErrorHtml(targetUrl, 'Stream error: ' + e.message));
              }
              let html = Buffer.concat(chunks).toString('utf8');
              // Inject <base> so relative assets resolve to target origin
              if (!/<base\b/i.test(html)) {
                html = html.replace(/(<head[^>]*>)/i, `$1<base href="${targetUrl}">`);
                if (!html.includes('<base')) html = `<base href="${targetUrl}">` + html;
              }
              delete headers['content-length'];
              res.writeHead(proxyRes.statusCode, headers);
              res.end(html);
            } else {
              res.writeHead(proxyRes.statusCode, headers);
              proxyRes.pipe(res);
            }
          }
        );
        proxyReq.on('error', (e) => {
          if (res.headersSent) return;
          res.writeHead(502, { 'Content-Type': 'text/html' });
          res.end(proxyErrorHtml(targetUrl, e.code === 'ECONNREFUSED'
            ? `Connection refused — is the dev server running on ${t.hostname}:${t.port}?`
            : e.message));
        });
        proxyReq.end();
      };

      makeProxyRequest(target, 5);
      return;
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
