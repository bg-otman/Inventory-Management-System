const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const source = ts.transpileModule(
  fs.readFileSync(require.resolve('../frontend/lib/api.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
function setup(fetch) {
  const timers = new Map();
  let id = 0;
  const context = {
    exports: {},
    crypto: require('node:crypto').webcrypto,
    AbortController,
    fetch,
    setTimeout(fn) {
      const key = ++id;
      timers.set(key, fn);
      return key;
    },
    clearTimeout: (key) => timers.delete(key),
  };
  vm.runInNewContext(source, context);
  return {
    api: context.exports,
    timers,
    expire() {
      for (const fn of [...timers.values()]) fn();
    },
  };
}
test('a stalled response body times out and the same write keeps its idempotency key', async () => {
  const keys = [];
  let requests = 0;
  const h = setup(async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    requests++;
    return {
      ok: true,
      status: 200,
      json:
        requests === 1
          ? () =>
              new Promise((_, reject) =>
                options.signal.addEventListener('abort', () => reject(Error('aborted'))),
              )
          : async () => ({ id: 'saved-once' }),
    };
  });
  const first = h.api.command('/payments', { amount: '10' });
  await new Promise(setImmediate);
  assert.equal(h.timers.size, 1);
  h.expire();
  await assert.rejects(first, /sans risque de doublon/);
  assert.equal(h.timers.size, 0);
  await h.api.command('/payments', { amount: '10' });
  assert.equal(keys[0], keys[1]);
  await h.api.command('/payments', { amount: '10' });
  assert.notEqual(keys[1], keys[2]);
  assert.equal(h.timers.size, 0);
});
test('a stalled state request rejects rather than leaving the loading screen indefinitely', async () => {
  const h = setup(
    (_url, options) =>
      new Promise((_, reject) =>
        options.signal.addEventListener('abort', () => reject(Error('aborted'))),
      ),
  );
  const loaded = h.api.loadState();
  h.expire();
  await assert.rejects(loaded, /aborted/);
  assert.equal(h.timers.size, 0);
});
