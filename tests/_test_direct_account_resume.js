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

const storageFunctions = [
  'sessionText', 'copiedFields', 'sessionStoreRecord', 'migrateLegacySession',
  'sessionRecords', 'savedSession', 'sessionForAttempt'
].map(extract).join('\n');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function failure(code, stage) {
  return Object.assign(new Error(code), {stage});
}

function makeContext(record) {
  const key = 'sgs-session-v3:' + encodeURIComponent(record.profileId) + ':' + encodeURIComponent(record.provider);
  const store = new Map([[key, record]]);
  const calls = [];
  const remembered = [];
  let randomCounter = 0;
  let releaseLock = null;
  let lockOwnerToken = '';
  const context = {
    SESSION_STORE_PREFIX: 'sgs-session-v3:',
    SESSION_PROVIDERS: new Set(['qq', 'wx', 'bilibili', 'steam', 'oppo', 'xiaomi', 'vivo', 'huawei']),
    SESSION_PROFILE_PATTERN: /^[A-Za-z0-9._:-]{1,256}$/,
    SESSION_RECORD_EXPIRES_FOREVER: Number.MAX_SAFE_INTEGER,
    SESSION_KEY: 'legacy-session',
    STEAM_PENDING_KEY: 'steam-pending',
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
    GAME_ROUTES: {},
    location: {pathname: '/login/x/index'},
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
    reportDiagnostic: () => {},
    hideQR: () => {},
    restoreMiddle: () => {},
    setProvidersBusy: () => {},
    errorUI: error => { context.lastError = error; },
    invalidateOnError: () => {},
    forget: () => {},
    showMiddle: async () => {},
    remember: attempt => {
      remembered.push({provider: attempt.provider, session: attempt.session, wegame: attempt.wegame,
        steam: attempt.steam ? {...attempt.steam} : null});
      return true;
    },
    exchangeVivo: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    exchangeHuawei: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    exchangeXiaomi: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    exchangeSteam: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    exchangeBili: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    exchangeOppo: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    prepareWX: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    waitForWX: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    prepare: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    waitForQQ: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    redeem: async () => { throw failure('UNEXPECTED_PROVIDER', 'setup'); },
    nativeSession: () => ({atExpires: Date.now() + 3600000, ct: 'refresh-ct'}),
    refreshNative: async () => {},
    queryURL: (base, values) => {
      const url = new URL(base);
      for (const [name, value] of Object.entries(values)) url.searchParams.set(name, String(value));
      return url.href;
    },
    CONFIG: {
      wga_appid: 'wga-app', wga_app_key: 'wga-key', TD_SDK_APP_ID: '485', TD_CONFIG_ID: '117',
      TD_CHANNEL_ID: '', channel_id: '', any_platform_id: '10038', any_platform_name: 'wegame',
      TD_GROUP_ID: '0'
    },
    json: async (_attempt, stage, url, body) => {
      calls.push({stage, url, body});
      if (stage === 'channel') return {last_month_channel: '00000000'};
      if (stage === 'sgs_session') return {code: 0, data: {session: 'fresh-session'}};
      if (stage === 'sgs_grant') {
        if (!String(url).includes('ticket=fresh-session')) throw failure('OFFICIAL_REJECTED_1001', stage);
        return {code: 0, data: {account: 'wegame-account', token: 'T', sign: 'S',
          timestamp: Math.floor(Date.now() / 1000), channel_id: 320023}};
      }
      throw failure('UNEXPECTED_ENDPOINT', stage);
    },
    success: (value, stage) => {
      if (!value || (Object.hasOwn(value, 'code') && Number(value.code) !== 0)) {
        throw failure('OFFICIAL_REJECTED_1001', stage);
      }
      return value;
    },
    validateGrant: value => ({...value}),
    acquireLock: async token => {
      if (releaseLock) throw failure('OTHER_TAB_ACTIVE', 'setup');
      context.lockOwnerToken = token;
      context.releaseLock = () => { context.releaseCount = (context.releaseCount || 0) + 1; };
    },
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
      context.unlock(token || current?.clientToken || '');
      return !!current;
    }
  };
  vm.createContext(context);
  vm.runInContext(storageFunctions, context);
  return {context, calls, remembered, store};
}

function steamHarness(options = {}) {
  const profileId = 'steam:account-1';
  const harness = makeContext({
    v: 3, provider: 'steam', profileId, id: '1'.repeat(32), expires: Number.MAX_SAFE_INTEGER,
    created: Date.now() - 1000, updated: Date.now(), account: 'steam-account',
    steam: {
      access_token: 'steam-access-token', steamID: '', expires: 0,
      ...(options.withoutRetainedUntil ? {} : {retainedUntil: Date.now() + 60 * 60 * 1000})
    }
  });
  const transportCalls = [];
  Object.assign(harness.context, {
    EMBEDDED: true,
    transport: async (_attempt, url, options) => {
      transportCalls.push({url, body: options.body});
      return {responseText: JSON.stringify({code: 0, data: {
        account: 'steam-account', token: 'T', sign: 'S',
        timestamp: Math.floor(Date.now() / 1000), channel_id: 320061
      }})};
    },
    steamSigned: access_token => ({access_token, timestamp: Math.floor(Date.now() / 1000), sign: 'steam-sign'}),
    validateSteamGrant: value => ({...value}),
    waitForSteamPage: async () => { throw failure('UNEXPECTED_STEAM_SCAN', 'steam_browser_login'); },
    prepareSteam: async () => { throw failure('UNEXPECTED_STEAM_SCAN', 'steam_preflight'); },
    renderSteamQR: () => { throw failure('UNEXPECTED_STEAM_SCAN', 'steam_qr'); },
    waitForSteam: async () => { throw failure('UNEXPECTED_STEAM_SCAN', 'steam_poll'); },
    authorizeSteam: async () => { throw failure('UNEXPECTED_STEAM_SCAN', 'steam_oauth'); }
  });
  vm.runInContext(extract('validateSteamAuth') + '\n' + extract('exchangeSteam') + '\n' +
    extract('canReplaySavedAuth') + '\n' + extract('staleGrantRejected') + '\n' +
    extract('gameRouteForAttempt') + '\n' + extract('resume'), harness.context);
  harness.context.exchange = attempt => harness.context.exchangeSteam(attempt);
  return {harness, profileId, transportCalls};
}

function wegameHarness(provider = 'qq', options = {}) {
  const profileId = 'wegame:account-1';
  const harness = makeContext({
    v: 3, provider, profileId, id: '2'.repeat(32), expires: Number.MAX_SAFE_INTEGER,
    created: Date.now() - 1000, updated: Date.now(), account: 'wegame-account',
    session: 'stale-session', wegame: {
      openid: 'wegame-openid', access_token: 'wegame-access-token', uid: 'wegame-uid',
      channel: '00000000', ct: 'refresh-ct', atExpires: Date.now() + 60 * 60 * 1000
    }
  });
  if (options.acceptSavedSession) {
    harness.context.json = async (_attempt, stage, url) => {
      harness.calls.push({stage, url});
      if (stage !== 'sgs_grant' || !String(url).includes('ticket=stale-session')) {
        throw failure('OFFICIAL_REJECTED_1001', stage);
      }
      return {code: 0, data: {account: 'wegame-account', token: 'T', sign: 'S',
        timestamp: Math.floor(Date.now() / 1000), channel_id: 320023}};
    };
  }
  vm.runInContext(extract('canReplaySavedAuth') + '\n' + extract('staleGrantRejected') + '\n' +
    extract('gameRouteForAttempt') + '\n' + extract('exchange') + '\n' + extract('resume'), harness.context);
  return {harness, profileId};
}

async function callResume(harness, profileId, provider) {
  try {
    const result = await harness.context.resume({
      profileId, provider, required: true,
      clientToken: 'a'.repeat(32), saveSession: true
    });
    return {result, error: ''};
  } catch (error) {
    return {result: false, error: error.message, stage: error.stage || ''};
  }
}

(async () => {
  const steam = steamHarness();
  const steamRun = await callResume(steam.harness, steam.profileId, 'steam');
  const steamRemembered = steam.harness.remembered.find(item => item.provider === 'steam');
  const steamOk = steamRun.result === true && steamRun.error === '' &&
    steam.transportCalls.length === 1 &&
    String(steam.transportCalls[0].body?.access_token) === 'steam-access-token' &&
    steamRemembered?.steam?.access_token === 'steam-access-token' &&
    steamRemembered?.steam?.steamID === '' &&
    steamRemembered?.steam?.retainedUntil > Date.now() + 23 * 60 * 60 * 1000;

  const wegame = wegameHarness('qq');
  const wegameRun = await callResume(wegame.harness, wegame.profileId, 'qq');
  const wegameOk = wegameRun.result === true && wegameRun.error === '' &&
    wegame.harness.calls.some(call => call.stage === 'sgs_session') &&
    wegame.harness.calls.some(call => call.stage === 'sgs_grant' &&
      String(call.url).includes('ticket=fresh-session')) &&
    wegame.harness.remembered.some(item => item.session === 'fresh-session');

  const fallback = wegameHarness('wx');
  const fallbackRun = await callResume(fallback.harness, fallback.profileId, 'wegame');
  const fallbackOk = fallbackRun.result === true && fallbackRun.error === '' &&
    fallback.harness.calls.some(call => call.stage === 'sgs_session') &&
    fallback.harness.remembered.some(item => item.provider === 'wx' && item.session === 'fresh-session');

  const migratedSteam = steamHarness({withoutRetainedUntil: true});
  const migratedSteamRun = await callResume(migratedSteam.harness, migratedSteam.profileId, 'steam');
  const migratedSteamRemembered = migratedSteam.harness.remembered.find(item => item.provider === 'steam');
  const migratedSteamOk = migratedSteamRun.result === true && migratedSteamRun.error === '' &&
    migratedSteam.transportCalls.length === 1 && migratedSteamRemembered?.steam?.retainedUntil > Date.now();

  const validSession = wegameHarness('qq', {acceptSavedSession: true});
  const validSessionRun = await callResume(validSession.harness, validSession.profileId, 'qq');
  const validSessionOk = validSessionRun.result === true && validSessionRun.error === '' &&
    validSession.harness.calls.length === 1 && validSession.harness.calls[0].stage === 'sgs_grant';

  console.log(JSON.stringify({steam: {...steamRun, ok: steamOk,
      transportCalls: steam.transportCalls.length, remembered: steamRemembered || null},
    wegame: {...wegameRun, ok: wegameOk,
      stages: wegame.harness.calls.map(call => call.stage)},
    fallback: {...fallbackRun, ok: fallbackOk,
      stages: fallback.harness.calls.map(call => call.stage)},
    migratedSteam: {...migratedSteamRun, ok: migratedSteamOk,
      stages: migratedSteam.transportCalls.length},
    validSession: {...validSessionRun, ok: validSessionOk,
      stages: validSession.harness.calls.map(call => call.stage)}}, null, 2));

  if (!steamOk || !wegameOk || !fallbackOk || !migratedSteamOk || !validSessionOk) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
