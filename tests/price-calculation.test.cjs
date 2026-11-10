const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const output = ts.transpileModule(
  fs.readFileSync(require.resolve('../frontend/lib/types.ts'), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } },
).outputText;
const context = { exports: {} };
vm.runInNewContext(output, context);
const { totals, priceLabel } = context.exports;
test('full unit-price precision is used before rounding each line to cents', () => {
  for (const [quantity, price, expected] of [
    ['1000', '0.001235', 1.24],
    ['1', '2.675', 2.68],
    ['3', '0.335', 1.01],
    ['0.001', '5', 0.01],
    ['1.5', '0.333333', 0.5],
    ['10000', '0.000125', 1.25],
  ]) {
    assert.equal(totals([{ product_id: 'p', quantity, price }], '0').total, expected);
  }
  assert.equal(
    totals(
      [
        { quantity: '1', price: '0.005' },
        { quantity: '1', price: '0.005' },
      ],
      '0.01',
    ).total,
    0.01,
  );
  assert.equal(totals([{ quantity: '1000000', price: '1e-6' }], '0').total, 1);
});
test('display retains all price decimals and large integer precision', () => {
  assert.equal(priceLabel('0.001235', 'fr'), '0,001235');
  assert.equal(priceLabel('15.00', 'fr'), '15,00');
  assert.equal(
    priceLabel('90071992547409.123456', 'fr').replace(/[.\s\u202f\u00a0]/g, ''),
    '90071992547409,123456',
  );
});
