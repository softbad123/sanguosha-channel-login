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

function fields(value, keys, stage) {
  const result = {};
  for (const key of keys) {
    const item = value?.[key];
    if ((typeof item !== 'string' && typeof item !== 'number') || String(item).length === 0) {
      throw failure('MISSING_FIELD', stage);
    }
    result[key] = String(item);
  }
  return result;
}

function success(value, stage) {
  if (!value || value.code !== 0) {
    throw failure('OFFICIAL_REJECTED_' + (Number.isInteger(value?.code) ? value.code : 'UNKNOWN'), stage);
  }
  return value;
}

function createContext(extra = {}) {
  const context = {
    Date, Number, String, Object, Array, Promise, JSON, Set, Map,
    assert: (ok, code, stage) => { if (!ok) throw failure(code, stage); },
    failure, fields, success,
    validateGrant: data => ({account: data.account, token: data.token,
      sign: data.sign, timestamp: data.timestamp, channelId: data.channel_id}),
    queryURL: (base, params) => base + '?' + new URLSearchParams(params).toString(),
    reportDiagnostic: () => {},
    ...extra
  };
  vm.createContext(context);
  return context;
}

function load(context, names, apiName) {
  vm.runInContext(names.map(extract).join('\n') + '\nthis.' + apiName + ' = {' + names.join(',') + '};', context);
  return context[apiName];
}

function honorHarness(options = {}) {
  const calls = [];
  const remembered = [];
  const context = createContext({
    active: () => {},
    authorizeHonor: async () => {},
    remember: attempt => remembered.push(attempt),
    json: async (attempt, stage, url, body) => {
      calls.push({stage, url, body});
      if (stage === 'sgs_session') return {code: 0, data: {thirdparty: 'honor', cId: '50027', session: 'SGS-SESSION'}};
      if (stage === 'sgs_grant') return {code: 0, data: {third_account_id: 'HONOR-UID',
        account: 'game-account', token: 'GAME-TOKEN', sign: 'GAME-SIGN',
        timestamp: Date.now(), channel_id: '320463'}};
      throw failure('UNEXPECTED_STAGE', stage);
    }
  });
  const api = load(context, ['exchangeHonor'], 'api');
  const attempt = {provider: 'honor', device: 'honor-device', stage: 'setup',
    cookies: {clear() {}}, honor: {auth: {uid: 'HONOR-UID', session: 'UNION-TOKEN',
      expires: options.authExpires === undefined ? Date.now() + 180000 : options.authExpires}}};
  if (options.session) attempt.session = options.session;
  return {api, attempt, calls, remembered};
}

function vivoHarness(options = {}) {
  const calls = [];
  const remembered = [];
  let sessionRequests = 0;
  const context = createContext({
    VIVO_PACKAGE: 'com.yoka.sgstenth.vivo',
    active: () => {},
    remember: attempt => remembered.push(attempt),
    json: async (attempt, stage, url, body) => {
      if (stage === 'sgs_session') {
        sessionRequests += 1;
        calls.push({stage: 'sgs_session', uid: body.data.uid, session: body.data.session});
        if (sessionRequests === 1 && options.rejectFirstSession) return {code: 50804};
        return {code: 0, data: {session: 'SGS-SESSION'}};
      }
      if (stage === 'sgs_grant') {
        calls.push({stage: 'sgs_grant'});
        return {code: 0, data: {account: 'vivo-account', token: 'GAME-TOKEN', sign: 'GAME-SIGN',
          timestamp: Date.now(), channel_id: '320056'}};
      }
      throw failure('UNEXPECTED_STAGE', stage);
    },
    vivoBrowserValue: async (attempt, path, values, post = false) => {
      calls.push({stage: path, values, post});
      if (path === '/h5/union/get') {
        if (options.getCode) return {code: options.getCode, authPending: options.getCode === 30101};
        return {code: 0, data: {openId: 'PARENT-OPENID', nickName: 'vivo-nick',
          subAccounts: [{subOpenId: 'OTHER-SUB', lastLogin: true, frozenFlag: false},
            {subOpenId: 'SAVED-SUB', lastLogin: false, frozenFlag: false}]},
          extraData: {minor: false, forceNative: false}, extraInfo: 'extra-info'};
      }
      if (path === '/h5/account/realName') return {code: 0, data: {accountRealName: true}};
      if (path === '/h5/union/use') {
        assert.strictEqual(post, true);
        assert.strictEqual(values.subOpenId, 'SAVED-SUB');
        return {code: 0, data: 'FRESH-OPEN-TOKEN', extraData: {minor: false, forceNative: false},
          noticeData: null, vipRecall: 0};
      }
      throw failure('UNEXPECTED_PATH', 'vivo_account');
    }
  });
  const api = load(context, ['vivoSavedAccountChoice', 'refreshVivoOpenToken', 'exchangeVivo'], 'api');
  const attempt = {provider: 'vivo', restored: true, stage: 'restore', device: 'vivo-device',
    vivo: {uid: 'SAVED-SUB', session: 'STALE-OPEN-TOKEN', username: 'vivo-nick', openId: 'PARENT-OPENID'},
    session: '', cookies: {clear() {}}, requests: new Set()};
  return {api, attempt, calls, remembered, get sessionRequests() { return sessionRequests; }};
}

async function main() {
  {
    const harness = honorHarness({session: 'SGS-SAVED', authExpires: Date.now() - 1});
    const grant = await harness.api.exchangeHonor(harness.attempt);
    assert.strictEqual(grant.account, 'game-account');
    assert.deepStrictEqual(harness.calls.map(call => call.stage), ['sgs_grant']);
    assert.strictEqual(new URL(harness.calls[0].url).searchParams.get('ticket'), 'SGS-SAVED');
  }

  {
    const harness = honorHarness({authExpires: Date.now() - 1});
    await assert.rejects(() => harness.api.exchangeHonor(harness.attempt),
      error => error.message === 'SAVED_SESSION_EXPIRED' && error.stage === 'honor_game');
    assert.strictEqual(harness.calls.length, 0);
  }

  {
    const harness = vivoHarness({rejectFirstSession: true});
    const grant = await harness.api.exchangeVivo(harness.attempt);
    assert.strictEqual(grant.account, 'vivo-account');
    assert.deepStrictEqual(harness.calls.map(call => call.stage),
      ['sgs_session', '/h5/union/get', '/h5/account/realName', '/h5/union/use', 'sgs_session', 'sgs_grant']);
    assert.strictEqual(harness.calls[0].session, 'STALE-OPEN-TOKEN');
    assert.strictEqual(harness.calls[4].session, 'FRESH-OPEN-TOKEN');
    assert.strictEqual(harness.attempt.vivo.uid, 'SAVED-SUB');
    assert.strictEqual(harness.attempt.vivo.session, 'FRESH-OPEN-TOKEN');
    assert.strictEqual(harness.attempt.vivo.openId, 'PARENT-OPENID');
    assert.strictEqual(harness.remembered.length, 1);
  }

  {
    const harness = vivoHarness({rejectFirstSession: true, getCode: 30101});
    await assert.rejects(() => harness.api.exchangeVivo(harness.attempt),
      error => error.message === 'SAVED_SESSION_EXPIRED' && error.stage === 'vivo_account');
    assert.strictEqual(harness.sessionRequests, 1);
    assert.strictEqual(harness.calls.some(call => call.stage === '/h5/union/use'), false);
  }

  console.log(JSON.stringify({ok: true, checks: 4}, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
