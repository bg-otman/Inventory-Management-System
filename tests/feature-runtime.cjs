const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs');
const { _electron } = require(process.env.INVENTORY_PLAYWRIGHT_MODULE || 'playwright');
let app, page;
const shots = process.env.INVENTORY_TEST_SCREENSHOTS;
async function shot(name) {
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, name + '.png') });
  }
}
async function start() {
  const args = [path.join(__dirname, 'electron-entry.cjs')];
  if (process.env.INVENTORY_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  app = await _electron.launch({
    executablePath: require('electron'),
    args,
    env: process.env,
    timeout: 30000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.locator('.app-shell').waitFor({ timeout: 30000 });
}
const state = () => page.evaluate(async () => await (await fetch('/api/v1/state')).json());
const modal = () => page.getByRole('dialog');
const nav = (name) =>
  page.locator('.sidebar nav').getByRole('button', { name, exact: true }).click();
const close = () => modal().getByRole('button', { name: 'Fermer', exact: true }).click();
const button = (name) => modal().getByRole('button', { name, exact: true }).click();
const spin = (name, v) => modal().getByRole('spinbutton', { name, exact: true }).fill(v);
async function choose(name) {
  await modal().getByRole('combobox', { name: 'Rechercher un produit' }).first().fill(name);
  await modal().getByRole('option').filter({ hasText: name }).first().click();
}
async function stop() {
  const origin = new URL(page.url()).origin,
    closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  app = null;
  await assert.rejects(fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(1500) }));
}
async function print(title) {
  const next = app.waitForEvent('window');
  await button('Imprimer / Enregistrer en PDF');
  const popup = await next;
  await popup.waitForLoadState();
  assert.match(await popup.locator('body').innerText(), new RegExp(title));
  assert.equal(await popup.locator('html').getAttribute('lang'), 'fr');
  assert.equal(await popup.locator('.company-logo').count(), 1);
  if (shots)
    await popup.screenshot({ path: path.join(shots, title.replaceAll(' ', '-') + '.png') });
  await popup.close();
}
(async () => {
  await start();
  assert.equal(await page.locator('.language-button').count(), 0);
  const seed = await page.evaluate(
    async (logo) => {
      const write = async (p, b, m = 'POST') => {
        const r = await fetch('/api/v1' + p, {
          method: m,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify(b),
        });
        if (!r.ok) throw Error(await r.text());
        return r.json();
      };
      const s = await (await fetch('/api/v1/state')).json();
      if (s.products.length) throw Error('Use a fresh test profile.');
      const wh = s.warehouses[0].id;
      await write(
        '/settings',
        { company_name: 'Atelier Démo', address: 'Casablanca', phone: '0600000000', logo },
        'PATCH',
      );
      const cat = await write('/categories', { name: 'Électricité' }),
        customer = await write('/parties', { kind: 'customer', name: 'Client Démo' }),
        supplier = await write('/parties', { kind: 'supplier', name: 'Fournisseur Démo' });
      const p = await write('/products', {
        name: 'Câble précis',
        category_id: cat.id,
        stock_mode: 'existing',
        unit: 'meter',
        opening_quantity: '10',
        warehouse_id: wh,
        purchase_cost: '3.123456',
        price: '12.123456',
        wholesale_price: '9.123456',
      });
      await write('/products', { name: 'Lampe', category_id: cat.id, stock_mode: 'catalog' });
      return { p: p.id, wh, customer: customer.id, supplier: supplier.id };
    },
    'data:image/png;base64,' +
      fs.readFileSync(path.join(__dirname, '../desktop/icon.png')).toString('base64'),
  );
  await page.reload();
  await page.locator('.app-shell').waitFor();
  await nav('Stock');
  const search = page.getByRole('searchbox', { name: 'Rechercher dans le stock' });
  await search.pressSequentially('cable');
  assert.equal(await search.inputValue(), 'cable');
  assert.equal(await page.locator('.product-table tbody tr').count(), 1);
  await search.fill('introuvable');
  assert.equal(await page.locator('.product-table tbody tr').count(), 0);
  await search.fill('');
  await page.getByRole('button', { name: 'Ajouter un produit', exact: true }).click();
  await button('Plus de détails · facultatif');
  assert.equal(
    await modal()
      .getByText(/SKU|Code-barres|Arabe/)
      .count(),
    0,
  );
  await close();
  await page.getByRole('button', { name: 'Entrepôts', exact: true }).click();
  await page.locator('.warehouse-card').first().getByRole('button', { name: 'Renommer' }).click();
  await modal().getByRole('textbox', { name: 'Nom', exact: true }).fill('Dépôt central');
  await button('Enregistrer');
  await page.getByRole('heading', { name: 'Dépôt central', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ajouter un entrepôt', exact: true }).click();
  await modal().getByRole('textbox', { name: 'Nom', exact: true }).fill('Dépôt temporaire');
  await button('Enregistrer');
  await page
    .locator('.warehouse-card')
    .filter({ hasText: 'Dépôt temporaire' })
    .getByRole('button', { name: 'Retirer', exact: true })
    .click();
  await button('Retirer');
  assert.equal((await state()).warehouses.find((w) => w.name === 'Dépôt temporaire').active, false);
  console.log('PASS: typed stock search, no codes, rename/remove warehouse.');
  await nav('Devis');
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Nouveau devis', exact: true })
    .click();
  await modal().getByRole('combobox', { name: 'Client', exact: true }).selectOption(seed.customer);
  await modal()
    .getByRole('combobox', { name: 'Rechercher un produit' })
    .fill('Article sur commande');
  await spin('Quantité', '2');
  await spin('Prix unitaire', '7.123456');
  await button('Enregistrer et émettre');
  await modal().getByRole('button', { name: 'Modifier le document', exact: true }).waitFor();
  await print('DEVIS');
  let s = await state();
  assert.equal(s.documents.find((d) => d.kind === 'quote').total, '14.25');
  assert.equal(Number(s.parties.find((p) => p.id === seed.customer).balance), 0);
  await button('Modifier le document');
  await spin('Quantité', '3');
  await modal().getByRole('textbox', { name: 'Notes', exact: true }).fill('Offre corrigée');
  await button('Enregistrer les modifications');
  await modal().getByText('Offre corrigée', { exact: true }).waitFor();
  await button('Convertir en facture');
  await modal()
    .getByRole('heading', { name: /Facture de vente/ })
    .waitFor();
  await choose('Câble précis');
  assert.equal(
    await modal().getByRole('spinbutton', { name: 'Prix unitaire', exact: true }).inputValue(),
    '7.123456',
  );
  await modal().getByRole('checkbox', { name: 'Marchandises livrées', exact: true }).check();
  await button('Confirmer la vente');
  await modal().getByRole('button', { name: 'Modifier le document', exact: true }).waitFor();
  s = await state();
  const sale = s.documents.find((d) => d.kind === 'sale');
  assert.equal(sale.total, '21.37');
  assert.equal(s.stock.find((x) => x.product_id === seed.p).quantity, '7.000');
  await button('Modifier le document');
  await spin('Quantité', '2');
  await spin('Prix unitaire', '11.234567');
  await button('Enregistrer les modifications');
  await modal().getByRole('button', { name: 'Créer un bon de livraison', exact: true }).waitFor();
  await print('FACTURE');
  s = await state();
  assert.equal(s.stock.find((x) => x.product_id === seed.p).quantity, '8.000');
  assert.equal(s.parties.find((p) => p.id === seed.customer).balance, '22.47');
  await button('Créer un bon de livraison');
  await modal().getByRole('heading', { name: /BL-/ }).waitFor();
  await print('BON DE LIVRAISON');
  await button('Modifier le document');
  await spin('Quantité', '4');
  await button('Enregistrer les modifications');
  await button('Convertir en facture');
  await modal().getByRole('heading', { name: sale.number, exact: true }).waitFor();
  assert.equal((await state()).stock.find((x) => x.product_id === seed.p).quantity, '8.000');
  await button('Convertir en devis');
  await modal().getByRole('heading', { name: /DEV-/ }).waitFor();
  await close();
  console.log(
    'PASS: free quotation, conversion preserves price, sale correction, delivery-note edit/print, no double stock.',
  );
  await nav('Achats');
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Nouvel achat', exact: true })
    .click();
  await modal()
    .getByRole('combobox', { name: 'Fournisseur', exact: true })
    .selectOption(seed.supplier);
  await choose('Câble précis');
  await spin('Quantité', '2');
  await spin('Prix unitaire', '5.123456');
  await button('Enregistrer l’achat');
  await button('Modifier le document');
  await spin('Quantité', '3');
  await spin('Prix unitaire', '4.123456');
  await button('Enregistrer les modifications');
  await modal().getByRole('button', { name: 'Modifier le document', exact: true }).waitFor();
  await close();
  s = await state();
  assert.equal(s.stock.find((x) => x.product_id === seed.p).quantity, '11.000');
  assert.equal(s.documents.find((d) => d.kind === 'purchase').total, '12.37');
  await nav('Clients');
  await page.getByRole('button', { name: 'Client Démo', exact: true }).click();
  await modal().getByRole('heading', { name: 'Devis de ce client', exact: true }).waitFor();
  assert.equal(await modal().getByRole('button', { name: /^DEV-/ }).count(), 2);
  await shot('customer-documents');
  await close();
  await nav('Devis');
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Nouveau devis', exact: true })
    .click();
  await modal().getByRole('combobox', { name: 'Rechercher un produit' }).fill('Pièce hors stock');
  await spin('Prix unitaire', '4');
  await button('Enregistrer et émettre');
  await modal().getByRole('button', { name: 'Modifier le document', exact: true }).waitFor();
  await shot('walk-in-quote');
  await close();
  const before = await state();
  await stop();
  await start();
  assert.deepEqual(await state(), before);
  await stop();
  console.log(
    'PASS: purchase correction, customer quotations, walk-in quote, complete persistence after reopening.',
  );
})()
  .catch(async (e) => {
    console.error(e);
    if (page && !page.isClosed()) {
      console.error(await page.locator('body').innerText());
      await shot('failure');
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
  });
