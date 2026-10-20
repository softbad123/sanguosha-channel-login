const fs = require('fs');
const vm = require('vm');

function extract(name) {
  const source = fs.readFileSync('_direct_engine.js', 'utf8');
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
  if (!match) throw new Error(name + ' not found');
  const start = match.index + match[0].length - 1;
  let depth = 0, end = -1;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (character === '{') depth++;
    else if (character === '}') { depth--; if (depth === 0) { end = index + 1; break; } }
  }
  if (end < 0) throw new Error(name + ' incomplete');
  return source.slice(match.index, end);
}

const blocked = [];
let providerBusy = false;
const context = {
  attempt: null,
  busy: false,
  disposed: false,
  releaseLock: null,
  lockOwnerToken: '',
  runGeneration: 0,
  activeRunGeneration: 0,
  middle: null,
  ui: {output: {textContent: ''}},
  Date, String, Object, Set, Promise,
  random: (() => { let counter = 0; return () => (++counter).toString(16).padStart(32, '0'); })(),
  sessionText: (value, limit = 32768) => (typeof value === 'string' || typeof value === 'number') &&
    String(value).length > 0 && String(value).length <= limit ? String(value) : '',
  SESSION_PROFILE_PATTERN: /^[A-Za-z0-9._:-]{1,256}$/,
  Cookies: class Cookies { clear() {} },
  normalizeClientToken: token => {
    if (!/^[a-f0-9]{16,64}$/.test(token || '')) throw new Error('CLIENT_TOKEN_INVALID');
    return token;
  },
  assert: (ok, code, stage) => { if (!ok) { const error = new Error(code); error.stage = stage; throw error; } },
  failure: (code, stage) => Object.assign(new Error(code), {stage}),
  remembered: () => null,
  restoreMiddle: () => {},
  setProvidersBusy: value => { providerBusy = value; },
  hideQR: () => {},
  errorUI: (error, token) => { context.lastError = {message: error.message, token}; },
  invalidateOnError: () => {},
  restoreSteamCheckpoint: () => {},
  unlock: token => {
    if (!context.releaseLock) return;
    if (token && context.lockOwnerToken !== token) return;
    const release = context.releaseLock;
    context.releaseLock = null;
    context.lockOwnerToken = '';
    release();
  },
  clearAttempt: token => {
    const current = context.attempt;
    if (current && token && current.clientToken !== token) return false;
    context.attempt = null;
    if (current) for (const cancel of [...(current.requests || [])]) cancel();
    context.unlock(token || current?.clientToken || '');
    return !!current;
  },
  acquireLock: async token => {
    if (context.releaseLock) throw Object.assign(new Error('OTHER_TAB_ACTIVE'), {stage: 'setup'});
    context.releaseLock = () => { context.releaseCount = (context.releaseCount || 0) + 1; };
    context.lockOwnerToken = token;
  },
  exchange: attempt => new Promise((resolve, reject) => {
    blocked.push({provider: attempt.provider, resolve, reject});
  }),
  showMiddle: async () => {},
  forget: () => {},
  active: () => {},
  get providerBusy() { return providerBusy; }
};

context.unlock = context.unlock.bind(context);
context.clearAttempt = context.clearAttempt.bind(context);
vm.createContext(context);
vm.runInContext('this.__start = ' + extract('start') + ';', context);

const wxToken = 'a'.repeat(32);
const qqToken = 'b'.repeat(32);
async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('timeout waiting for ' + label + ': ' + JSON.stringify({
    provider: context.attempt?.provider || '', busy: context.busy,
    lockToken: context.lockOwnerToken, blocked: blocked.map(item => item.provider),
    error: context.lastError || null
  }));
}

(async () => {
  const wxRun = context.__start('wx', {clientToken: wxToken});
  await waitFor(() => blocked.some(item => item.provider === 'wx'), 'WeChat start');
  const qqRun = context.__start('qq', {clientToken: qqToken});
  await waitFor(() => blocked.some(item => item.provider === 'qq'), 'QQ start');

  const wxFlow = blocked.find(item => item.provider === 'wx');
  wxFlow.reject(Object.assign(new Error('WX_SUPERSEDED'), {stage: 'wx_oauth'}));
  await wxRun.catch(() => {});

  const during = {
    provider: context.attempt?.provider || '',
    token: context.attempt?.clientToken || '',
    busy: context.busy,
    providerBusy,
    lockToken: context.lockOwnerToken
  };

  const qqFlow = blocked.find(item => item.provider === 'qq');
  qqFlow.resolve();
  await qqRun.catch(() => {});

  const after = {
    provider: context.attempt?.provider || '',
    token: context.attempt?.clientToken || '',
    busy: context.busy,
    providerBusy,
    lockToken: context.lockOwnerToken,
    released: context.releaseCount || 0,
    error: context.lastError || null
  };
  console.log(JSON.stringify({during, after}, null, 2));

  const ok = during.provider === 'qq' && during.token === qqToken && during.busy === true &&
    during.providerBusy === true && during.lockToken === qqToken &&
    after.provider === 'qq' && after.token === qqToken && after.busy === false &&
    after.providerBusy === false && after.lockToken === '' && after.released === 2 &&
    after.error === null;
  if (!ok) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
