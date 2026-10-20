const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('_direct_engine.js', 'utf8');
function extract(name) {
  const start = src.indexOf('async function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let depth = 0, end = -1, seen = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; seen = true; }
    else if (ch === '}') { depth--; if (seen && depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}
const fn = extract('waitForOppoPage');
const R = 'sgs-oppo-page-result-v1:';
const OPPO_PAGE_RESULT_KEY = R;
async function run(name, value, nonce) {
  const store = new Map();
  if (value) store.set(R + nonce, value);
  const ctx = { OPPO_PAGE_RESULT_KEY: R,
    URL,
    GM_getValue: (k, d) => store.has(k) ? store.get(k) : d,
    GM_deleteValue: k => store.delete(k),
    active: () => {},
    setBrowserNotice: (attempt, text) => { attempt.browserNotice = text; },
    assert: (ok, code, stage) => { if (!ok) { const e = new Error(code); e.stage = stage; throw e; } },
    failure: (code, stage) => Object.assign(new Error(code), {stage}),
    sleep: async () => {},
    Date, Number, String, Set, Object
  };
  vm.createContext(ctx);
  const a = {browserNonce: nonce, stage: 'setup'};
  try {
    const out = await vm.runInContext('(' + fn + ')(a)', Object.assign(ctx, {a}));
    console.log(name, 'OK', out, 'consumed=' + !store.has(R + nonce));
  } catch (e) {
    console.log(name, 'ERR', e.message, e.stage);
  }
}
const n = 'b'.repeat(32);
(async () => {
  await run('valid-code', {v:1, nonce:n, code:'ABC12345', ticket:'', href:'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?code=ABC12345', createdAt:Date.now(), expires:Date.now()+60000}, n);
  await run('ticket-only', {v:1, nonce:n, code:'', ticket:'TICKET12345', href:'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?ticket=TICKET12345', createdAt:Date.now(), expires:Date.now()+60000}, n);
  await run('expired', {v:1, nonce:n, code:'ABC12345', href:'https://game-login.heytap.com/game-union-h5/h5/client-login/index.html?code=ABC12345', createdAt:Date.now()-130000, expires:Date.now()-1000}, n);
  await run('wrong-host', {v:1, nonce:n, code:'ABC12345', href:'https://evil.example/game-union-h5/h5/client-login/index.html?code=ABC12345', createdAt:Date.now(), expires:Date.now()+60000}, n);
  await run('nonce-missing', null, '');
})();


