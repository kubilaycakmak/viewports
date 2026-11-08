import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const source = fileURLToPath(new URL('../src/desktop/install-electron.js', import.meta.url));

const fakeInstaller = `
const fs = require('node:fs');
const logPath = process.env.FAKE_INSTALL_LOG;
const marker = process.env.FAKE_INSTALLED;
const previous = fs.existsSync(logPath)
  ? fs.readFileSync(logPath, 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse)
  : [];
const mirror = process.env.npm_config_electron_mirror || process.env.NPM_CONFIG_ELECTRON_MIRROR ||
  process.env.ELECTRON_MIRROR || '';
function log(event) {
  fs.appendFileSync(logPath, JSON.stringify({ event, mirror }) + '\\n');
}
console.log('INSTALLER_STDOUT_MUST_NOT_REACH_MCP');
if (fs.existsSync(marker)) {
  log('already-installed');
  process.exit(0);
}
log('attempt');
const scenario = process.env.FAKE_SCENARIO;
if (scenario === 'checksum' || (scenario === 'retry-then-checksum' && previous.some(row => row.event === 'attempt'))) {
  console.error('ChecksumMismatchError: checksum does not match');
  process.exit(1);
}
if (scenario === 'permission') {
  console.error('Error: EACCES: permission denied');
  process.exit(1);
}
if (scenario === 'network-always' || scenario === 'retry-then-checksum' ||
    (scenario === 'mirror' && !mirror) ||
    (scenario === 'retry' && previous.filter(row => row.event === 'attempt').length === 0)) {
  console.error('HTTPError: Response code 504 (Gateway Time-out)');
  process.exit(1);
}
setTimeout(() => {
  log('extract');
  fs.writeFileSync(marker, 'installed');
}, Number(process.env.FAKE_DELAY_MS || 0));
`;

const runner = `
import { ensureElectron } from './src/desktop/install-electron.js';
try {
  if (process.env.FAKE_RETRY_AFTER_ERROR) {
    try { await ensureElectron(); } catch {}
    process.env.FAKE_SCENARIO = 'success';
  }
  await Promise.all(Array.from({ length: Number(process.env.FAKE_CONCURRENT_CALLS || 1) },
    () => ensureElectron()));
  console.log('RESULT_SUCCESS');
} catch (error) {
  console.error(error.message);
  console.log('RESULT_ERROR');
}
`;

async function fixture(t, scenario, extraEnv = {}) {
  const dir = await mkdtemp(join(testDir, '.electron-setup-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const moduleDir = join(dir, 'src', 'desktop');
  const electronDir = join(dir, 'node_modules', 'electron');
  await mkdir(moduleDir, { recursive: true });
  await mkdir(electronDir, { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(join(electronDir, 'package.json'), '{"name":"electron","version":"45.2.3","type":"commonjs"}');
  await copyFile(source, join(moduleDir, 'install-electron.js'));
  await writeFile(join(electronDir, 'install.js'), fakeInstaller);
  await writeFile(join(dir, 'runner.mjs'), runner);

  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:(?:npm_config|npm_package_config)_)?electron_(?:mirror|nightly_?mirror|custom_?(?:dir|filename|version)|use_remote_checksums)$/i.test(key)
      || key === 'ELECTRON_OVERRIDE_DIST_PATH') delete env[key];
  }
  Object.assign(env, {
    FAKE_INSTALL_LOG: join(dir, 'attempts.log'),
    FAKE_INSTALLED: join(electronDir, 'installed'),
    FAKE_SCENARIO: scenario,
    ...extraEnv,
  });
  return {
    electronDir,
    lockPath: electronDir + '.lock',
    run: () => execFileAsync(process.execPath, [join(dir, 'runner.mjs')], {
      cwd: dir, env, timeout: 30_000, maxBuffer: 1024 * 1024,
    }),
    async events() {
      try {
        return (await readFile(env.FAKE_INSTALL_LOG, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    },
  };
}

test('retries temporary failures and then uses the checked mirror', async t => {
  const setup = await fixture(t, 'mirror');
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  const attempts = (await setup.events()).filter(event => event.event === 'attempt');
  assert.deepEqual(attempts.map(event => event.mirror), ['', '', 'https://npmmirror.com/mirrors/electron/']);
  assert.match(result.stderr, /retry/i);
});

test('a successful retry does not use a mirror', async t => {
  const setup = await fixture(t, 'retry');
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  assert.deepEqual((await setup.events()).filter(event => event.event === 'attempt').map(event => event.mirror), ['', '']);
});

for (const scenario of ['checksum', 'permission']) {
  test(`${scenario} errors do not trigger retry or mirror fallback`, async t => {
    const setup = await fixture(t, scenario);
    const result = await setup.run();
    assert.equal(result.stdout, 'RESULT_ERROR\n');
    assert.equal((await setup.events()).filter(event => event.event === 'attempt').length, 1);
    assert.match(result.stderr, scenario === 'checksum' ? /checksum/i : /EACCES/i);
  });
}

test('a checksum failure on retry does not trigger mirror fallback', async t => {
  const setup = await fixture(t, 'retry-then-checksum');
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_ERROR\n');
  assert.deepEqual((await setup.events()).filter(event => event.event === 'attempt').map(event => event.mirror), ['', '']);
  assert.match(result.stderr, /checksum/i);
});

for (const [name, extraEnv] of [
  ['explicit mirror', { ELECTRON_MIRROR: 'https://custom.example/electron/' }],
  ['npm mirror', { npm_config_electron_mirror: 'https://custom.example/electron/' }],
  ['custom directory', { ELECTRON_CUSTOM_DIR: 'private' }],
  ['remote checksums', { electron_use_remote_checksums: '1' }],
]) {
  test(`${name} is respected when downloads fail`, async t => {
    const setup = await fixture(t, 'network-always', extraEnv);
    const result = await setup.run();
    assert.equal(result.stdout, 'RESULT_ERROR\n');
    const attempts = (await setup.events()).filter(event => event.event === 'attempt');
    assert.ok(attempts.length >= 1);
    assert.ok(attempts.every(event => event.mirror !== 'https://npmmirror.com/mirrors/electron/'));
  });
}

test('an existing Electron installation does not invoke the installer', async t => {
  const setup = await fixture(t, 'permission');
  await mkdir(join(setup.electronDir, 'dist'), { recursive: true });
  await writeFile(join(setup.electronDir, 'dist', 'version'), 'v45.2.3');
  await writeFile(join(setup.electronDir, 'path.txt'), 'electron');
  await writeFile(join(setup.electronDir, 'dist', 'electron'), 'executable');
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  assert.deepEqual(await setup.events(), []);
});

test('an explicitly provided Electron executable bypasses installation', async t => {
  const setup = await fixture(t, 'permission', { ELECTRON_OVERRIDE_DIST_PATH: '/explicit/electron' });
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  assert.deepEqual(await setup.events(), []);
});

test('concurrent requests within one process share installation and keep stdout clean', async t => {
  const setup = await fixture(t, 'success', { FAKE_CONCURRENT_CALLS: '3', FAKE_DELAY_MS: '250' });
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  assert.equal((await setup.events()).filter(event => event.event === 'extract').length, 1);
});

test('concurrent processes do not extract into the same Electron directory', async t => {
  const setup = await fixture(t, 'success', { FAKE_DELAY_MS: '400' });
  const results = await Promise.all([setup.run(), setup.run(), setup.run()]);
  for (const result of results) assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  assert.equal((await setup.events()).filter(event => event.event === 'extract').length, 1);
});

test('a failed installation releases its lock for a later retry', async t => {
  const setup = await fixture(t, 'permission', { FAKE_RETRY_AFTER_ERROR: '1' });
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  const events = await setup.events();
  assert.equal(events.filter(event => event.event === 'attempt').length, 2);
  assert.equal(events.filter(event => event.event === 'extract').length, 1);
});

test('an abandoned installer lock is recovered', async t => {
  const setup = await fixture(t, 'success');
  await mkdir(setup.lockPath);
  const oldTime = new Date(Date.now() - 60_000);
  await utimes(setup.lockPath, oldTime, oldTime);
  const result = await setup.run();
  assert.equal(result.stdout, 'RESULT_SUCCESS\n');
  assert.equal((await setup.events()).filter(event => event.event === 'extract').length, 1);
});
