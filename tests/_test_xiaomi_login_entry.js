'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
const start = source.indexOf('const ChannelRegistry = (() => {');
const end = source.indexOf('/* CORE-END */', start);
assert(start >= 0 && end > start, 'channel core not found');
const modelStart = source.indexOf('/* XIAOMI-SNS-MODEL-BEGIN */');
const modelEnd = source.indexOf('/* XIAOMI-SNS-MODEL-END */', modelStart);
assert(modelStart >= 0 && modelEnd > modelStart, 'xiaomi SNS model not found');

const context = {
  console, URL, URLSearchParams, JSON, Object, Array, Map, Set, Promise, Number, String,
  Boolean, Date, Math, RegExp, Error, TypeError, Uint8Array, TextEncoder, TextDecoder,
  crypto: globalThis.crypto, setTimeout, clearTimeout, AbortController, performance,
  GM_getValue: () => null, GM_setValue: () => {}, GM_deleteValue: () => {},
  GM_listValues: () => [], GM_addValueChangeListener: () => 0, GM_removeValueChangeListener: () => {}
};
vm.createContext(context);
vm.runInContext(source.slice(modelStart, modelEnd) + '\n' + source.slice(start, end) +
  '\nthis.__registry = ChannelRegistry; this.__core = ChannelCore;', context);

const xiaomi = context.__registry.get('xiaomi');
assert(xiaomi, 'xiaomi channel is missing');
assert.strictEqual(xiaomi.oauth.loginEntry, undefined,
  'xiaomi must not use the callback-dropping standard login page');
assert.strictEqual(xiaomi.oauth.sns.qq.appid, '100284651');
assert.strictEqual(xiaomi.oauth.sns.weixin.appid, 'wxxmzh');
assert.strictEqual(xiaomi.oauth.sns.weixin.scope, 'snsapi_login');

const official = xiaomi.loginOptions.find(option => option.id === 'xiaomi-official');
const qqOption = xiaomi.loginOptions.find(option => option.id === 'xiaomi-qq');
const weixinOption = xiaomi.loginOptions.find(option => option.id === 'xiaomi-weixin');
assert(official, 'xiaomi direct OAuth option is missing');
assert.strictEqual(official.method, 1);
assert.strictEqual(official.sns, undefined, 'default official login must use direct OAuth');
assert(qqOption && weixinOption, 'xiaomi QQ and WeChat login options are missing');
assert.strictEqual(qqOption.method, 2);
assert.strictEqual(qqOption.sns, 'qq');
assert.strictEqual(weixinOption.method, 2);
assert.strictEqual(weixinOption.sns, 'weixin');

const state = '0123456789abcdef'.repeat(2);
const direct = context.__core.authorization(state, 1, 'xiaomi');
assert.strictEqual(direct.method, 1);
assert.strictEqual(direct.sns, '');
assert.strictEqual(direct.authorization.origin, 'https://account.xiaomi.com');
assert.strictEqual(direct.authorization.pathname, '/oauth2/authorize');
assert.strictEqual(direct.authorization.searchParams.get('client_id'), '2882303761517516898');
assert.strictEqual(direct.authorization.searchParams.get('response_type'), 'code');
assert.strictEqual(direct.authorization.searchParams.get('scope'), '1 3');
assert.strictEqual(direct.authorization.searchParams.get('redirect_uri'),
  'http://game.xiaomi.com/oauthcallback/mioauth');
assert.strictEqual(direct.authorization.searchParams.get('state'), state);
assert.strictEqual(direct.authorization.searchParams.get('skip_confirm'), 'false');
assert.strictEqual(direct.authorization.searchParams.get('_json'), null,
  'default official login must stay on the normal OAuth page');
assert.strictEqual(direct.authorization.searchParams.get('sgs_sns'), null);
assert.strictEqual(direct.loginEntry, undefined);

const bridgeEntry = context.__core.authorization(state, 2, 'xiaomi', 'qq');
assert.strictEqual(bridgeEntry.sns, 'qq');
assert.strictEqual(bridgeEntry.authorization.searchParams.get('_json'), 'true');
assert.strictEqual(bridgeEntry.authorization.searchParams.get('sgs_sns'), 'qq');
assert.strictEqual(bridgeEntry.authorization.searchParams.get('state'), state);
assert.strictEqual(bridgeEntry.loginEntry, undefined);
assert.throws(() => context.__core.authorization(state, 2, 'xiaomi', 'weibo'),
  /没有配置该第三方登录方式/);

const modelContext = {URL, URLSearchParams, JSON, Object, String, Error, RegExp};
vm.createContext(modelContext);
vm.runInContext(source.slice(modelStart, modelEnd) +
  '\nthis.__sns = XIAOMI_SNS; this.__bridge = XiaomiSNSBridge;', modelContext);
const model = modelContext.__bridge;
assert.strictEqual(model.bridgeWindowState('sgs-xiaomi-' + state), state);
assert.strictEqual(model.bridgeWindowState('sgs-vivo-' + state), '');
const pendingRecord = {v: 1, state, sns: 'qq', authorization: bridgeEntry.authorization.href,
  expires: 2000};
const resumed = model.pendingRequest(pendingRecord, state, 1000);
assert.strictEqual(resumed.sns, 'qq');
assert.strictEqual(resumed.state, state);
assert.strictEqual(model.pendingRequest(pendingRecord, 'f'.repeat(32), 1000), null);
assert.strictEqual(model.pendingRequest({...pendingRecord, sns: 'weixin'}, state, 1000), null);
assert.strictEqual(model.pendingRequest({...pendingRecord, expires: 1000}, state, 1000), null);
const cleaned = model.authorizeURL(bridgeEntry.authorization.href);
assert.strictEqual(cleaned.sns, 'qq');
assert.strictEqual(cleaned.state, state);
assert(!new URL(cleaned.apiURL).searchParams.has('sgs_sns'));
assert.strictEqual(new URL(cleaned.apiURL).searchParams.get('_json'), 'true');

const followup = new URL('https://account.xiaomi.com/oauth2/authorize');
followup.search = new URLSearchParams({client_id: '2882303761517516898', response_type: 'code', scope: '1 3',
  redirect_uri: 'http://game.xiaomi.com/oauthcallback/mioauth', state, skip_confirm: 'false'}).toString();
const signed = new URL('https://account.xiaomi.com/sts/oauth');
signed.searchParams.set('sign', 'AbCdEf12+/==');
signed.searchParams.set('followup', followup.href);
signed.searchParams.set('sid', 'oauth2.0');
const payload = {data: {sid: 'oauth2.0', callback: signed.href}, result: 'login', code: 70016};
const parsed = model.parseResponse('&&&START&&&' + JSON.stringify(payload));
const callback = model.validateResponse(parsed, cleaned);
assert.strictEqual(callback, signed.href);
const qqURL = model.loginURL(callback, 'qq');
assert.strictEqual(qqURL.origin, 'https://account.xiaomi.com');
assert.strictEqual(qqURL.pathname, '/pass/sns/login/auth');
assert.strictEqual(qqURL.searchParams.get('appid'), '100284651');
assert.strictEqual(qqURL.searchParams.get('callback'), callback);
assert.strictEqual(qqURL.searchParams.get('sid'), 'oauth2.0');
assert.strictEqual(qqURL.searchParams.get('_new'), 'true');
assert.strictEqual(qqURL.searchParams.get('policyName'), 'miaccount');
assert.strictEqual(qqURL.searchParams.get('scope'), null);
const weixinURL = model.loginURL(callback, 'weixin');
assert.strictEqual(weixinURL.searchParams.get('appid'), 'wxxmzh');
assert.strictEqual(weixinURL.searchParams.get('scope'), 'snsapi_login');

const wrongFollowup = new URL(followup.href);
wrongFollowup.searchParams.set('state', 'f'.repeat(32));
const wrongSigned = new URL(signed.href);
wrongSigned.searchParams.set('followup', wrongFollowup.href);
const wrongPayload = {data: {sid: 'oauth2.0', callback: wrongSigned.href}, result: 'login', code: 70016};
assert.throws(() => model.validateResponse(wrongPayload, cleaned), /与本次游戏授权不一致/);
assert.throws(() => model.validateResponse({...payload, code: 0}, cleaned), /未返回第三方登录回调/);
assert.throws(() => model.authorizeURL(bridgeEntry.authorization.href.replace('sgs_sns=qq', 'sgs_sns=weibo')),
  /不支持的第三方登录方式/);
assert.throws(() => model.authorizeURL(bridgeEntry.authorization.href.replace(state, 'f'.repeat(31))),
  /状态校验失败/);

console.log(JSON.stringify({ok: true, checks: 37}, null, 2));
