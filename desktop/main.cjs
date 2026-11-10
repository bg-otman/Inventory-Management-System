const { app, BrowserWindow, dialog, session, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
app.setName('Inventory');
app.setPath('userData', path.join(app.getPath('appData'), 'InventoryDesktop'));
app.setAppUserModelId('com.inventory.desktop');
// This dashboard does not need a GPU. Software rendering avoids driver-related
// white windows on older Windows machines, including after a second launch.
app.disableHardwareAcceleration();
const dataDir = path.join(app.getPath('userData'), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const token = randomBytes(32).toString('hex');
let backend,
  mainWindow,
  origin,
  closing = false,
  shutdownStarted = false;
let backendStopped = false,
  uiReady = false,
  restartRequested = false;
let localSession,
  uiTimer,
  recoveryOpen = false;
let interfaceEpoch = 0,
  interfaceAcknowledged = false;
const logPath = path.join(app.getPath('userData'), 'startup.log');
function log(message) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
}
function localLanguage() {
  return 'fr';
}
function tr(fr, ar) {
  return fr;
}
function backendRunning() {
  return (
    backend &&
    backend.pid &&
    !backendStopped &&
    backend.exitCode === null &&
    backend.signalCode === null
  );
}
function shutdown() {
  if (shutdownStarted) return;
  shutdownStarted = true;
  closing = true;
  clearTimeout(uiTimer);
  log('Closing Inventory.');
  // The dashboard owns the app lifecycle. Invoice windows must not leave an
  // invisible instance holding the single-instance lock after it is closed.
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy();
  let finished = false,
    graceTimer,
    forceTimer;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(graceTimer);
    clearTimeout(forceTimer);
    if (restartRequested) app.relaunch();
    log('Inventory stopped.');
    // Do not re-enter cancellable window/before-quit handlers after cleanup.
    app.exit(0);
  };
  if (!backendRunning()) {
    finish();
    return;
  }
  backend.once('exit', finish);
  graceTimer = setTimeout(() => {
    log('Local service shutdown timed out; terminating this child process.');
    forceTimer = setTimeout(finish, 2000);
    try {
      backend.kill('SIGKILL');
    } catch (error) {
      log(String(error));
      finish();
    }
  }, 10000);
  try {
    if (backend.stdin.writable && !backend.stdin.destroyed) {
      backend.stdin.end('shutdown\n', (error) => {
        if (error) log('Shutdown pipe: ' + error.message);
      });
    }
  } catch (error) {
    log('Shutdown pipe: ' + error.message);
  }
}
function showMainWindow() {
  if (closing || !mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
async function createMainWindow() {
  if (closing) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: 'Inventory',
    backgroundColor: '#f7f8f5',
    autoHideMenuBar: true,
    show: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      session: localSession,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: ['--inventory-language=' + localLanguage()],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = win;
  configureWindow(win);
  win.once('closed', () => {
    if (mainWindow === win) mainWindow = null;
    shutdown();
  });
  win.once('ready-to-show', showMainWindow);
  win.webContents.on('render-process-gone', (_event, details) => {
    if (!closing)
      void recover('Renderer stopped: ' + details.reason + ' (' + details.exitCode + ')');
  });
  win.on('unresponsive', () => {
    if (!closing) void recover('Window unresponsive.');
  });
  win.webContents.on('preload-error', (_event, _file, error) => {
    if (!closing) void recover('Preload: ' + error.message);
  });
  win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!closing && isMainFrame && code !== -3)
      void recover(`Page load failed: ${code} ${description}`);
  });
  // Loading activity also fires for hash navigation and subframes. Only a new
  // main document needs another acknowledgement from the dashboard preload.
  win.webContents.on('did-start-navigation', (details, url, isInPlace, isMainFrame) => {
    const target = details.url ?? url;
    const sameDocument = details.isSameDocument ?? isInPlace;
    const mainFrame = details.isMainFrame ?? isMainFrame;
    if (!mainFrame || sameDocument || !origin || !target) return;
    try {
      const next = new URL(target);
      if (next.origin === origin && next.pathname === '/') watchInterface(win);
    } catch {}
  });
  // A visible, dependency-free loading page is shown before Python starts.
  const ar = false;
  const loading = `<!doctype html><html lang="${'fr'}" dir="${'ltr'}"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Inventory</title><style>body{margin:0;background:#f7f8f5;color:#183b31;font:18px system-ui;display:grid;place-content:center;min-height:100vh;text-align:center}h1{font-size:36px}p{color:#61716a}</style><h1>Inventory</h1><p>${'Ouverture d’Inventory…'}</p></html>`;
  await loadPage(win, 'data:text/html;charset=utf-8,' + encodeURIComponent(loading));
  showMainWindow();
  if (uiReady) await loadDashboard(win);
  return win;
}
function watchInterface(win) {
  if (closing || win !== mainWindow || win.isDestroyed()) return;
  clearTimeout(uiTimer);
  const epoch = ++interfaceEpoch;
  interfaceAcknowledged = false;
  log(`Waiting for dashboard readiness (${epoch}).`);
  uiTimer = setTimeout(() => {
    // A queued callback may outlive clearTimeout or belong to a previous load.
    if (
      closing ||
      win !== mainWindow ||
      win.isDestroyed() ||
      epoch !== interfaceEpoch ||
      interfaceAcknowledged
    )
      return;
    void recover('Interface did not become ready within 45 seconds.');
  }, 45000);
}
async function loadPage(win, url) {
  let timer;
  try {
    await Promise.race([
      win.loadURL(url),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('La fenêtre met trop de temps à s’ouvrir.')),
          30000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function loadDashboard(win) {
  if (closing || win.isDestroyed()) return;
  log('Loading dashboard.');
  watchInterface(win);
  await loadPage(win, origin);
  showMainWindow();
}
async function recover(reason) {
  if (closing || recoveryOpen) return;
  recoveryOpen = true;
  clearTimeout(uiTimer);
  log(reason);
  try {
    // This native dialog still works if the page's renderer has crashed.
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Inventory',
      message: 'Inventory ne répond pas correctement.',
      detail:
        'Vous pouvez redémarrer l’application. Vos données enregistrées sont conservées.\n\nJournal : ' +
        logPath,
      buttons: ['Redémarrer', 'Ouvrir le journal et fermer', 'Fermer'],
      defaultId: 0,
      cancelId: 2,
    });
    if (closing) return;
    if (result.response === 0) restartRequested = true;
    if (result.response === 1) await shell.openPath(logPath);
  } catch (error) {
    log('Recovery dialog: ' + error.message);
  } finally {
    shutdown();
  }
}
function startupFailed(error) {
  if (closing || recoveryOpen) return;
  log(error.stack || String(error));
  dialog.showErrorBox(
    'Impossible de démarrer Inventory',
    error.message + '\n\n' + 'Détails : ' + logPath,
  );
  shutdown();
}
function trusted(event) {
  if (!origin || !event.senderFrame || new URL(event.senderFrame.url).origin !== origin)
    throw new Error('Untrusted window.');
}
async function api(url, options = {}) {
  return fetch(origin + '/api/v1' + url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(30000),
    headers: { ...options.headers, 'X-Inventory-Local': token },
  });
}
async function language() {
  try {
    return (await (await api('/preferences')).json()).language;
  } catch {
    return localLanguage();
  }
}
function configureWindow(win) {
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url);
    if (
      parsed.origin !== origin ||
      !/^\/api\/v1\/(?:invoices|receipts)\/[a-z0-9-]+\/print$/.test(parsed.pathname)
    )
      return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1000,
        height: 850,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
          session: localSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      },
    };
  });
  win.webContents.on('did-create-window', (child) => configureWindow(child));
}
async function startBackend() {
  log('Starting local service.');
  const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const python = app.isPackaged
    ? path.join(resources, 'python', 'python.exe')
    : process.env.INVENTORY_DEV_PYTHON;
  if (!python || !fs.existsSync(python))
    throw new Error(
      'Le composant Python fourni est introuvable. Extrayez tout le ZIP avant d’ouvrir Inventory.exe.',
    );
  backend = spawn(
    python,
    ['-u', '-X', 'utf8', '-B', path.join(resources, 'backend', 'desktop_server.py')],
    {
      cwd: path.join(resources, 'backend'),
      windowsHide: true,
      env: {
        ...process.env,
        INVENTORY_DATA_DIR: dataDir,
        INVENTORY_LOCAL_TOKEN: token,
        INVENTORY_FRONTEND: path.join(resources, app.isPackaged ? 'frontend' : 'frontend/out'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  backend.stderr.on('data', (data) => log(data.toString().slice(-8000)));
  backend.stdin.on('error', (error) => log('Local service input: ' + error.message));
  backend.on('error', (error) => log('Local service process: ' + error.message));
  backend.on('exit', (code) => {
    backendStopped = true;
    if (!closing && uiReady) {
      log(`Local service stopped (${code}).`);
      dialog.showErrorBox(
        'Inventory',
        'Le service de données local s’est arrêté. Fermez et relancez Inventory.\nDossier des données : ' +
          dataDir,
      );
      shutdown();
    }
  });
  await new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      clearTimeout(timer);
      backend.removeListener('error', failed);
      backend.removeListener('exit', exited);
      backend.stdout.removeListener('data', output);
    };
    const failed = (error) => {
      cleanup();
      reject(error);
    };
    const exited = () =>
      failed(new Error('Le service de données local s’est arrêté au démarrage.'));
    const timer = setTimeout(
      () => failed(new Error('Le service de données local met trop de temps à démarrer.')),
      30000,
    );
    const output = (chunk) => {
      buffer += chunk.toString();
      for (let split; (split = buffer.indexOf('\n')) >= 0;) {
        const line = buffer.slice(0, split);
        buffer = buffer.slice(split + 1);
        try {
          const ready = JSON.parse(line);
          if (Number.isInteger(ready.port) && ready.port > 0 && ready.port < 65536) {
            origin = `http://127.0.0.1:${ready.port}`;
            log('Local service listening.');
            cleanup();
            resolve();
          }
        } catch {
          log(line);
        }
      }
    };
    backend.once('error', failed);
    backend.once('exit', exited);
    backend.stdout.on('data', output);
  });
  const deadline = Date.now() + 15000;
  while (!closing && Date.now() < deadline) {
    try {
      const r = await api('/health', { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        log('Local service ready.');
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Le service de données local est indisponible.');
}
function registerActions() {
  ipcMain.on('inventory:ui-ready', (event) => {
    try {
      trusted(event);
    } catch {
      return;
    }
    if (event.sender !== mainWindow?.webContents) return;
    interfaceAcknowledged = true;
    clearTimeout(uiTimer);
    log('Interface ready.');
  });
  ipcMain.on('inventory:ui-error', (event, message) => {
    try {
      trusted(event);
    } catch {
      return;
    }
    if (typeof message === 'string')
      log('Interface error: ' + message.replace(/[\r\n]+/g, ' ').slice(0, 1500));
  });
  ipcMain.handle('inventory:open-log', async (event) => {
    trusted(event);
    await shell.openPath(logPath);
  });
  ipcMain.handle('inventory:open-data-folder', async (event) => {
    trusted(event);
    await shell.openPath(dataDir);
  });
  ipcMain.handle('inventory:export-backup', async (event, name) => {
    trusted(event);
    if (
      typeof name !== 'string' ||
      !/^inventory-(?:recovery-|imported-)?[A-Za-z0-9_-]+\.db$/.test(name)
    )
      throw new Error('Nom de sauvegarde invalide.');
    const ar = false;
    const selected = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer une copie de sauvegarde',
      defaultPath: path.join(app.getPath('documents'), name),
      filters: [{ name: 'Sauvegarde Inventory', extensions: ['db'] }],
    });
    if (selected.canceled || !selected.filePath) return false;
    // Never allow an export to replace the application's live database.
    if (
      path.resolve(selected.filePath).toLowerCase() ===
      path.resolve(dataDir, 'inventory.db').toLowerCase()
    )
      throw new Error('Choisissez une autre destination.');
    const response = await api('/backups/' + encodeURIComponent(name) + '/export');
    if (!response.ok) throw new Error('Impossible d’exporter cette sauvegarde.');
    const data = Buffer.from(await response.arrayBuffer());
    const temporary = selected.filePath + '.inventory-tmp';
    fs.writeFileSync(temporary, data);
    fs.renameSync(temporary, selected.filePath);
    return true;
  });
  ipcMain.handle('inventory:import-backup', async (event) => {
    trusted(event);
    const ar = false;
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisir une sauvegarde Inventory',
      properties: ['openFile'],
      filters: [{ name: 'Sauvegarde Inventory', extensions: ['db'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const file = selected.filePaths[0];
    if (fs.statSync(file).size > 200 * 1024 * 1024)
      throw new Error('La sauvegarde dépasse 200 Mo.');
    const response = await api('/backups/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fs.readFileSync(file),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Sauvegarde invalide.');
    return data;
  });
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  log(
    `Starting Inventory ${app.getVersion()} (${process.platform}, Electron ${process.versions.electron}).`,
  );
  app.on('second-instance', () => {
    // A quick double-click during shutdown is honored after cleanup finishes.
    if (closing) {
      restartRequested = true;
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) showMainWindow();
    else if (uiReady) void createMainWindow().catch(startupFailed);
  });
  app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null);
      // Business data/preferences live in SQLite/JSON, never in browser storage.
      // A fresh session avoids stale disk caches and lock files across launches.
      localSession = session.fromPartition('inventory-local', { cache: false });
      await localSession.setProxy({ mode: 'direct' });
      localSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      localSession.setPermissionCheckHandler(() => false);
      localSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*'] },
        (details, callback) => {
          callback({ cancel: !origin || new URL(details.url).origin !== origin });
        },
      );
      localSession.webRequest.onBeforeSendHeaders(
        { urls: ['http://127.0.0.1/*'] },
        (details, callback) => {
          if (new URL(details.url).origin === origin)
            details.requestHeaders['X-Inventory-Local'] = token;
          callback({ requestHeaders: details.requestHeaders });
        },
      );
      registerActions();
      const win = await createMainWindow();
      if (closing) return;
      await startBackend();
      if (closing) return;
      uiReady = true;
      await loadDashboard(win);
    } catch (error) {
      startupFailed(error);
    }
  });
  app.on('window-all-closed', shutdown);
  app.on('before-quit', (event) => {
    event.preventDefault();
    shutdown();
  });
}
