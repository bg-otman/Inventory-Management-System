// Execute the actual launcher against deterministic Electron/process doubles.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(
  process.env.INVENTORY_LAUNCHER || path.join(__dirname, '../desktop/main.cjs'),
  'utf8',
);
async function launch({ readyToShow = true, health = true, stalledPage = false } = {}) {
  const windows = [],
    timers = new Map(),
    errors = [],
    logs = [];
  let timerId = 0;
  const app = new EventEmitter();
  Object.assign(app, {
    isPackaged: false,
    setName() {},
    setPath() {},
    setAppUserModelId() {},
    disableHardwareAcceleration() {},
    getVersion: () => 'test',
    getPath: () => '/tmp/inventory-test',
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    relaunches: 0,
    relaunch() {
      this.relaunches++;
    },
    exits: [],
    exit(code) {
      this.exits.push(code);
    },
    quit() {
      const e = {
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
      };
      this.emit('before-quit', e);
      if (!e.prevented) this.exit(0);
    },
  });
  class Window extends EventEmitter {
    constructor(options = {}) {
      super();
      this.destroyed = false;
      this.visible = !!options.show;
      this.minimized = false;
      this.focused = false;
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.getURL = () => this.url || '';
      windows.push(this);
    }
    static getAllWindows() {
      return windows.filter((w) => !w.destroyed);
    }
    isDestroyed() {
      return this.destroyed;
    }
    check() {
      if (this.destroyed) throw Error('Object has been destroyed');
    }
    isMinimized() {
      this.check();
      return this.minimized;
    }
    isVisible() {
      this.check();
      return this.visible;
    }
    restore() {
      this.check();
      this.minimized = false;
    }
    show() {
      this.check();
      this.visible = true;
    }
    focus() {
      this.check();
      this.focused = true;
    }
    hide() {
      this.check();
      this.visible = false;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.visible = false;
      this.emit('closed');
      if (!Window.getAllWindows().length) app.emit('window-all-closed');
    }
    close() {
      this.destroy();
    }
    async loadURL(url) {
      this.url = new URL(url).href;
      this.webContents.emit('did-start-navigation', {
        url: this.url,
        isSameDocument: false,
        isMainFrame: true,
      });
      this.webContents.emit('did-start-loading');
      if (stalledPage && url.startsWith('http:')) return new Promise(() => {});
      if (readyToShow) this.emit('ready-to-show');
      this.webContents.emit('did-finish-load');
    }
  }
  const child = new EventEmitter();
  Object.assign(child, {
    pid: 123,
    exitCode: null,
    signalCode: null,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: new EventEmitter(),
    kills: [],
  });
  child.stdin.writable = true;
  child.stdin.destroyed = false;
  child.stdin.writes = [];
  child.stdin.end = (value, callback) => {
    child.stdin.writes.push(value);
    child.stdin.callback = callback;
  };
  child.kill = (signal) => {
    child.kills.push(signal);
    return true;
  };
  child.stop = (code = 0, signal = null) => {
    child.exitCode = code;
    child.signalCode = signal;
    child.emit('exit', code, signal);
  };
  const ipcMain = new EventEmitter();
  ipcMain.handle = () => {};
  const session = {
    setProxy: async () => {},
    setPermissionRequestHandler() {},
    setPermissionCheckHandler() {},
    webRequest: { onBeforeRequest() {}, onBeforeSendHeaders() {} },
  };
  const electron = {
    app,
    BrowserWindow: Window,
    dialog: {
      showErrorBox: (...args) => errors.push(args),
      showMessageBox: async (options) => {
        errors.push(options);
        return { response: 2 };
      },
    },
    Menu: { setApplicationMenu() {} },
    ipcMain,
    shell: {},
    session: { fromPartition: () => session },
  };
  const context = {
    require(name) {
      if (name === 'electron') return electron;
      if (name === 'node:fs')
        return {
          mkdirSync() {},
          existsSync: () => true,
          readFileSync: () => '{"language":"fr"}',
          appendFileSync: (_p, s) => logs.push(s),
        };
      if (name === 'node:child_process')
        return {
          spawn: () => {
            queueMicrotask(() => child.stdout.emit('data', '{"port":32123}\n'));
            return child;
          },
        };
      return require(name);
    },
    __dirname: path.join(__dirname, '../desktop'),
    process: {
      env: { INVENTORY_DEV_PYTHON: '/test/python' },
      versions: { electron: 'test' },
      platform: 'test',
    },
    URL,
    Buffer,
    console,
    AbortSignal,
    fetch: async () => ({ ok: health, json: async () => ({ language: 'fr' }) }),
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  vm.runInNewContext(source, context, { filename: 'desktop/main.cjs' });
  const flush = async () => {
    for (let i = 0; i < 60; i++) await Promise.resolve();
  };
  await flush();
  return {
    app,
    child,
    Window,
    windows,
    errors,
    logs,
    timers,
    flush,
    ipcMain,
    fire(delay) {
      for (const [id, t] of [...timers])
        if (t.delay === delay) {
          timers.delete(id);
          t.fn();
        }
    },
  };
}

test('closing the dashboard also stops Inventory when an invoice window remains', async () => {
  const h = await launch();
  const main = h.windows[0];
  new h.Window();
  main.close();
  assert.deepEqual(h.child.stdin.writes, ['shutdown\n']);
  assert.doesNotThrow(() => h.app.emit('second-instance'));
  h.child.stop();
  await h.flush();
  assert.equal(h.app.exits.length, 1);
  assert.equal(h.Window.getAllWindows().length, 0);
});

test('reopening while shutdown is in progress queues exactly one relaunch', async () => {
  const h = await launch();
  h.windows[0].close();
  h.app.emit('second-instance');
  h.app.emit('second-instance');
  h.child.stop();
  await h.flush();
  assert.equal(h.app.relaunches, 1);
  assert.equal(h.app.exits.length, 1);
});

test('opening an already running app restores the existing dashboard', async () => {
  const h = await launch();
  h.windows[0].minimized = true;
  h.windows[0].hide();
  h.app.emit('second-instance');
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].minimized, false);
  assert.equal(h.windows[0].visible, true);
  assert.equal(h.windows[0].focused, true);
});

test('a loaded dashboard becomes visible even without ready-to-show', async () => {
  const h = await launch({ readyToShow: false });
  assert.equal(h.windows[0].visible, true);
});

test('a stalled service cannot leave the launcher running after closing', async () => {
  const h = await launch();
  h.windows[0].close();
  h.fire(10000);
  assert.deepEqual(h.child.kills, ['SIGKILL']);
  h.fire(2000);
  assert.equal(h.app.exits.length, 1);
});

test('broken shutdown pipes do not throw or block exit', async () => {
  const h = await launch();
  h.windows[0].close();
  assert.doesNotThrow(() => h.child.stdin.emit('error', Error('EPIPE')));
  h.child.stop();
  await h.flush();
  assert.equal(h.app.exits.length, 1);
});

test('unexpected service exit shuts down the dashboard and reports the problem', async () => {
  const h = await launch();
  h.child.stop(1);
  await h.flush();
  assert.equal(h.errors.length, 1);
  assert.equal(h.app.exits.length, 1);
});

test('the startup window is already visible while the local service is not ready', async () => {
  const h = await launch({ health: false });
  assert.equal(h.windows[0].visible, true);
  assert.match(h.windows[0].url, /^data:text\/html/);
  h.windows[0].close();
  h.child.stop();
});

test('a stalled document load reports an error and shuts down instead of hanging', async () => {
  const h = await launch({ stalledPage: true });
  h.fire(30000);
  await h.flush();
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.child.stdin.writes, ['shutdown\n']);
  h.child.stop();
  assert.equal(h.app.exits.length, 1);
});

test('missing frontend readiness produces native recovery and closes the owned service', async () => {
  const h = await launch();
  h.fire(45000);
  await h.flush();
  assert.equal(h.errors[0].buttons.length, 3);
  assert.deepEqual(h.child.stdin.writes, ['shutdown\n']);
  h.child.stop();
  assert.equal(h.app.exits.length, 1);
});

test('only the trusted dashboard can acknowledge readiness', async () => {
  const h = await launch();
  const sender = h.windows[0].webContents;
  h.ipcMain.emit('inventory:ui-ready', { sender, senderFrame: { url: 'https://example.com' } });
  assert.ok([...h.timers.values()].some((t) => t.delay === 45000));
  h.ipcMain.emit('inventory:ui-ready', { sender, senderFrame: { url: 'http://127.0.0.1:32123/' } });
  assert.ok(![...h.timers.values()].some((t) => t.delay === 45000));
  h.windows[0].close();
  h.child.stop();
});

test('renderer crash and unresponsive events create only one recovery dialog', async () => {
  const h = await launch();
  h.windows[0].webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  h.windows[0].emit('unresponsive');
  await h.flush();
  assert.equal(h.errors.length, 1);
  assert.ok(h.logs.some((line) => line.includes('Renderer stopped: crashed')));
  h.child.stop();
  assert.equal(h.app.exits.length, 1);
});

test('loading activity and same-document navigation after readiness cannot trigger startup recovery', async () => {
  const h = await launch();
  const main = h.windows[0];
  h.ipcMain.emit('inventory:ui-ready', {
    sender: main.webContents,
    senderFrame: { url: main.url },
  });
  main.webContents.emit('did-start-loading');
  main.webContents.emit('did-start-navigation', {
    url: main.url + '#stock',
    isSameDocument: true,
    isMainFrame: true,
  });
  main.webContents.emit('did-start-navigation', {
    url: main.url,
    isSameDocument: false,
    isMainFrame: false,
  });
  h.fire(45000);
  await h.flush();
  assert.equal(h.errors.length, 0);
  assert.equal(h.app.exits.length, 0);
  assert.equal(main.isDestroyed(), false);
  main.close();
  h.child.stop();
});

test('stale readiness deadlines cannot fail a ready page or a new load; a genuinely hung reload still recovers', async () => {
  const h = await launch();
  const main = h.windows[0];
  const pending = () => [...h.timers.values()].find((t) => t.delay === 45000);
  const initial = pending();
  assert.ok(initial);
  const ready = () =>
    h.ipcMain.emit('inventory:ui-ready', {
      sender: main.webContents,
      senderFrame: { url: main.url },
    });
  ready();
  initial.fn();
  await h.flush();
  assert.equal(h.errors.length, 0);
  // A full main-document reload requires a fresh acknowledgement.
  main.webContents.emit('did-start-navigation', {
    url: main.url,
    isSameDocument: false,
    isMainFrame: true,
  });
  const reload = pending();
  assert.ok(reload);
  initial.fn();
  await h.flush();
  assert.equal(h.errors.length, 0);
  ready();
  reload.fn();
  await h.flush();
  assert.equal(h.errors.length, 0);
  // Retain support for Electron's older positional navigation arguments.
  main.webContents.emit('did-start-navigation', {}, main.url, false, true);
  assert.ok(pending());
  h.fire(45000);
  await h.flush();
  assert.equal(h.errors.length, 1);
  assert.deepEqual(h.child.stdin.writes, ['shutdown\n']);
  h.child.stop();
  assert.equal(h.app.exits.length, 1);
});
