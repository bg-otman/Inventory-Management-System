// Real Electron + bundled static UI + real Python service. Run with a fresh,
// isolated INVENTORY_TEST_PROFILE and INVENTORY_DEV_PYTHON; requires a display.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { _electron } = require(process.env.INVENTORY_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
let before, invoice, current;
const screenshots = process.env.INVENTORY_TEST_SCREENSHOTS;
function inspectDatabase(stage) {
  const file = path.join(
    process.env.INVENTORY_TEST_PROFILE,
    'InventoryDesktop',
    'data',
    'inventory.db',
  );
  console.log(
    stage,
    ['', '-wal', '-shm'].map((s) => [
      s,
      fs.existsSync(file + s) ? fs.statSync(file + s).size : null,
    ]),
  );
}
async function start() {
  const args = [path.join(__dirname, 'electron-entry.cjs')];
  // CI-only flag, never passed by the production app or Windows executable.
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
async function state(page) {
  return page.evaluate(async () => (await fetch('/api/v1/state')).json());
}
async function stop({ app, origin }) {
  const closed = app.waitForEvent('close');
  await app.evaluate(
    ({ BrowserWindow }, origin) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().split('#')[0] === origin + '/')
        .close(),
    origin,
  );
  await closed;
  await assert.rejects(fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(2000) }));
  current = null;
}
async function screenshot(page, name) {
  if (screenshots) {
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, name + '.png') });
  }
}
(async () => {
  let run = await start();
  assert.equal((await state(run.page)).products.length, 0, 'Use a fresh test profile.');
  invoice = await run.page.evaluate(async () => {
    const warehouse = (await (await fetch('/api/v1/state')).json()).warehouses[0].id;
    const write = async (path, body) => {
      const r = await fetch('/api/v1' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    };
    const category = await write('/categories', { name: 'Électricité' });
    const supplier = await write('/parties', { kind: 'supplier', name: 'Fournisseur test' });
    const customer = await write('/parties', { kind: 'customer', name: 'Client test' });
    const product = await write('/products', {
      name: 'Câble',
      category_id: category.id,
      supplier_id: supplier.id,
      unit: 'meter',
      opening_quantity: '10.500',
      warehouse_id: warehouse,
      purchase_cost: '7.25',
      price: '11.00',
      payment: '20.00',
      language: 'fr',
    });
    const sale = await write('/documents', {
      kind: 'sale',
      party_id: customer.id,
      warehouse_id: warehouse,
      items: [{ product_id: product.id, quantity: '2.500', price: '11.00' }],
      confirm: true,
      fulfill: true,
      payment: '10',
      language: 'fr',
    });
    await write('/payments', {
      party_id: customer.id,
      amount: '5',
      direction: 'received',
      paid_at: '2026-10-18',
      auto_allocate: true,
      language: 'fr',
    });
    return sale.id;
  });
  before = await state(run.page);
  assert.equal(before.stock[0].quantity, '8.000');
  assert.equal(before.parties.find((p) => p.kind === 'customer').balance, '12.50');
  inspectDatabase('After writes');
  await run.page.reload();
  await run.page.locator('.app-shell').waitFor();
  await screenshot(run.page, 'dashboard-fr');
  const popupPromise = run.app.waitForEvent('window');
  await run.page.evaluate(
    (id) => window.open('/api/v1/invoices/' + id + '/print', '_blank'),
    invoice,
  );
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.match(await popup.locator('body').innerText(), /FACTURE|Facture/);
  inspectDatabase('Before close');
  await stop(run);
  console.log(
    'PASS: real dashboard, persisted stock/sale/payment, authenticated invoice, close with invoice open.',
  );
  inspectDatabase('After close');

  run = await start();
  assert.deepEqual(await state(run.page), before);
  if (process.env.INVENTORY_TEST_LIFECYCLE_ONLY === '1') {
    await stop(run);
    console.log('PASS: stock and all balances survived closing.');
    return;
  }
  assert.equal(await run.page.locator('html').getAttribute('lang'), 'fr');
  await stop(run);
  console.log('PASS: second launch preserves all data and French interface.');
  run = await start();
  assert.deepEqual(await state(run.page), before);
  // A hung state request must produce an actionable screen after its deadline.
  let blocked;
  await run.page.route('**/api/v1/state', (route) => {
    blocked = route;
  });
  await run.page.reload();
  await run.page
    .getByRole('button', { name: 'Ouvrir le journal', exact: true })
    .waitFor({ timeout: 25000 });
  await screenshot(run.page, 'data-timeout');
  await run.page.unroute('**/api/v1/state');
  await blocked.abort().catch(() => {});
  await run.page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await run.page.locator('.app-shell').waitFor();
  // An actual React render exception must display the recovery page, not white.
  await run.page.route('**/api/v1/state', (route) =>
    route.fulfill({ json: { ...before, settings: null } }),
  );
  await run.page.reload();
  try {
    await run.page.getByRole('heading', { name: /Impossible d’afficher cette page/ }).waitFor();
  } catch (error) {
    await screenshot(run.page, 'render-recovery-failure');
    console.error('Recovery screen:', await run.page.locator('body').innerText());
    throw error;
  }
  await screenshot(run.page, 'render-recovery');
  await run.page.unroute('**/api/v1/state');
  await run.page.getByRole('button', { name: /Réessayer/, exact: true }).click();
  await run.page.locator('.app-shell').waitFor();
  assert.deepEqual(await state(run.page), before);
  // Crash the actual renderer. Only the native-dialog choice is automated.
  await run.app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false });
  });
  const closed = run.app.waitForEvent('close');
  await run.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer(),
  );
  await closed;
  current = null;
  await assert.rejects(fetch(run.origin + '/api/v1/health', { signal: AbortSignal.timeout(2000) }));
  console.log(
    'PASS: third launch, French-only interface, stalled API recovery, React crash recovery, renderer crash cleanup.',
  );

  run = await start();
  assert.deepEqual(await state(run.page), before);
  assert.equal(await run.page.locator('html').getAttribute('lang'), 'fr');
  await stop(run);
  console.log('PASS: fourth launch after renderer crash; all stock and balances preserved.');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (current) await current.close();
  });
