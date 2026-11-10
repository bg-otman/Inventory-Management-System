// Full Electron regression for a false startup deadline after navigating.
// Use the same isolated profile/display variables as desktop-runtime.cjs.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { _electron } = require(process.env.INVENTORY_PLAYWRIGHT_MODULE || 'playwright');
let current;
const logPath = path.join(process.env.INVENTORY_TEST_PROFILE, 'InventoryDesktop', 'startup.log');
async function start() {
  const args = [path.join(__dirname, 'electron-entry.cjs')];
  if (process.env.INVENTORY_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  const app = await _electron.launch({
    executablePath: require('electron'),
    args,
    env: process.env,
    timeout: 30000,
  });
  current = app;
  const page = await app.firstWindow();
  await page.locator('.app-shell').waitFor({ timeout: 30000 });
  const origin = new URL(page.url()).origin;
  return { app, page, origin };
}
async function stop({ app, origin }) {
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  await assert.rejects(fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(2000) }));
  current = null;
}
(async () => {
  let run = await start();
  for (const name of ['Stock', 'Ventes', 'Clients', 'Stock']) {
    await run.page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
  }
  await run.page.evaluate(() => {
    location.hash = 'stock';
  });
  console.log('Waiting beyond the 45-second readiness deadline after navigation.');
  await new Promise((resolve) => setTimeout(resolve, 47000));
  assert.equal(await run.page.locator('.app-shell').count(), 1);
  assert.doesNotMatch(fs.readFileSync(logPath, 'utf8'), /Interface did not become ready/);
  await run.page.reload();
  await run.page.locator('.app-shell').waitFor({ timeout: 30000 });
  await run.page.waitForFunction(() => document.readyState === 'complete');
  const log = fs.readFileSync(logPath, 'utf8');
  assert.ok((log.match(/Interface ready\./g) || []).length >= 2);
  await stop(run);
  run = await start();
  await stop(run);
  assert.doesNotMatch(fs.readFileSync(logPath, 'utf8'), /Interface did not become ready/);
  console.log('PASS: navigation beyond 45 seconds, full reload, complete shutdown, and reopening.');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (current) await current.close();
  });
