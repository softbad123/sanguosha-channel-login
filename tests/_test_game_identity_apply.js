'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const main = fs.readFileSync(path.join(__dirname, '..', '三国杀多渠道登录.user.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  const signature = source.indexOf(') {', start);
  const body = source.indexOf('{', signature >= 0 ? signature : start);
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

const state = {
  profile: {id: 'vivo:account-1', channelId: 'vivo', serverId: '', roleId: '', roleName: ''},
  accountPhase: 'loading',
  updates: [],
  logs: [],
  collapsed: 0,
  marked: false
};
const sandbox = {
  currentProfileId: 'vivo:account-1',
  expectedProfileId: '',
  gameIdentityCache: null,
  gameIdentityAppliedSignature: '',
  selectedProfileId: '',
  selectedProfileChannelId: 'vivo',
  CHANNEL: {id: 'vivo', name: 'Vivo', shortName: 'Vivo服'},
  profileById(id, channelId) {
    return id === state.profile.id && channelId === 'vivo' ? state.profile : null;
  },
  setAccountPhase(phase) { state.accountPhase = phase; },
  saveLoginInfoEnabled() { return true; },
  transientProfileMatches() { return false; },
  updateTransientProfile() { throw new Error('saved account should not use transient storage'); },
  accounts: {
    update(id, changes, create, channelId) {
      state.updates.push({id, changes: {...changes}, create, channelId});
      Object.assign(state.profile, changes);
      return state.profile;
    }
  },
  selectProfile() {},
  updateAccountHeading() {},
  renderAccounts() {},
  heartbeat() {},
  autoCollapseForLogin(reason, stage, meta) { state.collapsed += 1; state.collapseMeta = {reason, stage, meta}; return true; },
  markGameLoginSession() { state.marked = true; },
  feedbackLog: {
    add(level, message, meta) { state.logs.push({level, message, meta}); }
  },
  diagnosticMeta(extra) { return {version: '1.3.0', channelId: 'vivo', ...extra}; },
  Object, String, Number
};
vm.createContext(sandbox);
vm.runInContext([
  extractFunction(main, 'gameField'),
  extractFunction(main, 'gameIdentityReady'),
  extractFunction(main, 'gameIdentityFromEvent'),
  extractFunction(main, 'applyGameIdentity')
].join('\n'), sandbox);

const event = {
  type: 'game-identity', serverId: '320056', roleId: '123456', roleName: '测试角色',
  loginAccount: 'vivo-login', channelAccount: 'channel-7'
};
sandbox.event = event;
vm.runInContext('this.applied = applyGameIdentity(gameIdentityFromEvent(event), {source: "test_probe"});', sandbox);
assert.strictEqual(sandbox.applied, true, 'identity event was rejected');
assert.strictEqual(state.updates.length, 1, 'identity did not reach account storage');
assert.strictEqual(state.updates[0].id, 'vivo:account-1');
assert.strictEqual(state.updates[0].changes.roleId, '123456');
assert.strictEqual(state.updates[0].changes.roleName, '测试角色');
assert.strictEqual(state.updates[0].changes.serverId, '320056');
assert.strictEqual(state.profile.roleId, '123456', 'roleId was not written to the profile');
assert.strictEqual(state.accountPhase, 'connected');
assert.strictEqual(state.collapsed, 1);
assert.strictEqual(state.marked, true);
assert(state.logs.some(item => item.level === 'success' && item.message.includes('写入账号管理')));

vm.runInContext('applyGameIdentity(gameIdentityFromEvent(event), {source: "test_probe"});', sandbox);
assert.strictEqual(state.updates.length, 1, 'same identity was written repeatedly');
assert.strictEqual(state.collapsed, 1, 'same identity collapsed the panel repeatedly');

console.log(JSON.stringify({ok: true, roleId: state.profile.roleId, updates: state.updates.length}, null, 2));
