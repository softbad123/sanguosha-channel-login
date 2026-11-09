'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('_direct_engine.js', 'utf8');

function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let parameterDepth = 0;
  let parameterEnd = -1;
  for (let index = source.indexOf('(', start); index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    else if (source[index] === ')' && --parameterDepth === 0) { parameterEnd = index; break; }
  }
  const body = source.indexOf('{', parameterEnd);
  let depth = 0;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(name + ' is incomplete');
}

const values = new Map();
const calls = {assigned: '', events: [], handoff: null, attempt: null};
const name = 'jnd-wg-qq-' + 'd'.repeat(32);
const id = 'b'.repeat(32);
const profileId = 'profile';
const clientToken = 'c'.repeat(32);
const context = {
  EMBEDDED: true,
  ORIGIN: 'https://web.sanguosha.com',
  PREFIX: 'jnd-wg-qq-',
  DIRECT_LOGIN_ATTEMPT_KEY: 'sgs-direct-login-attempt-v1',
  HANDOFF_TTL: 240000,
  DIRECT_LOGIN_ATTEMPT_TTL: 60000,
  GAME_ROUTES: {xiaomi: {path: '/x/pc/index.php', channel: 320052, query: false}},
  TAB_KEY: 'tab',
  window: {name: ''},
  sessionStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  },
  location: {assign(url) { calls.assigned = url; }},
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
  active() {},
  validateSteamGrant(value) { return value; },
  validateBiliAuth(value) { return value; },
  validateBiliGrant(value) { return value; },
  validateGrant(value) { return value; },
  writeHandoff(value) {
    calls.handoff = value;
    values.set('sgs-direct-handoff-v1', JSON.stringify(value));
  },
  discardHandoff() { values.delete('sgs-direct-handoff-v1'); },
  emitDirectEvent(event) { calls.events.push(event); },
  failure(code, stage) { return Object.assign(new Error(code), {code, stage}); },
  random() { return 'd'.repeat(32); }
};
vm.createContext(context);
vm.runInContext([
  extract('readDirectLoginAttempt'),
  extract('writeDirectLoginAttempt'),
  extract('discardDirectLoginAttempt'),
  extract('directLoginAttemptFor'),
  extract('openGame')
].join('\n'), context);

context.writeDirectLoginAttempt({
  v: 1, provider: 'xiaomi', name, id, profileId, clientToken,
  restored: true, saveSession: true, expires: Date.now() + 60000
});
assert.strictEqual(context.directLoginAttemptFor('xiaomi', clientToken, name, profileId, id)?.name, name,
  'the exact saved-session attempt was not accepted');
assert.strictEqual(context.directLoginAttemptFor('xiaomi', clientToken, name, 'other', id), null,
  'a different profile was accepted');
assert.strictEqual(context.directLoginAttemptFor('xiaomi', 'e'.repeat(32), name, profileId, id), null,
  'a different client token was accepted');
assert.strictEqual(context.directLoginAttemptFor('xiaomi', clientToken, name, profileId, 'f'.repeat(32)), null,
  'a different saved record was accepted');
context.EMBEDDED = false;
assert.strictEqual(context.directLoginAttemptFor('xiaomi', clientToken, name, profileId, id)?.restored, true,
  'standalone mode prematurely rejected every Xiaomi entry');
context.EMBEDDED = true;
assert.strictEqual(context.discardDirectLoginAttempt('jnd-wg-qq-' + 'e'.repeat(32)), false,
  'a different handoff name removed the attempt');
assert.strictEqual(context.discardDirectLoginAttempt(name), true,
  'the matching attempt was not removed');
assert.strictEqual(values.has('sgs-direct-login-attempt-v1'), false,
  'the attempt marker survived its matching discard');

context.openGame({
  provider: 'xiaomi', savedId: id, __sgsProfileId: profileId, clientToken,
  restored: true, saveSession: true, grant: {account: 'account', token: 'token'},
  grantExpires: Date.now() + 60000
});
assert.strictEqual(calls.handoff?.name, name, 'the Xiaomi handoff did not receive the attempt name');
assert.strictEqual(calls.handoff?.profileId, profileId, 'the Xiaomi handoff lost its profile binding');
const attempt = JSON.parse(values.get('sgs-direct-login-attempt-v1'));
assert.strictEqual(attempt?.name, name, 'the direct attempt did not match the handoff');
assert.strictEqual(attempt?.id, id, 'the direct attempt did not bind the saved record');
assert.strictEqual(attempt?.clientToken, clientToken,
  'the direct attempt did not bind the navigation token');
assert.strictEqual(attempt?.profileId, profileId,
  'the direct attempt did not bind the account profile');
assert.strictEqual(attempt?.restored, true,
  'the restored-login flag was not carried across the navigation');
assert.strictEqual(calls.assigned, 'https://web.sanguosha.com/x/pc/index.php',
  'the Xiaomi game route was not navigated');

console.log(JSON.stringify({ok: true, checks: [
  'attempt marker binds handoff, record, profile and token',
  'mismatched attempt fields are rejected',
  'openGame writes the matching marker before navigation'
]}, null, 2));
