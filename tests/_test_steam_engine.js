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

const fn = extract('waitForSteamPage');
const prefix = 'sgs-steam-page-result-v1:';
const nonce = 'd'.repeat(32);
const state = 'e'.repeat(32);

async function run(name, value, expectedError = '') {
  const store = new Map();
  if (value) store.set(prefix + nonce, value);
  const ctx = {
    STEAM_PAGE_RESULT_KEY: prefix, Date, Number, String, Object,
    GM_getValue: (key, fallback) => store.has(key) ? store.get(key) : fallback,
    GM_deleteValue: key => store.delete(key),
    active: () => {},
    setBrowserNotice: (attempt, text) => { attempt.browserNotice = text; },
    assert: (ok, code, stage) => { if (!ok) { const error = new Error(code); error.stage = stage; throw error; } },
    failure: (code, stage) => Object.assign(new Error(code), {stage}),
    sleep: async () => {}
  };
  vm.createContext(ctx);
  const attempt = {browserNonce: nonce, state, stage: 'setup'};
  try {
    const out = await vm.runInContext('(' + fn + ')(attempt)', Object.assign(ctx, {attempt}));
    const ok = !expectedError && out.access_token === 'token-12345678' && out.steamID === '76561198000000000' &&
      out.expires > Date.now() && !store.has(prefix + nonce);
    return {name, ok, out, consumed: !store.has(prefix + nonce)};
  } catch (error) {
    return {name, ok: error.message === expectedError, error: error.message};
  }
}

(async () => {
  const base = {v: 1, nonce, state, access_token: 'token-12345678', steamid: '76561198000000000',
    expires_in: 3600, createdAt: Date.now(), expires: Date.now() + 60000};
  const results = [
    await run('valid', base),
    await run('state-mismatch', {...base, state: 'f'.repeat(32)}, 'STEAM_STATE_MISMATCH'),
    await run('nonce-mismatch', {...base, nonce: 'a'.repeat(32)}, 'STEAM_PAGE_RESULT_INVALID'),
    await run('expired', {...base, createdAt: Date.now() - 130000, expires: Date.now() - 1}, 'STEAM_PAGE_RESULT_EXPIRED'),
    await run('missing-token', {...base, access_token: ''}, 'STEAM_PAGE_RESULT_INVALID')
  ];
  console.log(JSON.stringify(results, null, 2));
  if (results.some(item => !item.ok)) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
