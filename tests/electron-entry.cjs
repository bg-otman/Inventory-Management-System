// Real-runtime smoke tests use an isolated profile, never the user's workspace.
const { app } = require('electron');
const path = require('node:path');
if (!process.env.INVENTORY_TEST_PROFILE)
  throw new Error('Set INVENTORY_TEST_PROFILE to a test directory.');
app.setPath('appData', path.resolve(process.env.INVENTORY_TEST_PROFILE));
// Some Linux CI hosts prohibit Unix listening sockets. Only skip the OS lock
// in that explicitly selected test environment; the shipped launcher keeps it.
if (process.env.INVENTORY_TEST_SKIP_OS_LOCK === '1' && process.platform === 'linux')
  app.requestSingleInstanceLock = () => true;
require('../desktop/main.cjs');
