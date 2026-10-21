'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('三国杀多渠道登录.user.js', 'utf8');

function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  const body = source.indexOf('{', start);
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

function run(phase, consumedLaunch) {
  const profile = {id: 'vivo:210381106232', channelId: 'vivo'};
  const calls = {started: 0, opened: 0};
  const statuses = [];
  const context = {
    isBrowserChannel: true,
    CHANNEL: {id: 'vivo', name: 'Vivo', shortName: 'Vivo', reason: ''},
    accounts: {get: () => profile, live: () => []},
    selectedProfileChannelId: 'vivo',
    currentProfileId: profile.id,
    expectedProfileId: profile.id,
    consumedLaunch,
    accountPhase: phase,
    active: null,
    showPanel: () => {},
    status: text => statuses.push(String(text)),
    preferredLoginOption: () => ({}),
    switchChannel: () => {},
    startAccountInCurrentWindow: () => { calls.started += 1; return true; },
    openNewAccountWindow: () => { calls.opened += 1; },
    prepareCurrentWindowForNewAccount: () => {},
    findOwnedWindow: () => null,
    focusOwnedWindow: () => {},
    requestExistingWindow: () => {},
    saveLoginInfo: () => true
  };
  vm.createContext(context);
  vm.runInContext(extract('openAccountWindow') + '\nthis.openAccountWindow = openAccountWindow;', context);
  context.openAccountWindow(profile);
  return {calls, statuses};
}

for (const phase of ['waiting', 'loading', 'failed', 'disconnected']) {
  const result = run(phase, true);
  assert.strictEqual(result.calls.started, 1,
    phase + ' account did not retry saved login from the account manager');
  assert(!result.statuses.includes('这里就是该账号当前的游戏窗口。'),
    phase + ' account was incorrectly treated as an active game window');
}

const connected = run('connected', true);
assert.strictEqual(connected.calls.started, 0,
  'a connected account started a duplicate saved-login flow');
assert(connected.statuses.includes('这里就是该账号当前的游戏窗口。'),
  'connected account did not explain that the current window is already active');

const fresh = run('connected', false);
assert.strictEqual(fresh.calls.started, 1,
  'an explicitly selected account could not start saved login in the current window');

console.log(JSON.stringify({ok: true, retryPhases: ['waiting', 'loading', 'failed', 'disconnected'],
  connectedGuard: true, explicitSelection: true}, null, 2));
