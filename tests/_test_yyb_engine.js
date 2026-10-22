'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');
const {TextEncoder} = require('util');

const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{').exec(source);
  if (!match) throw new Error(name + ' not found');
  const start = match.index + match[0].length - 1;
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

function constant(name) {
  const string = new RegExp("const\\s+" + name + "\\s*=\\s*'([^']*)'\\s*;").exec(source);
  if (string) return string[1];
  const number = new RegExp('const\\s+' + name + '\\s*=\\s*(\\d+)\\s*;').exec(source);
  if (number) return number[1];
  throw new Error(name + ' not found');
}

function stringSet(name) {
  const match = new RegExp('const\\s+' + name + '\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)').exec(source);
  if (!match) throw new Error(name + ' not found');
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));
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

const YYB_CHANNEL = Number(constant('YYB_CHANNEL'));
const YYB_SDK_CHANNEL = Number(constant('YYB_SDK_CHANNEL'));
const YYB_APP = constant('YYB_APP');
const YYB_WX_APP = constant('YYB_WX_APP');
const YYB_PACKAGE = constant('YYB_PACKAGE');
const YYB_PACKAGE_ID = constant('YYB_PACKAGE_ID');
const YYB_GROUP_ID = constant('YYB_GROUP_ID');
const YYB_SDK_APP = constant('YYB_SDK_APP');
const YYB_PLATFORM_ID = constant('YYB_PLATFORM_ID');
const YYB_PLATFORM_NAME = constant('YYB_PLATFORM_NAME');
const YYB_YSDK = constant('YYB_YSDK');
const YYB_VERIFY_VERSION = constant('YYB_VERIFY_VERSION');
const YYB_WX_SCOPE = constant('YYB_WX_SCOPE');
const YYB_WX_QR = constant('YYB_WX_QR');
const YYB_WX_POLL = constant('YYB_WX_POLL');
const YYB_SIGN_KEY = constant('YYB_SIGN_KEY');
const QQ_APP = constant('QQ_APP');
const WX_APP = constant('WX_APP');
const YYB_WX_HOSTS = stringSet('YYB_WX_HOSTS');
const WX_HOSTS = stringSet('WX_HOSTS');
const QQ_HOSTS = stringSet('QQ_HOSTS');
const OPPO_HOSTS = stringSet('OPPO_HOSTS');
const VIVO_HOSTS = stringSet('VIVO_HOSTS');
const API_HOSTS = stringSet('API_HOSTS');

class TestURL extends URL {}
TestURL.createObjectURL = () => 'blob:yyb-qr';
class TestBlob {
  constructor(parts, options) { this.parts = parts; this.type = options?.type || ''; }
}

function createContext(extra = {}) {
  const context = {
    YYB_CHANNEL, YYB_SDK_CHANNEL, YYB_APP, YYB_WX_APP, YYB_PACKAGE, YYB_PACKAGE_ID, YYB_GROUP_ID,
    YYB_SDK_APP, YYB_PLATFORM_ID, YYB_PLATFORM_NAME, YYB_YSDK, YYB_VERIFY_VERSION,
    YYB_WX_SCOPE, YYB_WX_QR, YYB_WX_POLL, YYB_SIGN_KEY,
    YYB_WX_HOSTS, WX_HOSTS, QQ_HOSTS, OPPO_HOSTS, VIVO_HOSTS, API_HOSTS,
    QQ_APP, WX_APP, DEFAULT_REQUEST_TIMEOUT: 60000,
    URL: TestURL, URLSearchParams, Blob: TestBlob, Uint8Array, TextEncoder,
    crypto: crypto.webcrypto, atob: global.atob,
    Date, Number, String, Object, Array, JSON, Set, Map, Math, RegExp, Promise,
    setTimeout, clearTimeout,
    queryURL: (base, params) => base + '?' + new URLSearchParams(params).toString(),
    assert: engineAssert, failure, console,
    random: () => 'a'.repeat(32),
    active: () => {},
    ...extra
  };
  vm.createContext(context);
  return context;
}

function load(context, names, apiName) {
  vm.runInContext(names.map(extract).join('\n') + '\nthis.' + apiName + ' = {' + names.join(',') + '};', context);
  return context[apiName];
}

function md5Hex(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

function jpegBase64() {
  const bytes = Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,
    0,1,0,0,255,217]);
  return Buffer.from(bytes).toString('base64');
}

function scanResponse() {
  return {ret: 0, msg: 'ok', appid: YYB_WX_APP, noncestr: 'nonce-1',
    timestamp: '1792000000000', scope: YYB_WX_SCOPE, signature: 'b'.repeat(40)};
}

function qrResponse() {
  return {errcode: 0, uuid: 'yyb-wx-uuid-1234', appname: '三国杀一将成名yyb',
    qrcode: {qrcodebase64: jpegBase64(), qrcodelength: 22}};
}

(async () => {
  const checks = [];
  const check = (name, callback) => {
    const result = callback();
    if (result?.then) throw new Error('use checkAsync for ' + name);
    checks.push(name);
  };
  const checkAsync = async (name, callback) => {
    await callback();
    checks.push(name);
  };

  const protocol = createContext();
  const unit = load(protocol, ['sessionText', 'fields', 'md5', 'yybSign', 'yybWXQrResult',
    'yybWXPollResult', 'qqAppId', 'qqScope', 'wxAppId', 'wxBundleId'], 'yyb');

  check('YYB request signature is MD5(timestamp + client key)', () => {
    const timestamp = '1792000000123';
    assert.strictEqual(unit.yybSign(timestamp), md5Hex(timestamp + YYB_SIGN_KEY));
    assert.strictEqual(unit.yybSign(timestamp).length, 32);
  });

  check('YYB QQ and WeChat providers never reuse WeGame app ids', () => {
    assert.strictEqual(unit.qqAppId({provider: 'yybqq'}), YYB_APP);
    assert.strictEqual(unit.qqAppId({provider: 'qq'}), '101790992');
    assert.strictEqual(unit.qqScope({provider: 'yybqq'}), 'all');
    assert.strictEqual(unit.wxAppId({provider: 'yybwx'}), YYB_WX_APP);
    assert.strictEqual(unit.wxAppId({provider: 'wx'}), 'wxba26a260a325b6f8');
    assert.strictEqual(unit.wxBundleId({provider: 'yybwx'}), YYB_PACKAGE);
  });

  check('YYB WeChat QR response is strict JSON with a real image', () => {
    const result = unit.yybWXQrResult(JSON.stringify(qrResponse()));
    assert.strictEqual(result.uuid, 'yyb-wx-uuid-1234');
    assert.strictEqual(result.mime, 'image/jpeg');
    assert(result.bytes.length > 10);
    throwsCode(() => unit.yybWXQrResult('<html>error</html>'), 'YYB_WX_QR_INVALID');
    throwsCode(() => unit.yybWXQrResult(JSON.stringify({errcode: 1})), 'YYB_WX_QR_REJECTED');
    const empty = qrResponse(); empty.qrcode.qrcodebase64 = '';
    throwsCode(() => unit.yybWXQrResult(JSON.stringify(empty)), 'YYB_WX_QR_INVALID');
    const bad = qrResponse(); bad.qrcode.qrcodebase64 = Buffer.from('not-an-image').toString('base64');
    throwsCode(() => unit.yybWXQrResult(JSON.stringify(bad)), 'YYB_WX_QR_IMAGE_INVALID');
  });

  check('YYB WeChat poll parser accepts documented statuses only', () => {
    const pending = unit.yybWXPollResult('{"wx_errcode":408,"wx_code":""}');
    assert.strictEqual(pending.code, 408);
    assert.strictEqual(pending.redirect, '');
    const success = unit.yybWXPollResult('{"wx_errcode":405,"wx_code":"WX-CODE-12345"}');
    assert.strictEqual(success.code, 405);
    assert.strictEqual(success.redirect, 'WX-CODE-12345');
    throwsCode(() => unit.yybWXPollResult('{"wx_errcode":"bad"}'), 'YYB_WX_POLL_INVALID');
    throwsCode(() => unit.yybWXPollResult('window.wx_errcode = 405'), 'YYB_WX_POLL_INVALID');
  });

  await checkAsync('YYB WeChat transport uses a dedicated trusted host policy', async () => {
    const requests = [];
    const context = createContext({
      performance: {now: () => 0},
      record: () => {},
      GM_xmlhttpRequest: options => {
        requests.push(options);
        setTimeout(() => options.onload({status: 200, responseText: 'ok',
          responseHeaders: '', finalUrl: options.url}), 0);
      }
    });
    const net = load(context, ['transportHosts', 'parseURL', 'transport'], 'net');
    assert(net.transportHosts({yybwx: true}).has('open.weixin.qq.com'));
    assert(net.transportHosts({yybwx: true}).has('long.open.weixin.qq.com'));
    assert(!net.transportHosts({}).has('open.weixin.qq.com'));
    const attempt = {stage: 'setup', requests: new Set()};
    const response = await net.transport(attempt, YYB_WX_QR,
      {stage: 'yyb_wx_qr', yybwx: true});
    assert.strictEqual(response.responseText, 'ok');
    assert.strictEqual(requests.length, 1);
    throwsCode(() => net.transport(attempt, 'https://evil.example/connect', {yybwx: true}),
      'ENDPOINT_DENIED');
  });

  await checkAsync('YYB WeChat scan request binds official app id and signature', async () => {
    const requests = [];
    const context = createContext();
    context.transport = async (attempt, url, options) => {
      requests.push({url, options});
      return {responseText: JSON.stringify({ret: 0, appid: YYB_WX_APP,
        timestamp: '1', traceid: 'a'.repeat(32), sig: 'x', version: YYB_VERIFY_VERSION})};
    };
    const c = load(context, ['sessionText', 'fields', 'md5', 'yybSign', 'yybRet', 'yybRequest'], 'yyb');
    await c.yybRequest({stage: 'setup'}, 'yyb_qq_verify', '/auth/qq_verify_login', {
      channel: String(YYB_SDK_CHANNEL), offerid: YYB_APP, atk: 'ATK', ptk: 'PTK',
      loginType: '1', platform: 'qq', appid: YYB_APP, openid: 'OPENID', loginplatform: '1'
    });
    assert.strictEqual(requests.length, 1);
    const url = new URL(requests[0].url);
    assert.strictEqual(url.origin, YYB_YSDK);
    assert.strictEqual(url.pathname, '/auth/qq_verify_login');
    const timestamp = url.searchParams.get('timestamp');
    assert(/^\d{13}$/.test(timestamp));
    assert.strictEqual(url.searchParams.get('sig'), c.yybSign(timestamp));
    assert.strictEqual(url.searchParams.get('version'), YYB_VERIFY_VERSION);
    assert.strictEqual(url.searchParams.get('traceid'), 'a'.repeat(32));
    assert.strictEqual(url.searchParams.get('channel'), String(YYB_SDK_CHANNEL));
    assert.strictEqual(url.searchParams.get('offerid'), YYB_APP);
  });

  await checkAsync('YYB WeChat QR issuance uses wx_scan_code_login then sdk/qrconnect', async () => {
    const scanCalls = [];
    const transports = [];
    const context = createContext({ui: {screen: {alt: '', src: '', hidden: true}},
      setBrowserNotice: (attempt, text) => { attempt.notice = text; }});
    context.yybRequest = async (attempt, stage, path, params) => {
      scanCalls.push({stage, path, params});
      return scanResponse();
    };
    context.transport = async (attempt, url, options) => {
      transports.push({url, options});
      return {responseText: JSON.stringify(qrResponse())};
    };
    const prepare = load(context, ['sessionText', 'fields', 'yybRet', 'yybWXQrResult', 'prepareYYBWX'], 'prepare');
    const attempt = {stage: 'setup', expires: Date.now() + 60000};
    await prepare.prepareYYBWX(attempt);
    assert.strictEqual(scanCalls.length, 1);
    assert.strictEqual(scanCalls[0].path, '/auth/wx_scan_code_login');
    assert.strictEqual(scanCalls[0].params.openappid, YYB_WX_APP);
    assert.strictEqual(scanCalls[0].params.appid, YYB_WX_APP);
    assert.strictEqual(scanCalls[0].params.scope, YYB_WX_SCOPE);
    assert.strictEqual(scanCalls[0].params.loginplatform, '2');
    assert(/^[0-9a-f-]{36}$/i.test(scanCalls[0].params.noncestr));
    assert.strictEqual(transports.length, 1);
    const qrURL = new URL(transports[0].url);
    assert.strictEqual(qrURL.origin + qrURL.pathname, YYB_WX_QR);
    assert.strictEqual(transports[0].options.yybwx, true);
    for (const key of ['appid', 'noncestr', 'timestamp', 'scope', 'signature']) {
      assert.strictEqual(qrURL.searchParams.get(key), scanResponse()[key]);
    }
    assert.strictEqual(attempt.yybWXUUID, 'yyb-wx-uuid-1234');
    assert.strictEqual(attempt.image, 'blob:yyb-qr');
    assert.strictEqual(attempt.notice, '请使用微信扫描应用宝登录二维码');
    assert.strictEqual(context.ui.screen.hidden, false);
    assert.strictEqual(attempt.stage, 'waiting_scan');
  });

  await checkAsync('YYB WeChat QR rejects changed app or signature', async () => {
    for (const override of [{appid: 'wx-other'}, {signature: 'not-hex'},
      {scope: 'snsapi_userinfo'}]) {
      const context = createContext({ui: {screen: {}}, setBrowserNotice: () => {}});
      context.yybRequest = async () => ({...scanResponse(), ...override});
      context.transport = async () => ({responseText: JSON.stringify(qrResponse())});
      const prepare = load(context, ['sessionText', 'fields', 'yybRet', 'yybWXQrResult', 'prepareYYBWX'], 'prepare');
      await assert.rejects(prepare.prepareYYBWX({stage: 'setup'}), error =>
        error.message === 'YYB_WX_AUTH_INVALID');
    }
  });

  await checkAsync('YYB WeChat long poll follows scan states and consumes code once', async () => {
    const transports = [];
    const sleeps = [];
    const replies = [
      {wx_errcode: 408, wx_code: ''},
      {wx_errcode: 404, wx_code: ''},
      {wx_errcode: 405, wx_code: 'WX-CODE-12345678'}
    ];
    const context = createContext({
      sleep: async milliseconds => { sleeps.push(milliseconds); },
      hideQR: attempt => { attempt.hidden = true; },
      setBrowserNotice: (attempt, text) => { attempt.notice = text; }
    });
    context.transport = async (attempt, url, options) => {
      transports.push({url, options});
      return {responseText: JSON.stringify(replies.shift())};
    };
    const poll = load(context, ['sessionText', 'yybWXPollResult', 'waitForYYBWX'], 'poll');
    const attempt = {yybWXUUID: 'yyb-wx-uuid-1234', stage: 'waiting_scan',
      expires: Date.now() + 60000, cookies: {clear() { this.cleared = true; }}};
    await poll.waitForYYBWX(attempt);
    assert.strictEqual(transports.length, 3);
    assert.strictEqual(new URL(transports[0].url).searchParams.get('last'), '408');
    assert.strictEqual(new URL(transports[1].url).searchParams.get('last'), '408');
    assert.strictEqual(new URL(transports[2].url).searchParams.get('last'), '404');
    assert.strictEqual(new URL(transports[1].url).searchParams.get('uuid'), 'yyb-wx-uuid-1234');
    assert.strictEqual(transports[1].options.timeout, 65000);
    assert.strictEqual(transports[0].options.yybwx, true);
    assert.deepStrictEqual(sleeps, [2000, 1000]);
    assert.strictEqual(attempt.wxCode, 'WX-CODE-12345678');
    assert.strictEqual(attempt.yybWXUUID, '');
    assert.strictEqual(attempt.hidden, true);
    assert.strictEqual(attempt.cookies.cleared, true);
    assert.strictEqual(attempt.notice, '微信已确认，正在兑换应用宝登录票据…');
  });

  await checkAsync('YYB WeChat poll surfaces expiry and cancel without retrying', async () => {
    for (const [status, code] of [[402, 'WX_QR_EXPIRED'], [403, 'WX_LOGIN_CANCELLED']]) {
      const context = createContext({sleep: async () => {}, hideQR: () => {}, setBrowserNotice: () => {}});
      context.transport = async () => ({responseText: JSON.stringify({wx_errcode: status, wx_code: ''})});
      const poll = load(context, ['sessionText', 'yybWXPollResult', 'waitForYYBWX'], 'poll');
      await assert.rejects(poll.waitForYYBWX({yybWXUUID: 'uuid', stage: 'waiting_scan',
        expires: Date.now() + 60000, cookies: {clear() {}}}), error => error.message === code);
    }
  });

  await checkAsync('YYB WeChat code is cleared before verification and reused never', async () => {
    const calls = [];
    const context = createContext();
    context.yybRequest = async (attempt, stage, path, params) => {
      calls.push({stage, path, params, wxCode: attempt.wxCode, uuid: attempt.yybWXUUID});
      return {ret: 0, openid: 'YYB-OPENID', atk: 'YYB-ATK', atk_expire: 3600,
        pf: 'PF', pfKey: 'PFKEY', nick_name: '玩家'};
    };
    const verify = load(context, ['sessionText', 'yybRet', 'verifyYYBWX'], 'verify');
    const attempt = {wxCode: 'WX-CODE-12345678', yybWXUUID: 'uuid', stage: 'waiting_scan'};
    const result = await verify.verifyYYBWX(attempt);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].path, '/auth/wx_verify_code');
    assert.strictEqual(calls[0].wxCode, '');
    assert.strictEqual(calls[0].uuid, '');
    assert.strictEqual(calls[0].params.code, 'WX-CODE-12345678');
    assert.strictEqual(calls[0].params.channel, String(YYB_SDK_CHANNEL));
    assert.strictEqual(calls[0].params.appid, YYB_WX_APP);
    assert.strictEqual(calls[0].params.platform, 'wx');
    assert.strictEqual(result.openid, 'YYB-OPENID');
    assert.strictEqual(result.accessToken, 'YYB-ATK');
    assert.strictEqual(result.channel, String(YYB_SDK_CHANNEL));
    assert.strictEqual(attempt.wxCode, '');

    const failing = createContext();
    failing.yybRequest = async () => { throw failure('NETWORK_ERROR', 'yyb_wx_verify'); };
    const failingVerify = load(failing, ['sessionText', 'yybRet', 'verifyYYBWX'], 'verify');
    const failedAttempt = {wxCode: 'WX-CODE-87654321', yybWXUUID: 'uuid-2'};
    await assert.rejects(failingVerify.verifyYYBWX(failedAttempt), error =>
      error.message === 'NETWORK_ERROR');
    assert.strictEqual(failedAttempt.wxCode, '');
    assert.strictEqual(failedAttempt.yybWXUUID, '');
  });

  await checkAsync('YYB QQ requires pay_token and binds verification to app/channel', async () => {
    const context = createContext();
    const calls = [];
    context.yybRequest = async (attempt, stage, path, params) => {
      calls.push({stage, path, params});
      return {ret: 0, openid: 'YSDK-OPENID-NAMESPACE', atk: 'YSDK-ATK-NAMESPACE',
        ptk: 'YSDK-PTK-NAMESPACE',
        pf: 'PF', pfKey: 'PFKEY', nick_name: 'QQ玩家'};
    };
    const verify = load(context, ['sessionText', 'fields', 'yybRet', 'verifyYYBQQ'], 'verify');
    const missing = {provider: 'yybqq', qq: {openid: 'QQ-OPENID', access_token: 'QQ-ATK'}};
    await assert.rejects(verify.verifyYYBQQ(missing), error =>
      error.message === 'YYB_QQ_PAY_TOKEN_MISSING');
    assert.strictEqual(calls.length, 0);

    const attempt = {provider: 'yybqq', qq: {openid: 'QQ-OPENID', access_token: 'QQ-ATK',
      pay_token: 'QQ-PTK', pf: 'PF', pfKey: 'PFKEY'}};
    const result = await verify.verifyYYBQQ(attempt);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].path, '/auth/qq_verify_login');
    assert.strictEqual(calls[0].params.channel, String(YYB_SDK_CHANNEL));
    assert.strictEqual(calls[0].params.offerid, YYB_APP);
    assert.strictEqual(calls[0].params.appid, YYB_APP);
    assert.strictEqual(calls[0].params.openid, 'QQ-OPENID');
    assert.strictEqual(calls[0].params.atk, 'QQ-ATK');
    assert.strictEqual(calls[0].params.ptk, 'QQ-PTK');
    // YSDK's verify response is a separate namespace. The account identity
    // and session must remain the QQ OAuth callback values, matching the
    // YSDK client's UserLoginRet open_id/accessToken/payToken behavior.
    assert.strictEqual(result.openid, 'QQ-OPENID');
    assert.strictEqual(result.accessToken, 'QQ-ATK');
    assert.strictEqual(result.payToken, 'QQ-PTK');
    assert.strictEqual(result.loginType, 'qq');
    assert.strictEqual(result.channel, String(YYB_SDK_CHANNEL));

    context.yybRequest = async () => ({ret: 11000, msg: 'rejected'});
    const rejected = load(context, ['sessionText', 'fields', 'yybRet', 'verifyYYBQQ'], 'verify');
    await assert.rejects(rejected.verifyYYBQQ(attempt), error =>
      error.message === 'YYB_VERIFY_REJECTED_11000');
  });

  await checkAsync('YYB QQ verification failure never records an account', async () => {
    let remembered = 0;
    const context = createContext({
      remember: () => { remembered += 1; },
      yybRequest: async () => { throw failure('YYB_VERIFY_REJECTED_11000', 'yyb_qq_verify'); }
    });
    const exchange = load(context, ['fields', 'success', 'validateGrant', 'sessionText',
      'yybAccount', 'yybRet', 'yybGrant', 'verifyYYBQQ', 'verifyYYBWX', 'exchangeYYB'], 'exchange');
    const attempt = {provider: 'yybqq', stage: 'setup',
      qq: {openid: 'QQ-OPENID', access_token: 'QQ-ATK', pay_token: 'QQ-PTK'}};
    await assert.rejects(exchange.exchangeYYB(attempt), error =>
      error.message === 'YYB_VERIFY_REJECTED_11000');
    assert.strictEqual(remembered, 0);
    assert.strictEqual(attempt.account, undefined);
    assert.strictEqual(attempt.yyb, undefined);
  });

  await checkAsync('YYB separates YSDK channel 320460 from SGS web channel 1036', async () => {
    assert.strictEqual(YYB_CHANNEL, 1036);
    assert.strictEqual(YYB_SDK_CHANNEL, 320460);
    for (const provider of ['yybqq', 'yybwx']) {
      assert(new RegExp(provider +
        ": Object\\.freeze\\(\\{path: '/10/pc/index\\.php', channel: YYB_CHANNEL, query: true, delivery: 'callback'\\}\\)")
        .test(source), provider + ' must route with the SGS web channel');
    }
    const calls = [];
    const remembered = [];
    let grantChannel = YYB_CHANNEL;
    let sessionData = {thirdparty: YYB_PLATFORM_NAME, cId: YYB_PLATFORM_ID, session: 'SGS-SESSION'};
    const context = createContext({});
    context.json = async (attempt, stage, url, body) => {
      calls.push({stage, url, body});
      if (stage === 'sgs_session') return {code: 0, data: {...sessionData}};
      if (stage === 'sgs_grant') {
        const data = {account: 'YYB-ACCOUNT', token: 'GAME-TOKEN', sign: 'GAME-SIGN',
          timestamp: Math.floor(Date.now() / 1000)};
        if (grantChannel !== undefined) data.channel_id = grantChannel;
        return {code: 0, data};
      }
      throw failure('UNEXPECTED_STAGE', stage);
    };
    context.remember = attempt => { remembered.push(attempt); return true; };
    const exchange = load(context, ['fields', 'success', 'validateGrant', 'sessionText',
      'yybAccount', 'yybRet', 'yybGrant', 'verifyYYBQQ', 'verifyYYBWX', 'exchangeYYB'], 'exchange');
    const makeAttempt = () => ({provider: 'yybwx', device: 'device-1', stage: 'setup',
      cookies: {clear() {}}, yyb: {openid: 'YYB-OPENID', accessToken: 'YYB-ATK',
        payToken: 'YYB-PTK', pf: 'PF', pfKey: 'PFKEY', loginType: 'wx',
        appid: YYB_WX_APP, channel: String(YYB_SDK_CHANNEL)}});
    const grant = await exchange.exchangeYYB(makeAttempt());
    assert.strictEqual(String(grant.channel_id), String(YYB_CHANNEL));
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].stage, 'sgs_session');
    assert.strictEqual(calls[0].body.appid, YYB_SDK_APP);
    assert.strictEqual(calls[0].body.package_id, YYB_PACKAGE_ID);
    assert.strictEqual(calls[0].body.platform_id, YYB_PLATFORM_ID);
    assert.strictEqual(calls[0].body.platform_name, YYB_PLATFORM_NAME);
    assert.strictEqual(calls[0].body.data.pid, YYB_PLATFORM_ID);
    assert.strictEqual(calls[0].body.data.gid, YYB_SDK_APP);
    assert.strictEqual(calls[0].body.data.uid, 'YYB-OPENID');
    assert.strictEqual(calls[0].body.data.session, 'YYB-ATK');
    assert.strictEqual(calls[0].body.base.group_id, YYB_GROUP_ID);
    assert.strictEqual(calls[1].stage, 'sgs_grant');
    assert.strictEqual(remembered.length, 1);

    grantChannel = YYB_SDK_CHANNEL;
    const androidAlias = await exchange.exchangeYYB(makeAttempt());
    assert.strictEqual(String(androidAlias.channel_id), String(YYB_CHANNEL));
    assert.strictEqual(remembered.length, 2);

    grantChannel = undefined;
    const noChannel = await exchange.exchangeYYB(makeAttempt());
    assert.strictEqual(String(noChannel.channel_id), String(YYB_CHANNEL));
    assert.strictEqual(remembered.length, 3);

    grantChannel = 320023;
    await assert.rejects(exchange.exchangeYYB(makeAttempt()), error => error.message === 'YYB_CHANNEL_MISMATCH');
    assert.strictEqual(remembered.length, 3);

    grantChannel = YYB_CHANNEL;
    sessionData = {thirdparty: 'honor', cId: YYB_PLATFORM_ID, session: 'SGS-SESSION'};
    await assert.rejects(exchange.exchangeYYB(makeAttempt()), error =>
      error.message === 'YYB_CHANNEL_MISMATCH' && error.stage === 'sgs_session');
    assert.strictEqual(remembered.length, 3);

    sessionData = {thirdparty: YYB_PLATFORM_NAME, cId: '50027', session: 'SGS-SESSION'};
    await assert.rejects(exchange.exchangeYYB(makeAttempt()), error =>
      error.message === 'YYB_CHANNEL_MISMATCH' && error.stage === 'sgs_session');
    assert.strictEqual(remembered.length, 3);
  });

  check('YYB account validator rejects WeGame channel numbers', () => {
    const context = createContext();
    const validate = load(context, ['yybAccount'], 'validate');
    throwsCode(() => validate.yybAccount({yyb: {openid: 'O', accessToken: 'A', channel: '320023'}}),
      'YYB_AUTH_INVALID');
    assert.strictEqual(validate.yybAccount({yyb: {openid: 'O', accessToken: 'A',
      channel: String(YYB_SDK_CHANNEL)}}).openid, 'O');
  });

  console.log(JSON.stringify({ok: true, checks}, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
