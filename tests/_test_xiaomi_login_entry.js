'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');
const start = source.indexOf('const ChannelRegistry = (() => {');
const end = source.indexOf('/* CORE-END */', start);
assert(start >= 0 && end > start, 'channel core not found');

const context = {
  console, URL, URLSearchParams, JSON, Object, Array, Map, Set, Promise, Number, String,
  Boolean, Date, Math, RegExp, Error, TypeError, Uint8Array, TextEncoder, TextDecoder,
  crypto: globalThis.crypto, setTimeout, clearTimeout, AbortController, performance,
  GM_getValue: () => null, GM_setValue: () => {}, GM_deleteValue: () => {},
  GM_listValues: () => [], GM_addValueChangeListener: () => 0, GM_removeValueChangeListener: () => {}
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) +
  '\nthis.__registry = ChannelRegistry; this.__core = ChannelCore;', context);

const xiaomi = context.__registry.get('xiaomi');
assert(xiaomi, 'xiaomi channel is missing');
assert.strictEqual(xiaomi.oauth.loginEntry, 'https://id.mi.com/');
assert.strictEqual(xiaomi.loginOptions.find(option => option.id === 'xiaomi-official').method, 2);

const state = '0123456789abcdef'.repeat(2);
const entry = context.__core.authorization(state, 2, 'xiaomi');
assert.strictEqual(entry.method, 2);
assert.strictEqual(entry.authorization.origin, 'https://account.xiaomi.com');
assert.strictEqual(entry.authorization.pathname, '/oauth2/authorize');
assert.strictEqual(entry.authorization.searchParams.get('client_id'), '2882303761517516898');
assert.strictEqual(entry.authorization.searchParams.get('response_type'), 'code');
assert.strictEqual(entry.authorization.searchParams.get('scope'), '1 3');
assert.strictEqual(entry.authorization.searchParams.get('redirect_uri'),
  'http://game.xiaomi.com/oauthcallback/mioauth');
assert.strictEqual(entry.authorization.searchParams.get('state'), state);
assert.strictEqual(entry.authorization.searchParams.get('skip_confirm'), 'false');

assert(entry.loginEntry, 'xiaomi standard login entry is missing');
assert.strictEqual(entry.loginEntry.origin, 'https://id.mi.com');
assert.strictEqual(entry.loginEntry.pathname, '/');
assert.strictEqual(entry.loginEntry.searchParams.get('sid'), 'passport');
assert.strictEqual(entry.loginEntry.searchParams.get('callback'), entry.authorization.href,
  'standard login entry must carry the complete OAuth authorization URL');

console.log(JSON.stringify({ok: true, checks: 15}, null, 2));
