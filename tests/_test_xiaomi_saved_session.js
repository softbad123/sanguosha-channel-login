'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
  if (!match) throw new Error(name + ' not found');
  const start = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  throw new Error(name + ' is incomplete');
}

function failure(code, stage) {
  return Object.assign(new Error(code), {stage});
}

function success(value, stage) {
  if (!value || value.code !== 0) {
    throw failure('OFFICIAL_REJECTED_' + (Number.isInteger(value?.code) ? value.code : 'UNKNOWN'), stage);
  }
  return value;
}

function fields(value, keys, stage) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure('RESPONSE_SCHEMA_CHANGED', stage);
  }
  const result = {};
  for (const key of keys) {
    const item = value[key];
    if (!((typeof item === 'string' || typeof item === 'number') && String(item).length > 0)) {
      throw failure('RESPONSE_SCHEMA_CHANGED', stage);
    }
    result[key] = String(item);
  }
  return result;
}

function queryURL(base, params) {
  return base + '?' + new URLSearchParams(params).toString();
}

function validateGrant(data) {
  return {...data, channelId: data.channel_id};
}

const sessionFunctions = [
  'sessionText', 'xiaomiOAuthFields', 'sessionStoreKey', 'copiedFields',
  'sessionStoreRecord', 'migrateLegacySession', 'sessionRecords', 'savedSession'
];
const xiaomiFunctions = [
  'xiaomiGameCredentials', 'xiaomiGameSession', 'xiaomiSgsSession', 'exchangeXiaomi'
];

function storageHarness() {
  const store = new Map();
  let randomCounter = 0;
  const context = {
    SESSION_STORE_PREFIX: 'sgs-login-session-v3:',
    SESSION_PROVIDERS: new Set(['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei', 'honor', 'yybqq', 'yybwx']),
    SESSION_PROFILE_PATTERN: /^[A-Za-z0-9._:-]{1,256}$/,
    SESSION_RECORD_EXPIRES_FOREVER: Number.MAX_SAFE_INTEGER,
    SESSION_KEY: 'legacy-session',
    GM_getValue: (name, fallback) => store.has(name) ? store.get(name) : fallback,
    GM_setValue: (name, value) => store.set(name, value),
    GM_deleteValue: name => store.delete(name),
    GM_listValues: () => [...store.keys()],
    Date, Number, String, Object, Array, JSON, Set, Promise, RegExp,
    attempt: null,
    legacySessionMigrated: false,
    random: () => (++randomCounter).toString(16).padStart(32, '0')
  };
  vm.createContext(context);
  vm.runInContext(sessionFunctions.map(extract).concat([
    extract('remember'), extract('rememberBrowserSessionRecord')
  ]).join('\n'), context);
  return {context, store};
}

function transport(options, calls) {
  let gameIndex = 0;
  let sessionIndex = 0;
  let grantIndex = 0;
  return {
    xiaomiSDK: async (attempt, path, plain, post = false) => {
      calls.push({type: 'sdk', path, plain, post});
      if (path === '/misdk/v2/oauth') {
        return options.oauthResponse || {code: 0, uuid: '123456', st: 'service-token'};
      }
      if (path === '/migc-sdk-account/getLoginAppAccount_v2') {
        const values = options.gameResponses || [
          {retCode: 200, appAccountId: '654321', session: 'NATIVE-SESSION', nickName: 'nick'}
        ];
        return values[Math.min(gameIndex++, values.length - 1)];
      }
      throw failure('UNEXPECTED_PATH', 'xiaomi_sdk');
    },
    json: async (attempt, stage) => {
      calls.push({type: 'json', stage});
      if (stage === 'sgs_session') {
        const values = options.sessionResponses || [{code: 0, data: {session: 'SGS-SESSION'}}];
        return values[Math.min(sessionIndex++, values.length - 1)];
      }
      if (stage === 'sgs_grant') {
        const values = options.grantResponses || [{code: 0, data: {
          account: attempt.account || 'game-account', token: 'T', sign: 'S',
          timestamp: Date.now(), channel_id: '320052'
        }}];
        return values[Math.min(grantIndex++, values.length - 1)];
      }
      throw failure('UNEXPECTED_STAGE', stage);
    }
  };
}

function exchangeHarness(options = {}) {
  const calls = [];
  const remembered = [];
  const context = {
    XIAOMI_GAME_APP: '2882303761520011303',
    Date, Number, String, Object, Array, JSON, Set, Promise, RegExp,
    failure, success, fields, queryURL, validateGrant,
    assert: (ok, code, stage) => { if (!ok) throw failure(code, stage); },
    active: () => {},
    remember: attempt => remembered.push({
      provider: attempt.provider, session: attempt.session, xiaomi: attempt.xiaomi,
      xiaomiOAuth: attempt.xiaomiOAuth
    }),
    ...transport(options, calls)
  };
  vm.createContext(context);
  vm.runInContext(sessionFunctions.concat(xiaomiFunctions, ['canReplaySavedAuth']).map(extract).join('\n'), context);
  return {context, calls, remembered};
}

function resumeHarness(record, options = {}) {
  const calls = [];
  const diagnostics = [];
  const errors = [];
  const store = new Map([[sessionKey(record.profileId, record.provider), record]]);
  let randomCounter = 0;
  let lockOwner = '';
  const context = {
    SESSION_STORE_PREFIX: 'sgs-login-session-v3:',
    SESSION_PROVIDERS: new Set(['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei', 'honor', 'yybqq', 'yybwx']),
    SESSION_PROFILE_PATTERN: /^[A-Za-z0-9._:-]{1,256}$/,
    SESSION_RECORD_EXPIRES_FOREVER: Number.MAX_SAFE_INTEGER,
    SESSION_KEY: 'legacy-session',
    GM_getValue: (name, fallback) => store.has(name) ? store.get(name) : fallback,
    GM_setValue: (name, value) => store.set(name, value),
    GM_deleteValue: name => store.delete(name),
    GM_listValues: () => [...store.keys()],
    Date, Number, String, Object, Array, JSON, Set, Promise, RegExp,
    XIAOMI_GAME_APP: '2882303761520011303',
    attempt: null,
    legacySessionMigrated: false,
    busy: false,
    disposed: false,
    runGeneration: 0,
    activeRunGeneration: 0,
    releaseLock: null,
    lockOwnerToken: '',
    GAME_ROUTES: {xiaomi: {path: '/x/pc/index.php'}},
    location: {pathname: '/login/x/index', assign: () => {}},
    random: () => (++randomCounter).toString(16).padStart(32, '0'),
    normalizeClientToken: token => {
      if (!/^[a-f0-9]{16,64}$/.test(token || '')) throw failure('CLIENT_TOKEN_INVALID', 'setup');
      return token;
    },
    Cookies: class Cookies {
      clear() {}
    },
    failure, success, fields, queryURL, validateGrant,
    assert: (ok, code, stage) => { if (!ok) throw failure(code, stage); },
    active: () => {},
    reportDiagnostic: value => diagnostics.push(value),
    restoreMiddle: () => {},
    clearAttempt: token => {
      const current = context.attempt;
      if (current && token && current.clientToken !== token) return false;
      context.attempt = null;
      context.unlock(token || current?.clientToken || '');
      return true;
    },
    setProvidersBusy: () => {},
    openGame: () => { context.openGameCalls += 1; },
    showMiddle: async () => { context.showMiddleCalls += 1; },
    errorUI: error => errors.push(error),
    acquireLock: async token => {
      lockOwner = token;
      context.lockOwnerToken = token;
      context.releaseLock = () => {};
    },
    unlock: expected => {
      if (expected && lockOwner !== expected) return;
      lockOwner = '';
      context.lockOwnerToken = '';
      context.releaseLock = null;
    },
    exchange: async attempt => context.exchangeXiaomi(attempt)
  };
  const memory = transport(options, calls);
  Object.assign(context, memory);
  Object.assign(context, {openGameCalls: 0, showMiddleCalls: 0});
  vm.createContext(context);
  vm.runInContext(sessionFunctions.concat(xiaomiFunctions, [
    'remember', 'canReplaySavedAuth', 'staleGrantRejected', 'gameRouteForAttempt',
    'invalidateOnError', 'resume'
  ]).map(extract).join('\n'), context);
  return {context, store, calls, diagnostics, errors};
}

function sessionKey(profileId, provider) {
  return 'sgs-login-session-v3:' + encodeURIComponent(profileId) + ':' + encodeURIComponent(provider);
}

function savedRecord(overrides = {}) {
  return {
    v: 3, provider: 'xiaomi', profileId: 'xiaomi:account-1', id: 'b'.repeat(32),
    expires: Number.MAX_SAFE_INTEGER, created: Date.now() - 1000, updated: Date.now(),
    account: 'game-account', device: 'device', session: '',
    xiaomiOAuth: {uuid: '123456', st: 'service-token'},
    ...overrides
  };
}

async function main() {
  const checks = [];

  {
    const harness = storageHarness();
    const raw = savedRecord({
      session: 'SGS-SAVED',
      xiaomi: {uid: '654321', session: 'NATIVE-SAVED', username: 'nick'}
    });
    const normalized = harness.context.sessionStoreRecord(raw);
    assert.strictEqual(normalized.xiaomiOAuth.st, 'service-token');
    assert.strictEqual(normalized.xiaomi.session, 'NATIVE-SAVED');

    const invalid = harness.context.sessionStoreRecord(savedRecord({
      id: 'c'.repeat(32),
      xiaomiOAuth: {uuid: '123456', st: 'bad&token'}
    }));
    assert.strictEqual(invalid.xiaomiOAuth, undefined, 'invalid service token must not persist');

    const attempt = {
      provider: 'xiaomi', saveSession: true, __sgsProfileId: 'xiaomi:qr',
      session: 'SGS-QR', account: 'game-account', device: 'device',
      xiaomi: {uid: '111', session: 'NATIVE-QR', username: 'qr'},
      xiaomiOAuth: {uuid: '111', st: 'qr-token'}
    };
    harness.context.attempt = attempt;
    assert.strictEqual(harness.context.remember(attempt), true);
    const stored = harness.context.savedSession('xiaomi', 'xiaomi:qr');
    assert.strictEqual(stored.xiaomiOAuth.st, 'qr-token');
    assert.strictEqual(stored.xiaomi.session, 'NATIVE-QR');

    const external = {
      provider: 'xiaomi', profileId: 'xiaomi:browser', session: 'SGS-BROWSER',
      account: 'game-account',
      xiaomiOAuth: {uuid: '222', st: 'browser-token'},
      xiaomi: {uid: '222', session: 'NATIVE-BROWSER', username: 'browser'}
    };
    assert.strictEqual(harness.context.rememberBrowserSessionRecord(external), true);
    const first = harness.context.savedSession('xiaomi', 'xiaomi:browser');
    assert.strictEqual(first.xiaomiOAuth.st, 'browser-token');
    assert.strictEqual(first.session, 'SGS-BROWSER');
    assert.strictEqual(harness.context.rememberBrowserSessionRecord({
      ...external, session: 'SGS-BROWSER-2',
      xiaomi: {...external.xiaomi, session: 'NATIVE-BROWSER-2'}
    }), true);
    const second = harness.context.savedSession('xiaomi', 'xiaomi:browser');
    assert.strictEqual(second.id, first.id, 'browser login must update the existing record');
    assert.strictEqual(second.created, first.created);
    assert.strictEqual(second.session, 'SGS-BROWSER-2');
    assert.strictEqual(second.xiaomi.session, 'NATIVE-BROWSER-2');
    assert.strictEqual(harness.context.rememberBrowserSessionRecord({...external, profileId: 'bad/profile'}), false);
    assert.strictEqual(harness.context.rememberBrowserSessionRecord({...external, saveSession: false}), false);
    assert.strictEqual(harness.context.rememberBrowserSessionRecord({
      ...external, profileId: 'xiaomi:bad-token', xiaomiOAuth: {uuid: '2', st: 'a=b'}
    }), false);
    checks.push('stores the renewable Xiaomi service token for QR and browser logins');
  }

  {
    const harness = exchangeHarness();
    const attempt = {
      provider: 'xiaomi', restored: false, state: 'state', device: 'device',
      cookies: {clear() {}}, xiaomiCode: 'CODE'
    };
    const grant = await harness.context.exchangeXiaomi(attempt);
    assert.strictEqual(grant.account, 'game-account');
    assert.strictEqual(attempt.xiaomiOAuth.st, 'service-token');
    assert.strictEqual(attempt.xiaomi.session, 'NATIVE-SESSION');
    assert.strictEqual(attempt.session, 'SGS-SESSION');
    assert.strictEqual(harness.calls[0].path, '/misdk/v2/oauth');
    assert.strictEqual(harness.calls[1].path, '/migc-sdk-account/getLoginAppAccount_v2');
    assert(harness.calls[1].plain.includes('toke=service-token'));
    assert.strictEqual(harness.remembered[0].xiaomiOAuth.st, 'service-token');
    checks.push('a fresh Xiaomi QR authorization keeps uuid/st after minting the game session');
  }

  {
    const harness = exchangeHarness();
    const attempt = {
      provider: 'xiaomi', restored: true, device: 'device', cookies: {clear() {}},
      xiaomiOAuth: {uuid: '123456', st: 'service-token'}
    };
    const grant = await harness.context.exchangeXiaomi(attempt);
    assert.strictEqual(grant.account, 'game-account');
    assert.strictEqual(harness.calls.some(call => call.path === '/misdk/v2/oauth'), false,
      'restore must not open the OAuth code exchange');
    assert.strictEqual(harness.calls.filter(call => call.path === '/migc-sdk-account/getLoginAppAccount_v2').length, 1);
    assert.strictEqual(attempt.session, 'SGS-SESSION');
    assert.strictEqual(harness.remembered[0].xiaomiOAuth.st, 'service-token');
    checks.push('an OAuth-only saved record renews the Xiaomi game session without another authorization');
  }

  {
    const harness = exchangeHarness({
      sessionResponses: [{code: 50804}, {code: 0, data: {session: 'SGS-FRESH'}}],
      gameResponses: [{retCode: 200, appAccountId: '654321', session: 'NATIVE-FRESH', nickName: 'nick'}]
    });
    const attempt = {
      provider: 'xiaomi', restored: true, device: 'device', cookies: {clear() {}},
      xiaomi: {uid: '654321', session: 'NATIVE-STALE', username: 'nick'},
      xiaomiOAuth: {uuid: '123456', st: 'service-token'}
    };
    const grant = await harness.context.exchangeXiaomi(attempt);
    assert.strictEqual(grant.account, 'game-account');
    assert.strictEqual(harness.calls.filter(call => call.type === 'json' && call.stage === 'sgs_session').length, 2);
    assert.strictEqual(harness.calls.some(call => call.path === '/migc-sdk-account/getLoginAppAccount_v2'), true);
    assert.strictEqual(attempt.xiaomi.session, 'NATIVE-FRESH');
    assert.strictEqual(attempt.session, 'SGS-FRESH');
    checks.push('a rejected native game session is refreshed from the stored service token');
  }

  {
    const harness = exchangeHarness({gameResponses: [{retCode: 1515}]});
    const attempt = {
      provider: 'xiaomi', restored: true, device: 'device', cookies: {clear() {}},
      xiaomiOAuth: {uuid: '123456', st: 'expired-token'}
    };
    await assert.rejects(() => harness.context.exchangeXiaomi(attempt),
      error => error.message === 'SAVED_SESSION_EXPIRED' && error.stage === 'xiaomi_game');
    assert.strictEqual(attempt.xiaomiOAuth.st, 'expired-token');
    assert.strictEqual(harness.calls.filter(call => call.type === 'json').length, 0);

    const fresh = exchangeHarness({gameResponses: [{retCode: 1515}]});
    await assert.rejects(() => fresh.context.exchangeXiaomi({
      provider: 'xiaomi', restored: false, device: 'device', cookies: {clear() {}},
      xiaomiOAuth: {uuid: '123456', st: 'expired-token'}
    }), error => error.message === 'XIAOMI_GAME_ACCOUNT_REJECTED' && error.stage === 'xiaomi_sdk');
    checks.push('an expired stored service token requires re-authorization but is not discarded');
  }

  {
    const harness = exchangeHarness();
    const replay = harness.context;
    assert.strictEqual(replay.canReplaySavedAuth({provider: 'xiaomi',
      xiaomiOAuth: {uuid: '123456', st: 'service-token'}}), true);
    assert.strictEqual(replay.canReplaySavedAuth({provider: 'xiaomi',
      xiaomi: {uid: '123456', session: 'NATIVE'}}), true);
    assert.strictEqual(replay.canReplaySavedAuth({provider: 'xiaomi', session: 'SGS'}), false);
    assert.strictEqual(replay.canReplaySavedAuth({provider: 'vivo',
      xiaomiOAuth: {uuid: '123456', st: 'service-token'}}), false);
    checks.push('saved-auth replay recognizes the service token without weakening other providers');
  }

  {
    const record = savedRecord();
    const harness = resumeHarness(record);
    const result = await harness.context.resume({
      profileId: record.profileId, provider: 'xiaomi', required: true,
      clientToken: 'a'.repeat(32), saveSession: true
    });
    assert.strictEqual(result, true);
    assert.strictEqual(harness.context.showMiddleCalls, 1);
    assert.strictEqual(harness.calls.some(call => call.path === '/misdk/v2/oauth'), false);
    assert.strictEqual(harness.calls.some(call => call.path === '/migc-sdk-account/getLoginAppAccount_v2'), true);
    const stored = harness.context.savedSession('xiaomi', record.profileId);
    assert.strictEqual(stored.xiaomiOAuth.st, 'service-token');
    assert.strictEqual(stored.session, 'SGS-SESSION');
    assert.strictEqual(stored.xiaomi.session, 'NATIVE-SESSION');
    checks.push('resume reconstructs an OAuth-only record and persists the renewed session');
  }

  {
    const record = savedRecord({
      session: 'STALE-SGS',
      xiaomi: {uid: '654321', session: 'NATIVE-STILL-VALID', username: 'nick'}
    });
    const harness = resumeHarness(record, {
      grantResponses: [{code: 1001}, {code: 0, data: {
        account: 'game-account', token: 'T', sign: 'S',
        timestamp: Date.now(), channel_id: '320052'
      }}]
    });
    const result = await harness.context.resume({
      profileId: record.profileId, provider: 'xiaomi', required: true,
      clientToken: 'd'.repeat(32), saveSession: true
    });
    assert.strictEqual(result, true);
    assert.strictEqual(harness.calls.some(call => call.path === '/migc-sdk-account/getLoginAppAccount_v2'), false,
      'a still-valid native game session should be reused first');
    const stages = harness.calls.filter(call => call.type === 'json').map(call => call.stage);
    assert.deepStrictEqual(stages, ['sgs_grant', 'sgs_session', 'sgs_grant']);
    assert.strictEqual(harness.context.savedSession('xiaomi', record.profileId).xiaomiOAuth.st, 'service-token');
    checks.push('resume keeps the existing native-session rebuild path before using device credentials');
  }

  {
    const record = savedRecord();
    const harness = resumeHarness(record, {gameResponses: [{retCode: 1515}]});
    await assert.rejects(() => harness.context.resume({
      profileId: record.profileId, provider: 'xiaomi', required: true,
      clientToken: 'e'.repeat(32), saveSession: true
    }), error => error.message === 'SAVED_SESSION_EXPIRED' &&
      error.stage === 'xiaomi_game' && error.reauthRequired === true);
    assert.strictEqual(harness.store.has(sessionKey(record.profileId, 'xiaomi')), true,
      'a failed renewal must keep the account record');
    assert.strictEqual(harness.context.showMiddleCalls, 0);
    checks.push('an expired stored service token asks for re-authorization and keeps the account record');
  }

  console.log(JSON.stringify({ok: true, checks}, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
