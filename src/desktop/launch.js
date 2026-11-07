import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { STARTUP_MESSAGE } from './request.js';

const electronCli = createRequire(import.meta.url).resolve('electron/cli.js');
const desktopEntry = fileURLToPath(new URL('./main.js', import.meta.url));

export function launchDesktop({ url, devices }) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [electronCli, desktopEntry, url, ...devices.map(({ id }) => id)], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    const output = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => {
      finish(new Error('Desktop windows did not load within two minutes.'));
    }, 120_000);
    let settled = false;

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      output.close();
      child.stdout.destroy();
      child.stderr.destroy();
      if (error) {
        child.kill();
        reject(error);
      } else {
        child.unref();
        resolve({ url, devices });
      }
    }

    output.on('line', line => {
      if (!line.startsWith(STARTUP_MESSAGE)) {
        process.stderr.write(`${line}\n`);
        return;
      }
      try {
        const result = JSON.parse(line.slice(STARTUP_MESSAGE.length));
        finish(result.ready === true ? undefined : new Error(result.error));
      } catch (error) {
        finish(error);
      }
    });
    child.once('error', finish);
    child.once('close', code => finish(new Error(`Desktop app stopped before opening its windows (exit ${code}).`)));
  });
}
