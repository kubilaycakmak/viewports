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

// ─── Page crawler helpers ─────────────────────────────────────────────────────

function fetchUrlText(urlStr, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let t;
    try { t = new URL(urlStr); } catch (e) { return reject(e); }
    const requester = t.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requester(
      { hostname: t.hostname, port: +t.port || (t.protocol === 'https:' ? 443 : 80),
        path: t.pathname + (t.search || ''), method: 'GET', timeout: timeoutMs,
        headers: { 'user-agent': 'viewports-crawler/1.0', accept: '*/*' } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    req.end();
  });
}

function parseSitemapXml(xml) {
  const urls = [];
  const re = /<loc[^>]*>\s*([^<]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) urls.push(m[1].trim().replace(/&amp;/g, '&'));
  return urls;
}

function parseSitemapFromRobots(text) {
  const sitemaps = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^Sitemap:\s*(.+)/i);
    if (m) sitemaps.push(m[1].trim());
  }
  return sitemaps;
}

function parseHtmlLinks(html, baseUrl) {
  const links = new Set();
  const origin = new URL(baseUrl).origin;
  const skipExt = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|pdf|zip|gz)$/i;
  const re = /href=["']([^"'#?][^"']*?)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || /^(mailto:|javascript:|tel:)/.test(href)) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin === origin && !skipExt.test(resolved.pathname))
        links.add(resolved.origin + resolved.pathname);
    } catch {}
  }
  return [...links];
}

function injectProxyRuntime(html, targetUrl, proxyPort) {
  let target;
  try { target = new URL(targetUrl); } catch { return html; }

  const runtime = `<script>(function(){var TARGET_ORIGIN=${JSON.stringify(target.origin)};var PROXY_ORIGIN=${JSON.stringify(`http://localhost:${proxyPort}`)};var PROXY_PORT=${proxyPort};function rewrite(url){try{var next=new URL(String(url),window.location.href);if(next.origin===TARGET_ORIGIN){return PROXY_ORIGIN+next.pathname+next.search+next.hash;}if((next.hostname==='localhost'||next.hostname==='127.0.0.1')&&next.port&&next.port!==String(PROXY_PORT)){return PROXY_ORIGIN+'/_proxy_/'+next.port+next.pathname+next.search+next.hash;}}catch(e){}return url;}var originalFetch=window.fetch;if(typeof originalFetch==='function'){window.fetch=function(input,init){if(typeof input==='string'||input instanceof URL){return originalFetch.call(this,rewrite(input),init);}if(input&&input.url){return originalFetch.call(this,new Request(rewrite(input.url),input),init);}return originalFetch.call(this,input,init);};}var originalOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){var args=Array.prototype.slice.call(arguments);args[1]=rewrite(url);return originalOpen.apply(this,args);};try{var _la=window.location.assign.bind(window.location);window.location.assign=function(u){_la(rewrite(u));}}catch(e){}try{var _lr=window.location.replace.bind(window.location);window.location.replace=function(u){_lr(rewrite(u));}}catch(e){}if(window.history){try{var _ps=window.history.pushState.bind(window.history);window.history.pushState=function(s,t,u){_ps(s,t,u?rewrite(u):u);};}catch(e){}try{var _rs=window.history.replaceState.bind(window.history);window.history.replaceState=function(s,t,u){_rs(s,t,u?rewrite(u):u);};}catch(e){}}})();</script>`;

  if (html.includes('</head>')) return html.replace('</head>', `${runtime}</head>`);
  if (html.includes('</body>')) return html.replace('</body>', `${runtime}</body>`);
  return runtime + html;
}

/**
 * Transparent HTTP/WS proxy.
 * All requests are forwarded to the current target with:
 *   - X-Frame-Options removed
 *   - Access-Control-Allow-Origin: * added
 *   - CSP frame-ancestors removed
 *   - HTML pages patched so absolute target-origin fetch/XHR calls are rewritten
 *     through the local proxy port
 */
function createTransparentProxy(getTarget, proxyPort) {
  const proxy = createServer((req, res) => {
    // ── Sub-proxy: /_proxy_/:port/* ────────────────────────────────────────────
    // Routes requests from proxied pages to OTHER localhost services (e.g. a
    // backend API on a different port). Avoids CORS errors inside iframes by
    // keeping all traffic on the same proxy origin.
    const subMatch = req.url.match(/^\/_proxy_\/(\d+)(\/.*)?$/);
    if (subMatch) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        });
        return res.end();
      }
      const tPort = parseInt(subMatch[1], 10);
      const tPath = subMatch[2] || '/';
      const fwdH  = { ...req.headers, host: `localhost:${tPort}` };
      delete fwdH['origin'];
      delete fwdH['referer'];
      const pr = httpRequest(
        { hostname: 'localhost', port: tPort, path: tPath, method: req.method, headers: fwdH },
        (pRes) => {
          const h = { ...pRes.headers };
          h['access-control-allow-origin']      = '*';
          h['access-control-allow-credentials'] = 'true';
          delete h['x-frame-options'];
          res.writeHead(pRes.statusCode, h);
          pRes.pipe(res);
        }
      );
      pr.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end(); } });
      req.pipe(pr);
      return;
    }

    // ── Main proxy: forward to target URL ─────────────────────────────────────
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
        // Rewrite absolute Location headers so 3xx redirects stay within the proxy
        // rather than bouncing the iframe back to the raw target origin.
        if (h['location'] && proxyPort) {
          try {
            const locUrl = new URL(h['location']);
            if (locUrl.origin === t.origin) {
              h['location'] = `http://localhost:${proxyPort}${locUrl.pathname}${locUrl.search}${locUrl.hash}`;
            }
          } catch {}
        }
        const contentType= String(h['content-type'] || '');
        const contentEncoding = String(h['content-encoding'] || '');
        const shouldInject = proxyPort
          && contentType.includes('text/html')
          && (!contentEncoding || contentEncoding === 'identity');

        if (!shouldInject) {
          res.writeHead(proxyRes.statusCode, h);
          proxyRes.pipe(res);
          return;
        }

        let body = '';
        proxyRes.setEncoding('utf8');
        proxyRes.on('data', (chunk) => { body += chunk; });
        proxyRes.on('end', () => {
          delete h['content-length'];
          res.writeHead(proxyRes.statusCode, h);
          res.end(injectProxyRuntime(body, rawTarget, proxyPort));
        });
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
        const tProxy = createTransparentProxy(() => currentTarget, proxyPort);
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

    // API: crawl-pages — discover pages via sitemap.xml, robots.txt, or HTML links
    if (req.url.startsWith('/api/crawl-pages')) {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const target = params.get('url');
      if (!target) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Missing url param' }));
      }
      let base;
      try { base = new URL(target); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid URL' }));
      }
      (async () => {
        let pages = [];
        let source = 'crawl';

        // 1. Collect sitemap URLs from robots.txt, then always try /sitemap.xml
        const sitemapUrls = [`${base.origin}/sitemap.xml`];
        try {
          const { body } = await fetchUrlText(`${base.origin}/robots.txt`);
          for (const s of parseSitemapFromRobots(body))
            if (!sitemapUrls.includes(s)) sitemapUrls.push(s);
        } catch {}

        // 2. Try each sitemap
        for (const sUrl of sitemapUrls) {
          try {
            const { status, body } = await fetchUrlText(sUrl);
            if (status === 200 && body.includes('<loc')) {
              const locs = parseSitemapXml(body).filter(u => {
                try { return new URL(u).origin === base.origin; } catch { return false; }
              });
              if (locs.length > 0) {
                pages = locs.map(u => ({ url: u, path: new URL(u).pathname || '/', source: 'sitemap' }));
                source = 'sitemap';
                break;
              }
            }
          } catch {}
        }

        // 3. Fallback: parse <a href> links from root HTML
        if (pages.length === 0) {
          try {
            const rootUrl = base.origin + (base.pathname || '/');
            const { body } = await fetchUrlText(rootUrl);
            const links = parseHtmlLinks(body, rootUrl);
            const allUrls = new Set([base.origin + '/']);
            for (const l of links) allUrls.add(l);
            pages = [...allUrls].map(u => ({ url: u, path: new URL(u).pathname || '/', source: 'crawl' }));
            source = 'crawl';
          } catch (e) {
            const message = e?.message || e?.code || 'Failed to fetch target';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: message, pages: [] }));
          }
        }

        // Deduplicate, sort, limit to 60
        const seen = new Set();
        pages = pages
          .filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true; })
          .sort((a, b) => a.path.localeCompare(b.path))
          .slice(0, 60);

        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ pages, source, total: pages.length }));
      })().catch(e => {
        const message = e?.message || e?.code || 'Failed to fetch target';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message, pages: [] }));
      });
      return;
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
