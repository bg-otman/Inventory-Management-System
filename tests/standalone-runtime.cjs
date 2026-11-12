// Real browser + local API smoke test. Build the frontend first; requires Playwright.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { chromium } = require(process.env.INVENTORY_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-standalone-'));
const token = randomBytes(32).toString('hex');
const service = spawn(
  process.env.INVENTORY_DEV_PYTHON || 'python3',
  [
    '-u',
    '-c',
    [
      'import json, socket, uvicorn',
      'from app.local_bootstrap import bootstrap',
      'bootstrap()',
      'from app.main import app',
      'from fastapi.staticfiles import StaticFiles',
      `app.mount('/', StaticFiles(directory=${JSON.stringify(path.join(root, 'frontend/out').replaceAll('\\', '/'))}, html=True))`,
      "listener = socket.socket(); listener.bind(('127.0.0.1', 0)); listener.listen(128)",
      "print(json.dumps({'port': listener.getsockname()[1]}), flush=True)",
      "uvicorn.Server(uvicorn.Config(app, log_level='warning')).run(sockets=[listener])",
    ].join('\n'),
  ],
  {
    cwd: path.join(root, 'backend'),
    env: { ...process.env, INVENTORY_DATA_DIR: profile, INVENTORY_LOCAL_TOKEN: token },
  },
);
let browser;
let logs = '';
service.stderr.on('data', (chunk) => {
  logs += chunk;
});
const port = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(Error('Local API startup timed out: ' + logs)), 20000);
  createInterface({ input: service.stdout }).once('line', (line) => {
    clearTimeout(timeout);
    try {
      resolve(JSON.parse(line).port);
    } catch (error) {
      reject(error);
    }
  });
  service.once('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  service.once('exit', () => {
    clearTimeout(timeout);
    reject(Error(logs));
  });
});
(async () => {
  try {
    const origin = 'http://127.0.0.1:' + (await port);
    browser = await chromium.launch({
      headless: true,
      ...(process.env.INVENTORY_TEST_BROWSER
        ? { executablePath: process.env.INVENTORY_TEST_BROWSER }
        : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      extraHTTPHeaders: { 'X-Inventory-Local': token },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    await page.locator('.app-shell').waitFor();
    const read = () => page.evaluate(async () => (await fetch('/api/v1/state')).json());
    const modal = () => page.getByRole('dialog');
    const click = (name) => modal().getByRole('button', { name, exact: true }).click();
    const close = () => click('Fermer');
    const noStock = async () => {
      const state = await read();
      for (const key of ['products', 'stock', 'movements']) assert.deepEqual(state[key], []);
      assert(state.documents.every((d) => d.warehouse_id === null && !d.fulfilled));
      return state;
    };
    const customer = await page.evaluate(
      async () =>
        (
          await (
            await fetch('/api/v1/parties', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': crypto.randomUUID(),
              },
              body: JSON.stringify({ kind: 'customer', name: 'Client sans stock' }),
            })
          ).json()
        ).id,
    );
    await page.reload();
    await page
      .locator('.standalone-documents-panel')
      .getByRole('button', { name: 'Facture de vente', exact: true })
      .click();
    assert.equal(
      await modal()
        .getByLabel(/Entrepôt/)
        .count(),
      0,
    );
    assert.equal(
      await modal().getByRole('button', { name: 'Créer un produit', exact: true }).count(),
      0,
    );
    await modal().getByRole('combobox', { name: 'Rechercher un client' }).fill('Client sans stock');
    await modal().getByRole('option').filter({ hasText: 'Client sans stock' }).click();
    await modal().getByLabel('Désignation', { exact: true }).fill('Article hors catalogue');
    await modal().getByLabel('Unité', { exact: true }).selectOption('meter');
    await modal().getByLabel('Quantité', { exact: true }).fill('2.5');
    await modal().getByLabel('Prix unitaire', { exact: true }).fill('7.123456');
    if (process.env.INVENTORY_TEST_SCREENSHOTS) {
      fs.mkdirSync(process.env.INVENTORY_TEST_SCREENSHOTS, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.INVENTORY_TEST_SCREENSHOTS, 'standalone-form.png'),
      });
    }
    await click('Confirmer la vente');
    await modal().getByRole('heading', { name: /^INV-/ }).waitFor();
    let state = await noStock();
    const sale = state.documents[0];
    assert.equal(sale.party_id, customer);
    assert.equal(sale.total, '17.81');
    await click('Modifier le document');
    await modal().getByLabel('Quantité', { exact: true }).fill('3.5');
    await modal().getByLabel('Prix unitaire', { exact: true }).fill('10');
    await click('Enregistrer les modifications');
    await modal().getByRole('heading', { name: sale.number, exact: true }).waitFor();
    assert.equal((await noStock()).documents.find((d) => d.id === sale.id).total, '35.00');
    await click('Convertir en devis');
    await modal().getByRole('heading', { name: /^DEV-/ }).waitFor();
    await click('Créer un bon de livraison');
    await modal().getByRole('heading', { name: /^BL-/ }).waitFor();
    const delivery = (await read()).documents.find((d) => d.kind === 'delivery');
    await click('Convertir en facture');
    await modal().getByRole('heading', { name: sale.number, exact: true }).waitFor();
    assert.equal((await noStock()).documents.length, 3);
    const popupPromise = context.waitForEvent('page');
    await click('Imprimer / Enregistrer en PDF');
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.match(await popup.locator('body').innerText(), /FACTURE/);
    assert.match(await popup.locator('body').innerText(), /Article hors catalogue/);
    await popup.close();
    await close();
    await page
      .locator('.sidebar nav')
      .getByRole('button', { name: 'Documents sans stock', exact: true })
      .click();
    await page.getByRole('button', { name: delivery.number, exact: true }).click();
    await click('Supprimer le document');
    await modal().getByLabel('Motif', { exact: true }).fill('Erreur de livraison');
    await click('Supprimer le document');
    await modal().waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: delivery.number, exact: true }).count(), 0);
    await page.getByLabel('Statut', { exact: true }).selectOption('reversed');
    await page.getByRole('button', { name: delivery.number, exact: true }).waitFor();
    await page.getByLabel('Statut', { exact: true }).selectOption('');
    await page
      .locator('.standalone-documents-panel')
      .getByRole('button', { name: 'Devis', exact: true })
      .click();
    await modal().getByLabel('Désignation', { exact: true }).fill('Article de passage');
    await modal().getByLabel('Prix unitaire', { exact: true }).fill('12.34');
    await click('Enregistrer et émettre');
    await modal().getByRole('heading', { name: /^DEV-/ }).waitFor();
    await click('Convertir en facture');
    await modal().getByLabel('Désignation', { exact: true }).waitFor();
    await click('Confirmer la vente');
    await modal().getByRole('heading', { name: /^INV-/ }).waitFor();
    state = await noStock();
    const walkin = state.documents.find((d) => d.kind === 'sale' && !d.party_id);
    assert.equal(walkin.total, '12.34');
    assert.equal(walkin.paid, walkin.total);
    await close();
    // Suggestions can reuse warehouse product names, including retired/empty items,
    // but all saved lines must remain detached and leave inventory unchanged.
    const seed = await page.evaluate(async () => {
      const write = async (path, body, method = 'POST') => {
        const response = await fetch('/api/v1' + path, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw Error(await response.text());
        return response.json();
      };
      const warehouse = (await (await fetch('/api/v1/state')).json()).warehouses[0].id;
      const category = await write('/categories', { name: 'Articles de test' });
      const current = await write('/products', {
        name: 'Câble électrique professionnel avec une très longue désignation',
        category_id: category.id,
        unit: 'meter',
        price: '12.123456',
        stock_mode: 'existing',
        opening_quantity: '5',
        warehouse_id: warehouse,
      });
      const retired = await write('/products', {
        name: 'Référence retirée anciennement présente dans un entrepôt',
        category_id: category.id,
        unit: 'kg',
        price: '9.99',
        stock_mode: 'existing',
        opening_quantity: '2',
        warehouse_id: warehouse,
      });
      await write('/stock/adjust', {
        product_id: retired.id,
        warehouse_id: warehouse,
        quantity: '-2',
        reason: 'Stock épuisé',
      });
      await write('/products/' + retired.id, {}, 'DELETE');
      return { current: current.id, retired: retired.id };
    });
    await page.reload();
    await page.locator('.app-shell').waitFor();
    const inventory = await read();
    const unchangedInventory = async () => {
      const state = await read();
      for (const key of ['products', 'stock', 'movements'])
        assert.deepEqual(state[key], inventory[key]);
      for (const d of state.documents) {
        assert.equal(d.warehouse_id, null);
        for (const line of d.items) {
          assert.equal(line.product_id, null);
          assert.equal(line.warehouse_id, null);
        }
      }
      return state;
    };
    await page.getByRole('button', { name: 'Nouveau document sans stock', exact: true }).click();
    const designation = (i) =>
      modal().getByRole('combobox', { name: 'Désignation', exact: true }).nth(i);
    await designation(0).fill('cable electrique');
    await modal().getByRole('option').filter({ hasText: 'Câble électrique professionnel' }).click();
    const longName = inventory.products.find((p) => p.id === seed.current).name;
    assert.equal(await designation(0).inputValue(), longName);
    assert.equal(await modal().getByLabel('Unité', { exact: true }).first().inputValue(), 'meter');
    assert.equal(
      await modal().getByLabel('Prix unitaire', { exact: true }).first().inputValue(),
      '12.123456',
    );
    await click('Ajouter une ligne');
    await designation(1).fill('reference retiree');
    await modal().getByRole('option').filter({ hasText: 'Référence retirée' }).waitFor();
    await designation(1).press('Enter');
    assert.equal(
      await designation(1).inputValue(),
      inventory.products.find((p) => p.id === seed.retired).name,
    );
    assert.equal(await modal().getByLabel('Unité', { exact: true }).nth(1).inputValue(), 'kg');
    await click('Ajouter une ligne');
    await designation(2).fill('article hors catalogue');
    assert.equal(await modal().getByRole('listbox').getByRole('option').count(), 1);
    await designation(2).press('Enter');
    assert.equal(await designation(2).inputValue(), 'Article hors catalogue');
    assert.equal(
      Number(await modal().getByLabel('Prix unitaire', { exact: true }).nth(2).inputValue()),
      10,
    );
    await click('Ajouter une ligne');
    await designation(3).fill('Prestation jamais enregistrée');
    await modal().getByLabel('Prix unitaire', { exact: true }).nth(3).fill('0.5');
    await click('Enregistrer le brouillon');
    await click('Modifier le document');
    // A copied long description stays editable as a free line.
    await designation(0).fill(longName + ' personnalisé');
    await click('Confirmer la vente');
    await modal().getByRole('heading', { name: /^INV-/ }).waitFor();
    state = await unchangedInventory();
    assert(state.documents.some((d) => d.items.some((l) => l.name === longName + ' personnalisé')));
    await close();
    await page.getByRole('button', { name: 'Nouveau document sans stock', exact: true }).click();
    await modal().getByLabel('Type de document', { exact: true }).selectOption('quote');
    await designation(0).fill('prestation jamais');
    await designation(0).press('Enter');
    assert.equal(await designation(0).inputValue(), 'Prestation jamais enregistrée');
    await click('Enregistrer et émettre');
    await modal().getByRole('heading', { name: /^DEV-/ }).waitFor();
    await unchangedInventory();
    await close();
    // Normal stock sales retain their catalogue-only search.
    await page
      .locator('.sidebar nav')
      .getByRole('button', { name: /^Ventes\b/ })
      .click();
    await page.getByRole('button', { name: 'Nouvelle vente', exact: true }).click();
    await modal()
      .getByRole('combobox', { name: 'Rechercher un produit', exact: true })
      .fill('reference retiree');
    assert.equal(await modal().getByRole('listbox').getByRole('option').count(), 0);
    await modal()
      .getByRole('combobox', { name: 'Rechercher un produit', exact: true })
      .fill('prestation jamais');
    assert.equal(await modal().getByRole('listbox').getByRole('option').count(), 0);
    await close();
    await unchangedInventory();
    if (process.env.INVENTORY_TEST_SCREENSHOTS)
      await page.screenshot({
        path: path.join(process.env.INVENTORY_TEST_SCREENSHOTS, 'standalone-documents.png'),
      });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: standalone workflows and catalogue/history suggestions, including retired products, without inventory changes.',
    );
  } finally {
    if (browser) await browser.close();
    if (service.exitCode === null) {
      const stopped = once(service, 'exit');
      service.kill();
      await stopped;
    }
    assert.equal(path.dirname(profile), os.tmpdir());
    assert(path.basename(profile).startsWith('inventory-standalone-'));
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
