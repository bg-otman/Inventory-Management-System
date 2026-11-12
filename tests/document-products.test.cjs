const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const context = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(require.resolve('../frontend/lib/types.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
const suggestions = context.exports.standaloneProductSuggestions;
const product = (id, name, active = true) => ({
  id,
  name,
  active,
  unit: 'meter',
  price: '12.123456',
  description: '',
});
const document = (id, created_at, items, kind = 'sale') => ({ id, created_at, kind, items });
const line = (name, unit = 'meter', price = '7.123456') => ({ name, unit, price });

test('standalone suggestions include retired and out-of-stock catalogue products without needing warehouse data', () => {
  const s = {
    products: [product('a', 'Câble électrique'), product('b', 'Ancien article', false)],
    documents: [],
  };
  const before = JSON.stringify(s);
  const options = suggestions(s);
  assert.equal(options.length, 2);
  assert.equal(options[0].price, '12.123456');
  assert.equal(options[1].name, 'Ancien article');
  assert.match(options[1].description, /Retiré/);
  assert.equal(JSON.stringify(s), before);
});

test('standalone history keeps previous names and free lines, using the latest entry per name and unit', () => {
  const s = {
    products: [],
    documents: [
      document('old', '2026-11-01', [line('Nom très long', 'kg', '1'), line('Ancien nom retiré')]),
      document('new', '2026-11-12', [
        line('Nom très long', 'kg', '2.123456'),
        line('Nom très long', 'meter', '3'),
      ]),
    ],
  };
  const before = JSON.stringify(s);
  const options = suggestions(s);
  assert.equal(options.length, 3);
  assert.equal(
    options.find((p) => p.name === 'Nom très long' && p.unit === 'kg').price,
    '2.123456',
  );
  assert.equal(options.find((p) => p.name === 'Ancien nom retiré').unit, 'meter');
  assert.equal(JSON.stringify(s), before);
});

test('catalogue descriptions take priority over duplicate history while distinct units remain available', () => {
  const options = suggestions({
    products: [product('a', 'Câble électrique')],
    documents: [
      document('history', '2026-11-12', [
        line('  CABLE ELECTRIQUE  '),
        line('Câble électrique', 'kg'),
        line('   '),
      ]),
    ],
  });
  assert.equal(options.length, 2);
  assert.equal(options[0].name, 'Câble électrique');
  assert.equal(options[0].price, '12.123456');
  assert.equal(options[1].unit, 'kg');
});

test('purchase history supplies the article name and unit without suggesting its cost as a selling price', () => {
  const options = suggestions({
    products: [],
    documents: [document('purchase', '2026-11-12', [line('Article acheté')], 'purchase')],
  });
  assert.equal(options[0].name, 'Article acheté');
  assert.equal(options[0].unit, 'meter');
  assert.equal(options[0].price, null);
});
