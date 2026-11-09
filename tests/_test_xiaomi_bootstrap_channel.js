'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  const end = source.indexOf('\n  }', start);
  if (end > start) return source.slice(start, end + 4);
  throw new Error(name + ' is incomplete');
}

const page = {};
Object.defineProperty(page, 'channel_id', {
  value: 210100, writable: true, enumerable: true, configurable: false
});
Object.defineProperty(page, 'ReqObj', {
  value: {channel_id: 210100}, writable: true, enumerable: true, configurable: false
});
page.customData = function () {
  page.channel_id = 210100;
  page.ReqObj.channel_id = 210100;
};

let consumed = '';
const context = {
  page,
  HANDOFF_TTL: 240000,
  Date,
  Number,
  String,
  Object,
  Array,
  JSON,
  Set,
  Promise,
  RegExp,
  assert(ok, code, stage) {
    if (!ok) throw Object.assign(new Error(code), {code, stage});
  },
  consumeHandoff(name) { consumed = name; }
};
vm.createContext(context);
vm.runInContext([
  extract('installChannelProvenance'),
  extract('installRequestBootstrap')
].join('\n'), context);

const name = 'jnd-wg-qq-' + 'a'.repeat(32);
context.installRequestBootstrap('xiaomi', 320052, {
  account: 'account', token: 'token', sign: 'sign',
  timestamp: Date.now(), channel_id: 320052
}, name);

assert.strictEqual(page.channel_id, 320052,
  'the Xiaomi channel was not installed over a non-configurable official channel');
assert.strictEqual(page.ReqObj.channel_id, 320052,
  'the Xiaomi channel was not installed into the existing ReqObj');
assert.strictEqual(consumed, name, 'the one-time handoff was not consumed');
assert.strictEqual(page.__SGS_XIAOMI_BOOTSTRAP__.provider, 'xiaomi');
assert.strictEqual(page.__SGS_XIAOMI_BOOTSTRAP__.channelId, '320052');
assert.strictEqual(page.__SGS_XIAOMI_BOOTSTRAP__.name, name);
assert(page.__SGS_XIAOMI_BOOTSTRAP__.expires > Date.now(),
  'the document Xiaomi provenance expired immediately');

page.customData();
assert.strictEqual(page.channel_id, 320052,
  'customData() restored the official placeholder after the Xiaomi bootstrap');
assert.strictEqual(page.ReqObj.channel_id, 320052,
  'customData() restored the official placeholder in ReqObj after the Xiaomi bootstrap');

page.ReqObj.channel_id = String(page.channel_id);
assert.strictEqual(page.ReqObj.channel_id, '320052',
  'the game later copied the official channel over the Xiaomi request');

console.log(JSON.stringify({ok: true, checks: [
  'Xiaomi bootstrap overrides a writable non-configurable official channel',
  'customData() cannot restore the official placeholder',
  'the document provenance records the verified Xiaomi handoff'
]}, null, 2));
