import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import lockfile from 'proper-lockfile';

const require = createRequire(import.meta.url);
const installer = require.resolve('electron/install.js');
const electronDir = dirname(installer);
const electronVersion = require('electron/package.json').version;
const MIRROR = 'https://npmmirror.com/mirrors/electron/';
const TIMEOUT_MS = 300_000;
let installation;

function hasCustomSource(env) {
  const sourceSetting = /^(?:(?:npm_config|npm_package_config)_)?electron_(?:mirror|nightly_?mirror|custom_?(?:dir|filename|version)|use_remote_checksums)$/i;
  return Object.entries(env).some(([key, value]) => value && sourceSetting.test(key));
}

function isTemporaryFailure(result) {
  if (result.timedOut) return true;
  const message = result.message;
  if (/checksum|EACCES|EPERM|ENOSPC|EROFS/i.test(message)) return false;
  return /(?:response code|HTTP(?:Error)?(?: response)?)[\s:]*(?:429|5\d\d)\b/i.test(message)
    || /\b(?:ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT)\b/i.test(message)
    || /\bfetch failed\b/i.test(message);
}

function describeFailure(result) {
  if (result.timedOut) return 'Download timed out.';
  return result.message.split(/\r?\n/).map(line => line.trim())
    .find(line => /error|HTTP|EACCES|EPERM|ENOSPC|EROFS/i.test(line))
    || `Installer exited with code ${result.code ?? 'unknown'}.`;
}

function runInstaller(env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [installer], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let message = '';
    let timedOut = false;
    let settled = false;
    const progress = setTimeout(() => {
      process.stderr.write('Preparing Electron for the desktop preview...\n');
    }, 1000);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);

    function finish(code, error) {
      if (settled) return;
      settled = true;
      clearTimeout(progress);
      clearTimeout(timeout);
      resolve({ code, message: error?.message || message, timedOut });
    }

    child.stderr.on('data', chunk => {
      message = (message + chunk.toString()).slice(-32_768);
    });
    child.once('error', error => finish(null, error));
    child.once('close', code => finish(code));
  });
}

async function install() {
  const env = { ...process.env };
  let result = await runInstaller(env);
  if (result.code === 0) return;

  if (isTemporaryFailure(result)) {
    process.stderr.write('Electron download failed temporarily. Retrying...\n');
    await new Promise(resolve => setTimeout(resolve, 1000));
    result = await runInstaller(env);
    if (result.code === 0) return;

    if (isTemporaryFailure(result) && !hasCustomSource(env)) {
      process.stderr.write('Electron download is unavailable. Trying the documented mirror...\n');
      result = await runInstaller({
        ...env,
        ELECTRON_MIRROR: MIRROR,
        ELECTRON_CUSTOM_DIR: '{{ version }}',
      });
      if (result.code === 0) return;
    }
  }

  throw new Error(`Electron setup failed. ${describeFailure(result)}`);
}

async function isInstalled() {
  try {
    const [version, executable] = await Promise.all([
      readFile(join(electronDir, 'dist', 'version'), 'utf8'),
      readFile(join(electronDir, 'path.txt'), 'utf8'),
    ]);
    if (version.trim().replace(/^v/, '') !== electronVersion) return false;
    await access(join(electronDir, 'dist', executable.trim()));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

export function ensureElectron() {
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) return Promise.resolve();
  if (!installation) {
    installation = (async () => {
      if (await isInstalled() && !await lockfile.check(electronDir, { stale: 30_000 })) return;
      const release = await lockfile.lock(electronDir, {
        stale: 30_000,
        update: 10_000,
        retries: { retries: 930, minTimeout: 1000, maxTimeout: 1000, factor: 1 },
      });
      try {
        if (!await isInstalled()) await install();
      } finally {
        await release();
      }
    })().finally(() => {
      installation = undefined;
    });
  }
  return installation;
}
