import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ensureElectron } from './install-electron.js';
import { DEFAULT_AREAS } from './presentation.js';
import { STARTUP_MESSAGE } from './request.js';

const electronCli = createRequire(import.meta.url).resolve('electron/cli.js');
const desktopEntry = fileURLToPath(new URL('./main.js', import.meta.url));

export async function launchDesktop({ url, devices, textSize = 'default', areas = DEFAULT_AREAS }, { managed = false } = {}) {
  await ensureElectron();

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (managed) env.VIEWPORTS_CONTROL = 'stdio';
  else delete env.VIEWPORTS_CONTROL;

  return new Promise((resolve, reject) => {
    const areaNames = ['top', 'bottom'].filter(name => areas[name]);
    const args = [
      electronCli, desktopEntry, url, ...devices.map(({ id }) => id),
      `--text-size=${textSize}`, `--areas=${areaNames.join(',') || 'none'}`,
    ];
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: [managed ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env,
    });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.stdin?.on('error', () => disconnect());
    const output = createInterface({ input: child.stdout });
    const pending = new Map();
    let nextId = 0;
    let settled = false;
    let disconnected = false;
    const timeout = setTimeout(() => {
      finish(new Error('Desktop windows did not load within two minutes.'));
    }, 120_000);

    function disconnect() {
      if (disconnected) return;
      disconnected = true;
      child.stdin?.end();
      output.close();
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      for (const request of pending.values()) request.reject(new Error('Preview session closed.'));
      pending.clear();
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        disconnect();
        child.kill();
        reject(error);
      } else if (managed) {
        resolve({
          url,
          devices,
          textSize,
          areas,
          control: {
            disconnect,
            request(action, device, value) {
              if (disconnected) return Promise.reject(new Error('Preview session closed.'));
              const id = ++nextId;
              return new Promise((resolveRequest, rejectRequest) => {
                const timer = setTimeout(() => {
                  pending.delete(id);
                  rejectRequest(new Error('Preview session did not respond.'));
                }, 15_000);
                pending.set(id, {
                  resolve: value => { clearTimeout(timer); resolveRequest(value); },
                  reject: error => { clearTimeout(timer); rejectRequest(error); },
                });
                child.stdin.write(JSON.stringify({ id, action, device, value }) + '\n', error => {
                  if (error) {
                    pending.get(id)?.reject(error);
                    pending.delete(id);
                  }
                });
              });
            },
          },
        });
      } else {
        disconnect();
        resolve({ url, devices, textSize, areas });
      }
    }

    output.on('line', line => {
      if (!line.startsWith(STARTUP_MESSAGE)) {
        process.stderr.write(`${line}\n`);
        return;
      }
      try {
        const result = JSON.parse(line.slice(STARTUP_MESSAGE.length));
        if (!settled) {
          finish(result.ready === true ? undefined : new Error(result.error));
          return;
        }
        const request = pending.get(result.id);
        if (!request) return;
        pending.delete(result.id);
        if (result.error) request.reject(new Error(result.error));
        else request.resolve(result);
      } catch (error) {
        finish(error);
      }
    });
    child.once('error', error => {
      if (!settled) finish(error);
      else disconnect();
    });
    child.once('close', code => {
      if (!settled) finish(new Error(`Desktop app stopped before opening its windows (exit ${code}).`));
      else disconnect();
    });
  });
}
