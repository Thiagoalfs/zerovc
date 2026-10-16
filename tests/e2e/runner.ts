/**
 * Root E2E Runner Proxy
 * Dispatches to client/tests/e2e/runner.ts
 */
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const clientDir = path.resolve(projectRoot, 'client');
const runnerPath = path.resolve(clientDir, 'tests/e2e/runner.ts');

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const child = spawn(npxCmd, ['tsx', 'tests/e2e/runner.ts'], {
  cwd: clientDir,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
