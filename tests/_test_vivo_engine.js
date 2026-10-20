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
const fn = extract('waitForVivoPage');
const RESULT = 'sgs-vivo-page-result-v1:';
const STATE = 'sgs-vivo-page-state-v1:';
async function run(name, value, state, nonce) {
  const store = new Map();
  if (value) store.set(RESULT + nonce, value);
  if (state) store.set(STATE + nonce, state);
  const ctx = { VIVO_PAGE_RESULT_KEY: RESULT, VIVO_PAGE_STATE_PREFIX: STATE,
    URL, Date, Number, String, Object,
    GM_getValue: (key, fallback) => store.has(key) ? store.get(key) : fallback,
    GM_deleteValue: key => store.delete(key),
    active: () => {},
    setBrowserNotice: (attempt, text) => { attempt.browserNotice = text; },
    assert: (ok, code, stage) => { if (!ok) { const e = new Error(code); e.stage = stage; throw e; } },
    failure: (code, stage) => Object.assign(new Error(code), {stage}),
    sleep: async () => {}
  };
  vm.createContext(ctx);
  const a = {browserNonce: nonce, stage: 'setup'};
  try {
    const out = await vm.runInContext('(' + fn + ')(a)', Object.assign(ctx, {a}));
    if ('phone' in out) throw new Error('Vivo result must not expose phone');
    console.log(name, 'OK', JSON.stringify({out, notice: a.browserNotice,
      resultConsumed: !store.has(RESULT + nonce), stateConsumed: !store.has(STATE + nonce)}));
  } catch (e) {
    console.log(name, 'ERR', e.message, e.stage, 'notice=' + (a.browserNotice || ''));
  }
}
const n = 'c'.repeat(32);
(async () => {
  await run('valid-result', {v:1, nonce:n, subOpenId:'SUB123', openToken:'TOKEN123456',
    openId:'OPEN123',
    href:'https://joint.vivo.com.cn/game-subaccount-login/?from=auth',
    createdAt:Date.now(), expires:Date.now()+60000},
  {v:1, nonce:n, phase:'official_login_called', expires:Date.now()+60000}, n);
  await run('expired', {v:1, nonce:n, subOpenId:'SUB123', openToken:'TOKEN123456',
    href:'https://joint.vivo.com.cn/game-subaccount-login/?from=auth',
    createdAt:Date.now()-130000, expires:Date.now()-1000}, null, n);
  await run('wrong-host', {v:1, nonce:n, subOpenId:'SUB123', openToken:'TOKEN123456',
    href:'https://evil.example/game-subaccount-login/?from=auth',
    createdAt:Date.now(), expires:Date.now()+60000}, null, n);
  await run('nonce-missing', null, null, '');
})();
