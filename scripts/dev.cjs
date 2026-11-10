const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const readline = require('node:readline');

const root = path.resolve(__dirname, '..');
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');
const requirements = path.join(backendDir, 'requirements-desktop.lock.txt');
const frontendLockfile = path.join(frontendDir, 'package-lock.json');
const venvId = createHash('sha256').update(root).digest('hex').slice(0, 12);
const venvDir = path.join(os.homedir(), '.inventory-dev-envs', venvId);
const frontendNativeDir = path.join(venvDir, 'frontend-native');
const frontendNativeModules = path.join(frontendNativeDir, 'node_modules');
const frontendNativeMarker = path.join(venvDir, '.frontend-native.sha256');
const venvPython = path.join(
  venvDir,
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const requirementsMarker = path.join(venvDir, '.backend-requirements.sha256');
const dataDir = path.resolve(
  process.env.INVENTORY_DEV_DATA_DIR || path.join(os.homedir(), '.inventory-desktop-dev'),
);

let backend;
let frontend;
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  if (frontend && frontend.exitCode === null) frontend.kill('SIGTERM');
  if (backend && backend.exitCode === null) {
    backend.stdin.end('shutdown\n');
    const forceStop = setTimeout(() => backend.kill(), 5000);
    forceStop.unref();
    backend.once('exit', () => clearTimeout(forceStop));
  }
}

function runSetupCommand(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}.`);
}

function resolvePython() {
  if (process.env.INVENTORY_DEV_PYTHON) return process.env.INVENTORY_DEV_PYTHON;

  const systemPython = process.platform === 'win32' ? 'python' : 'python3';
  if (!fs.existsSync(venvPython)) {
    process.stdout.write('Creating the local Python environment...\n');
    runSetupCommand(systemPython, ['-m', 'venv', venvDir]);
  }

  const lockHash = createHash('sha256').update(fs.readFileSync(requirements)).digest('hex');
  const installedHash = fs.existsSync(requirementsMarker)
    ? fs.readFileSync(requirementsMarker, 'utf8').trim()
    : '';
  if (installedHash !== lockHash) {
    process.stdout.write('Installing the locked backend requirements...\n');
    runSetupCommand(venvPython, ['-m', 'pip', 'install', '-r', requirements]);
    fs.writeFileSync(requirementsMarker, lockHash + '\n');
  }

  return venvPython;
}

function resolveLinuxNativeModules() {
  if (process.platform !== 'linux' || process.arch !== 'x64') return '';

  const lockfile = JSON.parse(fs.readFileSync(frontendLockfile, 'utf8'));
  const packages = [
    ['node_modules/lightningcss', 'lightningcss-linux-x64-gnu'],
    ['node_modules/@tailwindcss/oxide', '@tailwindcss/oxide-linux-x64-gnu'],
    ['node_modules/next', '@next/swc-linux-x64-gnu'],
  ].map(([parent, name]) => {
    const version = lockfile.packages[parent]?.optionalDependencies?.[name];
    if (!version) throw new Error(`Could not find ${name} in frontend/package-lock.json.`);
    return `${name}@${version}`;
  });
  const packageNames = packages.map((spec) => spec.slice(0, spec.lastIndexOf('@')));
  const marker = createHash('sha256').update(packages.join('\n')).digest('hex');
  const installed = packageNames.every((name) =>
    fs.existsSync(path.join(frontendNativeModules, ...name.split('/'), 'package.json')),
  );

  if (!installed || !fs.existsSync(frontendNativeMarker) ||
      fs.readFileSync(frontendNativeMarker, 'utf8').trim() !== marker) {
    process.stdout.write('Installing Linux frontend native dependencies...\n');
    runSetupCommand('npm', [
      'install',
      '--prefix',
      frontendNativeDir,
      '--no-save',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      ...packages,
    ]);
    fs.writeFileSync(frontendNativeMarker, marker + '\n');
  }

  return frontendNativeModules;
}

async function findFrontendPort(startPort) {
  for (let port = startPort; port < startPort + 100 && port <= 65535; port++) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error(`No available browser dev port found starting at ${startPort}.`);
}

async function waitForBackend() {
  return new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: backend.stdout });
    const timeout = setTimeout(() => finish(new Error('Backend startup timed out.')), 30000);
    const finish = (error, port) => {
      clearTimeout(timeout);
      lines.close();
      backend.removeListener('error', failed);
      backend.removeListener('exit', exited);
      if (error) reject(error);
      else resolve(port);
    };
    const failed = (error) => finish(error);
    const exited = (code) =>
      finish(new Error(`Backend stopped before startup completed (exit ${code}).`));

    backend.once('error', failed);
    backend.once('exit', exited);
    lines.on('line', (line) => {
      try {
        const ready = JSON.parse(line);
        if (Number.isInteger(ready.port) && ready.port > 0 && ready.port < 65536) {
          finish(null, ready.port);
          return;
        }
      } catch {}
      process.stdout.write(line + '\n');
    });
  });
}

async function run() {
  const startPort = Number.parseInt(process.env.INVENTORY_DEV_PORT || '3000', 10);
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535)
    throw new Error('INVENTORY_DEV_PORT must be between 1 and 65535.');
  const frontendPort = await findFrontendPort(startPort);
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const frontendNativeModules = resolveLinuxNativeModules();
  const python = resolvePython();
  backend = spawn(
    python,
    ['-u', '-X', 'utf8', '-B', path.join(backendDir, 'desktop_server.py')],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        INVENTORY_DATA_DIR: dataDir,
        INVENTORY_DEV_MODE: '1',
        INVENTORY_DEV_ORIGIN: frontendOrigin,
        INVENTORY_LOCAL_TOKEN: randomBytes(32).toString('hex'),
      },
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  );
  backend.stdin.on('error', () => {});
  const port = await waitForBackend();
  backend.once('exit', (code) => {
    if (!stopping) {
      console.error(`Backend stopped unexpectedly (exit ${code}).`);
      stop(1);
    }
  });

  const nextCli = path.join(frontendDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  const frontendEnv = {
    ...process.env,
    INVENTORY_API_ORIGIN: `http://127.0.0.1:${port}`,
    INVENTORY_DEV_DIST_DIR:
      process.env.INVENTORY_DEV_DIST_DIR ||
      (process.platform === 'linux' ? '.next-dev-wsl' : '.next-dev-windows'),
    INVENTORY_DEV_ORIGIN: frontendOrigin,
    INVENTORY_DEV_MODE: '1',
  };
  if (frontendNativeModules)
    frontendEnv.NODE_PATH = [frontendNativeModules, process.env.NODE_PATH]
      .filter(Boolean)
      .join(path.delimiter);
  frontend = spawn(
    process.execPath,
    [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', String(frontendPort)],
    {
      cwd: frontendDir,
      env: frontendEnv,
      stdio: 'inherit',
    },
  );
  frontend.once('error', (error) => {
    console.error(`Could not start Next.js: ${error.message}`);
    stop(1);
  });
  frontend.once('exit', (code) => stop(code ?? 1));
  process.stdout.write(`Inventory browser dev: ${frontendOrigin}\nData: ${dataDir}\n`);
}

process.once('SIGINT', () => stop(130));
process.once('SIGTERM', () => stop(143));

run().catch((error) => {
  console.error(error.message);
  stop(1);
});