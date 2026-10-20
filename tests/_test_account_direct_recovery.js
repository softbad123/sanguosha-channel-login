const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
  if (!match) throw new Error(name + ' not found');
  const start = match.index + match[0].length - 1;
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  throw new Error(name + ' is incomplete');
}

function optionalExtract(name) {
  try { return extract(name); } catch (_) { return ''; }
}

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function failure(code, stage, extra = {}) {
  return Object.assign(new Error(code), {stage, ...extra});
}

const providers = ['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei'];
const grantStage = provider => provider === 'bilibili' ? 'bili_grant' :
  provider === 'steam' ? 'steam_grant' : 'sgs_grant';

function upstreamCredentials(provider) {
  const future = Date.now() + 3600000;
  if (provider === 'qq' || provider === 'wx') return {
    wegame: {openid: 'openid', access_token: 'wegame-token', uid: 'uid',
      channel: '00000000', ct: 'refresh-ct', atExpires: future}
  };
  if (provider === 'bilibili') return {bili: {uid: '1', access_key: 'bili-key',
    uname: 'bili-user', expires: Math.floor(future / 1000)}};
  if (provider === 'steam') return {steam: {access_token: 'steam-token',
    steamID: '76561198000000000', expires: 0, retainedUntil: future}};
  if (provider === 'oppo') return {oppo: {token: 'oppo-token', ssoid: 'ssoid',
    accountName: 'oppo-user', credentialType: 'game-ticket'}};
  if (provider === 'xiaomi' || provider === 'vivo') return {
    [provider]: {uid: 'uid', session: 'upstream-session', username: 'user'}
  };
  return {[provider]: {auth: {uid: 'uid', session: 'upstream-session',
    username: 'user', expires: future}}};
}

function savedRecord(provider, overrides = {}) {
  const recordId = providers.indexOf(provider).toString(16).padStart(2, '0').repeat(16);
  return {
    v: 3, provider, profileId: provider + ':account-1', id: recordId,
    expires: Number.MAX_SAFE_INTEGER, created: Date.now() - 1000,
    updated: Date.now(), account: provider + '-account', session: 'stale-session',
    ...upstreamCredentials(provider), ...overrides
  };
}

function makeHarness(record, options = {}) {
  const key = 'sgs-session-v3:' + encodeURIComponent(record.profileId) + ':' + encodeURIComponent(record.provider);
  const store = new Map([[key, record]]);
  const calls = [];
  const remembered = [];
  const events = [];
  let randomCounter = 0;
  const context = {
    SESSION_STORE_PREFIX: 'sgs-session-v3:',
    SESSION_PROVIDERS: new Set(providers),
    SESSION_PROFILE_PATTERN: /^[A-Za-z0-9._:-]{1,256}$/,
    SESSION_RECORD_EXPIRES_FOREVER: Number.MAX_SAFE_INTEGER,
    SESSION_KEY: 'legacy-session',
    STEAM_PENDING_KEY: 'steam-pending',
    GAME_ROUTES: {
      qq: {path: '/10/pc/index.php'}, wx: {path: '/10/pc/index.php'},
      bilibili: {path: '/10/pc/bilibiliWD_index.php'}, steam: {path: '/10/pc/index.php'},
      oppo: {path: '/10/pc/index.php'}, vivo: {path: '/10/pc/index.php'},
      huawei: {path: '/10/pc/index.php'},
      xiaomi: {path: '/x/pc/index.php'}
    },
    GM_getValue: (name, fallback) => store.has(name) ? store.get(name) : fallback,
    GM_setValue: (name, value) => store.set(name, value),
    GM_deleteValue: name => store.delete(name),
    GM_listValues: () => [...store.keys()],
    Date, Number, String, Object, Array, JSON, Set, Promise, RegExp,
    attempt: null,
    legacySessionMigrated: false,
    releaseLock: null,
    lockOwnerToken: '',
    busy: false,
    disposed: false,
    runGeneration: 0,
    activeRunGeneration: 0,
    random: () => (++randomCounter).toString(16).padStart(32, '0'),
    normalizeClientToken: token => {
      if (!/^[a-f0-9]{16,64}$/.test(token || '')) throw failure('CLIENT_TOKEN_INVALID', 'setup');
      return token;
    },
    Cookies: class Cookies { clear() {} },
    failure,
    assert,
    fields: (value, keys, stage) => {
      if (!value || typeof value !== 'object') throw failure('RESPONSE_SCHEMA_CHANGED', stage);
      const result = {};
      for (const name of keys) {
        const item = value[name];
        if ((typeof item === 'string' || typeof item === 'number') && String(item).length > 0) {
          result[name] = String(item);
        }
      }
      if (Object.keys(result).length !== keys.length) throw failure('RESPONSE_SCHEMA_CHANGED', stage);
      return result;
    },
    active: () => {},
    hideQR: () => {},
    restoreMiddle: () => {},
    setProvidersBusy: () => {},
    emitDirectEvent: event => { events.push(event); return ''; },
    forgetCalls: 0,
    callCount: 0,
    showMiddleCalls: 0,
    openGameCalls: 0,
    exchange: async attempt => {
      calls.push({provider: attempt.provider, session: attempt.session});
      if (options.exchange) return options.exchange(attempt, calls.length);
      if (calls.length === 1) throw failure('OFFICIAL_REJECTED_1001', grantStage(attempt.provider));
      if (attempt.session) throw failure('REBUILD_DID_NOT_CLEAR_SESSION', 'setup');
      attempt.session = 'fresh-session';
      attempt.grant = {account: attempt.account || 'account', token: 'T', sign: 'S',
        timestamp: Math.floor(Date.now() / 1000)};
      attempt.grantExpires = Date.now() + 90000;
      return attempt.grant;
    },
    remember: attempt => { remembered.push({provider: attempt.provider, session: attempt.session}); return true; },
    showMiddle: async () => {
      context.showMiddleCalls += 1;
      if (options.showMiddleFails) throw failure('OFFICIAL_ENTRY_DOM_CHANGED', 'entry_ui');
    },
    openGame: attempt => { context.openGameCalls += 1; context.openGameAttempt = attempt; },
    errorUI: error => {
      context.lastError = error;
      context.microError = {code: error.message, stage: error.stage,
        ...(error.recoverable ? {recoverable: true} : {})};
      events.push({type: 'error', provider: context.attempt?.provider || '',
        code: error.message, stage: error.stage, clientToken: context.attempt?.clientToken || '',
        recoverable: error.recoverable === true});
    },
    forget: attempt => {
      context.forgetCalls += 1;
      for (const [name, value] of store) {
        if (value?.id === attempt?.savedId) store.delete(name);
      }
    },
    acquireLock: async token => { context.lockOwnerToken = token; context.releaseLock = () => {}; },
    unlock: token => {
      if (token && context.lockOwnerToken !== token) return;
      context.lockOwnerToken = ''; context.releaseLock = null;
    },
    clearAttempt: token => {
      const current = context.attempt;
      if (current && token && current.clientToken !== token) return false;
      context.attempt = null;
      context.unlock(token || current?.clientToken || '');
      return !!current;
    },
    location: {pathname: options.path || '/login/x/index', assign: () => {}},
    ui: {output: {textContent: ''}},
    microError: null
  };
  vm.createContext(context);
  const functionNames = [
    'sessionText', 'copiedFields', 'sessionStoreRecord', 'migrateLegacySession',
    'sessionRecords', 'savedSession', 'sessionForAttempt', 'validateBiliAuth',
    'validateSteamAuth', 'invalidateOnError'
  ];
  const functions = functionNames.map(extract).concat([
    optionalExtract('canReplaySavedAuth'), optionalExtract('staleGrantRejected'),
    optionalExtract('gameRouteForAttempt'), extract('expireAttempt'),
    extract('cancelFlow'), extract('resume')
  ]).filter(Boolean).join('\n');
  vm.runInContext(functions, context);
  return {context, store, key, calls, remembered, events};
}

async function resume(harness, provider) {
  try {
    const result = await harness.context.resume({
      profileId: provider + ':account-1', provider, required: true,
      clientToken: 'a'.repeat(32), saveSession: true
    });
    return {result, error: ''};
  } catch (error) {
    return {result: false, error: error.message, stage: error.stage || '',
      reauthRequired: error.reauthRequired === true};
  }
}

(async () => {
  const results = [];
  for (const provider of providers) {
    const harness = makeHarness(savedRecord(provider));
    const run = await resume(harness, provider);
    results.push({provider, ...run,
      calls: harness.calls.map(call => call.session || ''),
      remembered: harness.remembered, showMiddle: harness.context.showMiddleCalls});
  }

  const expiredHuawei = savedRecord('huawei');
  expiredHuawei.session = 'stale-session';
  expiredHuawei.huawei.auth.expires = Date.now() - 1;
  const expiredHarness = makeHarness(expiredHuawei, {
    exchange: async () => { throw failure('SAVED_SESSION_EXPIRED', 'sgs_grant'); }
  });
  const expiredRun = await resume(expiredHarness, 'huawei');

  const gameHarness = makeHarness(savedRecord('qq'), {
    path: '/10/pc/index.php', showMiddleFails: true,
    exchange: async attempt => {
      gameHarness.calls.push({provider: attempt.provider, session: attempt.session});
      attempt.session = 'fresh-session';
      attempt.grant = {account: 'game-account', token: 'T', sign: 'S',
        timestamp: Math.floor(Date.now() / 1000)};
      attempt.grantExpires = Date.now() + 90000;
      return attempt.grant;
    }
  });
  const gameRun = await resume(gameHarness, 'qq');

  const expiryHarness = makeHarness(savedRecord('qq'));
  const expiryToken = 'b'.repeat(32);
  expiryHarness.context.attempt = {provider: 'qq', clientToken: expiryToken,
    savedId: savedRecord('qq').id, expires: Date.now() - 1};
  const expiryCleared = expiryHarness.context.expireAttempt(expiryToken);

  const cancelStore = makeHarness(savedRecord('wx'));
  const supersededToken = 'c'.repeat(32);
  cancelStore.context.attempt = {provider: 'wx', clientToken: supersededToken,
    savedId: savedRecord('wx').id, expires: Date.now() + 60000};
  const supersededCleared = cancelStore.context.cancelFlow(supersededToken, 'superseded');
  const userToken = 'd'.repeat(32);
  cancelStore.context.attempt = {provider: 'wx', clientToken: userToken,
    savedId: savedRecord('wx').id, expires: Date.now() + 60000};
  const userCleared = cancelStore.context.cancelFlow(userToken, 'user');

  const allRebuilt = results.every(item => item.result === true && item.calls.length === 2 &&
    item.calls[1] === '' && item.remembered.length >= 1 && item.showMiddle === 1);
  const failureKeptRecord = expiredRun.result === false &&
    expiredRun.reauthRequired && expiredHarness.store.has(expiredHarness.key) &&
    expiredHarness.context.forgetCalls === 0;
  const gamePageDirect = gameRun.result === true && gameHarness.context.openGameCalls === 1 &&
    gameHarness.context.showMiddleCalls === 0;
  const expiryKeptRecord = expiryCleared && expiryHarness.store.has(expiryHarness.key) &&
    expiryHarness.context.forgetCalls === 0 && expiryHarness.context.attempt === null &&
    expiryHarness.events.some(event => event.type === 'error' && event.code === 'LOGIN_FLOW_EXPIRED');
  const cancelReasons = supersededCleared && userCleared &&
    !cancelStore.events.some(event => event.type === 'cancel' && event.reason === 'superseded') &&
    cancelStore.events.some(event => event.type === 'cancel' && event.reason === 'user') &&
    cancelStore.store.has(cancelStore.key);

  console.log(JSON.stringify({results, expired: {...expiredRun,
    recordKept: expiredHarness.store.has(expiredHarness.key), forgetCalls: expiredHarness.context.forgetCalls},
    game: {...gameRun, openGameCalls: gameHarness.context.openGameCalls,
      showMiddleCalls: gameHarness.context.showMiddleCalls},
    expiry: {cleared: expiryCleared, recordKept: expiryHarness.store.has(expiryHarness.key),
      forgetCalls: expiryHarness.context.forgetCalls,
      event: expiryHarness.events.find(event => event.type === 'error') || null},
    cancel: {supersededCleared, userCleared, events: cancelStore.events},
    checks: {allRebuilt, failureKeptRecord, gamePageDirect, expiryKeptRecord, cancelReasons}}, null, 2));
  if (!allRebuilt || !failureKeptRecord || !gamePageDirect || !expiryKeptRecord || !cancelReasons) {
    process.exit(1);
  }
})().catch(error => { console.error(error); process.exit(1); });
