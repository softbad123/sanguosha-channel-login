'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');
const {TextEncoder} = require('util');

const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(name) {
  let match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
  if (!match) match = new RegExp('class\\s+' + name + '\\s*\\{').exec(source);
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

function engineAssert(ok, code, stage) {
  if (!ok) throw failure(code, stage);
}

function throwsCode(callback, code) {
  let caught = null;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  assert(caught, 'expected ' + code);
  assert.strictEqual(caught.message, code);
  return caught;
}

const HONOR_QR = 'https://hnid-drcn.cloud.honor.com';
const HONOR_QR_COMPAT = 'https://hnid-drcn.cloud.hihonor.com';
const HONOR_ACCOUNT = 'https://hnid-drcn.platform.hihonorcloud.com';
const HONOR_AUTH = 'https://hnoauth-login.cloud.hihonor.com';
const HONOR_GAME = 'https://gamecenter-api-drcn.hispace.hihonorcloud.com';
const HONOR_APP = '104459689';
class TestURL extends URL {}
TestURL.createObjectURL = () => 'blob:honor-qr';
class TestBlob {
  constructor(parts, options) { this.parts = parts; this.type = options?.type || ''; }
}

function createContext(extra = {}) {
  const context = {
    HONOR_CHANNEL: 320463,
    HONOR_APP,
    HONOR_AUTH,
    HONOR_QR,
    HONOR_QR_COMPAT,
    HONOR_ACCOUNT,
    HONOR_GAME,
    HONOR_QR_HOSTS: new Set(['hnid-drcn.cloud.honor.com', 'hnid-drcn.cloud.hihonor.com']),
    HONOR_HOSTS: new Set(['hnid-drcn.cloud.honor.com', 'hnid-drcn.cloud.hihonor.com',
      'hnoauth-login.cloud.hihonor.com', 'hnid-drcn.platform.hihonorcloud.com',
      'gamecenter-api-drcn.hispace.hihonorcloud.com']),
    URL, URLSearchParams, Set, Map, Object, Array, String, Number, JSON, Date, Math, RegExp,
    Uint8Array, Promise, TextEncoder, crypto: crypto.webcrypto,
    queryURL: (base, params) => base + '?' + new URLSearchParams(params).toString(),
    assert: engineAssert, failure, console,
    ...extra
  };
  vm.createContext(context);
  return context;
}

function load(context, names, apiName) {
  vm.runInContext(names.map(extract).join('\n') + '\nthis.' + apiName + ' = {' + names.join(',') + '};', context);
  return context[apiName];
}

function honorXML(serviceToken, owner = 'HONOR-UID') {
  return '<?xml version="1.0" encoding="UTF-8"?><result resultCode="0"><LoginByQrCodeRsp>' +
    '<userID>' + owner + '</userID><serviceToken>' + serviceToken + '</serviceToken>' +
    '</LoginByQrCodeRsp></result>';
}

function authHarness(options = {}) {
  const calls = {json: [], request: []};
  let pollIndex = 0;
  let sleeps = 0;
  const polls = options.polls || [{
    resultCode: '0', userID: 'HONOR-UID', code: 'SCAN-CODE', accountType: '2',
    siteID: '1', userAccount: '138<000>'
  }];
  const token = options.token || {open_id: 'HONOR-UID', code: 'OAUTH-CODE', expires_in: 3600};
  const game = options.game || {
    loginData: {errorCode: 0, data: {appId: HONOR_APP, isChildAccount: false,
      realInfo: {hasRealName: true, isAdult: true}, unionToken: {openId: 'HONOR-UID', token: 'UNION-TOKEN'}}}
  };
  const context = createContext({
    performance,
    queueMicrotask,
    sleep: async () => { sleeps += 1; },
    active: () => {},
    hideQR: attempt => { attempt.qrHidden = true; }
  });
  const honor = load(context, ['parseURL', 'fields', 'honorURL', 'honorText',
    'honorXML', 'honorLoginResult', 'authorizeHonor'], 'honor');
  context.honorJSON = async (attempt, stage, url, body, jsonBody) => {
    calls.json.push({stage, url, body, jsonBody});
    if (stage === 'honor_poll') {
      const result = polls[Math.min(pollIndex, polls.length - 1)];
      pollIndex += 1;
      return {...result};
    }
    if (stage === 'honor_token') return {...token};
    if (stage === 'honor_game') return JSON.parse(JSON.stringify(game));
    throw failure('UNEXPECTED_STAGE', stage);
  };
  context.honorRequest = async (attempt, stage, url, body, jsonBody, extra) => {
    if (stage === 'honor_account') {
      calls.request.push({stage, url, body, jsonBody, extra});
      return {status: 200, responseText: options.accountXML || honorXML('abcdefghijklmnopqrstuvwxyz')};
    }
    throw failure('UNEXPECTED_STAGE', stage);
  };
  const attempt = {
    device: 'honor-device-123', expires: Date.now() + 60000, stage: 'setup',
    cookies: {cleared: false, clear() { this.cleared = true; }},
    honor: {qr: {content: HONOR_QR + '/qrcode/login.jsp?qRCode=QR-CODE&qSiteID=1',
      qrToken: 'QR-TOKEN', code: 'QR-CODE', siteID: '1'}}
  };
  return {context, honor, attempt, calls, get sleeps() { return sleeps; }};
}

function exchangeHarness(options = {}) {
  const calls = [];
  const remembered = [];
  let authorized = 0;
  const context = createContext({
    active: () => {},
    authorizeHonor: async () => { authorized += 1; },
    remember: attempt => remembered.push(attempt),
    json: async (attempt, stage, url, body) => {
      calls.push({stage, url, body});
      if (stage === 'sgs_session') {
        return {code: 0, data: {thirdparty: options.thirdparty || 'honor',
          cId: options.cId === undefined ? 50027 : options.cId, session: 'SGS-SESSION'}};
      }
      if (stage === 'sgs_grant') {
        return {code: 0, data: {third_account_id: options.thirdAccountId || 'HONOR-UID',
          account: 'game-account', token: 'GAME-TOKEN', sign: 'GAME-SIGN',
          timestamp: Date.now(), channel_id: '320463'}};
      }
      throw failure('UNEXPECTED_STAGE', stage);
    }
  });
  const honor = load(context, ['fields', 'success', 'validateGrant', 'exchangeHonor'], 'honor');
  const attempt = {
    provider: 'honor', device: 'honor-device-123', stage: 'setup',
    honor: {auth: {uid: 'HONOR-UID', session: 'UNION-TOKEN',
      expires: options.authExpires === undefined ? Date.now() + 180000 : options.authExpires}}
  };
  if (options.session) attempt.session = options.session;
  return {context, honor, attempt, calls, remembered, get authorized() { return authorized; }};
}

(async () => {
  const checks = [];
  const check = (name, callback) => {
    callback();
    checks.push(name);
  };

  const protocol = createContext();
  const unit = load(protocol, ['parseURL', 'uniqueParams', 'fields', 'honorURL', 'honorText',
    'honorXML', 'honorLoginResult'], 'honor');

  check('current and compatible Honor QR hosts', () => {
    for (const host of [HONOR_QR, HONOR_QR_COMPAT]) {
      const url = host + '/qrcode/login.jsp?reqClientType=701&qrSiteID=1&loginChannel=7000700&qRCode=ABC';
      assert.strictEqual(unit.honorURL(url, 'honor_qr').hostname, new URL(host).hostname);
    }
    const denied = throwsCode(() => unit.honorURL('https://evil.example/qrcode/login.jsp?qRCode=ABC', 'honor_qr'),
      'ENDPOINT_DENIED');
    assert.strictEqual(denied.stage, 'honor_qr');
  });

  check('Honor endpoint path allowlist', () => {
    throwsCode(() => unit.honorURL(HONOR_QR + '/AccountServer/IDM/loginByQrCode', 'honor_qr'), 'ENDPOINT_DENIED');
    throwsCode(() => unit.honorURL(HONOR_AUTH + '/oauth2/v3/token', 'honor_token'), 'ENDPOINT_DENIED');
    assert.strictEqual(unit.honorURL(HONOR_ACCOUNT + '/AccountServer/IDM/loginByQrCode',
      'honor_account').pathname, '/AccountServer/IDM/loginByQrCode');
    assert.strictEqual(unit.honorURL(HONOR_GAME + '/game/union/sdk/v1/aggregate/login',
      'honor_game').pathname, '/game/union/sdk/v1/aggregate/login');
  });

  check('Honor XML escaping and strict result parsing', () => {
    assert.strictEqual(unit.honorXML({userAccount: '<&>"\''}), '<userAccount>&lt;&amp;&gt;&quot;&apos;</userAccount>');
    assert.strictEqual(unit.honorLoginResult(honorXML('abcdefghijklmnopqrstuvwxyz&amp;ok'), 'HONOR-UID'),
      'abcdefghijklmnopqrstuvwxyz&ok');
    throwsCode(() => unit.honorLoginResult(honorXML('token', 'OTHER'), 'HONOR-UID'), 'ACCOUNT_MISMATCH');
    throwsCode(() => unit.honorLoginResult('<!DOCTYPE x><result resultCode="0"></result>', 'HONOR-UID'),
      'HONOR_XML_INVALID');
    throwsCode(() => unit.honorLoginResult('<result resultCode="0"><LoginByQrCodeRsp>' +
      '<userID>HONOR-UID</userID><userID>HONOR-UID</userID><serviceToken>abcdefghijklmnopqrstuvwxyz</serviceToken>' +
      '</LoginByQrCodeRsp></result>', 'HONOR-UID'), 'HONOR_XML_FIELD_INVALID');
    throwsCode(() => unit.honorLoginResult('<result resultCode="7"></result>', 'HONOR-UID'), 'HONOR_ACCOUNT_7');
  });

  for (const host of [HONOR_QR, HONOR_QR_COMPAT]) {
    let calls = [];
    const context = createContext({
      URL: TestURL,
      Blob: TestBlob,
      encodeBiliQR: text => ({size: 2, modules: [[true, false], [false, true]], text}),
      hideQR: attempt => { attempt.qrHidden = true; },
      ui: {screen: {}, oppoLink: {}}
    });
    const prepare = load(context, ['parseURL', 'uniqueParams', 'fields', 'honorURL', 'prepareHonor'], 'prepare');
    context.honorJSON = async (attempt, stage, url, body) => {
      calls.push({stage, url, body});
      return {content: host + '/qrcode/login.jsp?reqClientType=701&qrSiteID=1&loginChannel=7000700&qRCode=QR-CODE',
        qrToken: 'QR-TOKEN'};
    };
    const attempt = {expires: Date.now() + 60000, stage: 'setup'};
    await prepare.prepareHonor(attempt);
    check('Honor getqrInfo body on ' + new URL(host).hostname, () => {
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].stage, 'honor_qr');
      assert.strictEqual(calls[0].url, HONOR_QR + '/DimensionalCode/getqrInfo');
      assert.strictEqual(JSON.stringify(calls[0].body), JSON.stringify({
        version: '60101', appID: 'com.hihonor.id', loginChannel: '7000700',
        reqClientType: '701', confirmFlag: '1', lang: 'zh-CN'}));
      assert.strictEqual(attempt.honor.qr.code, 'QR-CODE');
      assert.strictEqual(attempt.honor.qr.siteID, '1');
      assert.strictEqual(attempt.qrHidden, true);
      assert.strictEqual(attempt.image, 'blob:honor-qr');
    });
  }

  for (const scenario of [
    {name: 'wrong Honor QR site', query: 'reqClientType=701&qrSiteID=2&loginChannel=7000700&qRCode=A',
      code: 'HONOR_QR_INVALID'},
    {name: 'wrong Honor QR client type', query: 'reqClientType=700&qrSiteID=1&loginChannel=7000700&qRCode=A',
      code: 'HONOR_QR_INVALID'},
    {name: 'wrong Honor QR login channel', query: 'reqClientType=701&qrSiteID=1&loginChannel=7000701&qRCode=A',
      code: 'HONOR_QR_INVALID'},
    {name: 'duplicate Honor QR code parameter', query: 'reqClientType=701&qrSiteID=1&loginChannel=7000700&qRCode=A&qRCode=B',
      code: 'DUPLICATE_FIELD'}
  ]) {
    const context = createContext({
      URL: TestURL, Blob: TestBlob,
      encodeBiliQR: () => ({size: 2, modules: [[true, false], [false, true]]}),
      hideQR: () => {},
      ui: {screen: {}, oppoLink: {}}
    });
    const prepare = load(context, ['parseURL', 'uniqueParams', 'fields', 'honorURL', 'prepareHonor'], 'prepare');
    context.honorJSON = async () => ({content: HONOR_QR + '/qrcode/login.jsp?' + scenario.query,
      qrToken: 'QR-TOKEN'});
    try {
      await prepare.prepareHonor({expires: Date.now() + 60000, stage: 'setup'});
      throw new Error('expected ' + scenario.code);
    } catch (error) {
      check(scenario.name, () => assert.strictEqual(error.message, scenario.code));
    }
  }

  {
    let calls = [];
    const network = createContext({
      DEFAULT_REQUEST_TIMEOUT: 60000,
      performance,
      active: () => {},
      record: () => {},
      GM_xmlhttpRequest(options) {
        calls.push({...options});
        const responseHeaders = calls.length === 1
          ? 'set-cookie: honor-agw-cookie=agw-value; Path=/; Domain=hnid-drcn.cloud.honor.com\r\n' +
            'set-cookie: JSESSIONID=session-value; Path=/; Domain=hnid-drcn.cloud.honor.com\r\n'
          : '';
        queueMicrotask(() => options.onload({status: 200, responseText: '{"resultCode":"103000200"}',
          responseHeaders, finalUrl: options.url}));
        return {abort() {}};
      }
    });
    const net = load(network, ['Cookies', 'isolatedRequest'], 'net');
    const attempt = {expires: Date.now() + 60000, stage: 'setup', requests: new Set(),
      cookies: new net.Cookies()};
    await net.isolatedRequest(attempt, HONOR_QR + '/DimensionalCode/getqrInfo', false,
      {stage: 'honor_qr', body: {version: '60101', appID: 'com.hihonor.id'}});
    await net.isolatedRequest(attempt, HONOR_QR + '/DimensionalCode/async', false,
      {stage: 'honor_poll', body: {qrToken: 'QR-TOKEN'}});
    check('isolated request reuses QR cookies', () => {
      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0].method, 'POST');
      assert.strictEqual(calls[0].anonymous, true);
      assert.strictEqual(calls[0].redirect, 'manual');
      assert.strictEqual(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.strictEqual(calls[0].data, 'version=60101&appID=com.hihonor.id');
      assert.strictEqual(calls[1].data, 'qrToken=QR-TOKEN');
      assert(calls[1].cookie.includes('honor-agw-cookie=agw-value'));
      assert(calls[1].cookie.includes('JSESSIONID=session-value'));
    });
  }

  {
    const harness = authHarness({polls: [
      {resultCode: '103000200'},
      {resultCode: '0', userID: 'HONOR-UID', code: 'SCAN-CODE', accountType: '2',
        siteID: '1', userAccount: '138<000>'}
    ]});
    await harness.honor.authorizeHonor(harness.attempt);
    check('Honor QR poll, token and game-center exchange', () => {
      const pollCalls = harness.calls.json.filter(call => call.stage === 'honor_poll');
      assert.strictEqual(pollCalls.length, 2);
      assert.strictEqual(pollCalls[0].body.qrToken, 'QR-TOKEN');
      assert.strictEqual(harness.sleeps, 1);
      assert.strictEqual(harness.calls.request.length, 1);
      const account = harness.calls.request[0];
      assert.strictEqual(account.url, HONOR_ACCOUNT + '/AccountServer/IDM/loginByQrCode');
      assert(account.body.includes('<userID>HONOR-UID</userID>'));
      assert(account.body.includes('<qrCode>QR-CODE</qrCode>'));
      assert(account.body.includes('<userAccount>138&lt;000&gt;</userAccount>'));
      assert.strictEqual(account.extra.raw, true);
      assert.strictEqual(account.extra.headers.PKG, 'com.hihonor.id');
      assert.strictEqual(account.extra.headers.UUID, 'honor-device-123');
      assert.strictEqual(account.extra.headers['x-apk-version'], '9.0.2.351');
      const tokenCall = harness.calls.json.find(call => call.stage === 'honor_token');
      const tokenURL = new URL(tokenCall.url);
      assert.strictEqual(tokenURL.pathname, '/oauth2/v3/silent_token');
      assert.strictEqual(tokenURL.searchParams.get('client_id'), HONOR_APP);
      assert.strictEqual(tokenURL.searchParams.get('Version'), '60101');
      const expectedService = 'abcdefghijklmnopqrstuvwxyz'.slice(0, 20) +
        crypto.createHash('sha256').update('abcdefghijklmnopqrstuvwxyz:com.yoka.sgs.x.honor').digest('hex');
      assert.strictEqual(tokenCall.body.service_token, expectedService);
      assert.strictEqual(tokenCall.body.package_name, 'com.yoka.sgs.x.honor');
      assert.strictEqual(tokenCall.body.siteId, '1');
      const gameCall = harness.calls.json.find(call => call.stage === 'honor_game');
      assert.strictEqual(gameCall.jsonBody, true);
      assert.strictEqual(gameCall.body.appId, HONOR_APP);
      assert.strictEqual(gameCall.body.oauthCode, 'OAUTH-CODE');
      assert.strictEqual(harness.attempt.honor.auth.uid, 'HONOR-UID');
      assert.strictEqual(harness.attempt.honor.auth.session, 'UNION-TOKEN');
      assert(harness.attempt.honor.auth.expires > Date.now());
      assert.strictEqual(harness.attempt.cookies.cleared, true);
      assert.strictEqual(harness.attempt.qrHidden, true);
    });
  }

  for (const scenario of [
    {name: 'expired Honor QR', polls: [{resultCode: '103000201'}], code: 'QR_EXPIRED'},
    {name: 'Honor site binding mismatch', polls: [{resultCode: '0', userID: 'HONOR-UID',
      code: 'SCAN-CODE', accountType: '2', siteID: '2', userAccount: ''}],
    code: 'HONOR_QR_BINDING_MISMATCH'},
    {name: 'Honor account XML owner mismatch', polls: [{resultCode: '0', userID: 'HONOR-UID',
      code: 'SCAN-CODE', accountType: '2', siteID: '1', userAccount: ''}],
    accountXML: honorXML('abcdefghijklmnopqrstuvwxyz', 'OTHER'), code: 'ACCOUNT_MISMATCH'},
    {name: 'Honor union-token owner mismatch', polls: [{resultCode: '0', userID: 'HONOR-UID',
      code: 'SCAN-CODE', accountType: '2', siteID: '1', userAccount: ''}],
    game: {loginData: {errorCode: 0, data: {appId: HONOR_APP, isChildAccount: false,
      realInfo: {hasRealName: true, isAdult: true}, unionToken: {openId: 'OTHER', token: 'UNION-TOKEN'}}}},
    code: 'ACCOUNT_MISMATCH'},
    {name: 'Honor minor account', polls: [{resultCode: '0', userID: 'HONOR-UID',
      code: 'SCAN-CODE', accountType: '2', siteID: '1', userAccount: ''}],
    game: {loginData: {errorCode: 0, data: {appId: HONOR_APP, isChildAccount: true,
      realInfo: {hasRealName: true, isAdult: false}, unionToken: {openId: 'HONOR-UID', token: 'UNION-TOKEN'}}}},
    code: 'NATIVE_CONFIRMATION_REQUIRED'}
  ]) {
    const harness = authHarness(scenario);
    try {
      await harness.honor.authorizeHonor(harness.attempt);
      throw new Error('expected ' + scenario.code);
    } catch (error) {
      check(scenario.name, () => assert.strictEqual(error.message, scenario.code));
    }
  }

  {
    const harness = exchangeHarness();
    const grant = await harness.honor.exchangeHonor(harness.attempt);
    check('Honor AnySDK and game-grant identity binding', () => {
      assert.strictEqual(harness.calls.length, 2);
      const session = harness.calls[0];
      assert.strictEqual(session.stage, 'sgs_session');
      assert.strictEqual(session.body.platform_id, '50027');
      assert.strictEqual(session.body.data.thirdparty, 'honor');
      assert.strictEqual(session.body.data.uid, 'HONOR-UID');
      assert.strictEqual(session.body.data.session, 'UNION-TOKEN');
      const grantCall = harness.calls[1];
      assert.strictEqual(grantCall.stage, 'sgs_grant');
      const grantURL = new URL(grantCall.url);
      assert.strictEqual(grantURL.origin, 'https://10th-sdk-login.sanguosha.com');
      assert.strictEqual(grantURL.pathname, '/honor/app/login');
      assert.strictEqual(grantURL.searchParams.get('ticket'), 'SGS-SESSION');
      assert.strictEqual(grantURL.searchParams.get('is_adult'), '1');
      assert.strictEqual(grant.account, 'game-account');
      assert.strictEqual(harness.attempt.session, 'SGS-SESSION');
      assert.strictEqual(harness.attempt.account, 'game-account');
      assert.strictEqual(harness.remembered.length, 1);
      assert.strictEqual(harness.authorized, 0);
    });
  }

  {
    const harness = exchangeHarness({session: 'EXISTING-SESSION'});
    await harness.honor.exchangeHonor(harness.attempt);
    check('Honor saved session skips AnySDK login', () => {
      assert.strictEqual(harness.calls.length, 1);
      assert.strictEqual(harness.calls[0].stage, 'sgs_grant');
      assert.strictEqual(new URL(harness.calls[0].url).searchParams.get('ticket'), 'EXISTING-SESSION');
    });
  }

  for (const scenario of [
    {name: 'game grant account mismatch', options: {thirdAccountId: 'OTHER'}, code: 'ACCOUNT_MISMATCH'},
    {name: 'Honor AnySDK channel mismatch', options: {cId: 50028}, code: 'HONOR_CHANNEL_MISMATCH'},
    {name: 'expired saved Honor auth', options: {authExpires: Date.now() - 1}, code: 'SAVED_SESSION_EXPIRED'}
  ]) {
    const harness = exchangeHarness(scenario.options);
    try {
      await harness.honor.exchangeHonor(harness.attempt);
      throw new Error('expected ' + scenario.code);
    } catch (error) {
      check(scenario.name, () => {
        assert.strictEqual(error.message, scenario.code);
        assert.strictEqual(harness.remembered.length, 0);
      });
    }
  }

  {
    const storage = createContext({
      SESSION_PROVIDERS: new Set(['honor']),
      SESSION_PROFILE_PATTERN: /^[A-Za-z0-9._:-]{1,256}$/,
      SESSION_RECORD_EXPIRES_FOREVER: Number.MAX_SAFE_INTEGER
    });
    const store = load(storage, ['sessionText', 'copiedFields', 'sessionStoreRecord',
      'canReplaySavedAuth'], 'store');
    const future = Date.now() + 60000;
    const record = store.sessionStoreRecord({
      v: 3, provider: 'honor', profileId: 'honor:account-1', id: 'a'.repeat(32),
      expires: Number.MAX_SAFE_INTEGER, created: Date.now() - 1000, updated: Date.now(),
      account: 'game-account', device: 'honor-device-123', session: 'SGS-SESSION',
      honor: {auth: {uid: 'HONOR-UID', session: 'UNION-TOKEN', username: 'honor-user',
        gameUID: 'GAME-UID', expires: future, ignored: 'not-persisted'}}, extra: 'not-persisted'
    });
    check('Honor session record shape and replay gate', () => {
      assert(record);
      assert.strictEqual(JSON.stringify(record.honor), JSON.stringify({auth: {uid: 'HONOR-UID',
        session: 'UNION-TOKEN', username: 'honor-user', gameUID: 'GAME-UID', expires: future}}));
      assert.strictEqual(Object.hasOwn(record, 'extra'), false);
      assert.strictEqual(store.canReplaySavedAuth(record), true);
      assert.strictEqual(store.canReplaySavedAuth({...record,
        honor: {auth: {...record.honor.auth, expires: Date.now() - 1}}}), false);
      assert.strictEqual(store.canReplaySavedAuth({...record, honor: {auth: {uid: 'HONOR-UID'}}}), false);
    });
  }

  console.log(JSON.stringify({ok: true, checks: checks.length, names: checks}, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
